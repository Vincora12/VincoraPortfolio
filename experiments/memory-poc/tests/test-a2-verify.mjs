/* TEST A, PROCESSO 2 — un processo `node` NUOVO e SEPARATO da test-a1-write.mjs.
   Non riceve la conversazione originale: solo lo storage su disco e una
   domanda. Se il fatto torna, la persistenza è reale, non un artefatto di
   sessione o di cache in RAM del processo che ha scritto. */
import { getMemory, log } from '../lib/setup.mjs';
import { writeResult } from '../lib/result.mjs';

const USER = 'vinz-poc';
const AGENT = 'mon-a';
const QUERY = 'Come si chiama il mio gatto?';

const t0 = Date.now();
const mem = await getMemory();
const results = await mem.search(QUERY, { filters: { user_id: USER, agent_id: AGENT }, topK: 5 });
const elapsedMs = Date.now() - t0;

const blob = JSON.stringify(results).toLowerCase();
const found = blob.includes('pixel');

log('search completato', { elapsedMs, found });
writeResult('test-a2-verify', {
  status: found ? 'PASS' : 'FAIL',
  query: QUERY,
  expectedSubstring: 'pixel',
  found,
  elapsedMs,
  processo: 'nuovo processo node, nessuna conversazione passata nel prompt',
  results,
});
