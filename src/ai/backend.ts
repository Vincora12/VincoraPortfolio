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
import type { Lesson } from '../engine/types';
import type { V2Issue } from './v2Issues';

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
  /**
   * Quanto ragionare, detto per esteso.
   *
   * ⚠️ `thinking` sa dire due cose sole — sì o no — e gli step ne vogliono
   * tre: il Character Master `medium`, Bio e Prompt immagini `low`, Insegna
   * `none`. Quando c'è, questo campo vince su `thinking`.
   */
  effort?: 'none' | 'low' | 'medium';
  maxTokens?: number;
  /** Strumenti che il modello può chiamare. Li esegue il browser. */
  tools?: ToolDefinition[];
  /** Impone l'unico risultato strutturato richiesto da una UI specializzata. */
  toolChoice?: string;
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
  /* 🔷 LAB INFORMATION ARCHITECTURE CLEANUP — «Cost per Mon… use an
     existing correlation identifier if possible, else implement the
     smallest safe correlation metadata for future runs.» Non esisteva
     nessun id di correlazione: né sul client né sul server. Questo campo
     è quel minimo — il nome del .mon per cui questa chiamata lavora,
     quando lo sappiamo — e il server lo scrive nell'evento di spesa solo
     se presente. Gli eventi vecchi restano senza, ed è onesto che sia
     così. */
  monName?: string;
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
  /**
   * ⚠️ QUANTO È DURATA LA CHIAMATA. Solo la chiamata.
   *
   * 🔷 «Potrebbe essere anche che in quei secondi è contato altro.» — ed era
   * l'obiezione giusta, contro una mia deduzione fatta troppo in fretta.
   *
   * Il contatore dell'interfaccia parte quando premi il pulsante, e fino alla
   * risposta ci stanno dentro anche: il caricamento del pezzo di codice che
   * serve (una richiesta di rete a sé, la prima volta), la costruzione di un
   * prompt da sedicimila caratteri, e dopo la lettura del JSON, il
   * salvataggio e il ridisegno. Da diciassette secondi TOTALI non si può
   * concludere niente su quanto ha lavorato la funzione.
   *
   * 🔒 Questo numero misura una cosa sola: dalla `fetch` alla risposta. È
   * l'unico che si può confrontare col tetto della piattaforma.
   */
  ms?: number;
  /** Il codice HTTP vero, quando una risposta è arrivata. Assente per
      `no-token`/`offline`/`timeout`, dove non c'è mai stata una risposta da
      leggere. Serve a distinguere un 413 da un errore generico senza dover
      indovinare dal testo di `detail`. */
  status?: number;
  /** Presenti solo per `/api/state`: il server li manda sia sul salvataggio
      riuscito sia sul 413, sempre dallo stesso `MAX_BYTES` — mai un secondo
      numero calcolato qui. */
  payloadBytes?: number;
  limitBytes?: number;
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

export interface UsageSummary {
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  images: number;
}

export interface UsageEvent {
  id: string;
  timestamp: string;
  action: string;
  subsystem: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  images: number;
  estimatedCostUsd: number;
  /** Assente sugli eventi registrati prima di questo campo — onesto, non si inventa. */
  monName?: string;
}

