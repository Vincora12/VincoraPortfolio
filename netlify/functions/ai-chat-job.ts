import { getStore } from './_shared/localStore';
import { authorize, denied, json } from './_shared/auth';

const store = () => getStore('vinzmon-ai-chat');

export default async function aiChatJob(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method !== 'GET') return json({ error: 'solo GET' }, 405);

  const url = new URL(request.url);
  const id = url.searchParams.get('jobId') ?? '';
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) return json({ error: 'job non valido' }, 400);

  const job = await store().get(`job:${id}`, { type: 'json' }) as
    | { status?: string; updatedAt?: string; error?: string }
    | null;

  /* Stessa guardia di `evolution-job.ts`: un lavoro rimasto "running" per più
     di 10 minuti è un lavoro morto sul server (processo riavviato, provider
     mai tornato) — meglio dirlo che far girare il telefono all'infinito. */
  if (job?.status === 'running' && job.updatedAt && Date.now() - new Date(job.updatedAt).getTime() > 10 * 60_000) {
    job.status = 'error';
    job.error = 'La generazione si è fermata sul server.';
    await store().setJSON(`job:${id}`, job);
  }

  return job ? json(job) : json({ error: 'job non ancora disponibile' }, 404);
}

export const config = { path: '/api/ai-chat-job' };
