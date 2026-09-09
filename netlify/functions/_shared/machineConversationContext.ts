import { getStore } from './localStore';

export const MACHINE_STORE = 'vinzmon-machines';
export const MACHINE_STATE_KEY = 'machine-state-v1';

type StoredMachineState = {
  me?: { meSummary?: { summary?: string } | null };
  memon?: { observations?: Array<{ statement?: string; timestamp?: string; sourceIds?: string[] }> };
};

/** Read-only prompt projection from the canonical machine state. */
export async function machineConversationContext(): Promise<{
  meSummary: string | null;
  selfReflections: string[];
  selfReflectionIds: string[];
  selfReflectionCount: number;
}> {
  const stored = await getStore(MACHINE_STORE).get(MACHINE_STATE_KEY, { type: 'json' }) as StoredMachineState | null;
  const reflections = (stored?.memon?.observations ?? []).filter(
    (item) => typeof item.statement === 'string' && item.statement.trim() && (item.sourceIds?.length ?? 0) > 0,
  );
  return {
    meSummary: stored?.me?.meSummary?.summary?.trim() || null,
    selfReflections: reflections.slice(-24).map((item) => item.statement!.trim()),
    selfReflectionIds: reflections.slice(-24).map((item, i) => `memon:${item.timestamp ?? i}`),
    selfReflectionCount: reflections.length,
  };
}
