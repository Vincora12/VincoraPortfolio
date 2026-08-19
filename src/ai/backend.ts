/* ============================================================================
   PARLARE AL PROPRIO BACKEND (MASTER SPEC v1.13 §19.5)

   Qui c'era l'SDK di Anthropic con la chiave dentro il browser. Adesso c'è una
   `fetch` verso le proprie funzioni, e la differenza non è tecnica:

     prima   il browser aveva la chiave del fornitore. Chiunque aprisse quel
             browser poteva prenderla, e con quella spendere senza limite.

     adesso  il browser ha un TOKEN che apre solo le TUE funzioni, dove il
             tetto di spesa è già applicato. Se esce, si cambia una variabile
             d'ambiente e si ripubblica: tutto quello che aveva il vecchio
             smette di funzionare.

   🔒 §17 vale identico: qui dentro non si lancia mai. Rete assente, funzione
   spenta, tetto sfondato — si torna indietro con un esito, e chi chiama usa la
   voce deterministica. Una conversazione non deve mai restare muta.

   ⚠️ IN SVILUPPO LOCALE LE FUNZIONI NON CI SONO. `vite` serve solo i file
   statici, quindi `/api/ai` risponde con l'HTML della pagina. Non è un guasto
   ed è il motivo per cui la risposta viene controllata prima di essere letta
   come JSON: senza quel controllo, `npm run dev` riempirebbe la console di
   errori di parsing che non significano niente.
   ========================================================================= */

/** Cosa si può chiedere. Gli stessi nomi che il backend conosce. */
export type Capability = 'character-voice' | 'vision-quick' | 'text-cheap' | 'image' | 'prompt-compile';

export interface SystemBlock {
  text: string;
  /** Mettilo in cache: vale per ciò che non cambia a ogni messaggio. */
  cache?: boolean;
}

