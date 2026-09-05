import { getStore } from '@netlify/blobs';
import { authorize, denied, json } from './_shared/auth';

const store = () => getStore({ name: 'vinzmon-user-data', consistency: 'strong' });
/* Una chat può contenere fotografie codificate nel messaggio. */
const MAX_BYTES = 25 * 1024 * 1024;

function safeKey(request: Request): string | null {
  const key = new URL(request.url).searchParams.get('key')?.trim() ?? '';
  return key.length > 0 && key.length <= 300 ? `data:${key}` : null;
}

/* REMOTE CHAT HISTORY V1 — scrittura condizionale, ma solo per chi la chiede.
   `If-Match`/`X-Only-If-New` sono mandati SOLO da `serverStorage.ts` per le
   due chiavi della cronologia chat (`...:messages:<id>` e `...:threads`) —
   le uniche dove una PUT cieca può far sparire un thread/messaggio scritto
   da un altro dispositivo nella stessa finestra di tempo (G5/G6 del task).
   Ogni altro uso di questo store generico (tuning, config, chat-trace, ...)
   non manda questi header e ottiene ESATTAMENTE il comportamento di sempre:
   scrittura incondizionata — nessuna regressione fuori dallo scope di questo
   task. Vedi REMOTE_CHAT_HISTORY_V1.md. */
function writeConditions(request: Request): { onlyIfMatch: string } | { onlyIfNew: true } | undefined {
  const ifMatch = request.headers.get('if-match');
  if (ifMatch) return { onlyIfMatch: ifMatch };
  if (request.headers.get('x-only-if-new') === '1') return { onlyIfNew: true };
  return undefined;
}

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  const key = safeKey(request);
  if (!key) return json({ error: 'chiave non valida' }, 400);

  if (request.method === 'GET') {
    const result = await store().getWithMetadata(key, { type: 'text' });
    return json({ value: result?.data ?? null, etag: result?.etag ?? null });
  }
  if (request.method === 'DELETE') {
    await store().delete(key);
    return json({ ok: true });
  }
  if (request.method !== 'PUT') return json({ error: 'metodo non valido' }, 405);

  const value = await request.text();
  if (new TextEncoder().encode(value).byteLength > MAX_BYTES) return json({ error: 'dato troppo grande' }, 413);

  const conditions = writeConditions(request);
  if (!conditions) {
    await store().set(key, value);
    return json({ ok: true });
  }

  const result = await store().set(key, value, conditions);
  if (result.modified) return json({ ok: true, etag: result.etag });

  /* Rifiutata: qualcun altro ha scritto questa chiave nel frattempo. Il
     chiamante (serverStorage.ts) unisce il proprio scritto con questo valore
     corrente e ritenta — mai una sovrascrittura cieca, mai una perdita
     silenziosa (G5/G6). */
  const current = await store().getWithMetadata(key, { type: 'text' });
  return json({ error: 'conflict', value: current?.data ?? null, etag: current?.etag ?? null }, 409);
}

export const config = { path: '/api/user-data' };
