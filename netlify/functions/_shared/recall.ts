/* ============================================================================
   RECALL — the canonical memory READ contract (vNext Step 11)

   One read path over the stores that already exist. No new store, no data
   migration, no writes:
     personal     → core/memory (canonical personal memory; mem0 or local)
     me           → ME.MON machine summary (a DERIVED projection)
     reflection   → Mon self-reflections from the machine state (DERIVED)
     project      → the Project record (canonical, read-only here)
   Every item carries its provenance and whether it is derived, so a caller
   never mistakes a projection for a fact the user stated.

   World canon is not recalled here: Life/World stays deterministic and is
   read only through its own validators (engine/world `withCanon`).
   CEREBRO never owns memory: it receives what VINZ recalls, inside the
   context package, and has no write path to any of these stores.
   ========================================================================= */
import type { Project } from '../../../src/engine/projects';
import { getStore } from './localStore';
import { machineConversationContext } from './machineConversationContext';
import { searchPersonalMemory } from './core/memory';

export type RecallSource = 'personal' | 'me' | 'reflection' | 'project';

export interface RecallItem {
  id: string;
  text: string;
  source: RecallSource;
  /** Store the item was read from — for traces and "why do you know this". */
  provenance: 'core/memory' | 'machines/me' | 'machines/memon' | 'projects';
  /** True for projections a machine derived, never for what the user said or wrote. */
  derived: boolean;
  score?: number;
}

export interface RecallOptions {
  sources?: RecallSource[];
  limit?: number;
  projectId?: string | null;
  /** Include the ME projection even when the query does not touch it. */
  alwaysMe?: boolean;
}

const ME_QUERY = /\b(io|me|mio|mia|stress|salute|prefer|abitudine|come sto)\b/i;

async function personal(query: string, limit: number): Promise<RecallItem[]> {
  return (await searchPersonalMemory(query.slice(0, 2000), limit)).slice(0, limit).map((item, index) => ({
    id: item.id ?? `memory:${index}`,
    text: item.text,
    source: 'personal',
    provenance: 'core/memory',
    derived: false,
    ...(item.score === undefined ? {} : { score: item.score }),
  }));
}

async function machine(query: string, limit: number, sources: Set<RecallSource>, alwaysMe: boolean): Promise<RecallItem[]> {
  const context = await machineConversationContext();
  const out: RecallItem[] = [];
  if (sources.has('me') && context.meSummary) {
    const queryTerms = new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
    const relevant = [...queryTerms].some((term) => context.meSummary!.toLowerCase().includes(term));
    if (alwaysMe || relevant || ME_QUERY.test(query)) {
      out.push({ id: 'me:summary', text: context.meSummary.slice(0, limit * 1200), source: 'me', provenance: 'machines/me', derived: true, score: relevant ? 1 : 0.5 });
    }
  }
  if (sources.has('reflection')) {
    context.selfReflections.forEach((text, index) => out.push({ id: context.selfReflectionIds[index], text, source: 'reflection', provenance: 'machines/memon', derived: true }));
  }
  return out;
}

async function project(projectId: string): Promise<RecallItem[]> {
  const record = await getStore({ name: 'vinzmon-projects', consistency: 'strong' }).get(`projects/${projectId}`, { type: 'json' }) as Project | null;
  if (!record || record.trashedAt) return [];
  const text = [record.title, record.instructions, record.context].filter(Boolean).join('\n');
  return [{ id: `project:${record.id}`, text, source: 'project', provenance: 'projects', derived: false }];
}

/** The one way VINZ.MON reads what it remembers. Read-only. */
export async function recall(query: string, options: RecallOptions = {}): Promise<RecallItem[]> {
  const sources = new Set<RecallSource>(options.sources ?? ['personal', 'me']);
  const limit = Math.max(1, Math.min(options.limit ?? 5, 20));
  const [personalItems, machineItems, projectItems] = await Promise.all([
    sources.has('personal') ? personal(query, limit) : [],
    sources.has('me') || sources.has('reflection') ? machine(query, limit, sources, options.alwaysMe === true) : [],
    sources.has('project') && options.projectId ? project(options.projectId) : [],
  ]);
  return [...personalItems, ...machineItems, ...projectItems];
}
