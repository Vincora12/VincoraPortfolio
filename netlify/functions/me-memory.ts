import { authorize, denied, json } from './_shared/auth';
import { createMeModelStore } from './_shared/meModel';
import { projectMeModel } from './_shared/meMemoryProjection';
export default async function handler(request: Request): Promise<Response> { if (request.method !== 'GET') return json({ error: 'solo GET' }, 405); if (!authorize(request).ok) return denied(); try { return json(projectMeModel(await createMeModelStore().read())); } catch { return json({ error: 'memoria non disponibile' }, 503); } }
export const config = { path: '/api/me-memory' };
