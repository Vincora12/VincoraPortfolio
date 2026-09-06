import { setLocalStorageItem } from './localStorageDiagnostics';

// Per-key order and unacknowledged values belong to this client only. The
// authoritative value stays in the existing user-data store, guarded by ETag.
const pendingValues = new Map<string, string | null>();
const revisions = new Map<string, number>();
const writes = new Map<string, Promise<void>>();
const failed = new Set<string>();
const conflicts = new Set<string>();
const listeners = new Set<() => void>();
export const subscribeStorageSync = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const storageSyncFailures = () => failed.size;
export const storageSyncConflicts = () => [...conflicts];
function notify() { listeners.forEach((listener) => { try { listener(); } catch { /* Observers cannot stop persistence. */ } }); }

type Receipt = { revision: string | null; hash: string };
const RECEIPTS_KEY = 'vinzmon.storage-sync.receipts.v1';
let receipts: Map<string, Receipt> | undefined;
function acknowledgements() {
  if (!receipts) {
    try {
      const raw = JSON.parse(localStorage.getItem(RECEIPTS_KEY) ?? '[]') as unknown;
      receipts = new Map(Array.isArray(raw) ? raw.filter((r): r is [string, Receipt] => Array.isArray(r) && typeof r[0] === 'string' && typeof r[1]?.hash === 'string' && (typeof r[1]?.revision === 'string' || r[1]?.revision === null)) : []);
    } catch { receipts = new Map(); }
  }
  return receipts;
}
async function hash(value: string | null) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
async function acknowledge(key: string, revision: string | null, value: string | null) {
  const map = acknowledgements();
  const fingerprint = await hash(value);
  map.delete(key); map.set(key, { revision, hash: fingerprint });
  while (map.size > 1000) map.delete(map.keys().next().value!);
  try { localStorage.setItem(RECEIPTS_KEY, JSON.stringify([...map])); } catch { /* Cache only; memory remains usable, reload is conservative. */ }
}
function cached(key: string): string | null {
  if (pendingValues.has(key)) return pendingValues.get(key)!;
  try { return localStorage.getItem(key); } catch { return null; }
}
function cache(key: string, value: string | null, source: string) {
  try { if (value === null) localStorage.removeItem(key); else setLocalStorageItem(source, key, value); return true; }
  catch { console.warn('[VINZ storage] browser cache unavailable; canonical write retained'); return false; }
}
let activeTokenReader: (() => string | null) | undefined;
/** Registered after store creation; avoids importing browser state into server context compilation. */
export function configureStorageTokenReader(reader: () => string | null) { activeTokenReader = reader; }
function auth(): HeadersInit | null {
  try { const token = activeTokenReader?.(); if (token) return { authorization: `Bearer ${token}` }; } catch { /* Initialization may not be complete yet. */ }
  try {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const parsed = raw ? JSON.parse(raw) as { state?: { token?: unknown } } : null;
    return typeof parsed?.state?.token === 'string' ? { authorization: `Bearer ${parsed.state.token}` } : null;
  } catch { return null; }
}
async function remote(key: string, headers: HeadersInit) {
  const response = await fetch(`/api/user-data?key=${encodeURIComponent(key)}`, { headers, cache: 'no-store' });
  if (!response.ok) throw new Error('storage unavailable');
  const body = await response.json() as { value: string | null; revision?: string | null };
  if ((body.value !== null && typeof body.value !== 'string') || (body.revision !== null && typeof body.revision !== 'string')) throw new Error('storage revision unavailable');
  return { value: body.value, revision: body.revision! };
}
function conflict(key: string) { failed.add(key); conflicts.add(key); notify(); }

