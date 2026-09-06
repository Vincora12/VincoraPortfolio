/* ============================================================================
   STORAGE INSPECTOR (SYSTEM.LAB / STORAGE)

   🔷 «Voglio vedere quanto storage stiamo usando, quanto rimane, quali
   categorie occupano spazio, quali key sono responsabili.»

   ⚠️ SOLO LETTURA. Questo modulo misura, non cancella e non modifica. Ogni
   funzione qui dentro può fallire silenziosamente su un browser che non
   espone un'API — non deve mai far cadere la schermata che lo chiama.

   🔒 NON misura MAI un contenuto: solo dimensioni in byte, conteggi di key,
   nomi di campo. Nessuna funzione qui dentro restituisce testo di chat,
   prompt, token o immagini — anche il drill-down strutturale riporta la
   dimensione di un campo, mai il suo valore.
   ========================================================================= */

/* --- Formattazione ----------------------------------------------------------- */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** UTF-16: due byte per code unit — è quello che il motore tiene davvero in
    memoria per una stringa JS, non i byte UTF-8 che finirebbero in rete. */
function utf16Bytes(value: string): number {
  return value.length * 2;
}

/* --- BROWSER STORAGE (overview) ---------------------------------------------- */

export type Measurement = 'measured' | 'estimated' | 'unavailable';

export interface BrowserStorageEstimate {
  kind: Measurement;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function browserStorageEstimate(): Promise<BrowserStorageEstimate> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return { kind: 'unavailable', usageBytes: null, quotaBytes: null };
    }
    const result = await navigator.storage.estimate();
    if (typeof result.usage !== 'number' || typeof result.quota !== 'number') {
      return { kind: 'unavailable', usageBytes: null, quotaBytes: null };
    }
    /* L'API stessa si chiama "estimate": il numero è del browser, non
       inventato da noi, ma non è una misura esatta byte per byte — per
       questo resta "estimated" e non "measured", anche quando risponde. */
    return { kind: 'estimated', usageBytes: result.usage, quotaBytes: result.quota };
  } catch {
    return { kind: 'unavailable', usageBytes: null, quotaBytes: null };
  }
}

/* --- LOCAL STORAGE: categorie e classificazione ------------------------------ */

export type LocalStorageCategory =
  | 'prototype' | 'assistant-ui-threads' | 'assistant-ui-messages' | 'health-journal'
  | 'brain' | 'progression' | 'configuration' | 'cache' | 'other';

export const CATEGORY_LABEL: Record<LocalStorageCategory, string> = {
  prototype: 'PROTOTYPE',
  'assistant-ui-threads': 'CHAT THREADS',
  'assistant-ui-messages': 'CHAT MESSAGES',
  'health-journal': 'HEALTH',
  brain: 'BRAIN',
  progression: 'PROGRESSION',
  configuration: 'CONFIGURATION',
  cache: 'CACHE',
  other: 'OTHER',
};

/** CANONICAL = questo browser è l'unica copia. SERVER-BACKED = ha una
    controparte server che la stessa chiave sincronizza (`serverBackedStorage`
    o l'incasso nel salvataggio §19). RECONSTRUCTIBLE = perderla non perde
    dati: torna un default sano. CACHE = copia locale di qualcosa che vive
    altrove, tenuta per velocità. UNKNOWN = chiave non riconosciuta. */
export type Classification = 'CANONICAL' | 'SERVER-BACKED' | 'RECONSTRUCTIBLE' | 'CACHE' | 'UNKNOWN';

interface CategoryRule {
  test: (key: string) => boolean;
  category: LocalStorageCategory;
  classification: Classification;
}

/* 🔒 Ogni riga qui è stata verificata leggendo il file che scrive quella
   chiave — non è una supposizione sul nome. Vedi la classe che la usa a
   fianco di ogni regola. */
