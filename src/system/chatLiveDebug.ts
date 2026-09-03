/* ============================================================================
   LIVE DEBUG — canale diagnostico runtime-only (LAB → SYSTEM → LIVE DEBUG)

   🔒 Nessuna persistenza: solo una variabile in memoria + un pub/sub, come
   chat-memory-feedback.ts o chat-room-presence.ts. Niente Zustand
   persistente, niente localStorage, niente invio al server — la Chat
   pubblica, il LAB legge, nient'altro lo sa. Solo id tecnici, ruoli,
   relazioni di parentela e conteggi: mai il testo di un messaggio.
   ========================================================================= */

export type ChatLiveRole = 'system' | 'user' | 'assistant';

export type ChatLiveMessage = {
  id: string;
  role: ChatLiveRole;
  parentId: string | null;
};

export type ChatLiveThreadSnapshot = {
  threadId: string | null;
  remoteId: string | null;
  headId: string | null;
  visibleMessageIds: string[];
  repositoryMessages: ChatLiveMessage[];
  runStatus: 'idle' | 'running';
  updatedAt: string;
};

let current: ChatLiveThreadSnapshot | null = null;
const listeners = new Set<() => void>();

let pending: ChatLiveThreadSnapshot | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** ~300ms basta (richiesta esplicita: niente polling aggressivo) — durante
 * lo streaming di una risposta il thread notifica molto più spesso di
 * così, e i lettori non hanno bisogno di precisione da profiler. */
const FLUSH_MS = 300;

export function publishChatLiveSnapshot(snapshot: ChatLiveThreadSnapshot): void {
  pending = snapshot;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    current = pending;
    listeners.forEach((listener) => listener());
  }, FLUSH_MS);
}

export function currentChatLiveSnapshot(): ChatLiveThreadSnapshot | null {
  return current;
}

