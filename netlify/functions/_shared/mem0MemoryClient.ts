export type Mem0Result = { updated: boolean; stored: number; raw?: unknown };
const userId = 'vinzmon-user';
function config() { const url = process.env.VINZMON_MEMORY_SERVICE_URL || 'http://127.0.0.1:8788'; const secret = process.env.VINZMON_MEMORY_SERVICE_SECRET || process.env.VINZMON_TOKEN; if (!secret) throw new Error('Mem0 service is not configured'); return { url: url.replace(/\/$/, ''), secret }; }
async function call(path: string, init: RequestInit = {}) { const c = config(); const response = await fetch(`${c.url}${path}`, { ...init, headers: { authorization: `Bearer ${c.secret}`, 'content-type': 'application/json', ...(init.headers || {}) } }); if (!response.ok) throw new Error(`Mem0 service returned ${response.status}`); return response.json() as Promise<any>; }
export async function addToMem0(input: { text: string; conversationId?: string; messageId?: string; agentId?: string }): Promise<Mem0Result> { const raw = await call('/memory/add', { method: 'POST', body: JSON.stringify({ userId, agentId: input.agentId, text: input.text, infer: true, metadata: { source: 'chat', conversationId: input.conversationId, messageId: input.messageId } }) }); const stored = Array.isArray(raw?.results) ? raw.results.length : Array.isArray(raw) ? raw.length : raw?.memory ? 1 : 0; return { updated: stored > 0, stored, raw }; }
/* 🔴 `getAll` DI MEM0 HA UN `topK = 20` DI DEFAULT, e nessuno gliene passava
   uno: le macchine hanno sempre visto al massimo venti righe, cioè quasi niente
   e per giunta le sbagliate. Il limite si chiede esplicito. */
export async function listMem0(limit = 500): Promise<unknown> { return call(`/memory/list?userId=${encodeURIComponent(userId)}&limit=${limit}`); }
/* 🔴 `agentId` PRESERVATO NEL RISULTATO — trovato con un test reale, non
   ipotizzato: una ricerca Mem0 filtrata SOLO per `user_id` (senza
   `agent_id` nel filtro) non significa "solo ricordi senza agent_id" —
   significa "non controllare affatto l'agent_id", quindi restituisce
   ANCHE i ricordi privati di ogni mon (verificato: MON_B otteneva il fatto
   privato di MON_A passando da questa strada). Senza `agentId` nel
   risultato, chi chiama non può distinguere "livello utente vero" da
   "privato di un mon qualunque" — vedi `memoryV1.ts`'s
   `searchScopedPersonalMemory`, che usa questo campo per il filtro reale. */
export async function searchMem0(query: string, limit = 5, agentId?: string): Promise<Array<{ id?: string; text: string; score?: number; metadata?: Record<string, unknown>; agentId?: string }>> {
  const raw = await call('/memory/search', { method: 'POST', body: JSON.stringify({ userId, agentId, query, limit }) });
  const rows = Array.isArray(raw?.results) ? raw.results : Array.isArray(raw) ? raw : [];
  return rows.flatMap((row: any) => typeof row?.memory === 'string' ? [{ id: row.id, text: row.memory, score: row.score, metadata: row.metadata, agentId: row.agent_id }] : typeof row?.text === 'string' ? [{ id: row.id, text: row.text, score: row.score, metadata: row.metadata, agentId: row.agent_id }] : []);
}

/* ============================================================================
   MEMORY V1 — CORREZIONE NATIVA (search + giudizio locale + update)

   Chiama `/memory/upsert`, aggiunto a `services/mem0/server.ts` insieme a
   `services/mem0/correctionAdapter.ts` (porting testato del POC — vedi
   `experiments/memory-poc/REPORT.md`, ADDENDUM). Non duplica l'algoritmo:
   questa funzione è solo il trasporto HTTP, stesso schema di `addToMem0`. */
export type Mem0UpsertResult = { action: string; outcomes: unknown[] };
export async function upsertMem0(input: { text: string; agentId?: string; conversationId?: string; messageId?: string }): Promise<Mem0UpsertResult> {
  return call('/memory/upsert', { method: 'POST', body: JSON.stringify({ userId, agentId: input.agentId, text: input.text }) }) as Promise<Mem0UpsertResult>;
}

/* 🔷 «Un tasto che ricominci facendo cancellare anche i ricordi.»

   🔒 UNA RIGA ALLA VOLTA, NON UN RESET DELLA LIBRERIA. `Memory.reset()`
   esiste nell'SDK ma cancella la collezione intera del vector store —
   comodo, ma non verificato qui contro dati veri, e non distingue fra righe.
   Questa funzione riusa solo `/memory/list` e `/memory/delete`, gli stessi
   due endpoint già provati in questa sessione, riga per riga: più lenta, ma
   niente di cui non si sia già visto il comportamento reale. */
export async function deleteFromMem0(id: string): Promise<void> {
  await call('/memory/delete', { method: 'POST', body: JSON.stringify({ memoryId: id }) });
}

export async function wipeMem0(): Promise<{ deleted: number; failed: number }> {
  const raw = await listMem0(2000);
  const rows = Array.isArray((raw as { results?: unknown[] })?.results)
    ? (raw as { results: unknown[] }).results
    : Array.isArray(raw) ? raw : [];
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    const id = (row as { id?: string })?.id;
    if (!id) continue;
    try {
      await deleteFromMem0(id);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { deleted, failed };
}
