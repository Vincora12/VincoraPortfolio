/* TEST A, PROCESSO 1 — scrive un fatto per MON_A e termina.
   Nessuna verifica qui: la prova vera è nel processo 2, lanciato a parte. */
import { getMemory, log } from '../lib/setup.mjs';
import { writeResult } from '../lib/result.mjs';

const USER = 'vinz-poc';
const AGENT = 'mon-a';
const FACT = 'Il mio gatto si chiama Pixel ed è nato nel 2019.';

const t0 = Date.now();
const mem = await getMemory();
const addResult = await mem.add(FACT, { userId: USER, agentId: AGENT, infer: true });
const elapsedMs = Date.now() - t0;

log('add completato', { elapsedMs, addResult });
writeResult('test-a1-write', {
  status: addResult?.results?.length ? 'SCRITTO' : 'NESSUN_RICORDO_CREATO',
  fact: FACT,
  userId: USER,
  agentId: AGENT,
  elapsedMs,
  addResult,
});
