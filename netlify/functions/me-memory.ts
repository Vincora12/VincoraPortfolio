import { authorize, denied, json } from './_shared/auth';
import { createMeModelStore } from './_shared/meModel';
import { projectMeModel } from './_shared/meMemoryProjection';
import { listMem0, searchMem0 } from './_shared/mem0MemoryClient';
export default async function handler(request: Request): Promise<Response> { if (!authorize(request).ok) return denied(); try { if (process.env.VINZMON_MEMORY_WRITER_MODE === 'mem0') { if (request.method === 'POST') { const body = await request.json() as { query?: string }; return json({ memories: await searchMem0(body.query ?? '', 5) }); } if (request.method !== 'GET') return json({ error: 'metodo non supportato' }, 405); return json({ memories: await listMem0(), entities: [], relations: [], episodes: [], counts: { knowledge: 0, entities: 0, episodes: 0 } }); } if (request.method !== 'GET') return json({ error: 'solo GET' }, 405); return json(projectMeModel(await createMeModelStore().read())); } catch { return json({ error: 'memoria non disponibile' }, 503); } }
export const config = { path: '/api/me-memory' };
