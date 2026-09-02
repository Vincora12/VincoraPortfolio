import { isQuotaExceededError, recordQuotaExceeded } from './storageQuota';

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
      if (typeof value === 'string') localStorage.setItem(key, value);
      return value ?? local;
    } catch { return local; }
  },
  async setItem(key: string, value: string): Promise<void> {
    /* 🔴 Non era protetta: uno storage pieno faceva esplodere questa funzione
       per intero, rete compresa, invece di continuare a provare a salvare sul
       server. Adesso la copia locale può fallire da sola — il tentativo di
       rete sotto parte comunque, ed è quello che in un browser pieno conta
       davvero. */
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      if (isQuotaExceededError(error)) recordQuotaExceeded(`user-data:${key}`);
    }
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
      if (typeof value === 'string') localStorage.setItem(key, value);
      else await serverBackedStorage.setItem(key, local);
    } catch { /* Riprova alla prossima apertura. */ }
  }
}
