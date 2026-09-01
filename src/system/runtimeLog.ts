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
    | 'CHAT_CLIENT_ERROR';
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
import { savedToken } from '../brain/stream';
