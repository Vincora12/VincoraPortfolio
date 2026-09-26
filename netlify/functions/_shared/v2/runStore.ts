import { getStore } from '../localStore';
import type { RunResult } from './contracts';

export interface StoredRun {
  runId: string;
  status: RunResult['status'];
  profile: string;
  conversationId?: string;
  projectId?: string | null;
  model?: string;
  createdAt: string;
  completedAt: string;
  context: { windowTokens: number; estimatedInputTokens: number; resolvedProjectIds: string[]; trace: RunResult['context']['trace'] };
  error?: string;
}

const store = () => getStore({ name: 'vinzmon-runs', consistency: 'strong' });

export async function saveRun(result: RunResult, profile: string, createdAt: string, conversationId?: string): Promise<void> {
  const row: StoredRun = {
    runId: result.runId, status: result.status, profile,
    ...(conversationId ? { conversationId } : {}),
    ...(result.projectId !== undefined ? { projectId: result.projectId } : {}),
    ...(result.model ? { model: result.model } : {}),
    createdAt, completedAt: new Date().toISOString(),
    context: { windowTokens: result.context.windowTokens, estimatedInputTokens: result.context.estimatedInputTokens, resolvedProjectIds: result.context.resolvedProjectIds, trace: result.context.trace },
    ...(result.error ? { error: result.error.slice(0, 500) } : {}),
  };
  await store().setJSON(`run:${result.runId}`, row);
}

export async function readRun(runId: string): Promise<StoredRun | null> {
  return (await store().get(`run:${runId}`, { type: 'json' }) as StoredRun | null) ?? null;
}
