/* TEST C — ISOLAMENTO FRA MON. Un ricordo privato di MON_A non deve tornare
   cercando con MON_B, stesso utente. Verifico anche il caso opposto: un
   ricordo a livello UTENTE (nessun agentId) resta visibile a entrambi. */
import { getMemory, log } from '../lib/setup.mjs';
import { writeResult } from '../lib/result.mjs';

const USER = 'vinz-poc';
const MON_A = 'mon-a-private';
const MON_B = 'mon-b-private';
const SECRET = 'Con MON_A ho parlato del fatto che sto pensando di lasciare il lavoro attuale.';
const SHARED = "L'utente si chiama Vincenzo e vive a Roma.";

const mem = await getMemory();

await mem.add(SECRET, { userId: USER, agentId: MON_A, infer: true });
await mem.add(SHARED, { userId: USER, infer: true }); // nessun agentId: a livello utente

const searchOnA = await mem.search('Cosa mi ha detto sul lavoro?', { filters: { user_id: USER, agent_id: MON_A }, topK: 8 });
const searchOnB = await mem.search('Cosa mi ha detto sul lavoro?', { filters: { user_id: USER, agent_id: MON_B }, topK: 8 });
const sharedOnA = await mem.search('Dove vive e come si chiama?', { filters: { user_id: USER, agent_id: MON_A }, topK: 8 });
const sharedOnB = await mem.search('Dove vive e come si chiama?', { filters: { user_id: USER, agent_id: MON_B }, topK: 8 });

const has = (res, needle) => JSON.stringify(res).toLowerCase().includes(needle);

const leakedToB = has(searchOnB, 'lasciare') || has(searchOnB, 'lavoro attuale');
const visibleOnA = has(searchOnA, 'lasciare') || has(searchOnA, 'lavoro attuale');
const sharedVisibleA = has(sharedOnA, 'roma') || has(sharedOnA, 'vincenzo');
const sharedVisibleB = has(sharedOnB, 'roma') || has(sharedOnB, 'vincenzo');

writeResult('test-c-isolation', {
  status: visibleOnA && !leakedToB ? 'PASS' : 'FAIL',
  privateMemory: { visibleOnOwnMon: visibleOnA, leakedToOtherMon: leakedToB },
  userLevelMemory: {
    nota: 'un add() senza agentId è visibile filtrando SOLO per user_id, indipendentemente da quale agent_id si passi nel filtro?',
    visibleOnA: sharedVisibleA,
    visibleOnB: sharedVisibleB,
  },
  raw: { searchOnA, searchOnB, sharedOnA, sharedOnB },
});
