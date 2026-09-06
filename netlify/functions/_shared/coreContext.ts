import { getStore } from '@netlify/blobs';
import { buildCoreSystemPrompt, type CoreContext } from '../../../src/ai/coreContext';
import type { MonRecord } from '../../../src/engine/types';
import type { MoodState } from '../../../src/engine/mood';
import type { VoiceNote } from '../../../src/engine/notebook';
import { createMeModelStore } from './meModel';
import { projectMeModel } from './meMemoryProjection';
import { searchMem0 } from './mem0MemoryClient';
import { memoryWriterMode } from './memoryWriter';

export interface CoreContextOptions { query?: string; body?: 'web' | 'external'; toolsAvailable?: boolean }
/** No writes, second state store or persisted prompts. Strong read of the existing save. */
export async function loadCoreContext(options: CoreContextOptions = {}) {
  const saved = await getStore({ name: 'vinzmon-state', consistency: 'strong' }).get('save', { type: 'json' }) as {
    savedAt?: string; day?: number; state?: { activeMonName?: string; mons?: Record<string, MonRecord>; mood?: MoodState; world?: { id?: string }; voiceNotes?: VoiceNote[]; faceRedos?: number; usedDevTime?: boolean };
  } | null;
  const state = saved?.state;
  const mon = state?.activeMonName ? state.mons?.[state.activeMonName] ?? null : null;
  let meFacts: string[] = [];
  let memoryFacts: string[] = [];
  let memoryStatus: CoreContext['memoryStatus'] = 'not-requested';
  const mode = memoryWriterMode();
  let meAvailable = false;
  // The active memory owner wins. Never mix stale custom-ME facts into Mem0 mode.
  // Frozen preserves the existing custom read projection but performs no write.
  if (mode !== 'mem0') try {
    const me = projectMeModel(await createMeModelStore().read());
    meFacts = me.relations.slice(-8).map((r) => `${r.subject}: ${r.predicateLabel} ${r.object || r.value || ''}`);
    meAvailable = true;
  } catch { /* A derived ME view cannot prevent conversation. */ }
  if (options.query?.trim()) {
    try {
      memoryFacts = mode === 'mem0'
        ? (await searchMem0(options.query.slice(0, 2000), 5)).slice(0, 5).map((m) => m.text)
        : meFacts;
      memoryStatus = mode === 'mem0' || meAvailable ? 'available' : 'unavailable';
    } catch { memoryStatus = 'unavailable'; }
  }
  const context: CoreContext = {
    version: 1, identity: 'VINZ.MON', body: options.body ?? 'external', source: 'server',
    savedAt: saved?.savedAt ?? null, monName: mon?.data.name ?? null,
    worldId: state?.world?.id ?? mon?.worldId ?? null, day: saved?.day ?? null,
    memoryStatus, capabilities: { conversation: true, personalMemoryRead: memoryStatus === 'available', tools: options.toolsAvailable === true },
  };
  return { context, systemPrompt: buildCoreSystemPrompt({ mon, mood: state?.mood ?? null, context, memoryFacts, meFacts, voiceNotes: state?.voiceNotes, awareness: { rating: mon?.rating ?? null, faceRedos: state?.faceRedos ?? 0, timeSkipped: state?.usedDevTime ?? false } }) };
}
