/* ============================================================================
   MEMORY V1 — integrazione dietro flag, spenta di default.

   Costruita sopra tre pezzi già esistenti e già verificati, non un nuovo
   motore di memoria:
   - `services/mem0/correctionAdapter.ts` (porting del POC, search+giudizio
     Ollama locale+update nativo, mutex per ambito) — questo file chiama
     solo il suo trasporto HTTP (`mem0MemoryClient.ts`), non lo riscrive.
   - `getStore()` (`localStore.ts`), lo stesso store SQLite già usato per
     `vinzmon-evolution`/`vinzmon-machines` — riusato per la cattura
     resistente ai riavvii, nessuna infrastruttura nuova.
   - `memoryBackendMode()` (`core/memory.ts`) — il flag esiste già
     (`VINZMON_MEMORY_WRITER_MODE`), qui viene solo LETTO, non duplicato.

   FLAG: attiva quando `VINZMON_MEMORY_WRITER_MODE=mem0` **e**
   `VINZMON_LOCAL_CORE=1` (solo Mac, mai su Netlify) **e** i provider LLM/
   embedder di Mem0 sono esplicitamente `ollama` — quest'ultimo controllo
   esiste per un motivo preciso: senza, un `VINZMON_MEMORY_WRITER_MODE=mem0`
   con `.env` incompleto farebbe ripiegare `mem0ai` sul provider 'openai'
   di default (verificato in `services/mem0/server.ts`: `e.MEM0_LLM_PROVIDER
   || 'openai'`) — cioè manderebbe i ricordi privati a un servizio cloud
   senza che nessuno l'abbia deciso. Qui si rifiuta di attivarsi piuttosto
   che rischiarlo. */

import { createHash } from 'node:crypto';
import { getStore } from './localStore';
import { isLocalCoreServer } from './vinzWorkspace';
import { searchMem0, upsertMem0, type Mem0UpsertResult } from './mem0MemoryClient';

/* 🔒 Non importa `memoryBackendMode` da `core/memory.ts` di proposito:
   quel modulo importerà QUESTO file più sotto per instradare le sue
   funzioni verso Memory V1, e un'importazione nei due sensi fra due
   moduli è fragile da affidare al bundler. Il confronto sulla singola
   variabile d'ambiente è la stessa identica logica di `memoryBackendMode`
   per il solo valore `'mem0'` — non una seconda definizione del flag,
   solo evitare il ciclo. */
export function isMemoryV1Enabled(): boolean {
  if (!isLocalCoreServer()) return false;
  if (process.env.VINZMON_MEMORY_WRITER_MODE !== 'mem0') return false;
  const llmOk = process.env.MEM0_LLM_PROVIDER === 'ollama';
  const embedderOk = process.env.MEM0_EMBEDDER_PROVIDER === 'ollama';
  return llmOk && embedderOk;
}

/** Usata dai chiamanti che devono fallire rumorosamente, non ripiegare in
 * silenzio su un percorso non protetto, quando la modalità è 'mem0' ma la
 * configurazione non garantisce "solo locale". */
export function assertMemoryV1Ready(): void {
  if (process.env.VINZMON_MEMORY_WRITER_MODE !== 'mem0') {
    throw new Error('Memory V1: VINZMON_MEMORY_WRITER_MODE non è "mem0"');
  }
  if (!isLocalCoreServer()) {
    throw new Error('Memory V1: richiede il Local Core Server (VINZMON_LOCAL_CORE=1)');
  }
  if (process.env.MEM0_LLM_PROVIDER !== 'ollama' || process.env.MEM0_EMBEDDER_PROVIDER !== 'ollama') {
    throw new Error('Memory V1: MEM0_LLM_PROVIDER e MEM0_EMBEDDER_PROVIDER devono essere "ollama" — rifiutato per non rischiare un ripiego cloud silenzioso');
  }
}

/* ============================================================================
   CATTURA RESISTENTE AI RIAVVII

   `me-chat-capture.ts` è chiamato con `void` dal client (mai atteso) — quel
   pezzo era già non-bloccante, verificato in `netlify-runtime.ts:1119`
   prima di scrivere questo file, non presunto. Il problema vero non era il
   blocco della chat: era che, se il processo del Local Core Server muore a
   metà di quella richiesta HTTP, il tentativo di scrittura sparisce senza
   lasciare traccia — nessun record che dica "questo fatto andava ancora
   salvato".

   Questo modulo scrive un record PRIMA di chiamare Mem0, chiave derivata
   dal `messageId` — che esiste già, stabile, uno per messaggio — così un
   secondo tentativo con lo STESSO messageId (un retry del client, o la
   ripresa dopo un riavvio) trova il record e decide se ripetere il lavoro o
   fermarsi, invece di crearne uno nuovo. */

