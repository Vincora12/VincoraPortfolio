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
    | 'CHAT_CLIENT_ERROR'
    | 'STORAGE_LOCAL_WRITE_START'
    | 'STORAGE_LOCAL_WRITE_OK'
    | 'STORAGE_CLIENT_ERROR';
  status: 'START' | 'PASS' | 'FAIL';
  scope: 'system' | 'chat';
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
import { savedToken } from '../brain/stream';
