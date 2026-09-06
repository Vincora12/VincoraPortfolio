/** Small acknowledgement cache, never another copy of application data. */
export interface SyncReceipt { revision: string | null; hash: string }
export type SyncStatus = { status: 'idle' | 'syncing' | 'synced' | 'pending' | 'conflict' | 'error'; message?: string };
let status: SyncStatus = { status: 'idle' };
const listeners = new Set<() => void>();
export const getStateSyncStatus = () => status;
export function subscribeStateSync(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function reportStateSync(next: SyncStatus) { status = next; for (const listener of listeners) { try { listener(); } catch { /* Status observers cannot break persistence. */ } } }

const KEY = 'vinzmon.state-sync.receipt.v1';
let receipt: SyncReceipt | null | undefined;
export function readSyncReceipt(): SyncReceipt | null {
  if (receipt !== undefined) return receipt;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SyncReceipt | null;
    receipt = v && typeof v.hash === 'string' && (v.revision === null || typeof v.revision === 'string') ? v : null;
  } catch { receipt = null; }
  return receipt;
}
export function rememberSyncReceipt(next: SyncReceipt): void {
  receipt = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Cache full: in-memory receipt remains usable, reload is conservative. */ }
}

// Rebuildable prompts and local routing/progress indicators cannot mark a
// server snapshot dirty on reload. Canonical data itself is not removed.
const LOCAL_FIELDS = new Set(['token','batch','lastTrace','lastToolUses','assetProgress','forgeProgress','typingVisible','voiceModel','compilerModel','imageModel','stepModels','lessons','forgottenLessons','customMemory','customMemoryAt']);
export function syncComparable(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.map((v) => syncComparable(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key,v]) => typeof v !== 'function' && v !== undefined && key !== 'compiledPrompts' && (depth !== 0 || !LOCAL_FIELDS.has(key)))
    .sort(([a],[b]) => a.localeCompare(b)).map(([key,v]) => [key, syncComparable(v, depth + 1)]));
  return value;
}
export async function snapshotHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(syncComparable(value))));
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2,'0')).join('');
}
export function syncDecision(input: {
  localHash: string; remoteHash: string; receipt: SyncReceipt | null;
  localDay: number; remoteDay: number; remoteRevision: string | null;
  emptyLocal?: boolean; explicitReset?: boolean;
}): 'equal' | 'download' | 'upload' | 'conflict' {
  if (input.localHash === input.remoteHash) return 'equal';
  if (input.receipt?.revision === input.remoteRevision) return 'upload';
  if (input.localDay > input.remoteDay) return 'conflict'; // A stale future test must never roll back or overwrite another client.
  if (input.explicitReset) return 'conflict'; // Reset can upload only against a known baseline or explicit confirmation.
  if (input.emptyLocal || input.receipt?.hash === input.localHash) return 'download';
  return 'conflict';
}
