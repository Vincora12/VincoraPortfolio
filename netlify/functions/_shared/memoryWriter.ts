import { captureChatMemory, shouldCaptureChatMessage, type ChatMemoryResult } from './meChatMemory';
import type { MeModelStore } from './meModel';

export type MemoryWriterMode = 'custom' | 'frozen';

export type ChatMemoryWriterInput = Parameters<typeof captureChatMemory>[1];

const emptyFrozenResult = (): ChatMemoryResult => ({
  status: 'no_change', updated: false, created: 0, updatedCount: 0,
  superseded: 0, episodesCreated: 0, skipped: 0, ambiguities: [],
  warnings: ['memory writer frozen'],
});

/** The single server-side boundary for chat memory writes. */
export function memoryWriterMode(value: string | null | undefined = process.env.VINZMON_MEMORY_WRITER_MODE): MemoryWriterMode {
  if (!value || value === 'custom') return 'custom';
  if (value === 'frozen') return 'frozen';
  throw new Error(`unknown memory writer mode: ${value}`);
}

export function shouldCaptureForMemoryWriter(text: string): boolean {
  return shouldCaptureChatMessage(text);
}

export async function writeChatMemory(
  store: MeModelStore,
  input: ChatMemoryWriterInput,
  mode: string | null | undefined = process.env.VINZMON_MEMORY_WRITER_MODE,
): Promise<ChatMemoryResult> {
  const selected = memoryWriterMode(mode);
  if (selected === 'frozen') return emptyFrozenResult();
  return captureChatMemory(store, input);
}
