import { useApp } from '../state/store';
import { compileCoreContext, type CoreContext } from './coreContext';
import type { ContextDecision } from './contextSelection';
import { loadProject } from '../projects/client';
import { buildProjectContext } from '../engine/projects';

/** One context boundary for Web direct/tool runs; ingress uses its server owner. */
export async function resolveChatContext(token: string, query: string, toolsAvailable: boolean, signal: AbortSignal, projectId?: string, recentText = '', onSelection?: (selection: ContextDecision[]) => void): Promise<string> {
  let prompt: string;
  try {
    const response = await fetch('/api/core-context', { method: 'POST', signal, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: projectId ? '' : query.slice(0, 2000), recentText: recentText.slice(-3000), toolsAvailable }) });
    if (!response.ok) throw new Error('Canonical context unavailable');
    const body = await response.json() as { context: CoreContext; systemPrompt: string; selection?: ContextDecision[] };
    if (typeof body.systemPrompt !== 'string' || (!body.context.monName && useApp.getState().activeMonName)) throw new Error('Form not synchronized');
    prompt = body.systemPrompt;
    onSelection?.(body.selection ?? []);
  } catch (error) {
    if (signal.aborted) throw error;
    const state = useApp.getState();
    const mon = state.activeMonName ? state.mons[state.activeMonName] ?? null : null;
    const compiled = compileCoreContext({ mon, mood: state.mood, query: projectId ? '' : query, recentText, world: projectId ? null : state.world, voiceNotes: state.voiceNotes,
      context: { version: 1, identity: 'VINZ.MON', body: 'web', source: 'local-fallback', savedAt: null, monName: state.activeMonName,
        worldId: state.world?.id ?? null, day: state.day, memoryStatus: 'unavailable', capabilities: { conversation: true, personalMemoryRead: false, tools: toolsAvailable } },
      identityGrowth: {
        day: state.day,
        bond: state.progression.bond,
        hasMeSummary: false,
        selfReflectionCount: 0,
      },
    });
    prompt = compiled.systemPrompt;
    onSelection?.(compiled.selection);
  }
  // A missing selected project is an explicit error, never an unscoped answer.
  if (projectId) prompt += `\n\n${buildProjectContext(await loadProject(token, projectId))}`;
  return prompt;
}
