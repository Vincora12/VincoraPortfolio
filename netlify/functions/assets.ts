import { getStore } from './_shared/localStore';
import { authorize, denied, json } from './_shared/auth';

const store = () => getStore({ name: 'vinzmon-assets', consistency: 'strong' });
const MAX_BYTES = 15 * 1024 * 1024;
const clean = (value: string | null) => value && value.length <= 160 ? value : null;
const keyFor = (mon: string, asset: string) => `asset:${encodeURIComponent(mon)}:${encodeURIComponent(asset)}`;

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  const url = new URL(request.url);
  const mon = clean(url.searchParams.get('monName'));
  const asset = clean(url.searchParams.get('assetId'));

  if (request.method === 'GET' && (!mon || !asset)) {
    const { blobs } = await store().list({ prefix: 'asset:' });
    const assets = blobs.flatMap(({ key }) => {
      const match = key.match(/^asset:([^:]+):(.+)$/);
      return match ? [{ monName: decodeURIComponent(match[1]), assetId: decodeURIComponent(match[2]) }] : [];
    });
    return json({ assets });
  }
  if (!mon || !asset) return json({ error: 'asset non valido' }, 400);
  const key = keyFor(mon, asset);

  if (request.method === 'GET') {
    const data = await store().get(key, { type: 'arrayBuffer' });
    return data ? new Response(data, { headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store' } }) : json({ error: 'non trovato' }, 404);
  }
  if (request.method === 'DELETE') {
    await store().delete(key);
    return json({ ok: true });
  }
  if (request.method !== 'PUT') return json({ error: 'metodo non valido' }, 405);
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_BYTES) return json({ error: 'file non valido' }, 413);
  await store().set(key, data, { metadata: { contentType: request.headers.get('content-type') ?? 'image/png' } });
  return json({ ok: true });
}

export const config = { path: '/api/assets' };
