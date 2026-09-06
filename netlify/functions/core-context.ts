import { authorize, denied, json } from './_shared/auth';
import { loadCoreContext } from './_shared/coreContext';

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method !== 'POST') return json({ error: 'solo POST' }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 8000) return json({ error: 'richiesta troppo grande' }, 413);
    let input: { query?: unknown; toolsAvailable?: unknown };
    try { input = JSON.parse(raw); } catch { return json({ error: 'JSON non valido' }, 400); }
    if (!input || typeof input !== 'object' || (input.query !== undefined && typeof input.query !== 'string')) return json({ error: 'richiesta non valida' }, 400);
    return json(await loadCoreContext({ query: input.query as string | undefined, body: 'web', toolsAvailable: input.toolsAvailable === true }));
  } catch { return json({ error: 'contesto canonico non disponibile' }, 503); }
}

export const config = { path: '/api/core-context' };