export interface Turn {
  role: 'user' | 'assistant';
  /** Stringa nel caso normale, blocchi quando ci sono dentro gli strumenti. */
  content: string | Record<string, unknown>[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface AskRequest {
  capability: Capability;
  system?: SystemBlock[];
  turns?: Turn[];
  user?: string;
  image?: { mediaType: string; data: string };
  thinking?: boolean;
  maxTokens?: number;
  /** Strumenti che il modello può chiamare. Li esegue il browser. */
  tools?: ToolDefinition[];
  /** L'ultimo messaggio come blocchi: i risultati di un giro di strumenti. */
  userBlocks?: Record<string, unknown>[];
  /** Accende la ricerca sul web, che gira dal fornitore. */
  webSearch?: boolean;
  /** Solo per `image`. */
  prompt?: string;
  /**
   * Chi vuoi che serva questa richiesta, se hai scelto.
   *
   * 🔶 Si chiama ancora `voiceModel` perché è il nome che il server conosce, e
   * rinominarlo su tutte e due le sponde per una capacità in più sarebbe un
   * cambio di protocollo per zero guadagno. Vale per la voce e per il
   * compilatore di prompt: `resolveRoute` sa a quale elenco guardare.
   *
   * 🔒 È una PREFERENZA, non un comando: il server la accetta solo se
   * corrisponde a una scelta che conosce e sa prezzare. Mandare qui il nome
   * di un modello inventato non lo fa chiamare — fa tornare al predefinito.
   */
  voiceModel?: string | null;
}

/**
 * Perché non è arrivata la risposta. Serve alla UI, non solo al log — e
 * `capped` in particolare NON è un errore: è una decisione presa da te, e
 * l'app deve poterla raccontare invece di far finta che il modello sia rotto.
 */
export type BackendFailure =
  | 'no-token'
  | 'offline'
  | 'unauthorized'
  | 'capped'
  | 'error'
  /**
   * 🔶 La funzione è stata uccisa mentre lavorava.
   *
   * ⚠️ Prima finiva sotto `offline`, ed è costato mezz'ora di caccia nel posto
   * sbagliato: «offline» manda a controllare la rete, il deploy, il token —
   * tutte cose a posto. Netlify ferma una funzione sincrona a 10 secondi (26
   * sul piano Pro, a richiesta) e restituisce una pagina HTML: il
   * content-type non è JSON, e per il codice diventava «non ci sono».
   *
   * Una generazione di immagini ne impiega 15–60. Non è un guasto: è un
   * limite di piattaforma, e va detto con parole sue.
   */
  | 'timeout';

export interface BackendResult<T> {
  /** Il motivo vero, quando il server ne manda uno. Va in DEV e nei guasti. */
  detail?: string;
  data: T | null;
  failure: BackendFailure | null;
  /** Sopra la soglia d'avviso del mese: si continua, ma si dice. */
  warning?: boolean;
  /** Quanto resta del tetto, in dollari. Presente quando il server lo manda. */
  remainingUsd?: number;
}

export interface VoiceData {
  text: string;
  model: string;
  /** Strumenti che il modello vuole far girare prima di continuare. */
  toolUses?: { id: string; name: string; input: unknown }[];
  stopReason?: string;
}

export interface ImageData {
  /** PNG in base64, senza prefisso. */
  image: string;
}

/* --- Lo stato del tetto, per la UI ------------------------------------------
   Vive fuori da zustand come il contatore dei costi: è telemetria, non stato
   di prodotto, e non deve finire nei salvataggi né negli export.
   -------------------------------------------------------------------------- */

let lastWarning = false;
let lastRemaining: number | null = null;
const listeners = new Set<() => void>();

export function subscribeToBudget(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function budgetState(): { warning: boolean; remainingUsd: number | null } {
  return { warning: lastWarning, remainingUsd: lastRemaining };
}

function noteBudget(warning: boolean | undefined, remaining: number | undefined): void {
  const changed = warning !== lastWarning || remaining !== lastRemaining;
  lastWarning = Boolean(warning);
  if (typeof remaining === 'number') lastRemaining = remaining;
  if (changed) listeners.forEach((l) => l());
}

/* --- La chiamata ------------------------------------------------------------ */

/**
 * La soglia oltre la quale «è fallita» significa «l'hanno fermata».
 *
 * ⚠️ QUESTO NUMERO ERA 9.500, ED ERA SBAGLIATO — mio errore, e di quelli che
 * costano decisioni.
 *
 * 🔷 «Ora va, anche se è arrivato a 17 secondi.»
 *
 * Una chiamata che TORNA a diciassette secondi dimostra che il tetto di
 * questo sito è più alto di diciassette. Avevo ripetuto «dieci secondi» per
 * due giorni prendendolo dalla documentazione generale invece che dal sito
 * vero, e su quella premessa ho consigliato di spostarsi altrove o di
 * passare a un piano a pagamento. La premessa era da verificare, non da
 * ripetere.
 *
 * 🔒 VENTIQUATTRO, e non un numero più aggressivo: sotto c'è tutto lo spazio
 * in cui una chiamata può ancora riuscire, e chiamare «muro» un guasto che
 * muro non è ricrea esattamente il problema che questa soglia doveva
 * risolvere — una parola che manda a cercare dove non c'è niente.
 *
 * ⚠️ E il numero da guardare non è questo: è quello che finisce nel messaggio.
 * I secondi veri li riporta `detail`, e quelli non dipendono da cosa credo io.
 */
const NETLIFY_WALL_MS = 24_000;

/**
 * Quanto è durata, in parole.
 *
 * 🔒 È l'informazione che non dipende da nessuna mia convinzione: la soglia
 * qui sopra la posso sbagliare — l'ho appena fatto — i secondi trascorsi no.
 */
function after(startedAt: number): string {
  return `dopo ${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

async function post<T>(
  path: string,
  token: string | null,
  body: unknown,
  method = 'POST',
): Promise<BackendResult<T>> {
  if (!token) return { data: null, failure: 'no-token' };

  /* ⚠️ SI GUARDA L'OROLOGIO, ED È L'UNICO MODO DI DISTINGUERLE.

     🔷 «Dice chiamata fallita offline. Adesso ha detto timeout.»

     Erano LO STESSO EVENTO. Netlify uccide una funzione sincrona a dieci
     secondi, e come lo comunica non è deterministico: a volte risponde 502 —
     e allora leggevamo `timeout` — a volte chiude il collegamento e basta,
     e allora la `fetch` esplode e leggevamo `offline`. Stesso muro, due
     parole, e una delle due mandava a controllare la rete.

     🔒 Il tempo trascorso le separa senza ambiguità: una rete che non c'è
     fallisce SUBITO, una funzione uccisa fallisce DOPO NOVE SECONDI E MEZZO.
     Non è un'euristica delicata — è un ordine di grandezza. */
  const startedAt = Date.now();
  const wall = () => Date.now() - startedAt >= NETLIFY_WALL_MS;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // Niente rete, le funzioni non esistono (sviluppo locale)… oppure il muro.
    return { data: null, failure: wall() ? 'timeout' : 'offline', detail: after(startedAt) };
  }

  if (response.status === 401) return { data: null, failure: 'unauthorized' };

  if (response.status === 402) {
    /* Il tetto. Si legge il corpo per sapere quanto è stato speso: è
       l'informazione che rende la cosa comprensibile invece che misteriosa. */
    const body = await response.json().catch(() => null) as { spentUsd?: number } | null;
    noteBudget(true, 0);
    console.warn('[backend] tetto mensile raggiunto', body?.spentUsd);
    return { data: null, failure: 'capped', warning: true, remainingUsd: 0 };
  }

  /* In sviluppo locale `/api/ai` restituisce l'HTML della pagina con un 200
     allegro. Senza questo controllo si proverebbe a leggerlo come JSON e si
     otterrebbe un errore di parsing che non spiega niente a nessuno.

     🔶 Ma non è tutto uguale: un 200 con HTML è «le funzioni non ci sono»,
     un 502 o 504 con HTML è «la funzione è stata uccisa mentre lavorava».
     Erano la stessa parola, e la parola era quella sbagliata delle due. */
  const kind = response.headers.get('content-type') ?? '';
  if (!kind.includes('application/json')) {
    /* Il codice quando c'è, l'orologio quando non basta: Netlify non risponde
       sempre 502 quando uccide una funzione, ma ci mette sempre dieci
       secondi. */
    const killed = response.status === 502 || response.status === 504 || wall();
    return {
      data: null,
      failure: killed ? 'timeout' : 'offline',
      detail: `${after(startedAt)} · HTTP ${response.status}`,
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { warning?: boolean; remainingUsd?: number })
    | null;

  if (!response.ok || payload === null) {
    /* 🔶 Qui il motivo veniva buttato. Il server lo manda — «openai 404: model
       not found» è una cosa, «organization must be verified» è un'altra — e
       chi guarda l'app vedeva solo «error». Due problemi diversi, due rimedi
       diversi, un messaggio solo. */
    const reason = (payload as { reason?: string } | null)?.reason;
    console.warn('[backend] risposta non utilizzabile', response.status, reason ?? '');
    return { data: null, failure: 'error', detail: reason };
  }

  noteBudget(payload.warning, payload.remainingUsd);

  return {
    data: payload,
    failure: null,
    warning: payload.warning,
    remainingUsd: payload.remainingUsd,
  };
}

/** Una richiesta di testo o immagine allo strato AI. */
export function ask<T = VoiceData>(
  token: string | null,
  request: AskRequest,
): Promise<BackendResult<T>> {
  return post<T>('/api/ai', token, request);
}

export function askImage(
  token: string | null,
  prompt: string,
  /**
   * Chi disegna, se hai scelto.
   *
   * 🔶 Viaggia nel campo `voiceModel` come la voce e il compilatore: il server
   * ha UN campo per «il modello che preferisco», e `resolveRoute` lo confronta
   * col catalogo della capacità richiesta. Tre campi diversi sarebbero tre
   * posti dove scordarsi il filtro, e senza filtro il tetto di spesa non sa
   * più cosa sta prezzando.
   */
  imageModel?: string | null,
  /**
   * La forma della tavola. La decide il TIPO DI ASSET, non chi disegna: una
   * griglia di espressioni e un ritratto singolo non hanno la stessa forma, e
   * finché la misura stava dentro l'adattatore del fornitore nessuno dei due
   * poteva dirlo.
   */
  size?: string,
): Promise<BackendResult<ImageData>> {
  return post<ImageData>('/api/ai', token, {
    capability: 'image',
    prompt,
    voiceModel: imageModel,
    size,
  });
}

/* --- Attivazione (§19.5) ----------------------------------------------------
   Cosa il server ha davvero, per la procedura guidata. Mai il contenuto di una
   chiave: solo se c'è.
   -------------------------------------------------------------------------- */

export interface SetupVar {
  name: string;
  what: string;
  required: boolean;
  where: string;
  present: boolean;
}

/** Una scelta che si paga a token: la voce e chi scrive i prompt. */
export interface ModelChoice {
  model: string;
  label: string;
  /** Dollari per milione di token. Serve a scegliere sapendo cosa costa. */
  price: { input: number; output: number };
  it: string;
  ready: boolean;
}

/** Una scelta che si paga a pezzo: chi disegna. */
export interface ImageModelChoice {
  model: string;
  label: string;
  perImage: number;
  it: string;
  ready: boolean;
}

export interface SetupState {
  /** `false` = il segreto non è configurato sul server: è l'errore n.1. */
  serverToken: boolean;
  reason?: string;
  /**
   * «Ce n'è abbastanza per partire?», deciso dal server.
   *
   * 🔒 Non è «ci sono tutte le chiavi»: è «ce n'è almeno una che sa fare
   * questa cosa». Con una chiave OpenAI sola sono veri tutti e due.
   */
  ready?: { voice: boolean; compile: boolean; draw: boolean };
  vars?: SetupVar[];
  voices?: ModelChoice[];
  defaultVoice?: string;
  compilers?: ModelChoice[];
  defaultCompiler?: string;
  images?: ImageModelChoice[];
  defaultImage?: string;
  spentUsd?: number;
  capUsd?: number;
  month?: string;
}

/**
 * Interroga il server sull'attivazione.
 *
 * ⚠️ NON passa da `post()`, e la ragione è tutto il punto di questa funzione:
 * `post()` si ferma da solo quando il token manca, e qui il caso in cui il
 * token manca è proprio quello che vogliamo poter diagnosticare. Il primo
 * avvio in assoluto — niente su Netlify, niente nell'app — deve poter ricevere
 * «VINZMON_TOKEN non è configurato sul server» invece di un silenzio.
 */
export async function loadSetup(token: string | null): Promise<BackendResult<SetupState>> {
  let response: Response;
  try {
    response = await fetch('/api/setup', {
      headers: { authorization: `Bearer ${token ?? ''}` },
    });
  } catch {
    return { data: null, failure: 'offline' };
  }

  if (response.status === 401) return { data: null, failure: 'unauthorized' };

  /* In sviluppo locale l'indirizzo restituisce l'HTML della pagina con un 200:
     è «le funzioni non ci sono», non «va tutto bene». */
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    return { data: null, failure: 'offline' };
  }

  const data = (await response.json().catch(() => null)) as SetupState | null;
  return data ? { data, failure: null } : { data: null, failure: 'error' };
}

/* --- «Ma la richiesta arriva davvero?» --------------------------------------

   🔷 «Non arriva proprio la richiesta su ChatGPT API.»

   ⚠️ Quattro guasti diversi producevano lo stesso schermo che gira, e uno dei
   quattro — un NOME DI MODELLO che il fornitore non conosce — assomiglia
   esattamente a «non arriva niente», perché una richiesta rifiutata non
   compare fra quelle pagate sul cruscotto.

   `/api/ping` chiede al fornitore l'elenco dei suoi modelli: non costa niente,
   non consuma token, e risponde in un secondo. Quindi non può fallire per il
   motivo che sta indagando — ed è l'unica ragione per cui una diagnosi vale
   qualcosa.
   -------------------------------------------------------------------------- */

export interface ProviderProbe {
  provider: string;
  envVar: string;
  configured: boolean;
  /** La richiesta è partita ED è arrivata: abbiamo una risposta HTTP. */
  reachable: boolean;
  /** Il fornitore ha accettato la chiave. */
  authorized: boolean;
  status: number | null;
  ms: number;
  error?: string;
  models: { model: string; known: boolean }[];
}

export interface PingState {
  providers: ProviderProbe[];
  anyAlive: boolean;
  /** `fornitore/modello` per ogni nome che il fornitore non conosce. */
  unknownModels: string[];
}

export function loadPing(token: string | null): Promise<BackendResult<PingState>> {
  return post<PingState>('/api/ping', token, undefined, 'GET');
}

/* --- Salvataggio ------------------------------------------------------------ */

export interface RemoteSave {
  day: number;
  savedAt: string | null;
  state: unknown;
}

export function loadRemote(token: string | null): Promise<BackendResult<RemoteSave>> {
  return post<RemoteSave>('/api/state', token, undefined, 'GET');
}

export function saveRemote(
  token: string | null,
  day: number,
  state: unknown,
): Promise<BackendResult<{ ok: boolean; day: number; savedAt: string }>> {
  return post('/api/state', token, { day, state }, 'PUT');
}

/* --- Dati dalle Shortcut ----------------------------------------------------- */

export interface IngestedDay {
  date: string;
  steps?: number;
  workoutMinutes?: number;
  sleepHours?: number;
  notes: string[];
}

export function loadIngested(
  token: string | null,
): Promise<BackendResult<{ days: IngestedDay[] }>> {
  return post<{ days: IngestedDay[] }>('/api/ingest', token, undefined, 'GET');
}
