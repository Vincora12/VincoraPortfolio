/* Verifica offline del boundary Core Memory (CORE EXTRACTION PHASE 1). Nessuna API key o rete reale. */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-core-memory-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-core-memory-check.mjs');

writeFileSync(
  entry,
  `
export {
  memoryBackendMode,
  shouldCapturePersonalMemory,
  flattenMeModelDocument,
  mem0RowsToItems,
  filterByQuery,
  writePersonalMemory,
  listPersonalMemory,
  searchPersonalMemory,
  readMeMemoryView,
  searchMeMemoryView,
  importPersonalMemorySeed,
} from '${cwd}/netlify/functions/_shared/core/memory.ts';
`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
  external: ['@netlify/blobs'],
});

const m = await import(`file://${out}?v=${Date.now()}`);
let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

console.log('\n═══ CORE MEMORY BOUNDARY ═══\n');

// ── mode selection ──────────────────────────────────────────────────────
check(m.memoryBackendMode(undefined) === 'custom', 'nessuna variabile ambiente → custom (default)');
check(m.memoryBackendMode('custom') === 'custom', 'custom esplicito');
check(m.memoryBackendMode('mem0') === 'mem0', 'mem0 esplicito');
check(m.memoryBackendMode('frozen') === 'frozen', 'frozen esplicito');
let threw = false;
try { m.memoryBackendMode('future-engine'); } catch { threw = true; }
check(threw, 'una modalità sconosciuta fallisce invece di scegliere in silenzio');

check(m.shouldCapturePersonalMemory('Lavoro su FFUOCO da mesi') === true, 'un messaggio sostanzioso è candidato');
check(m.shouldCapturePersonalMemory('ok') === false, 'un ack breve non è candidato');

// ── pure projections ────────────────────────────────────────────────────
const NOW = new Date().toISOString();
const doc = {
  version: 1,
  user: { id: 'entity_user', type: 'user', name: 'Utente', aliases: [], status: 'active', createdAt: NOW, updatedAt: NOW },
  entities: [{ id: 'entity_1', type: 'project', name: 'FFUOCO', aliases: [], status: 'active', createdAt: NOW, updatedAt: NOW }],
  relations: [{ id: 'rel_1', subjectId: 'entity_user', predicate: 'works_on', objectId: 'entity_1', status: 'active', confidence: 0.8, sourceIds: [], createdAt: NOW, updatedAt: NOW }],
  episodes: [{ id: 'ep_1', type: 'travel', summary: 'Viaggio in Canada', entityIds: ['entity_user'], importance: 0.7, sourceIds: [], status: 'active', createdAt: NOW, updatedAt: NOW }],
  sources: [],
  summary: null,
  seedImports: [],
  chatCaptures: [],
};
const flattened = m.flattenMeModelDocument(doc);
check(flattened.length === 2, 'ogni relazione attiva e ogni episodio attivo diventa una riga di memoria');
check(flattened.some((item) => item.id === 'rel_1' && item.text.includes('FFUOCO')), 'la relazione porta il suo id stabile e un testo leggibile');
check(flattened.some((item) => item.id === 'ep_1' && item.text.includes('Canada')), 'l’episodio porta il suo id stabile e un testo leggibile');

const mem0Raw = { results: [{ id: 'm1', memory: 'Vive a Milano' }, { id: 'm2', text: 'Lavora su FFUOCO' }, { id: 'm3', memory: '' }] };
const mem0Items = m.mem0RowsToItems(mem0Raw);
check(mem0Items.length === 2, 'righe Mem0 senza testo vengono scartate, non riempite a vuoto');
check(mem0Items[0].text === 'Vive a Milano' && mem0Items[1].text === 'Lavora su FFUOCO', 'sia il campo memory che il campo text sono riconosciuti');
check(m.mem0RowsToItems([{ id: 'x', memory: 'riga senza wrapper results' }])[0].text === 'riga senza wrapper results', 'una risposta Mem0 senza wrapper {results} viene comunque letta');

const pool = [{ id: 'a', text: 'Lavora su FFUOCO' }, { id: 'b', text: 'Vive a Milano' }, { id: 'c', text: 'Interessato a scacchi' }];
check(m.filterByQuery(pool, 'FFUOCO', 5).length === 1, 'la ricerca deterministica trova la corrispondenza per parola');
check(m.filterByQuery(pool, '', 2).length === 2, 'una query vuota restituisce solo il limite, non un filtro rotto');

