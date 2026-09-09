import { getStore } from './localStore';
import { compileCoreContext, type CoreContext } from '../../../src/ai/coreContext';
import type { MonRecord } from '../../../src/engine/types';
import type { MoodState } from '../../../src/engine/mood';
import type { World } from '../../../src/engine/world';
import type { VoiceNote } from '../../../src/engine/notebook';
import { searchPersonalMemory } from './core/memory';
import { machineConversationContext } from './machineConversationContext';

export interface CoreContextOptions { query?: string; recentText?: string; body?: 'web' | 'external'; toolsAvailable?: boolean }
/** No writes, second state store or persisted prompts. Strong read of the existing save. */
export async function loadCoreContext(options: CoreContextOptions = {}) {
  const saved = await getStore({ name: 'vinzmon-state', consistency: 'strong' }).get('save', { type: 'json' }) as {
    savedAt?: string; day?: number; state?: { activeMonName?: string; mons?: Record<string, MonRecord>; mood?: MoodState; world?: World; voiceNotes?: VoiceNote[]; faceRedos?: number; usedDevTime?: boolean; progression?: { bond?: number } };
  } | null;
  const state = saved?.state;
  const mon = state?.activeMonName ? state.mons?.[state.activeMonName] ?? null : null;
  let meFacts: string[] = [];
  let memoryFacts: string[] = [];
  let memoryIds: string[] = [];
  let memoryStatus: CoreContext['memoryStatus'] = 'not-requested';
  const machineContext = await machineConversationContext().catch(() => ({ meSummary: null, selfReflections: [], selfReflectionIds: [], selfReflectionCount: 0 }));
  if (machineContext.meSummary) meFacts = [machineContext.meSummary];
  if (options.query?.trim()) {
    try {
      const memories = (await searchPersonalMemory(options.query.slice(0, 2000), 5)).slice(0, 5);
      memoryFacts = memories.map(m => m.text);
      memoryIds = memories.map((m, i) => m.id ?? `memory:${i}`);
      memoryStatus = 'available';
    } catch { memoryStatus = 'unavailable'; }
  }
  const context: CoreContext = {
    version: 1, identity: 'VINZ.MON', body: options.body ?? 'external', source: 'server',
    savedAt: saved?.savedAt ?? null, monName: mon?.data.name ?? null,
    worldId: state?.world?.id ?? mon?.worldId ?? null, day: saved?.day ?? null,
    memoryStatus, capabilities: { conversation: true, personalMemoryRead: memoryStatus === 'available', tools: options.toolsAvailable === true },
  };
  return { context, ...compileCoreContext({
    query: options.query,
    recentText: options.recentText,
    world: state?.world,
    memoryIds,
    selfReflectionIds: machineContext.selfReflectionIds,
    mon,
    mood: state?.mood ?? null,
    context,
    memoryFacts,
    meFacts,
    selfReflections: machineContext.selfReflections,
    identityGrowth: {
      day: context.day,
      bond: state?.progression?.bond ?? (typeof mon?.data.bond === 'number' ? mon.data.bond / 100 : null),
      hasMeSummary: Boolean(machineContext.meSummary),
      selfReflectionCount: machineContext.selfReflectionCount,
    },
    voiceNotes: state?.voiceNotes,
    awareness: { rating: mon?.rating ?? null, faceRedos: state?.faceRedos ?? 0, timeSkipped: state?.usedDevTime ?? false },
  }) };
}
