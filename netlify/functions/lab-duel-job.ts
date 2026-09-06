import { getStore } from './_shared/localStore';
import { authorize, denied, json } from './_shared/auth';

const store = () => getStore({ name: 'vinzlab-duels', consistency: 'strong' });

export default async function labDuelJob(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method !== 'GET') return json({ error: 'solo GET' }, 405);

  const url = new URL(request.url);
  const id = url.searchParams.get('jobId') ?? '';
  const seed = url.searchParams.get('seed');
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) return json({ error: 'job non valido' }, 400);

  if (seed !== null) {
    const numericSeed = Number(seed);
    if (!Number.isInteger(numericSeed)) return json({ error: 'seed non valido' }, 400);
    const data = await store().get(`asset:${id}:${numericSeed}`, { type: 'arrayBuffer' });
    if (!data) return json({ error: 'immagine non pronta' }, 404);
    return new Response(data, { headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store' } });
  }

  const job = await store().get(`job:${id}`, { type: 'json' }) as {
    status?: string;
    updatedAt?: string;
    error?: string;
    label?: string;
  } | null;
  if (job?.status === 'running' && job.updatedAt && Date.now() - new Date(job.updatedAt).getTime() > 12 * 60_000) {
    job.status = 'error';
    job.error = 'La generazione si è fermata sul server. Avviala di nuovo: le immagini già concluse restano salvate.';
    job.label = 'GENERAZIONE INTERROTTA';
    await store().setJSON(`job:${id}`, job);
  }
  return job ? json(job) : json({ error: 'job non ancora disponibile' }, 404);
}

export const config = { path: '/api/lab-duel-job' };
