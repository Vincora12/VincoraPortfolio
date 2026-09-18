/* ============================================================================
   CORREZIONE — usando SOLO operazioni native di Mem0 (search + update),
   nessun secondo archivio, nessun sistema di versionamento parallelo.

   PERCHÉ SERVE QUESTO FILE, letto nel sorgente installato (mem0ai 3.1.7,
   node_modules/mem0ai/dist/oss/index.js):

   Il modello di add() di questa versione NON è più "confronta col vecchio
   fatto e decidi ADD/UPDATE/DELETE" (il vecchio comportamento di mem0). È
   puramente ADDITIVO: `ADDITIVE_EXTRACTION_PROMPT` (index.js:5509) dice
   letteralmente all'LLM "Your sole operation is ADD" — e SA riconoscere un
   aggiornamento (lo schema `AdditiveExtractionSchema`, index.js:5996, ha un
   campo `linked_memory_ids` con l'istruzione esplicita di collegare un
   fatto nuovo quando è "updated/shifted preference" di uno esistente) — ma
   quel collegamento viene CALCOLATO e poi SCARTATO: `addToVectorStore`
   (index.js:17608-17612) costruisce la riga da salvare (`memPayload`) senza
   mai leggere `mem.linked_memory_ids`, e il valore finale restituito da
   `add()` (index.js:17805-17809) ha `event` scritto letteralmente come
   `"ADD"` per ogni riga — non è configurabile, è così nel codice.

   Verificato con un test reale (POC, Test B): "Atlas venerdì" e "Atlas
   lunedì" restano due ricordi indipendenti, e quello vecchio ha uno score
   di rilevanza PIÙ ALTO di quello nuovo in una ricerca semplice.

   COSA FA QUESTO ADAPTER, e perché non è un secondo sistema di memoria:
   usa `mem.search()` (nativo) per trovare un candidato esistente sullo
   stesso argomento, una singola chiamata locale a Ollama (stesso modello
   già configurato, nessun servizio nuovo) per decidere se è davvero una
   correzione, e — se sì — `mem.update()` (nativo) sulla riga esistente.
   Non tocca lo schema di mem0, non aggiunge tabelle, non tiene un proprio
   indice.

   ATOMICITÀ — letta in `updateMemory()` (index.js:18323-18349), non
   assunta: `vectorStore.update()` è UNA sola istruzione SQL
   (`UPDATE vectors SET vector=?, payload=? WHERE id=?`, index.js:1191) su
   UNA riga esistente — atomica per garanzia di SQLite, prima o dopo, mai a
   metà. Lo storico (`db.addHistory`) è una scrittura SEPARATA, su un file
   SQLite diverso, SENZA una transazione che unisca le due. Se il processo
   si interrompe fra le due scritture, il rischio reale è "lo storico non
   registra l'aggiornamento", MAI "il vecchio fatto torna a essere quello
   restituito dalla ricerca" — perché è la STESSA riga, sostituita sul
   posto, non una riga nuova accanto alla vecchia.

   L'ORDINE SCELTO SOTTO (update sulla riga vecchia, POI delete della riga
   doppia creata da add()) esiste apposta per questo: se il processo si
   interrompe fra i due passi, nella peggiore delle ipotesi restano DUE
   copie dello STESSO fatto corretto — mai una vecchia e una nuova in
   conflitto. L'ordine opposto (delete prima, update dopo) potrebbe invece
   lasciare, in caso di interruzione, ZERO copie del fatto — peggio.
   ========================================================================= */

const CANDIDATE_TOPK = 5;
/* 🔴 EURISTICA NON VALIDATA SU LARGA SCALA — dichiarato esplicitamente, non
   nascosto. Misurato su UN solo caso reale (Test B: "venerdì" vs "lunedì",
   score 0.429/0.409 — stesso argomento, valore diverso). Non c'è modo di
   sapere se questa soglia distingue bene "stesso fatto, valore cambiato"
   da "due fatti diversi che parlano dello stesso argomento" senza un
   campione molto più grande. Questo è il limite più importante di questo
   file, e va letto prima di fidarsene. */
const CANDIDATE_SIMILARITY_THRESHOLD = 0.35;

async function ollamaJudgeIsCorrection({ oldText, newText, model, baseUrl }) {
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
  const body = await res.json();
  const answer = String(body.response || '').trim().toUpperCase();
  return answer.startsWith('YES');
}

/**
 * Scrive un fatto usando SOLO mem0 nativo (search/add/update/delete).
 * Ritorna { action: 'ADD' | 'UPDATE' | 'SKIPPED_DUPLICATE', ... } — mai
 * inventa uno stato che mem0 non ha davvero prodotto.
 */
export async function upsertPersonalMemory(mem, { userId, agentId, text, ollamaModel, ollamaBaseUrl }) {
  const filters = { user_id: userId, ...(agentId ? { agent_id: agentId } : {}) };

  // 1. add() nativo — stessa estrazione/normalizzazione di sempre.
  const addResult = await mem.add(text, { userId, agentId, infer: true });
  const created = addResult?.results ?? [];
  if (created.length === 0) {
    return { action: 'NESSUN_RICORDO_ESTRATTO', addResult };
  }

  const outcomes = [];
  for (const newRow of created) {
    // 2. search() nativo — candidati esistenti sullo STESSO argomento,
    //    esclusa la riga appena creata e i nodi-entità del grafo.
    const candidates = await mem.search(newRow.memory, { filters, topK: CANDIDATE_TOPK });
    const rival = (candidates?.results ?? [])
      .filter((r) => !r.metadata?.entityType && r.id !== newRow.id)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

    if (!rival || (rival.score ?? 0) < CANDIDATE_SIMILARITY_THRESHOLD) {
      outcomes.push({ action: 'ADD', id: newRow.id, text: newRow.memory });
      continue;
    }

    // 3. UNA chiamata locale a Ollama (stesso modello, nessun servizio
    //    nuovo) per la decisione che add() calcolava e scartava.
    const isCorrection = await ollamaJudgeIsCorrection({
      oldText: rival.memory,
      newText: newRow.memory,
      model: ollamaModel,
      baseUrl: ollamaBaseUrl,
    });

    if (!isCorrection) {
      outcomes.push({ action: 'ADD', id: newRow.id, text: newRow.memory, candidateConsiderato: rival.memory, candidateScore: rival.score });
      continue;
    }

    // 4. update() nativo sulla riga VECCHIA (atomica, vedi commento in
    //    testa al file), POI delete() della riga doppia creata da add().
    await mem.update(rival.id, { text: newRow.memory });
    await mem.delete(newRow.id);
    outcomes.push({
      action: 'UPDATE',
      updatedId: rival.id,
      previousText: rival.memory,
      newText: newRow.memory,
      removedDuplicateId: newRow.id,
      candidateScore: rival.score,
    });
  }

  return { action: outcomes.length === 1 ? outcomes[0].action : 'MULTI', outcomes, addResult };
}
