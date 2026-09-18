/* TEST F — CANCELLAZIONE. Salvo, verifico che ci sia, cancello, verifico
   che sparisca dalla ricerca attiva. Controllo anche se resta una traccia
   nello storico (m.history) — mem0 lo dichiara come funzione a parte, non
   presumo che "delete" significhi "nessuna traccia in nessun posto". */
import { getMemory } from '../lib/setup.mjs';
import { writeResult } from '../lib/result.mjs';

const USER = 'vinz-poc';
const AGENT = 'mon-f-deletion';
const FACT = 'Il mio numero di scarpe è 42 e mezzo.';

const mem = await getMemory();
const addResult = await mem.add(FACT, { userId: USER, agentId: AGENT, infer: true });
const memoryId = addResult?.results?.[0]?.id;

if (!memoryId) {
  writeResult('test-f-deletion', { status: 'BLOCCATO', motivo: 'add() non ha restituito un id da cancellare', addResult });
  process.exit(0);
}

const before = await mem.search('Che numero di scarpe porto?', { filters: { user_id: USER, agent_id: AGENT }, topK: 5 });
const presentBefore = JSON.stringify(before).includes(memoryId) || JSON.stringify(before).toLowerCase().includes('42');

await mem.delete(memoryId);

const after = await mem.search('Che numero di scarpe porto?', { filters: { user_id: USER, agent_id: AGENT }, topK: 5 });
const presentAfter = JSON.stringify(after).includes(memoryId);

let historyEntries = null;
let historyError = null;
try {
  historyEntries = await mem.history(memoryId);
} catch (e) {
  historyError = e instanceof Error ? e.message : String(e);
}

writeResult('test-f-deletion', {
  status: presentBefore && !presentAfter ? 'PASS' : 'FAIL',
  memoryId,
  presentBefore,
  presentAfterDelete: presentAfter,
  storicoDopoLaCancellazione: historyEntries ?? { errore: historyError },
  nota: historyEntries
    ? 'm.history(id) rimane interrogabile dopo delete — è un registro di controllo separato dall\'indice di ricerca attivo, non un secondo indice ricercabile per contenuto'
    : 'm.history(id) non raggiungibile per questo id',
});
