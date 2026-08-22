import { getStore } from '@netlify/blobs';
import { authorize, denied, json } from './_shared/auth';

const store = () => getStore({ name: 'vinzmon-user-data', consistency: 'strong' });
/* Una chat può contenere fotografie codificate nel messaggio. */
const MAX_BYTES = 25 * 1024 * 1024;

function safeKey(request: Request): string | null {
  const key = new URL(request.url).searchParams.get('key')?.trim() ?? '';
  return key.length > 0 && key.length <= 300 ? `data:${key}` : null;
}

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  const key = safeKey(request);
  if (!key) return json({ error: 'chiave non valida' }, 400);

  if (request.method === 'GET') {
    const value = await store().get(key);
    return value === null ? json({ value: null }) : json({ value });
  }
  if (request.method === 'DELETE') {
    await store().delete(key);
    return json({ ok: true });
  }
  if (request.method !== 'PUT') return json({ error: 'metodo non valido' }, 405);

  const value = await request.text();
  if (new TextEncoder().encode(value).byteLength > MAX_BYTES) return json({ error: 'dato troppo grande' }, 413);
  await store().set(key, value);
  return json({ ok: true });
}

export const config = { path: '/api/user-data' };