async function writeItem(key: string, value: string | null): Promise<void> {
  const previous = cached(key);
  const revision = (revisions.get(key) ?? 0) + 1;
  revisions.set(key, revision);
  pendingValues.set(key, value);
  cache(key, value, 'serverStorage.setItem');
  const write = (writes.get(key) ?? Promise.resolve()).then(async () => {
    try {
      const headers = auth();
      if (!headers) throw new Error('auth unavailable');
      if (conflicts.has(key)) return; // Retry is not permission to discard another client's changes.
      if (!acknowledgements().has(key)) {
        const found = await remote(key, headers);
        if (found.value !== previous && found.value !== value && found.revision !== null) { conflict(key); return; }
        await acknowledge(key, found.revision, found.value);
      }
      const baseline = acknowledgements().get(key)!;
      const response = await fetch(`/api/user-data?key=${encodeURIComponent(key)}`, {
        method: value === null ? 'DELETE' : 'PUT', headers: { ...headers, 'if-match': baseline.revision ?? 'vinzmon-new' },
        ...(value === null ? {} : { body: value }),
      });
      if (response.status === 409) { conflict(key); return; }
      if (!response.ok) throw new Error('storage write failed');
      const result = await response.json() as { revision?: string };
      if (typeof result.revision !== 'string') throw new Error('write unconfirmed');
      await acknowledge(key, result.revision, value);
      if (revisions.get(key) === revision) { pendingValues.delete(key); failed.delete(key); conflicts.delete(key); }
    } catch {
      failed.add(key);
      console.warn('[VINZ storage] server sync pending; local session retained');
    } finally { notify(); }
  });
  writes.set(key, write);
  await write;
  if (writes.get(key) === write) writes.delete(key);
}

export const serverBackedStorage = {
  async getItem(key: string): Promise<string | null> {
    const local = cached(key);
    if (pendingValues.has(key)) return local;
    const revision = revisions.get(key);
    const headers = auth();
    if (!headers) return local;
    try {
      const found = await remote(key, headers);
      if (revision !== revisions.get(key)) return cached(key);
      const baseline = acknowledgements().get(key);
      const localHash = await hash(local);
      if (revision !== revisions.get(key)) return cached(key);
      // Unknown legacy divergence and unsynced edits survive reload. A server
      // tombstone removes only an acknowledged clean cache, never dirty edits.
      if (local !== null && found.value !== local && found.revision !== null && baseline?.hash !== localHash) {
        pendingValues.set(key, local); conflict(key); return local;
      }
      await acknowledge(key, found.revision, found.value);
      if (revision !== revisions.get(key)) return cached(key);
      if (found.value === null && found.revision === null) return local;
      cache(key, found.value, 'serverStorage.getItem cache');
      return found.value;
    } catch { return local; }
  },
  setItem: (key: string, value: string): Promise<void> => writeItem(key, value),
  removeItem: (key: string): Promise<void> => writeItem(key, null),
};

/** Migration uses the same protected read/write boundary, never a raw overwrite. */
export async function migrateStoragePrefix(prefix: string): Promise<void> {
  let keys: string[];
  try { keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((key): key is string => Boolean(key?.startsWith(prefix))); } catch { return; }
  for (const key of keys) {
    const value = await serverBackedStorage.getItem(key);
    if (value !== null && acknowledgements().get(key)?.revision === null && !conflicts.has(key)) await serverBackedStorage.setItem(key, value);
  }
}

/** Explicit retry preserves latest pending data; conflicts require a choice. */
export async function retryStorageSync(): Promise<void> {
  await Promise.all([...failed].filter((key) => !conflicts.has(key)).map((key) => pendingValues.has(key) ? writeItem(key, pendingValues.get(key)!) : Promise.resolve()));
}

/** UI must confirm data replacement. use-server requires a client reload. */
export async function resolveStorageSyncConflict(key: string, choice: 'keep-local' | 'use-server'): Promise<{ reloadRequired: boolean }> {
  await writes.get(key);
  if (!conflicts.has(key)) return { reloadRequired: false };
  const revision = revisions.get(key);
  const headers = auth();
  if (!headers) throw new Error('Autenticazione non disponibile');
  const found = await remote(key, headers);
  if (revision !== revisions.get(key)) throw new Error('La copia locale è cambiata: ripeti la scelta.');
  const local = cached(key);
  await acknowledge(key, found.revision, found.value);
  if (revision !== revisions.get(key)) throw new Error('La copia locale è cambiata: ripeti la scelta.');
  if (choice === 'keep-local') {
    conflicts.delete(key);
    await writeItem(key, local);
    return { reloadRequired: false };
  }
  if (!cache(key, found.value, 'serverStorage explicit server choice')) throw new Error('Cache browser non scrivibile: nessun dato locale scartato.');
  conflicts.delete(key); pendingValues.delete(key); failed.delete(key);
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  notify();
  return { reloadRequired: true };
}