type JobStatus = 'pending' | 'running' | 'done' | 'error';
interface CaptureJob {
  status: JobStatus;
  text: string;
  agentId?: string;
  conversationId?: string;
  messageId: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  outcome?: Mem0UpsertResult;
  error?: string;
}

const JOB_STORE = 'vinzmon-memory-v1-jobs';
const jobStore = () => getStore(JOB_STORE);

/* Stesso identificativo canonico che `coreContext.ts` già usa per il lato
   lettura (`state?.activeMonName`) — letto qui per il lato scrittura, dallo
   stesso salvataggio, non un secondo concetto di "quale mon". */
export async function activeMonNameFromSavedState(): Promise<string | undefined> {
  const saved = (await getStore({ name: 'vinzmon-state', consistency: 'strong' }).get('save', { type: 'json' })) as
    | { state?: { activeMonName?: string } }
    | null;
  return saved?.state?.activeMonName || undefined;
}
/* Una riga `running` più vecchia di questo va considerata orfana di un
   processo morto, non "ancora in corso" — misurato nel POC: il caso più
   lento osservato (add() a freddo, primo caricamento del modello) è stato
   50,3 s. Il triplo è un margine deliberatamente largo, non un numero
   comodo: meglio aspettare troppo che riprovare un lavoro che sta ancora
   girando davvero. */
const STALE_AFTER_MS = 3 * 60_000;

function jobKey(messageId: string): string {
  return `job:${createHash('sha256').update(messageId).digest('hex')}`;
}

function isStale(job: CaptureJob): boolean {
  return Date.now() - Date.parse(job.updatedAt) > STALE_AFTER_MS;
}

async function runJob(key: string, job: CaptureJob): Promise<{ status: 'done' | 'error'; outcome?: Mem0UpsertResult; error?: string }> {
  job.status = 'running';
  job.attempts += 1;
  job.updatedAt = new Date().toISOString();
  await jobStore().setJSON(key, job);
  try {
    // Nessuna transazione SQLite aperta qui sopra o qui sotto: `setJSON` è
    // una singola istruzione, già tornata, prima di questa chiamata lenta.
    const outcome = await upsertMem0({ text: job.text, agentId: job.agentId, conversationId: job.conversationId, messageId: job.messageId });
    job.status = 'done';
    job.updatedAt = new Date().toISOString();
    job.outcome = outcome;
    await jobStore().setJSON(key, job);
    return { status: 'done', outcome };
  } catch (error) {
    // Un errore resta un errore: MAI scritto come 'done'.
    job.status = 'error';
    job.updatedAt = new Date().toISOString();
    job.error = error instanceof Error ? error.message : 'errore sconosciuto';
    await jobStore().setJSON(key, job);
    return { status: 'error', error: job.error };
  }
}

export interface CaptureMemoryV1Result {
  status: 'done' | 'error' | 'skipped';
  reason?: 'already_done' | 'already_running';
  outcome?: Mem0UpsertResult;
  error?: string;
}

/**
 * Punto unico di scrittura per Memory V1. Idempotente per `messageId`:
 * chiamarla due volte con lo stesso messageId non produce due scritture —
 * la seconda o trova il lavoro già fatto (`skipped`) o riprende quello
 * rimasto a metà, mai lo duplica da zero.
 */
export async function captureMemoryV1(input: { text: string; agentId?: string; conversationId?: string; messageId: string }): Promise<CaptureMemoryV1Result> {
  assertMemoryV1Ready();
  const key = jobKey(input.messageId);
  const now = new Date().toISOString();
  const fresh: CaptureJob = { status: 'pending', text: input.text, agentId: input.agentId, conversationId: input.conversationId, messageId: input.messageId, createdAt: now, updatedAt: now, attempts: 0 };
  const { modified } = await jobStore().set(key, JSON.stringify(fresh), { onlyIfNew: true });
  if (modified) return runJob(key, fresh);

  const existing = (await jobStore().get(key, { type: 'json' })) as CaptureJob | null;
  if (!existing) return runJob(key, fresh); // riga sparita fra le due letture: caso limite, si ricrea
  if (existing.status === 'done') return { status: 'skipped', reason: 'already_done', outcome: existing.outcome };
  if (existing.status === 'running' && !isStale(existing)) return { status: 'skipped', reason: 'already_running' };
  return runJob(key, existing);
}

/**
 * Da chiamare periodicamente (riuso dello scheduler già esistente in
 * `core-server.ts`, nessun cron nuovo). Riprende SOLO i lavori fermi da più
 * di `STALE_AFTER_MS` — un lavoro genuinamente in corso non viene toccato.
 */