const RULES: CategoryRule[] = [
  { test: (k) => k === 'vinzmon.prototype.v4', category: 'prototype', classification: 'SERVER-BACKED' }, // state/store.ts → /api/state
  { test: (k) => k === 'vinzmon.health.journal.v1', category: 'health-journal', classification: 'SERVER-BACKED' }, // engine/healthJournal.ts, incassato nel salvataggio come __healthJournal
  { test: (k) => k === 'assistant-ui-official-chatgpt:threads', category: 'assistant-ui-threads', classification: 'SERVER-BACKED' },
  { test: (k) => k === 'assistant-ui-official-chatgpt:active-thread', category: 'assistant-ui-threads', classification: 'SERVER-BACKED' },
  { test: (k) => k.startsWith('assistant-ui-official-chatgpt:messages:'), category: 'assistant-ui-messages', classification: 'SERVER-BACKED' },
  { test: (k) => k === 'assistant-ui-official-chatgpt:thread-icons' || k === 'assistant-ui-official-chatgpt:thread-colors', category: 'assistant-ui-threads', classification: 'RECONSTRUCTIBLE' }, // preferenze cosmetiche, plain localStorage
  { test: (k) => k === 'vinzmon:chat-micro-behavior:v1', category: 'brain', classification: 'SERVER-BACKED' }, // chat-micro-behaviors.ts usa serverBackedStorage
  { test: (k) => k === 'vinzmon.brain.v1', category: 'brain', classification: 'SERVER-BACKED' }, // fallback locale di /api/brain quando manca il token
  { test: (k) => k === 'vinzmon.chat.daily-cost.v1', category: 'brain', classification: 'CACHE' }, // derivabile dal registro server (/api/usage)
  { test: (k) => k === 'vinzmon.chat.tree.v1', category: 'brain', classification: 'RECONSTRUCTIBLE' }, // solo layout visivo
  { test: (k) => k === 'vinzmon.sync.rewards.v2' || k === 'vinzmon.sync.wish.v1', category: 'progression', classification: 'CANONICAL' }, // nessuna copia altrove
  { test: (k) => k === 'vinzmon.runtimeConfig.v1', category: 'configuration', classification: 'SERVER-BACKED' },
  { test: (k) => k === 'vinzmon.taxonomyDescriptions.catalog', category: 'configuration', classification: 'CACHE' }, // mirror legacy di runtimeConfig.taxonomyVersion
  { test: (k) => k === 'vinzmon.designTokens.v1' || k === 'vinzmon.taxonomyProposals.v1' || k === 'vinzmon.catalog.v1' || k === 'vinzmon.axisWeights.v2' || k === 'vinzlab.training.v2', category: 'configuration', classification: 'RECONSTRUCTIBLE' }, // tarature DEV/LAB, un default esiste senza
  { test: (k) => k.startsWith('vinzmon:toy-pipeline-v2:'), category: 'cache', classification: 'CACHE' }, // flag di migrazione, App.tsx
];

export function classifyLocalStorageKey(key: string): { category: LocalStorageCategory; classification: Classification } {
  for (const rule of RULES) {
    if (rule.test(key)) return { category: rule.category, classification: rule.classification };
  }
  return { category: 'other', classification: 'UNKNOWN' };
}

export interface LocalStorageKeyInfo {
  key: string;
  bytes: number;
  category: LocalStorageCategory;
  classification: Classification;
}

export interface LocalStorageSnapshot {
  keys: LocalStorageKeyInfo[];
  totalBytes: number;
}

export function localStorageSnapshot(): LocalStorageSnapshot {
  if (typeof localStorage === 'undefined') return { keys: [], totalBytes: 0 };
  const keys: LocalStorageKeyInfo[] = [];
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null) continue;
    const value = localStorage.getItem(key) ?? '';
    const bytes = utf16Bytes(key) + utf16Bytes(value);
    const { category, classification } = classifyLocalStorageKey(key);
    keys.push({ key, bytes, category, classification });
    totalBytes += bytes;
  }
  return { keys: keys.sort((a, b) => b.bytes - a.bytes), totalBytes };
}

