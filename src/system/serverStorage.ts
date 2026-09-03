import { setLocalStorageItem } from './localStorageDiagnostics';
import { consumePendingHistoryReadGateId } from './chatLiveDebug';

/* Import dinamico deliberato: runtimeLog.ts porta con sé savedToken() da
   brain/stream.ts, una catena pesante. serverStorage.ts è importato in
   modo statico da moduli molto presto nel bundle (state/store.ts): un
   import statico qui vanificherebbe lo split che tiene runtimeLog fuori
   dal bundle principale (stesso motivo per cui state/store.ts lo importa
   già così). */
const postThreadStorageEvent = (event: Parameters<typeof import('./runtimeLog').postRuntimeEvent>[0]): void => {
  void import('./runtimeLog').then(({ postRuntimeEvent }) => postRuntimeEvent(event));
};

function auth(): HeadersInit | null {
  let token: string | null = null;
  try {
    const raw = localStorage.getItem('vinzmon.prototype.v4');
    const parsed = raw ? JSON.parse(raw) as { state?: { token?: unknown } } : null;
    token = typeof parsed?.state?.token === 'string' ? parsed.state.token : null;
  } catch { /* Un salvataggio locale illeggibile equivale a nessun token. */ }
  return token ? { authorization: `Bearer ${token}` } : null;
}

/* FIRST TURN OBSERVABILITY ONLY — la chiave dei messaggi della chat
   (assistant-ui-official-chatgpt:messages:<remoteId>) è scritta sia dal
   nostro codice (persistSnapshot) sia, internamente, da assistant-ui
   stesso (AsyncStorageHistoryAdapter). Nessuna delle due scritture sa
   dell'altra. Questi contatori aiutano a vedere, sul device reale, chi
   scrive cosa e in che ordine — mai il contenuto dei messaggi, solo
   quanti sono e qual è il loro headId (un id, non un testo). */
const CHAT_MESSAGES_KEY_PATTERN = /^assistant-ui-official-chatgpt:messages:/;

function byteLength(value: string): number {
  try { return new TextEncoder().encode(value).byteLength; } catch { return value.length; }
}

function repositoryShape(raw: string | null): { messageCount: number; headId: string } | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { headId?: string | null; messages?: unknown[] };
    return {
      messageCount: Array.isArray(parsed.messages) ? parsed.messages.length : 0,
      headId: typeof parsed.headId === 'string' ? parsed.headId : 'none',
    };
  } catch {
    return { messageCount: 0, headId: 'unparseable' };
  }
}

export const serverBackedStorage = {
  async getItem(key: string): Promise<string | null> {
    /* FIRST TURN — FINAL DISCRIMINATOR. Consumato SUBITO, in modo
       sincrono, prima di qualunque await: vedi il commento in
       chatLiveDebug.ts su perché questo è sicuro con letture
       concorrenti. Se questa chiamata non è passata da
       createOwnershipGatedHistoryAdapter(), gateId è null — non lo
       inventiamo mai qui. */
    const gateId = CHAT_MESSAGES_KEY_PATTERN.test(key) ? consumePendingHistoryReadGateId() : null;
    const local = localStorage.getItem(key);
    const headers = auth();
    let result = local;
    let source: 'LOCAL' | 'SERVER' = 'LOCAL';
    if (!headers) {
      result = local;
    } else {
      try {
        const response = await fetch(`/api/user-data?key=${encodeURIComponent(key)}`, { headers, cache: 'no-store' });
        if (!response.ok) {
          result = local;
        } else {
          const { value } = await response.json() as { value: string | null };
          if (typeof value === 'string') setLocalStorageItem('serverStorage.getItem cache', key, value);
          if (typeof value === 'string') { result = value; source = 'SERVER'; } else { result = local; }
        }
      } catch { result = local; }
    }
    if (CHAT_MESSAGES_KEY_PATTERN.test(key)) {
      const shape = repositoryShape(result);
      postThreadStorageEvent({
        eventType: 'CHAT_STORAGE_READ',
        status: 'PASS',
        scope: 'chat',
        payloadBytes: result ? byteLength(result) : 0,
        metadata: { source, messageCount: shape?.messageCount ?? 0, headId: shape?.headId ?? 'none', ...(gateId ? { gateId } : {}) },
      });
      if (shape) {
        postThreadStorageEvent({
          eventType: 'CHAT_HISTORY_LOAD',
          status: 'PASS',
          scope: 'chat',
          metadata: { messageCount: shape.messageCount, headId: shape.headId, ...(gateId ? { gateId } : {}) },
        });
      }
    }
    return result;
  },
  async setItem(key: string, value: string, caller = 'UNTAGGED'): Promise<void> {
    setLocalStorageItem('serverStorage.setItem', key, value);
    if (CHAT_MESSAGES_KEY_PATTERN.test(key)) {
      const shape = repositoryShape(value);
      postThreadStorageEvent({
        eventType: 'CHAT_STORAGE_WRITE',
        status: 'PASS',
        scope: 'chat',
        payloadBytes: byteLength(value),
        metadata: { caller, messageCount: shape?.messageCount ?? 0, headId: shape?.headId ?? 'none' },
      });
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
      if (typeof value === 'string') setLocalStorageItem('serverStorage.migrate cache', key, value);
      else await serverBackedStorage.setItem(key, local);
    } catch { /* Riprova alla prossima apertura. */ }
  }
}