export interface UsageDashboard {
  today: UsageSummary;
  last7Days: UsageSummary;
  month: UsageSummary;
  /** Speso questo mese, in dollari: lo stesso numero di `month.costUsd`,
      dichiarato a parte perché è quello che il tetto confronta. */
  spentUsd: number;
  /** ⚠️ Il tetto EFFETTIVO applicato dal server, non un default del browser. */
  monthlyCapUsd: number;
  capSource: 'runtime' | 'default';
  capUpdatedAt?: string;
  capMinUsd: number;
  capMaxUsd: number;
  remainingUsd: number;
  percentUsed: number;
  /** Il server ha già smesso di chiamare l'AI. */
  capped: boolean;
  monthKey: string;
  /** Spesa giorno per giorno del mese in corso, per il grafico. */
  daily: { day: number; costUsd: number }[];
  byCapability: Record<string, UsageSummary>;
  byModel: Record<string, UsageSummary>;
  recentEvents: UsageEvent[];
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
    return {
      data: null,
      failure: wall() ? 'timeout' : 'offline',
      detail: after(startedAt),
      ms: Date.now() - startedAt,
    };
  }

  if (response.status === 401)
    return { data: null, failure: 'unauthorized', ms: Date.now() - startedAt, status: response.status };

  if (response.status === 402) {
    /* Il tetto. Si legge il corpo per sapere quanto è stato speso: è
       l'informazione che rende la cosa comprensibile invece che misteriosa. */
    const body = await response.json().catch(() => null) as { spentUsd?: number } | null;
    noteBudget(true, 0);
    console.warn('[backend] tetto mensile raggiunto', body?.spentUsd);
    return {
      data: null,
      failure: 'capped',
      warning: true,
      remainingUsd: 0,
      ms: Date.now() - startedAt,
    };
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
      ms: Date.now() - startedAt,
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
    const errorBody = payload as { reason?: string; payloadBytes?: number; limitBytes?: number } | null;
    const reason = errorBody?.reason;
    console.warn('[backend] risposta non utilizzabile', response.status, reason ?? '');
    return {
      data: null,
      failure: 'error',
      detail: reason,
      ms: Date.now() - startedAt,
      status: response.status,
      payloadBytes: errorBody?.payloadBytes,
      limitBytes: errorBody?.limitBytes,
    };
  }

  noteBudget(payload.warning, payload.remainingUsd);

  return {
    data: payload,
    failure: null,
    warning: payload.warning,
    remainingUsd: payload.remainingUsd,
    ms: Date.now() - startedAt,
  };
}

export function loadUsage(token: string | null): Promise<BackendResult<UsageDashboard>> {
  return post<UsageDashboard>('/api/usage', token, undefined, 'GET');
}

/**
 * Scrive il tetto mensile.
 *
 * ⚠️ Va allo STESSO posto che `checkCap()` legge sul server. Non c'è una copia
 * nel browser da tenere allineata: il LAB manda il numero e poi rilegge, così
 * quello che vedi è quello che il server applicherà alla prossima chiamata.
 */
export function saveMonthlyCap(
  token: string | null,
  monthlyCapUsd: number,
): Promise<BackendResult<{ monthlyCapUsd: number; capSource: string }>> {
  return post<{ monthlyCapUsd: number; capSource: string }>(
    '/api/usage',
    token,
    { monthlyCapUsd },
    'PUT',
  );
}

export interface RuntimeEvent {
  id: string; timestamp: string; eventType: string; status: 'START' | 'PASS' | 'FAIL'; scope: string;
  action?: string; requestId?: string; conversationId?: string; messageId?: string; monId?: string; worldId?: string;
  capability?: string; provider?: string; model?: string; durationMs?: number; error?: string;
  errorName?: string; payloadBytes?: number; statusCode?: number; limitBytes?: number;
  metadata?: Record<string, string | number | boolean>;
}
export function loadRuntimeLog(token: string | null): Promise<BackendResult<{ events: RuntimeEvent[] }>> {
  return post<{ events: RuntimeEvent[] }>('/api/runtime-log', token, undefined, 'GET');
}

/** V2 ISSUES — conoscenza di prodotto per la ricostruzione pulita, non
 * osservabilità tecnica. Vedi docs/PROTOTYPE_V1_STATUS.md e
 * netlify/functions/v2-issues.ts: unica fonte di verità server-side,
 * mai Mem0/localStorage/Runtime Log. */
export function loadV2Issues(token: string | null): Promise<BackendResult<{ issues: V2Issue[] }>> {
  return post<{ issues: V2Issue[] }>('/api/v2-issues', token, undefined, 'GET');
}

export function createV2Issue(
  token: string | null,
  input: {
    title: string;
    area: V2Issue['area'];
    type: V2Issue['type'];
    observation: string;
    expectedBehavior?: string;
    finalRequirement?: string;
  },
): Promise<BackendResult<{ issue: V2Issue; merged: boolean }>> {
  return post<{ issue: V2Issue; merged: boolean }>('/api/v2-issues', token, input, 'POST');
}

