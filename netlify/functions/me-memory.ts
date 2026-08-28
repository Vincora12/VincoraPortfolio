import { authorize, denied, json } from './_shared/auth';
import { createMeModelStore } from './_shared/meModel';
import { projectMeModel } from './_shared/meMemoryProjection';
import { listMem0 } from './_shared/mem0MemoryClient';
export default async function handler(request: Request): Promise<Response> { if (request.method !== 'GET') return json({ error: 'solo GET' }, 405); if (!authorize(request).ok) return denied(); try { if (process.env.VINZMON_MEMORY_WRITER_MODE === 'mem0') return json({ memories: await listMem0(), entities: [], relations: [], episodes: [], counts: { knowledge: 0, entities: 0, episodes: 0 } }); return json(projectMeModel(await createMeModelStore().read())); } catch { return json({ error: 'memoria non disponibile' }, 503); } }
export const config = { path: '/api/me-memory' };
