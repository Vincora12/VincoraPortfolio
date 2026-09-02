import { authorize, denied, json } from './_shared/auth';
import { appendRuntimeEvent, recentRuntimeEvents, sanitizeRuntimeEvent, type RuntimeEvent } from './_shared/runtimeLog';

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method === 'GET') return json({ events: await recentRuntimeEvents() });
  if (request.method !== 'POST') return json({ error: 'solo GET/POST' }, 405);
  try {
    const body = await request.json() as Partial<RuntimeEvent>;
    const event = sanitizeRuntimeEvent(body);
    if (!event || !(['CLIENT_RUNTIME_ERROR', 'CHAT_SEND_START', 'CHAT_RESPONSE_OK', 'CHAT_RESPONSE_ERROR', 'CHAT_UI_SUBMIT', 'CHAT_MODEL_ADAPTER_START', 'CHAT_BASE_MODEL_START', 'CHAT_MEMORY_FETCH_START', 'CHAT_AI_FETCH_START', 'CHAT_THREAD_INITIALIZE_START', 'CHAT_THREAD_INITIALIZE_RESOLVED', 'CHAT_THREAD_PROMOTE_START', 'CHAT_THREAD_PROMOTE_OK', 'CHAT_RUN_START', 'CHAT_PROMOTION_TIMELINE_BEFORE', 'CHAT_PROMOTION_TIMELINE_PERSISTED', 'CHAT_PROMOTION_TIMELINE_AFTER', 'CHAT_CLIENT_ERROR', 'STORAGE_LOCAL_WRITE_START', 'STORAGE_LOCAL_WRITE_OK', 'STORAGE_CLIENT_ERROR', 'LOCAL_STORAGE_WRITE_START', 'LOCAL_STORAGE_WRITE_OK', 'LOCAL_STORAGE_WRITE_ERROR', 'STATE_REMOTE_SAVE_START', 'STATE_REMOTE_SAVE_OK', 'STATE_REMOTE_SAVE_ERROR'] as string[]).includes(event.eventType)) return json({ error: 'evento non valido' }, 400);
    await appendRuntimeEvent(event);
    return json({ ok: true });
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }
}

export const config = { path: '/api/runtime-log' };
