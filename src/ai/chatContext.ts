import { useApp } from '../state/store';
import { buildCoreSystemPrompt, type CoreContext } from './coreContext';
import { loadProject } from '../projects/client';
import { buildProjectContext } from '../engine/projects';

/** One context boundary for Web direct/tool runs; ingress uses its server owner. */
export async function resolveChatContext(token: string, query: string, toolsAvailable: boolean, signal: AbortSignal, projectId?: string): Promise<string> {
  let prompt: string;
  try {
    const response = await fetch('/api/core-context', { method: 'POST', signal, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: projectId ? '' : query, toolsAvailable }) });
    if (!response.ok) throw new Error('Canonical context unavailable');
    const body = await response.json() as { context: CoreContext; systemPrompt: string };
    if (typeof body.systemPrompt !== 'string' || (!body.context.monName && useApp.getState().activeMonName)) throw new Error('Form not synchronized');
    prompt = body.systemPrompt;
  } catch (error) {
    if (signal.aborted) throw error;
    const state = useApp.getState();
    prompt = buildCoreSystemPrompt({ mon: state.activeMonName ? state.mons[state.activeMonName] ?? null : null, mood: state.mood,
      context: { version: 1, identity: 'VINZ.MON', body: 'web', source: 'local-fallback', savedAt: null, monName: state.activeMonName,
        worldId: state.world?.id ?? null, day: state.day, memoryStatus: 'unavailable', capabilities: { conversation: true, personalMemoryRead: false, tools: toolsAvailable } } });
  }
  // A missing selected project is an explicit error, never an unscoped answer.
  if (projectId) prompt += `\n\n${buildProjectContext(await loadProject(token, projectId))}`;
  return prompt;
}
