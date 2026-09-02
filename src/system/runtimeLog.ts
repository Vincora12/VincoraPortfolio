export type RuntimeClientEvent = {
  eventType:
    | 'CLIENT_RUNTIME_ERROR'
    | 'CHAT_SEND_START'
    | 'CHAT_RESPONSE_OK'
    | 'CHAT_RESPONSE_ERROR'
    | 'CHAT_UI_SUBMIT'
    | 'CHAT_MODEL_ADAPTER_START'
    | 'CHAT_BASE_MODEL_START'
    | 'CHAT_MEMORY_FETCH_START'
    | 'CHAT_AI_FETCH_START'
    | 'CHAT_THREAD_INITIALIZE_START'
    | 'CHAT_THREAD_INITIALIZE_RESOLVED'
    | 'CHAT_THREAD_PROMOTE_START'
    | 'CHAT_THREAD_PROMOTE_OK'
    | 'CHAT_RUN_START'
    | 'CHAT_PROMOTION_TIMELINE_BEFORE'
    | 'CHAT_PROMOTION_TIMELINE_PERSISTED'
    | 'CHAT_PROMOTION_TIMELINE_AFTER'
    | 'CHAT_CLIENT_ERROR'
    | 'STORAGE_LOCAL_WRITE_START'
    | 'STORAGE_LOCAL_WRITE_OK'
    | 'STORAGE_CLIENT_ERROR'
    /* STORAGE STABILIZATION STEP 1/3 — `vinzmon-state` fallisce a 2 MB e
       finora falliva IN SILENZIO (`scheduleRemoteSave` lo dice nel proprio
       commento: «non si annuncia e non si ritenta»). Il salvataggio locale
       resta comunque, ma il backup server smette di aggiornarsi senza che
       nessuno lo veda finché non si perde il device. */
    | 'STATE_REMOTE_SAVE_START'
    | 'STATE_REMOTE_SAVE_OK'
    | 'STATE_REMOTE_SAVE_ERROR'
    /* MEMORY OBSERVABILITY MICRO-STEP — la chat ha due percorsi di risposta
       (BASE e LOCAL_TOOLS) e solo BASE esegue retrieval Mem0. Questi eventi
       non correggono nulla: rendono visibile quale percorso è stato scelto
       e cosa è successo al retrieval/capture, per confermare la diagnosi
       sull'uso reale prima di toccare l'architettura. */
    | 'CHAT_ROUTE_SELECTED'
    | 'MEMORY_RETRIEVAL_START'
    | 'MEMORY_RETRIEVAL_OK'
    | 'MEMORY_RETRIEVAL_ERROR'
    | 'MEMORY_RETRIEVAL_SKIPPED'
    | 'MEMORY_CAPTURE_START'
    | 'MEMORY_CAPTURE_OK'
    | 'MEMORY_CAPTURE_ERROR'
    | 'MEMORY_CAPTURE_SKIPPED';
  status: 'START' | 'PASS' | 'FAIL';
  scope: 'system' | 'chat' | 'memory';
  requestId?: string;
  conversationId?: string;
  messageId?: string;
  capability?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  action?: string;
  error?: string;
  errorName?: string;
  operation?: string;
  keyPrefix?: string;
  payloadBytes?: number;
  storage?: string;
  source?: string;
  errorMessage?: string;
  errorCode?: number;
  /** Il codice HTTP della risposta — distinto da `errorCode`, che è il
      `DOMException.code` di uno storage pieno, non uno status di rete. */
  statusCode?: number;
  /** Il tetto reale che il server ha applicato — `MAX_BYTES` di
      `netlify/functions/state.ts`, mai un numero duplicato qui. */
  limitBytes?: number;
  metadata?: Record<string, string | number | boolean>;
};

export function postRuntimeEvent(event: RuntimeClientEvent): void {
  try {
    const token = savedToken();
    if (!token) return;
    void fetch('/api/runtime-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(event),
    }).catch(() => undefined);
  } catch { /* observability must never affect the app */ }
}

