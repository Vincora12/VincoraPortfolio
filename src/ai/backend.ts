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
   * Chi vuoi che dia la voce, se hai scelto.
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
export type BackendFailure = 'no-token' | 'offline' | 'unauthorized' | 'capped' | 'error';

export interface BackendResult<T> {
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

async function post<T>(
  path: string,
  token: string | null,
  body: unknown,
  method = 'POST',
): Promise<BackendResult<T>> {
  if (!token) return { data: null, failure: 'no-token' };

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // Niente rete, o le funzioni non esistono (sviluppo locale).
    return { data: null, failure: 'offline' };
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
     otterrebbe un errore di parsing che non spiega niente a nessuno. */
  const kind = response.headers.get('content-type') ?? '';
  if (!kind.includes('application/json')) {
    return { data: null, failure: 'offline' };
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { warning?: boolean; remainingUsd?: number })
    | null;

  if (!response.ok || payload === null) {
    console.warn('[backend] risposta non utilizzabile', response.status);
    return { data: null, failure: 'error' };
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
): Promise<BackendResult<ImageData>> {
  return post<ImageData>('/api/ai', token, { capability: 'image', prompt });
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

export interface SetupState {
  /** `false` = il segreto non è configurato sul server: è l'errore n.1. */
  serverToken: boolean;
  reason?: string;
  vars?: SetupVar[];
  voices?: { model: string; label: string; ready: boolean }[];
  defaultVoice?: string;
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