export interface CategoryTotal {
  category: LocalStorageCategory;
  bytes: number;
  count: number;
}

export function byCategory(keys: LocalStorageKeyInfo[]): CategoryTotal[] {
  const map = new Map<LocalStorageCategory, CategoryTotal>();
  for (const item of keys) {
    const existing = map.get(item.category) ?? { category: item.category, bytes: 0, count: 0 };
    existing.bytes += item.bytes;
    existing.count += 1;
    map.set(item.category, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.bytes - a.bytes);
}

/* --- INDEXEDDB (idb-keyval, store predefinito) -------------------------------

   assets-pipeline/assetStore.ts e lab/rooms/duelImages.ts usano entrambi il
   database di idb-keyval SENZA `createStore` personalizzato: sono lo STESSO
   database ("keyval-store" / object store "keyval"), quindi una sola lettura
   di `keys()` li vede tutti e due. */

export type IndexedDbCategory = 'mon-assets' | 'kept-assets' | 'duel-images' | 'other';

export const INDEXEDDB_CATEGORY_LABEL: Record<IndexedDbCategory, string> = {
  'mon-assets': 'MON ASSETS',
  'kept-assets': 'KEPT ASSETS (TECA)',
  'duel-images': 'DUEL IMAGES',
  other: 'ALTRI RECORD',
};

function classifyIndexedDbKey(key: string): IndexedDbCategory {
  if (key.startsWith('asset:kept/')) return 'kept-assets';
  if (key.startsWith('asset:')) return 'mon-assets';
  if (key.startsWith('vinzlab/duel/')) return 'duel-images';
  return 'other';
}

async function idbValueBytes(value: unknown): Promise<number> {
  if (value instanceof Blob) return value.size;
  if (typeof value === 'string') return new TextEncoder().encode(value).length;
  if (value == null) return 0;
  try { return new TextEncoder().encode(JSON.stringify(value)).length; } catch { return 0; }
}

export interface IndexedDbEntryInfo {
  key: string;
  bytes: number;
  category: IndexedDbCategory;
}

export interface IndexedDbSnapshot {
  kind: Measurement;
  entries: IndexedDbEntryInfo[];
  totalBytes: number;
}

export async function indexedDbSnapshot(): Promise<IndexedDbSnapshot> {
  if (typeof indexedDB === 'undefined') return { kind: 'unavailable', entries: [], totalBytes: 0 };
  try {
    const { get, keys } = await import('idb-keyval');
    const allKeys = await keys();
    const entries: IndexedDbEntryInfo[] = [];
    let totalBytes = 0;
    for (const rawKey of allKeys) {
      const key = String(rawKey);
      const value = await get(rawKey);
      const bytes = await idbValueBytes(value);
      entries.push({ key, bytes, category: classifyIndexedDbKey(key) });
      totalBytes += bytes;
    }
    return { kind: 'measured', entries: entries.sort((a, b) => b.bytes - a.bytes), totalBytes };
  } catch {
    return { kind: 'unavailable', entries: [], totalBytes: 0 };
  }
}

export function byIndexedDbCategory(entries: IndexedDbEntryInfo[]): { category: IndexedDbCategory; bytes: number; count: number }[] {
  const map = new Map<IndexedDbCategory, { category: IndexedDbCategory; bytes: number; count: number }>();
  for (const item of entries) {
    const existing = map.get(item.category) ?? { category: item.category, bytes: 0, count: 0 };
    existing.bytes += item.bytes;
    existing.count += 1;
    map.set(item.category, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.bytes - a.bytes);
}

/* --- DRILL-DOWN STRUTTURALE ---------------------------------------------------

   Solo per `vinzmon.prototype.v4`: la dimensione stimata di ogni campo di
   primo livello, e — quando il campo è un dizionario o un array — un secondo
   livello con la dimensione di ogni voce. MAI il valore: solo il nome del
   campo (o della chiave/indice) e i byte che occupa.
   ========================================================================= */

export interface FieldBreakdown {
  field: string;
  bytes: number;
  children?: FieldBreakdown[];
}

function fieldSize(value: unknown): number {
  try { return utf16Bytes(JSON.stringify(value) ?? ''); } catch { return 0; }
}

export function prototypeFieldBreakdown(): FieldBreakdown[] | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem('vinzmon.prototype.v4');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const state = parsed.state;
    if (!state || typeof state !== 'object') return null;
    return Object.entries(state)
      .map(([field, value]) => {
        const bytes = fieldSize(value);
        let children: FieldBreakdown[] | undefined;
        if (value && typeof value === 'object') {
          const entries = Array.isArray(value)
            ? value.map((item, index) => [String(index), item] as const)
            : Object.entries(value as Record<string, unknown>);
          if (entries.length > 0 && entries.length <= 500) {
            children = entries
              .map(([childField, childValue]) => ({ field: childField, bytes: fieldSize(childValue) }))
              .sort((a, b) => b.bytes - a.bytes);
          }
        }
        return { field, bytes, children };
      })
      .sort((a, b) => b.bytes - a.bytes);
  } catch {
    return null;
  }
}

