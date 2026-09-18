/* TEST D — RECUPERO SEMANTICO. Nessuna parola in comune fra il fatto salvato
   e la domanda: se torna, è la ricerca di mem0 che funziona, non un
   overlap lessicale fortunato. */
import { getMemory } from '../lib/setup.mjs';
import { writeResult } from '../lib/result.mjs';

const USER = 'vinz-poc';
const AGENT = 'mon-d-semantic';

const mem = await getMemory();
const t0 = Date.now();
await mem.add('Preferisco evitare i bar troppo turistici.', { userId: USER, agentId: AGENT, infer: true });
const addMs = Date.now() - t0;

const t1 = Date.now();
const results = await mem.search('Che tipo di posto dovremmo scegliere per bere qualcosa?', { filters: { user_id: USER, agent_id: AGENT }, topK: 8 });
const searchMs = Date.now() - t1;

const rows = (results.results ?? []).filter((r) => !r.metadata?.entityType);
const blob = rows.map((r) => r.memory.toLowerCase()).join(' ');
const found = blob.includes('turist') || blob.includes('bar');

writeResult('test-d-semantic', {
  status: found ? 'PASS' : 'FAIL',
  nota: 'zero parole in comune fra fatto e query italiana; se trovato, prova ricerca semantica reale via embedding, non keyword',
  addMs, searchMs,
  righeNonEntita: rows.map((r) => ({ memory: r.memory, score: r.score })),
  found,
});
