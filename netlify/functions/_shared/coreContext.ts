import { getStore } from '@netlify/blobs';
import { buildCoreSystemPrompt, type CoreContext } from '../../../src/ai/coreContext';
import type { MonRecord } from '../../../src/engine/types';
import type { MoodState } from '../../../src/engine/mood';
import type { VoiceNote } from '../../../src/engine/notebook';
import { searchPersonalMemory } from './core/memory';

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
  if (options.query?.trim()) {
    try {
      memoryFacts = (await searchPersonalMemory(options.query.slice(0, 2000), 5)).slice(0, 5).map((m) => m.text);
      memoryStatus = 'available';
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
