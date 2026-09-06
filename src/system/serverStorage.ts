import { setLocalStorageItem } from './localStorageDiagnostics';
import { consumePendingHistoryReadGateId } from './chatLiveDebug';
import { mergeMessageRepositories, mergeThreadLists } from './chatHistoryMerge';

/* Import dinamico deliberato: runtimeLog.ts porta con sé savedToken() da
   brain/stream.ts, una catena pesante. serverStorage.ts è importato in
   modo statico da moduli molto presto nel bundle (state/store.ts): un
   import statico qui vanificherebbe lo split che tiene runtimeLog fuori
   dal bundle principale (stesso motivo per cui state/store.ts lo importa
   già così). */
const postThreadStorageEvent = (event: Parameters<typeof import('./runtimeLog').postRuntimeEvent>[0]): void => {
  void import('./runtimeLog').then(({ postRuntimeEvent }) => postRuntimeEvent(event));
};

let activeToken: (() => string | null) | undefined;
export function configureStorageTokenReader(reader: () => string | null): void { activeToken = reader; }
const pending = new Map<string, { value: string; caller: string }>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => { try { listener(); } catch { /* Observability cannot fail a write. */ } });
export const storageSyncFailures = () => pending.size;
export function subscribeStorageSync(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function cache(source: string, key: string, value: string): void {
  try { setLocalStorageItem(source, key, value); } catch { /* Optional browser cache must not prevent the canonical server write. */ }
}
function auth(): HeadersInit | null {
  let token: string | null = null;
  try {
    token = activeToken?.() ?? null;
    if (token) return { authorization: `Bearer ${token}` };
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

/* REMOTE CHAT HISTORY V1 — le due sole chiavi dove una PUT cieca perde dati
   scritti da un altro dispositivo nella stessa finestra di tempo (G5/G6):
   il repository messaggi di UN thread, e l'indice dei thread stesso
   (`LocalStorageThreadListAdapter`'s `threadsKey = ${prefix}threads`).
   Ogni altra chiave che passa da questo storage (tuning, config, chat-trace,
   icone/colori dei thread, ...) continua a scrivere senza condizioni,
   esattamente come prima — vedi REMOTE_CHAT_HISTORY_V1.md. */
const CHAT_THREADS_KEY = 'assistant-ui-official-chatgpt:threads';
const MAX_CONFLICT_RETRIES = 3;

function isConcurrencyAwareKey(key: string): boolean {
  return key === CHAT_THREADS_KEY || CHAT_MESSAGES_KEY_PATTERN.test(key);
}

function mergeForKey(key: string, serverValue: string | null, oursValue: string): string {
  return key === CHAT_THREADS_KEY
    ? mergeThreadLists(serverValue, oursValue)
    : mergeMessageRepositories(serverValue, oursValue);
}

/* ETag dell'ultima lettura/scrittura riuscita per chiave — SOLO in memoria,
   SOLO per decidere la condizione della prossima PUT (`If-Match` se lo
   conosciamo, `X-Only-If-New` se no). Non è una cache di dati: si perde ad
   ogni reload, e va benissimo così, perché `append()`/`initialize()` (vedi
   `LocalStorageThreadListAdapter`) fanno sempre una `getItem()` subito prima
   di una `setItem()` sulla stessa chiave — l'etag è quasi sempre già fresco
   quando serve. */
const knownEtags = new Map<string, string>();

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

const storage = {
  async getItem(key: string): Promise<string | null> {
    /* FIRST TURN — FINAL DISCRIMINATOR. Consumato SUBITO, in modo
       sincrono, prima di qualunque await: vedi il commento in
       chatLiveDebug.ts su perché questo è sicuro con letture
       concorrenti. Se questa chiamata non è passata da
       createOwnershipGatedHistoryAdapter(), gateId è null — non lo
       inventiamo mai qui. */
    const gateId = CHAT_MESSAGES_KEY_PATTERN.test(key) ? consumePendingHistoryReadGateId() : null;
    let local = pending.get(key)?.value ?? null;
    try { local ??= localStorage.getItem(key); } catch { /* Browser cache unavailable. */ }
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
          const { value, etag } = await response.json() as { value: string | null; etag?: string | null };
          if (typeof etag === 'string') knownEtags.set(key, etag);
          if (typeof value === 'string') cache('serverStorage.getItem cache', key, value);
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
    cache('serverStorage.setItem', key, value);
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
    if (!headers) throw new Error('STORAGE_AUTH_UNAVAILABLE');

    if (!isConcurrencyAwareKey(key)) {
      const response = await fetch(`/api/user-data?key=${encodeURIComponent(key)}`, { method: 'PUT', headers, body: value });
      if (!response.ok) throw new Error('STORAGE_WRITE_UNCONFIRMED');
      return;
    }

    /* REMOTE CHAT HISTORY V1 — scrittura condizionale con unione al conflitto
       (G5/G6). Le altre chiavi (sopra) restano una PUT cieca esattamente
       come sempre: qui, e solo qui, una PUT rifiutata (409 — un altro
       dispositivo ha scritto la stessa chiave nel frattempo) non è un
       errore da inghiottire: si unisce il valore corrente del server con
       quello che stavamo per scrivere (`mergeForKey` — mai una perdita, mai
       un id duplicato) e si ritenta, fino a `MAX_CONFLICT_RETRIES` volte. */
    let attemptValue = value;
    for (let attempt = 1; attempt <= MAX_CONFLICT_RETRIES + 1; attempt++) {
      const etag = knownEtags.get(key);
      const conditionHeaders: HeadersInit = etag ? { 'if-match': etag } : { 'x-only-if-new': '1' };
      let outcome: { kind: 'ok'; etag?: string } | { kind: 'conflict'; value: string | null; etag: string | null } | { kind: 'error' };
      try {
        const response = await fetch(`/api/user-data?key=${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: { ...headers, ...conditionHeaders },
          body: attemptValue,
        });
        if (response.status === 409) {
          const body = await response.json().catch(() => null) as { value?: string | null; etag?: string | null } | null;
          outcome = { kind: 'conflict', value: body?.value ?? null, etag: body?.etag ?? null };
        } else if (!response.ok) {
          outcome = { kind: 'error' };
        } else {
          const body = await response.json().catch(() => null) as { etag?: string } | null;
          outcome = { kind: 'ok', etag: body?.etag };
        }
      } catch {
        outcome = { kind: 'error' };
      }

      if (outcome.kind === 'ok') {
        if (outcome.etag) knownEtags.set(key, outcome.etag);
        if (!outcome.etag) throw new Error('STORAGE_WRITE_UNCONFIRMED');
        return;
      }
      if (outcome.kind === 'error') {
        /* Rete assente o server irraggiungibile: la copia locale (già
           scritta sopra, incondizionatamente) resta la verità disponibile —
           G8. Nessun altro ritentativo qui: il prossimo setItem() su questa
           chiave riparte da un getItem() fresco. */
        throw new Error('STORAGE_WRITE_UNCONFIRMED');
      }

      const isFinalAttempt = attempt === MAX_CONFLICT_RETRIES + 1;
      postThreadStorageEvent({
        eventType: 'CHAT_STORAGE_CONFLICT',
        status: isFinalAttempt ? 'FAIL' : 'START',
        scope: 'chat',
        metadata: { key: key.slice(0, 80), caller, attempt },
      });
      if (outcome.etag) knownEtags.set(key, outcome.etag);
      attemptValue = mergeForKey(key, outcome.value, attemptValue);
      cache('serverStorage.setItem merge', key, attemptValue);
    }
    throw new Error('STORAGE_CONFLICT_RETRY_EXHAUSTED');
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

// One writer per key, preserving the existing remote merge/CAS owner.
// Pending values remain in memory on failure, never falsely acknowledged.
const writes = new Map<string, Promise<void>>();
export const serverBackedStorage = {
  ...storage,
  async setItem(key: string, value: string, caller = 'UNTAGGED'): Promise<void> {
    const entry = { value, caller };
    pending.set(key, entry); notify();
    const task = (writes.get(key) ?? Promise.resolve()).then(async () => {
      try {
        await storage.setItem(key, value, caller);
        if (pending.get(key) === entry) pending.delete(key);
      } catch { /* Caller remains live; retry UI exposes unconfirmed persistence. */ }
      notify();
    });
    writes.set(key, task);
    await task;
    if (writes.get(key) === task) writes.delete(key);
  },
};
export async function retryStorageSync(): Promise<void> {
  await Promise.all([...pending].map(([key, { value, caller }]) => serverBackedStorage.setItem(key, value, caller)));
}

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
