/* TEST B — CORREZIONE. Non presumo che mem0 versioni i fatti: registro,
   correggo, cerco, e leggo cosa ha fatto DAVVERO col fatto precedente. */
import { getMemory, log } from '../lib/setup.mjs';
import { writeResult } from '../lib/result.mjs';

const USER = 'vinz-poc';
const AGENT = 'mon-b-correction';

const mem = await getMemory();

const t0 = Date.now();
const add1 = await mem.add('Il progetto Atlas sarà lanciato venerdì.', { userId: USER, agentId: AGENT, infer: true });
const add1Ms = Date.now() - t0;

const t1 = Date.now();
const add2 = await mem.add('Il lancio di Atlas è stato spostato a lunedì.', { userId: USER, agentId: AGENT, infer: true });
const add2Ms = Date.now() - t1;

const t2 = Date.now();
const results = await mem.search('Quando viene lanciato Atlas?', { filters: { user_id: USER, agent_id: AGENT }, topK: 10 });
const searchMs = Date.now() - t2;

const rows = (results?.results ?? []).filter((r) => !r.metadata?.entityType);
const texts = rows.map((r) => r.memory?.toLowerCase() ?? '');
/* mem0 estrae e normalizza in INGLESE con data assoluta, non nella lingua
   e nella forma relativa dell'input ("venerdì" -> "Friday, September 18,
   2026") — un fatto in sé, non un bug del test, verificato leggendo
   l'estrazione reale prima di correggere questo controllo. */
const mentionsMonday = texts.some((t) => t.includes('monday'));
const mentionsFridayStillPresent = texts.some((t) => t.includes('friday'));
const mondayRow = rows.find((r) => r.memory?.toLowerCase().includes('monday'));
const fridayRow = rows.find((r) => r.memory?.toLowerCase().includes('friday'));
const fridayOutranksMonday = Boolean(fridayRow && mondayRow && fridayRow.score > mondayRow.score);

const add2Events = (add2?.results ?? []).map((r) => r.metadata?.event ?? r.event);

log('eventi prodotti dal secondo add (correzione)', add2Events);

writeResult('test-b-correction', {
  status: mentionsMonday && !mentionsFridayStillPresent
    ? 'PASS'
    : (mentionsMonday && mentionsFridayStillPresent ? 'FAIL' : 'FAIL'),
  motivoFail: mentionsFridayStillPresent
    ? 'il secondo add ha prodotto evento ADD, non UPDATE: il fatto vecchio (venerdì) resta come ricordo indipendente, non sostituito'
    : undefined,
  fridayOutranksMonday,
  notaOrdinamento: fridayOutranksMonday ? 'il fatto SUPERATO (venerdì) ha uno score di rilevanza PIÙ ALTO del fatto CORRETTO (lunedì) in una ricerca semplice' : null,
  add1Ms, add2Ms, searchMs,
  add2EventsReali: add2Events,
  righeNonEntitaRestituite: rows,
  mentionsMonday,
  mentionsFridayStillPresent,
  rawSearch: results,
});
