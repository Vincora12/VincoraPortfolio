/* TEST I — RIPETE lo scenario di Test B (FAIL), stavolta passando da
   `upsertPersonalMemory` invece che da `mem.add()` diretto. Prova che
   basta la logica nell'adapter — nessuna riscrittura di mem0, nessun
   secondo archivio. Agente NUOVO per non mescolarsi coi dati di Test B. */
import { getMemory } from '../lib/setup.mjs';
import { upsertPersonalMemory } from '../lib/correctionAdapter.mjs';
import { writeResult } from '../lib/result.mjs';

const USER = 'vinz-poc';
const AGENT = 'mon-i-correction-adapter';
const OLLAMA_BASE = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'qwen2.5:14b';

const mem = await getMemory();

const t0 = Date.now();
const r1 = await upsertPersonalMemory(mem, { userId: USER, agentId: AGENT, text: 'Il progetto Atlas sarà lanciato venerdì.', ollamaModel: OLLAMA_MODEL, ollamaBaseUrl: OLLAMA_BASE });
const r1Ms = Date.now() - t0;

const t1 = Date.now();
const r2 = await upsertPersonalMemory(mem, { userId: USER, agentId: AGENT, text: 'Il lancio di Atlas è stato spostato a lunedì.', ollamaModel: OLLAMA_MODEL, ollamaBaseUrl: OLLAMA_BASE });
const r2Ms = Date.now() - t1;

const search = await mem.search('Quando viene lanciato Atlas?', { filters: { user_id: USER, agent_id: AGENT }, topK: 10 });
const rows = (search.results ?? []).filter((r) => !r.metadata?.entityType);
const activeCount = rows.length;
const mentionsMonday = rows.some((r) => r.memory.toLowerCase().includes('monday'));
const mentionsFriday = rows.some((r) => r.memory.toLowerCase().includes('friday'));

writeResult('test-i-correction-adapter', {
  status: activeCount === 1 && mentionsMonday && !mentionsFriday ? 'PASS' : 'FAIL',
  nota: 'stesso scenario del Test B, stavolta via upsertPersonalMemory invece di mem.add() diretto',
  primoUpsertAction: r1.action,
  secondoUpsertAction: r2.action,
  r1Ms, r2Ms,
  ricordiAttiviTrovati: activeCount,
  mentionsMonday, mentionsFriday,
  righeAttive: rows.map((r) => ({ memory: r.memory, score: r.score })),
  dettaglioSecondoUpsert: r2,
});
