import { authorize, denied, json } from './_shared/auth';
import { cancelRun, executeRun } from './_shared/v2/runEngine';
import { readRun } from './_shared/v2/runStore';
import type { ContextWindow, RunProfile, RunRequest } from './_shared/v2/contracts';
import { validProjectId } from '../../src/engine/projects';

const PROFILES = new Set<RunProfile>(['chat', 'project-chat', 'lab', 'automation', 'inspection', 'coding']);

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const runId = url.searchParams.get('runId');
    if (!runId) return json({ error: 'runId mancante' }, 400);
    const run = await readRun(runId);
    return run ? json({ run }) : json({ error: 'Run non trovato.' }, 404);
  }
  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: 'body non leggibile' }, 400); }
  if (body.action === 'cancel') {
    const runId = typeof body.runId === 'string' ? body.runId : '';
    return runId && cancelRun(runId) ? json({ ok: true }) : json({ error: 'Run non attivo.' }, 404);
  }
  const input = typeof body.input === 'string' ? body.input.trim() : '';
  const profile = body.profile as RunProfile;
  if (!input || input.length > 12_000 || !PROFILES.has(profile)) return json({ error: 'Run non valido.' }, 400);
  if (body.projectId !== undefined && body.projectId !== null && !validProjectId(body.projectId)) return json({ error: 'projectId non valido.' }, 400);
  const contextWindow: ContextWindow = body.contextWindow === 32_000 ? 32_000 : 16_000;
  const runRequest: RunRequest = {
    profile, input, contextWindow,
    ...(typeof body.runId === 'string' ? { runId: body.runId } : {}),
    ...(typeof body.conversationId === 'string' ? { conversationId: body.conversationId } : {}),
    ...(body.projectId === null || typeof body.projectId === 'string' ? { projectId: body.projectId } : {}),
    ...(typeof body.modelPreference === 'string' ? { modelPreference: body.modelPreference } : {}),
    ...(body.webSearch === true ? { webSearch: true } : {}),
  };
  const result = await executeRun(runRequest);
  return json(result, result.status === 'completed' ? 200 : result.status === 'cancelled' ? 499 : 502);
}

export const config = { path: '/api/runs' };
