import { savedToken } from '../brain/stream';

function auth(): HeadersInit | null {
  const token = savedToken();
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
    localStorage.setItem(key, value);
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
