/* TEST E — RUMORE. Una conversazione sintetica senza fatti duraturi: mem0
   deve produrre poco o niente, non un ricordo per ogni riga. */
import { getMemory } from '../lib/setup.mjs';
import { writeResult } from '../lib/result.mjs';

const USER = 'vinz-poc';
const AGENT = 'mon-e-noise';

const messages = [
  { role: 'user', content: 'ok' },
  { role: 'assistant', content: 'Va bene, fammi sapere.' },
  { role: 'user', content: 'quanto fa 12 per 7?' },
  { role: 'assistant', content: '84.' },
  { role: 'user', content: 'grazie mille!' },
  { role: 'assistant', content: 'di niente 😊' },
];

const mem = await getMemory();
const t0 = Date.now();
const addResult = await mem.add(messages, { userId: USER, agentId: AGENT, infer: true });
const addMs = Date.now() - t0;

const created = addResult?.results ?? [];

writeResult('test-e-noise', {
  status: created.length === 0 ? 'PASS' : 'FALSI_POSITIVI',
  nota: created.length === 0
    ? 'nessun ricordo creato da una conversazione senza fatti duraturi'
    : `mem0 ha creato ${created.length} ricordo/i da rumore puro — falsi positivi documentati sotto`,
  addMs,
  ricordiCreati: created,
});