/** Una richiesta di testo o immagine allo strato AI. */
export function ask<T = VoiceData>(
  token: string | null,
  request: AskRequest,
): Promise<BackendResult<T>> {
  return post<T>('/api/ai', token, request);
}

/** 🔷 AGENT.LAB V1 — una domanda all'inspector tecnico del progetto.
 *  Il server esegue da solo il giro lettura-strumenti-risposta
 *  (`netlify/functions/agent-lab.ts`): qui non c'è nessun ciclo da orchestrare,
 *  solo una richiesta e una risposta, come per qualunque altra chiamata AI. */
export interface AgentLabRequest {
  message: string;
  messages: { role: 'user' | 'assistant'; text: string }[];
  context?: { stepId?: string; stepLabel?: string; stepDetail?: string; stepPhase?: string } | null;
}

export interface AgentLabResponse {
  text: string;
  toolTrace: { name: string; ok: boolean }[];
  model: string;
  costUsd: number;
  warning?: boolean;
}

export function askAgentLab(token: string | null, request: AgentLabRequest): Promise<BackendResult<AgentLabResponse>> {
  return post<AgentLabResponse>('/api/agent-lab', token, request);
}

export interface PersonalMemorySearchResult {
  memories: Array<{ id?: string; text: string; score?: number }>;
}

/**
 * Ricerca di memoria personale rilevante per un testo, senza sapere quale
 * backend (ME Model o Mem0) la serva — lo decide il server (Core memory
 * boundary, `netlify/functions/_shared/core/memory.ts`). Usata per portare
 * contesto rilevante dentro un'interpretazione, non per leggere l'intera
 * memoria.
 */
