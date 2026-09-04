import { authorize, denied, json } from './_shared/auth';
import { readMeMemoryView, searchMeMemoryView } from './_shared/core/memory';

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  try {
    if (request.method === 'POST') {
      const body = await request.json() as { query?: string };
      return json(await searchMeMemoryView(body.query ?? ''));
    }
    if (request.method !== 'GET') return json({ error: 'solo GET' }, 405);
    return json(await readMeMemoryView());
  } catch {
    return json({ error: 'memoria non disponibile' }, 503);
  }
}

export const config = { path: '/api/me-memory' };
