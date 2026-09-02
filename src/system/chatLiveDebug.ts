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
