import type { Project } from '../../../../src/engine/projects';
import { loadCoreContext } from '../coreContext';
import { getStore } from '../localStore';
import { machineConversationContext } from '../machineConversationContext';
import { searchPersonalMemory } from '../core/memory';
import type { ContextDomains, MemoryEvidence, ProjectEvidence } from './contracts';

const projectStore = () => getStore({ name: 'vinzmon-projects', consistency: 'strong' });

async function listProjects(): Promise<Array<{ id: string; title: string }>> {
  const store = projectStore();
  const { blobs } = await store.list({ prefix: 'projects/' });
  const rows = await Promise.all(blobs.slice(0, 500).map(({ key }) => store.get(key, { type: 'json' }) as Promise<Project | null>));
  return rows.filter((project): project is Project => Boolean(project && !project.trashedAt)).map(({ id, title }) => ({ id, title }));
}

async function project(id: string): Promise<ProjectEvidence | null> {
  return (await projectStore().get(`projects/${id}`, { type: 'json' }) as Project | null) ?? null;
}

async function memory(query: string, limit: number): Promise<MemoryEvidence[]> {
  return (await searchPersonalMemory(query, limit)).map((item, index) => ({
    id: item.id ?? `memory:${index}`,
    text: item.text,
    ...(item.score === undefined ? {} : { score: item.score }),
    source: 'canonical-personal-memory',
  }));
}

async function me(query: string, limit: number): Promise<MemoryEvidence[]> {
  const context = await machineConversationContext();
  if (!context.meSummary) return [];
  const queryTerms = new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const relevant = [...queryTerms].some((term) => context.meSummary!.toLowerCase().includes(term));
  return relevant || /\b(io|me|mio|mia|stress|salute|prefer|abitudine|come sto)\b/i.test(query)
    ? [{ id: 'me:summary', text: context.meSummary.slice(0, limit * 1200), score: relevant ? 1 : 0.5, source: 'derived-me-projection' }]
    : [];
}

export const canonicalDomains: ContextDomains = {
  async identity() {
    const { systemPrompt } = await loadCoreContext({ body: 'external', toolsAvailable: false });
    return systemPrompt;
  },
  listProjects,
  project,
  globalMemory: memory,
  me,
};