export function searchPersonalMemory(
  token: string | null,
  query: string,
): Promise<BackendResult<PersonalMemorySearchResult>> {
  return post<PersonalMemorySearchResult>('/api/me-memory', token, { query }, 'POST');
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
  /** Il CHARACTER MASTER da allegare, in base64: la consistenza vera. */
  reference?: string | null,
  /**
   * 🔷 Quanto deve venire bene.
   *
   * `low` è la BOZZA: costa circa un nono di `medium` (che è il default del
   * fornitore, cioè quello che abbiamo sempre pagato senza dichiararlo) e
   * serve a rispondere alla domanda «la pipeline funziona e la creatura
   * somiglia a quello che volevo?». Per l'immagine che poi TIENI serve la
   * qualità piena.
   *
   * 🔒 `undefined` = il server decide, e il server sceglie `medium`: il
   * comportamento di prima resta il predefinito, questo parametro apre una
   * porta e non cambia il prodotto.
   */
  quality?: 'low' | 'medium' | 'high',
  /** Per chi sta costando: vedi `AskRequest.monName`. */
  monName?: string,
): Promise<BackendResult<ImageData>> {
  return post<ImageData>('/api/ai', token, {
    capability: 'image',
    prompt,
    voiceModel: imageModel,
    ...(reference ? { reference } : {}),
    ...(quality ? { quality } : {}),
    ...(monName ? { monName } : {}),
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
  /** Un fornitore per volta: la sua chiave è configurata sul server o no.
      Vale per QUALUNQUE scelta di QUALUNQUE capacità — non solo voce,
      compilatore e immagini. */
  providerReady?: Record<string, boolean>;
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

/* --- Il lavoro lungo: si avvia, e si va a riprendere ------------------------

   🔷 «Voglio far funzionare l'app con Sol. Che devi fare?»

   ⚠️ IL MURO NON SI SUPERA ASPETTANDO MENO: SI SUPERA NON ASPETTANDO.

   Finora ho affrontato i dieci secondi dalla parte sbagliata, abbassando il
   ragionamento finché la risposta ci stesse. Il risultato è che scegliere Sol
   costava il doppio e non dava niente: un Terra caro.

   Qui invece nessuna chiamata aspetta il modello:

     avvio    torna un identificativo in un istante
     attesa   la tiene OpenAI, che non ha un muro
     ritiro   «è pronto?», e anche questa torna in un istante

   🔒 Il tempo passa nel BROWSER, non dentro una funzione. È l'unico posto di
   tutta la catena dove aspettare non costa niente e non uccide nessuno.
   -------------------------------------------------------------------------- */

/**
 * Ogni quanto si chiede se è pronto — e NON è un numero fisso.
 *
 * ⚠️ A intervallo fisso di 2,5 secondi un lavoro finito subito dopo una
 * domanda resta invisibile per altri 2,5: su una risposta veloce è quasi tutto
 * il tempo che percepisci, ed è tempo in cui non sta succedendo niente.
 *
 * 🔒 La scala parte fitta e si allarga. Le prime domande costano poco — sono
 * chiamate a vuoto di pochi byte, non token — e coprono il caso in cui il
 * modello ha già finito. Quando è chiaro che ci vorrà, si rallenta: un lavoro
 * da un minuto non ha bisogno di essere interrogato trenta volte.
 *
 * Con questa scala una risposta pronta a 1s si vede a 0,8s invece che a 2,5;
 * un lavoro da 60s costa 27 domande invece di 24. Il prezzo è nullo — il
 * ritiro non consuma token — e il guadagno si sente proprio dove serve.
 */
const RITMO_MS = [800, 1200, 1800, 2500];

function attesa(giro: number): number {
  return RITMO_MS[Math.min(giro, RITMO_MS.length - 1)]!;
}

/**
 * Quanto si insiste prima di lasciar perdere.
 *
 * ⚠️ Otto minuti, e il numero non è a caso: OpenAI tiene il risultato per una
 * decina di minuti, quindi chiedere più a lungo vorrebbe dire chiedere di una
 * cosa che intanto è stata buttata. E un ragionamento che supera gli otto
 * minuti non è lento: è incastrato.
 */
const PAZIENZA_MS = 8 * 60 * 1000;

export interface LongOutcome {
  text: string | null;
  failure: BackendFailure | null;
  detail?: string;
  /** Quanto è durato in tutto, dall'avvio al ritiro. */
  ms: number;
}

/**
 * Avvia il lavoro e lo va a riprendere finché non è pronto.
 *
 * `onTick` riceve i secondi passati: serve a far vedere che è vivo, perché su
 * un'attesa di minuti i puntini da soli non bastano più.
 */
export async function askLong(
  token: string | null,
  request: AskRequest,
  onTick?: (secondi: number) => void,
): Promise<LongOutcome> {
  const from = Date.now();

  const avvio = await post<{ jobId?: string }>('/api/ai', token, {
    ...request,
    background: true,
  });

  if (!avvio.data?.jobId) {
    return {
      text: null,
      failure: avvio.failure ?? 'error',
      detail: avvio.detail,
      ms: Date.now() - from,
    };
  }

  const jobId = avvio.data.jobId;

  for (let passo = 0; ; passo++) {
    if (Date.now() - from > PAZIENZA_MS) {
      return { text: null, failure: 'timeout', detail: 'oltre otto minuti', ms: Date.now() - from };
    }

    await new Promise((r) => setTimeout(r, attesa(passo)));
    onTick?.(Math.round((Date.now() - from) / 1000));

    const giro = await post<{ text?: string; status?: string }>('/api/ai', token, {
      capability: request.capability,
      voiceModel: request.voiceModel,
      jobId,
    });

    /* 🔒 Un giro andato storto NON chiude tutto: la rete di un telefono cade e
       torna, e buttare via un lavoro che sta ancora girando dall'altra parte
       per un buco di due secondi sarebbe la cosa più stupida di tutta questa
       funzione. Si insiste finché la pazienza regge. */
    if (giro.failure === 'offline' || giro.failure === 'timeout') continue;

    if (giro.failure) {
      return { text: null, failure: giro.failure, detail: giro.detail, ms: Date.now() - from };
    }
    if (giro.data?.text) {
      return { text: giro.data.text, failure: null, ms: Date.now() - from };
    }
  }
}

/* --- Le lezioni, che non appartengono a nessuna partita ---------------------

   🔷 «No, devono sopravvivere sempre.»

   ⚠️ Chiave separata da `/api/state`, e non è pignoleria: quel salvataggio è
   arbitrato dal GIORNO DI GIOCO, e dopo un RICOMINCIA DA CAPO il giorno torna
   a 1. Il server rifiuterebbe di scrivere, e tutto quello che gli insegni
   dopo un reset non arriverebbe mai.

   🔒 Il PUT non manda «lo stato giusto»: manda quello che questo telefono sa,
   e riceve indietro la FUSIONE. Chi scrive adotta il risultato, quindi due
   telefoni convergono senza che nessuno dei due debba avere ragione.
   -------------------------------------------------------------------------- */

export interface LessonBook {
  lessons: Lesson[];
  /** Gli id dimenticati: senza, una cancellazione tornerebbe indietro. */
  forgotten: string[];
  /** Il documento sostituito, se ce n'è uno. Fra due vince il più recente. */
  memory?: string | null;
  memoryAt?: string | null;
  savedAt: string | null;
}

export function loadLessons(token: string | null): Promise<BackendResult<LessonBook>> {
  return post<LessonBook>('/api/lessons', token, undefined, 'GET');
}

export function syncLessons(
  token: string | null,
  book: { lessons: Lesson[]; forgotten: string[]; memory: string | null; memoryAt: string | null },
): Promise<BackendResult<LessonBook>> {
  return post<LessonBook>('/api/lessons', token, { ...book, savedAt: null }, 'PUT');
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
  /* ⚠️ Il flag che permette al giorno di tornare indietro. Esiste per una
     sola strada — LAB → SYSTEM → SAVE → NUOVA PARTITA — e il salvataggio
     automatico (`scheduleRemoteSave`) non lo passa mai: se lo passasse,
     ogni scrittura potrebbe cancellare una partita più avanti, che è
     esattamente ciò che il guardiano sul server esiste per impedire. */
  opts?: { reset?: boolean },
): Promise<BackendResult<{ ok: boolean; day: number; savedAt: string; payloadBytes: number; limitBytes: number; reset?: boolean }>> {
  return post('/api/state', token, opts?.reset ? { day, state, reset: true } : { day, state }, 'PUT');
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

/* --- La coda di /api/shortcut (brief Shortcuts §3) --------------------------
   Quello che una Shortcut ha già chiesto di salvare, con la stima già fatta
   dal server quando serviva un'AI: il client applica, non ricalcola. */

export type ShortcutMealSlot = 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena' | 'extra';

export interface PendingShortcutAction {
  id: string;
  action: 'meal' | 'workout' | 'checkin' | 'weight';
  at: string;
  meal?: {
    slot: ShortcutMealSlot;
    description: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    confidence: 'high' | 'medium' | 'low';
  };
  workout?: { title: string; details: string; minutes: number };
  checkin?: { text: string };
  weight?: { kg: number };
}

/** Svuota la coda: come `loadIngested`, il .mon la chiede quando è pronto e il
    server la consegna una volta sola — non un flusso, una cassetta della posta. */
export function loadShortcutQueue(
  token: string | null,
): Promise<BackendResult<{ pending: PendingShortcutAction[] }>> {
  return post<{ pending: PendingShortcutAction[] }>('/api/shortcut', token, undefined, 'GET');
}

/* --- VINZ.LAB → SHORTCUT API (brief §11) ------------------------------------- */

export interface ShortcutActionInfo {
  id: string;
  label: string;
  it: string;
  input: string;
  aiPolicy: 'never' | 'sometimes' | 'usually';
  enabled: boolean;
}

export interface ShortcutCallInfo {
  action: string;
  at: string;
  ok: boolean;
  ms: number;
  costUsd: number;
  reason?: string;
}

export interface ShortcutStatus {
  tokenConfigured: boolean;
  actions: ShortcutActionInfo[];
  recent: ShortcutCallInfo[];
  endpoint: string;
}

export function loadShortcutStatus(token: string | null): Promise<BackendResult<ShortcutStatus>> {
  return post<ShortcutStatus>('/api/shortcut-status', token, undefined, 'GET');
}
