/* ============================================================================
   CORREZIONE NATIVA — porting da `experiments/memory-poc/lib/correctionAdapter.mjs`
   (VinzMon-v2, POC del 2026-09-17). Stesso algoritmo, stesse tre operazioni
   native di mem0ai (search/update/delete), nessun secondo archivio.

   Vive QUI, non in netlify/functions/_shared, perché `mem0ai` è una
   dipendenza di QUESTO pacchetto (`services/mem0/package.json`) — importarlo
   da netlify/functions vorrebbe dire risolverlo da un albero di dipendenze
   che non lo dichiara. `server.ts` lo importa già; questo file resta un
   sibling con lo stesso accesso.

   AGGIUNTA rispetto al POC — MUTEX PER AMBITO (userId+agentId): il POC
   testava un upsert alla volta. Con più richieste HTTP concorrenti sullo
   stesso processo (`services/mem0/server.ts` gira come UN processo Node
   figlio, spawnato da `core-server.ts`'s `startLocalMem0()`), la sequenza
   search→giudizio→update non è atomica come lo è la singola istruzione SQL
   di `update()`: due upsert per lo STESSO fatto possono interfogliarsi e
   uno può sovrascrivere silenziosamente l'altro. Il mutex sotto serializza
   gli upsert per lo stesso (userId, agentId) IN ORDINE DI CHIAMATA — non di
   completamento — cosa che basta a impedire che un'elaborazione più vecchia
   finita in ritardo scavalchi una più recente, perché in un processo Node
   singolo la chiamata che arriva prima si accoda prima.

   ⚠️ QUESTO MUTEX VIVE IN MEMORIA DI PROCESSO. Protegge correttamente
   finché mem0 gira come UN SOLO processo Node (vero oggi: Local Core Server
   ne avvia esattamente uno). Se un giorno questo servizio girasse replicato
   su più processi/istanze, il mutex NON offrirebbe più protezione — andrebbe
   sostituito con un lock esterno (es. una riga in SQLite con
   `onlyIfNew`/`onlyIfMatch`, già disponibile in `localStore.ts`, ma quello
   vive in netlify/functions, non qui). Dichiarato, non nascosto. */

type MemoryLike = {
  add(text: string, config: { userId: string; agentId?: string; infer?: boolean }): Promise<{ results?: Array<{ id: string; memory: string }> }>;
  search(query: string, config: { filters: Record<string, string>; topK?: number }): Promise<{ results?: Array<{ id: string; memory: string; score?: number; metadata?: Record<string, unknown> }> }>;
  update(memoryId: string, config: { text: string }): Promise<unknown>;
  delete(memoryId: string): Promise<unknown>;
};

export interface UpsertInput {
  userId: string;
  agentId?: string;
  text: string;
}

export type UpsertOutcome =
  | { action: 'ADD'; id: string; text: string }
  | { action: 'UPDATE'; updatedId: string; previousText: string; newText: string; removedDuplicateId: string; candidateScore: number }
  | { action: 'NESSUN_RICORDO_ESTRATTO' };

export interface UpsertResult {
  action: string;
  outcomes: UpsertOutcome[];
}

const CANDIDATE_TOPK = 5;
/* Stessa soglia del POC, stesso limite dichiarato: validata su un campione
   di 3 casi totali (uno positivo, uno negativo, uno di conferma). Non è un
   valore tarato su scala — vedi experiments/memory-poc/REPORT.md, ADDENDUM. */
const CANDIDATE_SIMILARITY_THRESHOLD = 0.35;

async function ollamaJudgeIsCorrection(oldText: string, newText: string, model: string, baseUrl: string): Promise<boolean> {
  const prompt = [
    'Rispondi SOLO con la parola YES oppure la parola NO, niente altro.',
    'FATTO ESISTENTE: ' + oldText,
    'FATTO NUOVO: ' + newText,
    'Il FATTO NUOVO corregge, sostituisce o aggiorna il valore del FATTO ESISTENTE (stesso argomento, informazione cambiata)?',
    'Rispondi NO se sono due fatti diversi e scollegati, anche se simili nell\'argomento.',
  ].join('\n');
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0 } }),
  });
  if (!res.ok) throw new Error(`ollama judge fallito: ${res.status}`);
  const body = (await res.json()) as { response?: string };
  return String(body.response || '').trim().toUpperCase().startsWith('YES');
}

/* Coda FIFO per chiave — una Promise incatenata per ambito. Non un
   semaforo/libreria esterna: è il pattern minimo corretto per serializzare
   async in un solo processo Node, senza dipendenze nuove. */
const scopeQueues = new Map<string, Promise<unknown>>();
function withScopeLock<T>(scopeKey: string, fn: () => Promise<T>): Promise<T> {
  const previous = scopeQueues.get(scopeKey) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  // evita che una catena di errori tenga in vita la coda per sempre
  scopeQueues.set(scopeKey, next.catch(() => undefined));
  return next;
}

export async function upsertPersonalMemory(
  mem: MemoryLike,
  input: UpsertInput,
  opts: { ollamaModel: string; ollamaBaseUrl: string },
): Promise<UpsertResult> {
  const scopeKey = `${input.userId}::${input.agentId ?? '(user)'}`;
  return withScopeLock(scopeKey, () => upsertPersonalMemoryUnlocked(mem, input, opts));
}

async function upsertPersonalMemoryUnlocked(
  mem: MemoryLike,
  { userId, agentId, text }: UpsertInput,
  { ollamaModel, ollamaBaseUrl }: { ollamaModel: string; ollamaBaseUrl: string },
): Promise<UpsertResult> {
  const filters: Record<string, string> = { user_id: userId, ...(agentId ? { agent_id: agentId } : {}) };

  const addResult = await mem.add(text, { userId, agentId, infer: true });
  const created = addResult?.results ?? [];
  if (created.length === 0) {
    return { action: 'NESSUN_RICORDO_ESTRATTO', outcomes: [{ action: 'NESSUN_RICORDO_ESTRATTO' }] };
  }

  const outcomes: UpsertOutcome[] = [];
  for (const newRow of created) {
    const candidates = await mem.search(newRow.memory, { filters, topK: CANDIDATE_TOPK });
    const rival = (candidates?.results ?? [])
      .filter((r) => !r.metadata?.entityType && r.id !== newRow.id)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

    if (!rival || (rival.score ?? 0) < CANDIDATE_SIMILARITY_THRESHOLD) {
      outcomes.push({ action: 'ADD', id: newRow.id, text: newRow.memory });
      continue;
    }

    const isCorrection = await ollamaJudgeIsCorrection(rival.memory, newRow.memory, ollamaModel, ollamaBaseUrl);
    if (!isCorrection) {
      outcomes.push({ action: 'ADD', id: newRow.id, text: newRow.memory });
      continue;
    }

    // update() sulla riga VECCHIA prima, delete() della riga doppia dopo:
    // in caso di interruzione fra i due passi, restano al più due copie
    // dello STESSO fatto corretto, mai una vecchia e una nuova in conflitto.
    await mem.update(rival.id, { text: newRow.memory });
    await mem.delete(newRow.id);
    outcomes.push({
      action: 'UPDATE',
      updatedId: rival.id,
      previousText: rival.memory,
      newText: newRow.memory,
      removedDuplicateId: newRow.id,
      candidateScore: rival.score ?? 0,
    });
  }

  return { action: outcomes.length === 1 ? outcomes[0].action : 'MULTI', outcomes };
}