/** Diagnostic checkpoints for chat startup. Observability is best-effort and
 * deliberately independent from the assistant-ui model lifecycle. */
export function postChatDiagnostic(
  eventType: Extract<RuntimeClientEvent['eventType'], `CHAT_${string}`>,
  stage?: string,
): void {
  postRuntimeEvent({
    eventType,
    status: eventType === 'CHAT_CLIENT_ERROR' ? 'FAIL' : 'START',
    scope: 'chat',
    action: stage,
  });
}

export function postChatClientError(stage: string, error: unknown): void {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/(api[_-]?key|authorization|bearer|token)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 240);
  postRuntimeEvent({
    eventType: 'CHAT_CLIENT_ERROR',
    status: 'FAIL',
    scope: 'chat',
    action: stage,
    error: message || 'Errore client non specificato',
  });
}

/** Storage diagnostics are deliberately metadata-only: never send the value
 * (which may contain messages or base64 attachments) to the runtime log. */
export function postStorageDiagnostic(input: {
  eventType: 'STORAGE_LOCAL_WRITE_START' | 'STORAGE_LOCAL_WRITE_OK' | 'STORAGE_CLIENT_ERROR';
  operation: string;
  keyPrefix: string;
  payloadBytes: number;
  error?: unknown;
}): void {
  const raw = input.error instanceof Error ? input.error.message : String(input.error ?? '');
  const errorMessage = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/(api[_-]?key|authorization|bearer|token|secret|password)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 240);
  postRuntimeEvent({
    eventType: input.eventType,
    status: input.eventType === 'STORAGE_CLIENT_ERROR' ? 'FAIL' : input.eventType.endsWith('_OK') ? 'PASS' : 'START',
    scope: 'system',
    action: input.operation,
    operation: input.operation,
    keyPrefix: input.keyPrefix.slice(0, 100),
    payloadBytes: Number.isFinite(input.payloadBytes) ? Math.max(0, Math.round(input.payloadBytes)) : 0,
    storage: 'localStorage',
    ...(input.error ? { errorName: input.error instanceof Error ? input.error.name : undefined, error: errorMessage || 'Errore storage' } : {}),
  });
}
/**
 * Il salvataggio server (`/api/state`) osservabile: START prima della
 * `fetch`, OK o ERROR dopo. `vinzmon-state` ha un tetto di 2 MB e finora un
 * salvataggio troppo grande veniva scartato senza dirlo a nessuno — questo
 * non lo evita, lo rende visibile in SYSTEM.LAB → RUNTIME LOG.
 */
export function postStateSaveDiagnostic(input: {
  eventType: 'STATE_REMOTE_SAVE_START' | 'STATE_REMOTE_SAVE_OK' | 'STATE_REMOTE_SAVE_ERROR';
  payloadBytes: number;
  statusCode?: number;
  limitBytes?: number;
  errorName?: string;
  errorMessage?: string;
  /** Un motivo tecnico distinguibile, es. `PAYLOAD_TOO_LARGE`. */
  reason?: string;
}): void {
  postRuntimeEvent({
    eventType: input.eventType,
    status: input.eventType === 'STATE_REMOTE_SAVE_ERROR' ? 'FAIL' : input.eventType === 'STATE_REMOTE_SAVE_OK' ? 'PASS' : 'START',
    scope: 'system',
    action: 'state/store remote save',
    payloadBytes: Number.isFinite(input.payloadBytes) ? Math.max(0, Math.round(input.payloadBytes)) : 0,
    ...(typeof input.statusCode === 'number' ? { statusCode: input.statusCode } : {}),
    ...(typeof input.limitBytes === 'number' ? { limitBytes: input.limitBytes } : {}),
    ...(input.errorName ? { errorName: input.errorName } : {}),
    ...(input.errorMessage ? { error: input.errorMessage } : {}),
    ...(input.reason ? { metadata: { reason: input.reason } } : {}),
  });
}

import { savedToken } from '../brain/stream';
