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
