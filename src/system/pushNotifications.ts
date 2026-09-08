/* ============================================================================
   LE NOTIFICHE SONO SEMPRE ACCESE

   🔷 «Togli attiva insight e notifiche push sempre attive.»

   🔴 C'ERA UN PULSANTE, E QUINDI NON ARRIVAVA NIENTE. Le notifiche erano un
   opt-in esplicito nascosto nel vano tecnico, con il nome di un'altra funzione
   («ATTIVA INSIGHT»). Chi non l'aveva mai toccato aveva automazioni che
   giravano, promemoria che scadevano e pensieri prodotti — e zero avvisi. Una
   cosa che devi accendere è una cosa che resta spenta.

   🔒 ADESSO SI MANTIENE DA SÉ. A ogni apertura, se il permesso c'è, la
   sottoscrizione viene ricreata e rimandata al server. Non è ridondanza: i
   browser scadono e ruotano le sottoscrizioni per conto loro, e con il vecchio
   codice una sottoscrizione persa restava persa finché non ritoccavi il
   pulsante — cioè per sempre.

   ⚠️ IL PERMESSO NON POSSIAMO DARCELO DA SOLI. `requestPermission()` su iOS
   vuole un gesto: è una regola del sistema operativo, non una nostra scelta.
   Quindi non chiediamo all'avvio (verrebbe rifiutato in silenzio) ma al primo
   tocco, una volta sola per sessione. Nessun pulsante da cercare: apri VINZ,
   tocchi qualcosa, e il resto è il dialogo di iOS.

   ⚠️ UN «NO» È PER SEMPRE. Un permesso negato non si può richiedere di nuovo da
   codice — si sblocca solo dalle impostazioni di sistema. Per questo non
   insistiamo mai: si chiede una volta, e se la risposta è no lo si dice in
   MIND, dove il danno si vede.
   ========================================================================= */

function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * La chiave VAPID con cui una sottoscrizione è nata, nella stessa forma in cui
 * il server ci dà la sua.
 *
 * 🔴 SERVE PER ACCORGERSI CHE È VECCHIA. Se le chiavi del server cambiano, le
 * sottoscrizioni fatte con le precedenti restano lì e sembrano valide, ma ogni
 * invio muore con un 410 dall'altra parte. Il codice di prima faceva
 * `esistente ?? creane una`: teneva la vecchia per sempre e non arrivava mai
 * niente, senza un errore da nessuna parte.
 */
function keyOf(subscription: PushSubscription): string {
  const raw = subscription.options?.applicationServerKey;
  if (!raw) return '';
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Sottoscrive e registra sul server. Presuppone il permesso già dato. */
async function register(token: string): Promise<boolean> {
  const registration = await navigator.serviceWorker.ready;
  const keyResponse = await fetch('/api/push', { headers: { authorization: `Bearer ${token}` } });
  if (!keyResponse.ok) return false;
  const { publicKey } = (await keyResponse.json()) as { publicKey?: string };
  if (!publicKey) return false;

  let existing = await registration.pushManager.getSubscription();
  if (existing && keyOf(existing) !== publicKey) {
    await existing.unsubscribe().catch(() => false);
    existing = null;
  }
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationKey(publicKey),
    }));

  const saved = await fetch('/api/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(subscription),
  });
  return saved.ok;
}

/** Già chiesto in questa sessione: non si insiste a ogni tocco. */
let asked = false;

/**
 * Tiene vive le notifiche per tutta la vita dell'app. Da chiamare una volta,
 * con il token: restituisce la funzione per smettere di ascoltare il gesto.
 */
export function keepPushAlive(token: string): () => void {
  if (!supported()) return () => {};

  if (Notification.permission === 'granted') {
    void register(token).catch(() => false);
    return () => {};
  }
  if (Notification.permission === 'denied' || asked) return () => {};

  /* Il permesso si chiede dentro il gesto, non dopo: `await` prima di
     `requestPermission()` fa perdere l'attivazione all'utente e Safari rifiuta. */
  function stop() {
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
  }
  function onGesture() {
    stop();
    if (asked || Notification.permission !== 'default') return;
    asked = true;
    void Notification.requestPermission()
      .then((permission) => (permission === 'granted' ? register(token) : false))
      .catch(() => false);
  }
  window.addEventListener('pointerdown', onGesture, { once: true });
  window.addEventListener('keydown', onGesture, { once: true });
  return stop;
}

/**
 * Cosa può arrivarti davvero adesso.
 *
 * 🔒 È UNA DIAGNOSI, NON UN INTERRUTTORE. Serve solo a dire in MIND che le
 * automazioni stanno girando a vuoto: da qui non si riaccende niente, perché
 * un permesso negato si sblocca soltanto dalle impostazioni del telefono.
 */
export type PushStatus = 'unsupported' | 'blocked' | 'pending' | 'on';

export async function pushStatus(): Promise<PushStatus> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'pending';
  const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  return subscription ? 'on' : 'pending';
}

/**
 * L'evoluzione è finita: momento buono per chiedere, se non l'abbiamo ancora
 * fatto — c'è appena stato un gesto e la risposta interessa davvero.
 */
export async function enableEvolutionNotifications(token: string): Promise<void> {
  if (!supported() || Notification.permission === 'denied') return;
  if (Notification.permission !== 'granted') {
    if (asked) return;
    asked = true;
    if ((await Notification.requestPermission().catch(() => 'denied')) !== 'granted') return;
  }
  await register(token).catch(() => false);
}