export async function resumeIncompleteMemoryV1Captures(): Promise<{ scanned: number; resumed: number }> {
  if (!isMemoryV1Enabled()) return { scanned: 0, resumed: 0 };
  const store = jobStore();
  const { blobs } = await store.list({ prefix: 'job:' });
  let resumed = 0;
  for (const { key } of blobs) {
    const job = (await store.get(key, { type: 'json' })) as CaptureJob | null;
    if (!job) continue;
    if ((job.status === 'pending' || job.status === 'running') && isStale(job)) {
      await runJob(key, job);
      resumed += 1;
    }
  }
  return { scanned: blobs.length, resumed };
}

/* ============================================================================
   RECUPERO PER AMBITO — USER globale + MON privata, unite qui

   Una ricerca di Mem0 filtrata per `agent_id` ESCLUDE i ricordi a livello
   utente (verificato nel POC: una memoria salvata senza `agentId` non torna
   se il filtro di ricerca ne specifica uno) — non è un OR, è un AND sui
   campi presenti. Per questo si fanno DUE ricerche native e si uniscono qui,
   non dentro Mem0.

   RELAZIONE e IDENTITÀ-PRIVATA-DEL-MON coincidono in questo schema: l'unico
   scrittore per-mon oggi è la cattura dalla chat (`captureMemoryV1`), che è
   per natura relazionale — non esiste (ancora) un secondo scrittore che
   distingua "fatti sul mon" da "fatti sulla relazione". Dichiarato, non
   nascosto: una vera separazione servirebbe una terza dimensione che Mem0
   non offre nativamente (solo user_id/agent_id/run_id) o un secondo tag di
   metadata da introdurre più avanti.

   PROGETTO: NON collegata a nessun punto di chiamata reale in questa
   integrazione — l'autorizzazione per-progetto è un sistema che non è stato
   verificato qui, e mescolarlo senza quella verifica sarebbe esattamente il
   rischio che il punto 3 del compito vuole evitare ("non rendere globali
   ricordi... con scope ambiguo"). Il parametro esiste nella firma per non
   dover cambiare di nuovo la forma della funzione, ma passare `projectId`
   oggi non fa nulla in più. */
export interface ScopedMemoryItem {
  id?: string;
  text: string;
  score?: number;
  scope: 'user' | 'mon';
}

const isEntityRow = (row: { metadata?: Record<string, unknown> }) => typeof row.metadata?.entityType === 'string';

export async function searchScopedPersonalMemory(input: {
  query: string;
  agentId?: string;
  projectId?: string; // non collegato, vedi commento sopra
  limitPerScope?: number;
  maxChars?: number;
}): Promise<ScopedMemoryItem[]> {
  const limitPerScope = input.limitPerScope ?? 5;
  const maxChars = input.maxChars ?? 1500;

  const [userRowsRaw, monRows] = await Promise.all([
    searchMem0(input.query, limitPerScope),
    input.agentId ? searchMem0(input.query, limitPerScope, input.agentId) : Promise.resolve([]),
  ]);
  /* 🔴 TROVATO CON UN TEST REALE (non nel POC, in questa integrazione): un
     filtro Mem0 con solo `user_id` (nessun `agent_id`) NON significa "solo
     i ricordi senza agent_id" — significa "non controllare l'agent_id per
     niente", quindi `userRowsRaw` contiene ANCHE i ricordi privati di ogni
     mon. Il vero livello-utente si ottiene filtrando qui, in codice, sui
     ricordi che non hanno affatto un `agentId` — Mem0 da solo non lo fa. */
  const userRows = userRowsRaw.filter((row) => !row.agentId);

  const seenText = new Set<string>();
  const merged: ScopedMemoryItem[] = [];
  for (const [rows, scope] of [[userRows, 'user'], [monRows, 'mon']] as const) {
    for (const row of rows) {
      if (isEntityRow(row)) continue; // nodi del grafo (TOPIC/PROPER), non ricordi — stesso filtro di core/memory.ts
      const normalized = row.text.trim().toLowerCase();
      if (!normalized || seenText.has(normalized)) continue;
      seenText.add(normalized);
      merged.push({ id: row.id, text: row.text, score: row.score, scope });
    }
  }

  merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Budget in CARATTERI, non un tokenizer vero — stessa convenzione già in
  // uso nel resto del progetto (`LIMITS.userChars` in ai.ts), non una nuova
  // unità di misura inventata qui.
  const budgeted: ScopedMemoryItem[] = [];
  let used = 0;
  for (const item of merged) {
    if (used + item.text.length > maxChars) continue;
    budgeted.push(item);
    used += item.text.length;
  }
  return budgeted;
}
