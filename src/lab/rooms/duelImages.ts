/* ============================================================================
   LE IMMAGINI DEL DUELLO

   🔷 «Si devono generare delle immagini: io la clicco, l'avvio, e poi lui mi
      manda la notifica quando è pronto e faccio l'A/B test.»

   Ha ragione sul perché: un mostro lo scegli con l'occhio. Finora il duello
   mostrava solo le etichette — Family, affinità, taglia — e su quelle si
   giudica un foglio di calcolo, non una creatura.

   ⚠️ E QUI C'È UN LIMITE VERO, DA DIRE SUBITO. Le immagini NON si possono
   generare sul server e lasciare lì: la strada in background di `/api/ai`
   esiste solo per il TESTO (`startBackground` manda istruzioni e riceve
   parole). Le immagini passano da `/v1/images/generations`, che è sincrono.

   Quindi il lavoro gira QUI, nella pagina. Conseguenze, in chiaro:
   • se resti sul telefono con l'app aperta, arriva la notifica e basta;
   • se chiudi l'app, il lavoro si ferma dove è arrivato;
   • ma NON si perde: ogni immagine finita è già salvata, e riaprendo il
     laboratorio il lavoro RIPRENDE da lì invece di ricominciare da capo.

   🔒 E COSTA. Due immagini per duello: otto duelli sono sedici immagini
   pagate. Il numero si dice prima di partire, non dopo.
   ========================================================================= */

import { get, set, del, keys } from 'idb-keyval';
import type { MonRecord } from '../../engine/types';

const PREFISSO = 'vinzlab/duel/';
const CHIAVE_JOB = 'vinzlab/duel/job';

export type StatoJob = {
  /* 🔶 ERA UNA LISTA DI COPPIE, e leggeva `c[1]` per la seconda carta. Il
     mazzo non ha coppie: è una fila di creature, una alla volta. Passandogli
     liste da un elemento solo `c[1]` era `undefined` e il disegno moriva al
     primo giro — con l'aria di un problema di rete. */
  fatte: number;
  totale: number;
  errore: string | null;
  finito: boolean;
};

type Listener = (s: StatoJob) => void;
let ascoltatori: Listener[] = [];
let corrente: StatoJob | null = null;
let inCorso = false;

export function ascoltaJob(fn: Listener): () => void {
  ascoltatori.push(fn);
  if (corrente) fn(corrente);
  return () => {
    ascoltatori = ascoltatori.filter((x) => x !== fn);
  };
}

function annuncia(s: StatoJob) {
  corrente = s;
  for (const fn of ascoltatori) fn(s);
}

export const idImmagine = (seed: number) => `${PREFISSO}${seed}`;

export async function immagineDi(seed: number): Promise<string | null> {
  return (await get<string>(idImmagine(seed))) ?? null;
}

/** Quello che è già stato disegnato: serve a riprendere invece di ripagare. */
export async function giaFatte(): Promise<Set<string>> {
  const tutte = await keys();
  return new Set(
    tutte.filter((k): k is string => typeof k === 'string' && k.startsWith(PREFISSO) && k !== CHIAVE_JOB),
  );
}

export async function jobSalvato(): Promise<StatoJob | null> {
  return (await get<StatoJob>(CHIAVE_JOB)) ?? null;
}

export async function buttaTutto(): Promise<void> {
  for (const k of await giaFatte()) await del(k);
  await del(CHIAVE_JOB);
  corrente = null;
}

/* ============================================================================
   IL LAVORO

   🔒 UNA ALLA VOLTA, DI PROPOSITO. Sedici richieste di immagine in parallelo
   sono sedici modi di sbattere contro il tetto di spesa nello stesso secondo,
   e il tetto risponde a tutte insieme: si perderebbero tutte e sedici invece
   di fermarsi alla prima. In fila, il primo rifiuto ferma il resto.
   ========================================================================= */
export async function avviaJob({
  carte,
  token,
  imageModel,
  onNotifica,
}: {
  carte: { seed: number; record: MonRecord }[];
  token: string | null;
  imageModel: string | null;
  onNotifica: (titolo: string, corpo: string) => void;
}): Promise<void> {
  if (inCorso) return;
  inCorso = true;

  const piatte = carte;
  const fatte = await giaFatte();

  const stato: StatoJob = {
    fatte: piatte.filter((x) => fatte.has(idImmagine(x.seed))).length,
    totale: piatte.length,
    errore: null,
    finito: false,
  };
  annuncia(stato);
  await set(CHIAVE_JOB, stato);

  try {
    const { askImage } = await import('../../ai/backend');
    const { promptFor } = await import('../../assets-pipeline/promptFor');
    const { assetTypeDef } = await import('../../engine/assets');

    for (const x of piatte) {
      /* 🔒 Già fatta = già pagata. Non si ridisegna. */
      if (fatte.has(idImmagine(x.seed))) continue;

      const prompt = promptFor(x.record, 'character_master').text;
      const size = assetTypeDef('character_master').size;
      const out = await askImage(token, prompt, imageModel, size);

      if (out.failure || !out.data?.image) {
        stato.errore = out.detail ?? out.failure ?? 'nessuna immagine';
        annuncia({ ...stato });
        await set(CHIAVE_JOB, stato);
        onNotifica('VINZ.LAB: disegno fermo', stato.errore);
        return;
      }

      await set(idImmagine(x.seed), `data:image/png;base64,${out.data.image}`);
      stato.fatte += 1;
      annuncia({ ...stato });
      await set(CHIAVE_JOB, stato);
    }

    stato.finito = true;
    annuncia({ ...stato });
    await set(CHIAVE_JOB, stato);
    onNotifica('VINZ.LAB: il duello è pronto', `${stato.totale} immagini disegnate. Puoi scegliere.`);
  } finally {
    inCorso = false;
  }
}

/* ============================================================================
   LA NOTIFICA

   ⚠️ NON È PUSH, ED È UNA DIFFERENZA CHE SI SENTE. Il push vero arriva anche
   ad app chiusa, ma parte dal SERVER — e il server, qui, non sta disegnando
   niente: il lavoro gira nella pagina. Quindi la notifica la mostra la pagina
   stessa, attraverso il service worker già registrato (`public/sw.js`).

   🔒 Passa dal service worker e non da `new Notification(...)` perché su
   iPhone, in un'app aggiunta alla schermata Home, `new Notification` non
   esiste: l'unica strada è `registration.showNotification`.
   ========================================================================= */
export async function chiediPermesso(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export async function notifica(titolo: string, corpo: string): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    /* Il laboratorio non monta `App`, che è chi registra il service worker:
       se non c'è ancora, lo si registra qui. */
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
    await reg.showNotification(titolo, {
      body: corpo,
      icon: '/icon-180.png',
      badge: '/icon-180.png',
      tag: 'vinzlab-duel',
    });
  } catch {
    /* Una notifica che non parte non deve fermare il duello. */
  }
}
