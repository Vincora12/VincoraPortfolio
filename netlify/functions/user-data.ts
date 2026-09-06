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
    const entry = await store().getWithMetadata(key) as { data: string; etag: string; metadata: { deleted?: boolean } } | null;
    return json({ value: !entry || entry.metadata?.deleted ? null : entry.data, revision: entry?.etag ?? null });
  }
  if (request.method !== 'PUT' && request.method !== 'DELETE') return json({ error: 'metodo non valido' }, 405);

  const value = request.method === 'DELETE' ? '' : await request.text();
  if (new TextEncoder().encode(value).byteLength > MAX_BYTES) return json({ error: 'dato troppo grande' }, 413);
  const entry = await store().getMetadata(key);
  const expected = request.headers.get('if-match');
  if (!expected || expected !== (entry?.etag ?? 'vinzmon-new')) return json({ error: 'copia modificata da un altro client', code: 'STORAGE_CONFLICT' }, 409);
  // A conditional tombstone preserves delete semantics without a check/delete race.
  const result = await store().set(key, value, {
    ...(entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true }),
    metadata: { deleted: request.method === 'DELETE' },
  });
  if (!result.modified) return json({ error: 'scrittura concorrente', code: 'STORAGE_CONFLICT' }, 409);
  if (!result.etag) return json({ error: 'scrittura non confermata' }, 503);
  if ((await store().getMetadata(key))?.etag !== result.etag) return json({ error: 'copia aggiornata durante la conferma', code: 'STORAGE_CONFLICT' }, 409);
  return json({ ok: true, revision: result.etag });
}

export const config = { path: '/api/user-data' };
