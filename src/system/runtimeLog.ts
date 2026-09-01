export type RuntimeClientEvent = {
  eventType: 'CLIENT_RUNTIME_ERROR' | 'CHAT_SEND_START' | 'CHAT_RESPONSE_OK' | 'CHAT_RESPONSE_ERROR';
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
import { savedToken } from '../brain/stream';