export function subscribeChatLiveSnapshot(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* ATTRIBUTION — runtime-only, come sopra: mai persistito. Le nostre tre
   operazioni pubbliche che mutano il repository (append/startRun/import)
   segnano "sto operando io" prima di chiamare l'API vendor, così una
   mutazione osservata subito dopo (via aui.subscribe, vedi
   ChatLiveDebugPublisher) può essere attribuita invece di restare un
   mistero. Se nessuna delle tre è "in corso" quando la mutazione arriva,
   resta onestamente ASSISTANT_UI_INTERNAL — non si inventa un'attribuzione.

   import() muta in modo sincrono (clear()+import()+resetHead(), nessun
   await nel mezzo): l'operazione può essere chiusa esplicitamente subito
   dopo la chiamata. append() invece, per i messaggi non-run (ENTER/
   GREETING), fa il resetHead che conta DOPO un await interno
   (_getInitializePromise) che non possiamo osservare da qui: per questo
   la finestra si chiude da sola con un timeout invece che con una endRepositoryOperation()
   esplicita — è la parte onesta della soluzione, non una certezza. */
export type ChatRepositoryOperation = {
  operation: string;
  caller: string;
  parentId?: string;
  messageId?: string;
};

let activeOperation: ChatRepositoryOperation | null = null;
let activeOperationTimer: ReturnType<typeof setTimeout> | null = null;

/** @param autoExpireMs Rete di sicurezza: se nessuno chiama
 * endRepositoryOperation() prima, l'attribuzione scade da sola invece di
 * restare appesa indefinitamente e attribuire mutazioni successive e
 * slegate alla stessa operazione. */
export function beginRepositoryOperation(op: ChatRepositoryOperation, autoExpireMs = 800): void {
  activeOperation = op;
  if (activeOperationTimer) clearTimeout(activeOperationTimer);
  activeOperationTimer = setTimeout(() => {
    activeOperation = null;
    activeOperationTimer = null;
  }, autoExpireMs);
}

export function endRepositoryOperation(): void {
  activeOperation = null;
  if (activeOperationTimer) {
    clearTimeout(activeOperationTimer);
    activeOperationTimer = null;
  }
}

export function currentRepositoryOperation(): ChatRepositoryOperation | null {
  return activeOperation;
}

/* HISTORY GATE ID — discriminatore, runtime-only. Diverso apposta dal
   meccanismo ATTRIBUTION sopra: quello usa un timer (va bene per
   un'attribuzione "migliore di niente"), ma qui serve sapere ESATTAMENTE
   quale createOwnershipGatedHistoryAdapter() ha causato QUESTA lettura,
   e un valore globale con timeout potrebbe essere sovrascritto da una
   lettura concorrente slegata prima che la nostra si concluda.

   La correttezza qui non viene da un timeout: viene dal fatto che
   AsyncStorageHistoryAdapter.load() chiama storage.getItem(key) come
   PRIMA cosa, in modo sincrono, senza nessun await frapposto (verificato
   nel sorgente vendor). Quindi: il gate marca l'id SUBITO PRIMA di
   chiamare real.load(); getItem() lo consuma (legge e azzera)
   SINCRONAMENTE, prima di qualunque proprio await — nello stesso turno
   dell'event loop, prima che qualunque altro codice (compreso un secondo
   gate) possa intromettersi. Una volta consumato, resta nella closure di
   QUELLA chiamata a getItem(): letture successive, anche di un altro
   gate, non lo vedono più. */
let pendingHistoryReadGateId: string | null = null;

export function markNextHistoryReadAsGated(gateId: string): void {
  pendingHistoryReadGateId = gateId;
}

export function consumePendingHistoryReadGateId(): string | null {
  const id = pendingHistoryReadGateId;
  pendingHistoryReadGateId = null;
  return id;
}

/* ============================================================================
   BLACK BOX — cattura automatica al primo passaggio OK→SUSPECT di un
   detector A-E, runtime-only come tutto il resto di questo modulo. Vive
   qui (non nello stato locale dell'overlay React) apposta: chiudere e
   riaprire DEBUG nella stessa Chat non deve perderla, solo CLEAR VIEW o
   il reload della pagina la cancellano. Nessun testo di messaggio: solo
   gli stessi id/conteggi/enum già usati dallo snapshot e dagli eventi.
   ========================================================================= */
export type ChatIncidentDetectorId = 'messageCountDrop' | 'offBranch' | 'duplicateRun' | 'staleLoad' | 'repositoryDrop' | 'systemOnlyRegression';
export type ChatIncidentTrigger = ChatIncidentDetectorId | 'MANUAL';

export type ChatIncidentDetectorSnapshot = {
  id: ChatIncidentDetectorId;
  label: string;
  suspect: boolean;
  detail: string;
};

export type ChatIncidentEvent = {
  id: string;
  timestamp: string;
  eventType: string;
  status: string;
  metadata?: Record<string, string | number | boolean>;
};

export type ChatIncident = {
  capturedAt: string;
  triggerDetector: ChatIncidentTrigger;
  triggerLabel: string;
  snapshot: ChatLiveThreadSnapshot | null;
  detectors: ChatIncidentDetectorSnapshot[];
  events: ChatIncidentEvent[];
};

let currentIncident: ChatIncident | null = null;
const incidentListeners = new Set<() => void>();

function notifyIncidentListeners(): void {
  incidentListeners.forEach((listener) => listener());
}

export function currentChatIncident(): ChatIncident | null {
  return currentIncident;
}

export function subscribeChatIncident(listener: () => void): () => void {
  incidentListeners.add(listener);
  return () => incidentListeners.delete(listener);
}

export function captureChatIncident(incident: ChatIncident): void {
  currentIncident = incident;
  notifyIncidentListeners();
}

export function clearChatIncident(): void {
  currentIncident = null;
  notifyIncidentListeners();
}

/* Ricorda l'ultimo stato osservato (SUSPECT o no) di ogni detector — solo
   per distinguere una VERA transizione OK→SUSPECT da un detector che era
   già SUSPECT quando qualcuno ha iniziato a guardarlo. Runtime-only,
   sopravvive allo smontaggio di chi lo consulta ma non al reload. */
const lastDetectorSuspect = new Map<ChatIncidentDetectorId, boolean>();

/** @returns true SOLO se questa chiamata rappresenta una transizione
 * fresca da OK a SUSPECT (mai il contrario, mai SUSPECT→SUSPECT). */
export function noteDetectorTransitionToSuspect(id: ChatIncidentDetectorId, suspect: boolean): boolean {
  const was = lastDetectorSuspect.get(id) ?? false;
  lastDetectorSuspect.set(id, suspect);
  return suspect && !was;
}