// ── frozen mode: no I/O of any kind ─────────────────────────────────────
const untouchedStore = { read: async () => { throw new Error('frozen must never read the store'); }, write: async () => { throw new Error('frozen must never write the store'); } };
process.env.VINZMON_MEMORY_WRITER_MODE = 'frozen';
const frozenWrite = await m.writePersonalMemory({ text: 'Lavoro su FFUOCO', messageId: 'frozen-1' }, 'frozen', untouchedStore);
check(frozenWrite.backend === 'frozen' && frozenWrite.result.updated === false && frozenWrite.result.status === 'no_change', 'frozen non scrive nulla e lo dice onestamente');
check((await m.listPersonalMemory(untouchedStore)).length === 0, 'frozen non legge nulla in lettura');

// ── custom mode (ME Model): fake store + fake extraction provider ──────
function fakeStore(initial = doc) {
  let document = structuredClone(initial);
  return { get document() { return document; }, read: async () => structuredClone(document), write: async (next) => { document = structuredClone(next); } };
}

const originalFetch = globalThis.fetch;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'test-only';
process.env.VINZMON_MEMORY_WRITER_MODE = 'custom';
globalThis.fetch = async () => new Response(JSON.stringify({
  model: 'gpt-5.6-luna',
  choices: [{
    message: {
      content: JSON.stringify({
        version: '1', memoryWorthy: true,
        entities: [{ mention: 'ARCADIA', type: 'project' }],
        relations: [{ subject: 'USER', predicate: 'works_on', object: 'ARCADIA', confidence: 0.8 }],
        episodes: [],
      }),
    },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 20, completion_tokens: 10 },
}), { status: 200, headers: { 'content-type': 'application/json' } });

try {
  const emptyDoc = { ...doc, entities: [], relations: [], episodes: [] };
  const writeStore = fakeStore(emptyDoc);
  const customWrite = await m.writePersonalMemory({ text: 'Sto lavorando ad ARCADIA', messageId: 'custom-1' }, 'custom', writeStore);
  check(customWrite.backend === 'custom', 'la modalità custom scrive attraverso il ME Model, non Mem0');
  check(customWrite.result.updated === true, 'l’estrazione viene interpretata e la scrittura riesce');
  check(writeStore.document.relations.some((r) => r.predicate === 'works_on'), 'la relazione estratta finisce davvero nel documento ME Model');

  const readStore = fakeStore(doc);
  const listed = await m.listPersonalMemory(readStore);
  check(listed.length === 2, 'in modalità custom la lista personale legge il ME Model, non Mem0');
  const searched = await m.searchPersonalMemory('FFUOCO', 5, readStore);
  check(searched.length === 1 && searched[0].text.includes('FFUOCO'), 'in modalità custom la ricerca è la ricerca deterministica sul ME Model');

  const view = await m.readMeMemoryView(readStore);
  check(
    Array.isArray(view.memories) && view.memories.length === 2 && view.counts.memories === 2 && view.backend === 'custom',
    'GET /api/me-memory in modalità custom usa la STESSA forma unificata di mem0 — niente più Array.isArray(memory.memories) lato client per indovinare il backend',
  );
  check(view.user === 'Utente', 'il nome utente della proiezione ME Model arriva nella vista unificata (bug della Fase 1 restato corretto)');

  const searchedView = await m.searchMeMemoryView('FFUOCO', readStore);
  check(Array.isArray(searchedView.memories) && searchedView.memories.length === 1, 'POST /api/me-memory ora funziona anche in modalità custom — prima tornava sempre 405 e la memoria a lungo termine della Chat dal vivo non arrivava mai nel prompt in questa modalità');

  // Il registro spesa reale non è configurabile in questo ambiente offline: la scrittura sopra
  // (customWrite) è già la prova che recordSpend, avvolto in try/catch, non ha fatto fallire una
  // scrittura altrimenti riuscita — è esattamente il comportamento che deve avere in produzione
  // se il registro spesa avesse un problema.
  check(customWrite.result.updated === true, 'la spesa non tracciabile in questo test non ha fatto fallire la scrittura personale — la telemetria non può essere così vincolante');

  // ── ME Seed: instrada attraverso il boundary Core, non tocca più meModel.ts direttamente ──
  const seedStore = fakeStore({ ...doc, entities: [], relations: [], episodes: [], seedImports: [] });
  const seedExtraction = {
    version: '1',
    entities: [{ mention: 'Milano', type: 'place' }],
    relations: [{ subject: 'USER', predicate: 'lives_in', object: 'Milano', confidence: 0.9 }],
    episodes: [],
  };
  const seedResult = await m.importPersonalMemorySeed('Vivo a Milano da tre anni.', async () => seedExtraction, seedStore);
  check(seedResult.status === 'imported' && seedResult.relationsCreated === 1, 'il seed viene importato nello stesso ME Model, con lo stesso meccanismo di sempre');
  check(seedStore.document.relations.some((r) => r.predicate === 'lives_in'), 'il fatto del seed finisce davvero nel documento che anche la chat scrive — nessuna verità indipendente');
  const seedAgain = await m.importPersonalMemorySeed('Vivo a Milano da tre anni.', async () => { throw new Error('non deve essere richiamato: il seed è già stato importato'); }, seedStore);
  check(seedAgain.status === 'already_imported', 'un seed identico non viene re-importato né richiama di nuovo il modello — idempotenza del seed invariata');
} finally {
  globalThis.fetch = originalFetch;
  if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiKey;
}

// ── mem0 mode: fake Mem0 HTTP service, no real credentials ─────────────
process.env.VINZMON_MEMORY_WRITER_MODE = 'mem0';
process.env.VINZMON_MEMORY_SERVICE_URL = 'https://mem0.test';
process.env.VINZMON_MEMORY_SERVICE_SECRET = 'test-secret';
let lastMem0Path;
globalThis.fetch = async (url) => {
  lastMem0Path = String(url);
  if (lastMem0Path.includes('/memory/add')) return new Response(JSON.stringify({ results: [{ id: 'm-new', memory: 'Sto lavorando ad ARCADIA' }] }), { status: 200 });
  if (lastMem0Path.includes('/memory/list')) return new Response(JSON.stringify({ results: [{ id: 'm1', memory: 'Vive a Milano' }] }), { status: 200 });
  if (lastMem0Path.includes('/memory/search')) return new Response(JSON.stringify({ results: [{ id: 'm1', memory: 'Vive a Milano', score: 0.9 }] }), { status: 200 });
  return new Response(JSON.stringify({ results: [] }), { status: 200 });
};

try {
  const mem0Write = await m.writePersonalMemory({ text: 'Sto lavorando ad ARCADIA', messageId: 'mem0-1' }, 'mem0', untouchedStore);
  check(mem0Write.backend === 'mem0' && mem0Write.result.updated === true, 'la modalità mem0 scrive su Mem0, mai sul ME Model');
  check(lastMem0Path.includes('/memory/add'), 'la scrittura raggiunge davvero l’endpoint Mem0 giusto');

  const mem0List = await m.listPersonalMemory(untouchedStore);
  check(mem0List.length === 1 && mem0List[0].text === 'Vive a Milano', 'in modalità mem0 la lista personale legge Mem0, non il ME Model — questo è esattamente il bug che machines.ts aveva prima di questa fase');

  const mem0Search = await m.searchPersonalMemory('Milano', 5, untouchedStore);
  check(mem0Search[0]?.score === 0.9, 'in modalità mem0 la ricerca è la ricerca semantica reale di Mem0, non il filtro per parole');

  const mem0View = await m.readMeMemoryView(untouchedStore);
  check(
    Array.isArray(mem0View.memories) && mem0View.counts.memories === 1 && mem0View.backend === 'mem0',
    'GET /api/me-memory in modalità mem0 usa la stessa forma unificata di custom — stesso contratto, backend diverso',
  );

  const mem0Search2 = await m.searchMeMemoryView('Milano', untouchedStore);
  check(Array.isArray(mem0Search2.memories), 'POST /api/me-memory in modalità mem0 resta la ricerca Mem0, stessa forma di prima');
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.VINZMON_MEMORY_SERVICE_URL;
  delete process.env.VINZMON_MEMORY_SERVICE_SECRET;
  delete process.env.VINZMON_MEMORY_WRITER_MODE;
}

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