/* --- STATUS -------------------------------------------------------------------

   ACTIVE / WARNING / CRITICAL / QUOTA EXCEEDED, calcolato sui dati che
   riusciamo davvero a leggere — mai su un numero indovinato.

   🔴 STORAGE STABILIZATION STEP 1/4 — questa funzione valeva per la quota
   CONDIVISA di `navigator.storage.estimate()` (localStorage + IndexedDB +
   il resto), rinominata `computeSharedStorageStatus` per dirlo. Serviva
   ANCHE come stato di LOCAL STORAGE, e lì era una bugia: quella percentuale
   non è la quota di localStorage, che nessuna API espone da sola — vedi
   `computeLocalStorageStatus` qui sotto, che non la usa per niente. */

export type StorageStatus = 'ACTIVE' | 'WARNING' | 'CRITICAL' | 'QUOTA EXCEEDED';

export function computeSharedStorageStatus(percentUsed: number | null, quotaExceededRecently: boolean): StorageStatus {
  if (quotaExceededRecently) return 'QUOTA EXCEEDED';
  if (percentUsed === null) return 'ACTIVE';
  if (percentUsed >= 95) return 'CRITICAL';
  if (percentUsed >= 80) return 'WARNING';
  return 'ACTIVE';
}

/** Il testo che LOCAL STORAGE mostra al posto di un numero: nessun browser
    espone il tetto specifico di `localStorage`, solo quello condiviso
    dell'intera origine — dirlo è più onesto che indovinare un numero
    (5–10 MB, secondo il browser, mai dichiarato) e presentarlo come misura. */
export const LOCAL_STORAGE_LIMIT_LABEL = 'BROWSER MANAGED / NOT EXPOSED';

export type LocalStorageStatus = 'HEALTHY' | 'WARNING' | 'QUOTA EXCEEDED';

/**
 * Stato di LOCAL STORAGE, basato SOLO su evidenza reale:
 *
 * - QUOTA EXCEEDED: un `QuotaExceededError` è stato registrato di recente
 *   (`lastStorageOperation` di `localStorageDiagnostics.ts`) — un fatto
 *   accaduto, non una stima.
 * - WARNING: sopra una soglia PRUDENZIALE di 4 MB — il minimo che quasi
 *   ogni browser garantisce è circa 5 MB, quindi 4 avvisa prima del bordo
 *   più stretto conosciuto. Non è il limite vero (che non è leggibile), ed
 *   è dichiarato come soglia prudenziale nella UI, mai spacciato per una
 *   misura del browser.
 * - HEALTHY: nessuna delle due.
 */
export function computeLocalStorageStatus(usedBytes: number, quotaExceededRecently: boolean): LocalStorageStatus {
  if (quotaExceededRecently) return 'QUOTA EXCEEDED';
  if (usedBytes > 4 * 1024 * 1024) return 'WARNING';
  return 'HEALTHY';
}
