import type { Project } from '../../../../src/engine/projects';
import { loadCoreContext } from '../coreContext';
import { getStore } from '../localStore';
import { recall } from '../recall';
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
  return (await recall(query, { sources: ['personal'], limit })).map(({ id, text, score }) => ({
    id, text, ...(score === undefined ? {} : { score }), source: 'canonical-personal-memory',
  }));
}

async function me(query: string, limit: number): Promise<MemoryEvidence[]> {
  return (await recall(query, { sources: ['me'], limit })).map(({ id, text, score }) => ({
    id, text, ...(score === undefined ? {} : { score }), source: 'derived-me-projection',
  }));
}

export const canonicalDomains: ContextDomains = {
  async identity() {
    /* ME arrives through `me()` below, ranked and budgeted with the rest:
       the identity block must not carry it a second time (vNext Step 11). */
    const { systemPrompt } = await loadCoreContext({ body: 'external', toolsAvailable: false, includeMe: false });
    return systemPrompt;
  },
  listProjects,
  project,
  globalMemory: memory,
  me,
};
