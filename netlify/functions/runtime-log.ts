import { authorize, denied, json } from './_shared/auth';
import { appendRuntimeEvent, recentRuntimeEvents, sanitizeRuntimeEvent, type RuntimeEvent } from './_shared/runtimeLog';

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method === 'GET') return json({ events: await recentRuntimeEvents() });
  if (request.method !== 'POST') return json({ error: 'solo GET/POST' }, 405);
  try {
    const body = await request.json() as Partial<RuntimeEvent>;
    const event = sanitizeRuntimeEvent(body);
    if (!event || !(['CLIENT_RUNTIME_ERROR', 'CHAT_SEND_START', 'CHAT_RESPONSE_OK', 'CHAT_RESPONSE_ERROR'] as string[]).includes(event.eventType)) return json({ error: 'evento non valido' }, 400);
    await appendRuntimeEvent(event);
    return json({ ok: true });
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }
}

export const config = { path: '/api/runtime-log' };
