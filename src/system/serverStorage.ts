import { postStorageDiagnostic } from './runtimeLog';

function keyPrefix(key: string): string {
  const known = [
    'assistant-ui-official-chatgpt:messages:',
    'assistant-ui-official-chatgpt:',
    'vinzmon.prototype.v4',
    'vinzmon.health.journal.v1',
  ].find((prefix) => key.startsWith(prefix));
  if (known) return known;
  return key.split(':', 1)[0]?.slice(0, 100) || 'unknown';
}

function payloadBytes(value: string): number {
  try { return new TextEncoder().encode(value).byteLength; } catch { return value.length; }
}

function writeLocal(key: string, value: string, operation: string): void {
  const bytes = payloadBytes(value);
  const prefix = keyPrefix(key);
  postStorageDiagnostic({ eventType: 'STORAGE_LOCAL_WRITE_START', operation, keyPrefix: prefix, payloadBytes: bytes });
  try {
    localStorage.setItem(key, value);
    postStorageDiagnostic({ eventType: 'STORAGE_LOCAL_WRITE_OK', operation, keyPrefix: prefix, payloadBytes: bytes });
  } catch (error) {
    postStorageDiagnostic({ eventType: 'STORAGE_CLIENT_ERROR', operation, keyPrefix: prefix, payloadBytes: bytes, error });
    throw error;
  }
}

function auth(): HeadersInit | null {
  let token: string | null = null;
  try {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const parsed = raw ? JSON.parse(raw) as { state?: { token?: unknown } } : null;
    token = typeof parsed?.state?.token === 'string' ? parsed.state.token : null;
  } catch { /* Un salvataggio locale illeggibile equivale a nessun token. */ }
  return token ? { authorization: `Bearer ${token}` } : null;
}

export const serverBackedStorage = {
  async getItem(key: string): Promise<string | null> {
    const local = localStorage.getItem(key);
    const headers = auth();
    if (!headers) return local;
    try {
      const response = await fetch(`/api/user-data?key=${encodeURIComponent(key)}`, { headers, cache: 'no-store' });
      if (!response.ok) return local;
      const { value } = await response.json() as { value: string | null };
      if (typeof value === 'string') writeLocal(key, value, 'getItem-cache');
      return value ?? local;
    } catch { return local; }
  },
  async setItem(key: string, value: string): Promise<void> {
    writeLocal(key, value, 'setItem');
    const headers = auth();
    if (!headers) return;
    try {
      await fetch(`/api/user-data?key=${encodeURIComponent(key)}`, { method: 'PUT', headers, body: value });
    } catch { /* La copia locale resta disponibile e verrà riscritta al prossimo cambiamento. */ }
  },
  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
    const headers = auth();
    if (!headers) return;
    try {
      await fetch(`/api/user-data?key=${encodeURIComponent(key)}`, { method: 'DELETE', headers });
    } catch { /* Non bloccare la chat se la rete manca. */ }
  },
};

/** Migra le chiavi già presenti senza sovrascrivere una copia server esistente. */
export async function migrateStoragePrefix(prefix: string): Promise<void> {
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith(prefix)));
  for (const key of keys) {
    const local = localStorage.getItem(key);
    if (local === null) continue;
    const headers = auth();
    if (!headers) return;
    try {
      const response = await fetch(`/api/user-data?key=${encodeURIComponent(key)}`, { headers, cache: 'no-store' });
      if (!response.ok) continue;
      const { value } = await response.json() as { value: string | null };
      if (typeof value === 'string') writeLocal(key, value, 'migrate-cache');
      else await serverBackedStorage.setItem(key, local);
    } catch { /* Riprova alla prossima apertura. */ }
  }
}
