import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'vinzmon-tool-test-'));
try {
  const output = join(directory, 'tools.mjs');
  await build({ entryPoints: ['src/ai/tools.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node' });
  const { resultBlocks, budgetToolResults, runTool, executeRuntimeTool, TOOLS } = await import(pathToFileURL(output));
  const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  for (const text of ['x'.repeat(20000), '🍄漢字'.repeat(10000), '\n\t"\\'.repeat(9000)]) {
    const inputs = Array.from({ length: 12 }, (_, n) => ({ id: `call-${n}`, content: text, isError: n % 2 === 0 }));
    const blocks = resultBlocks(inputs);
    assert(byteLength(blocks) <= 10000, String(byteLength(blocks)));
    assert.equal(blocks.length, 12);
    blocks.forEach((block, n) => {
      assert.equal(block.tool_use_id, inputs[n].id);
      assert.equal(!!block.is_error, inputs[n].isError);
      assert(block.content.includes('[TRUNCATED'));
      assert(!/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u.test(block.content));
    });
  }
  const small = [{ id: 'one', content: 'small' }, { id: 'two', content: 'failure', isError: true }];
  assert.deepEqual(budgetToolResults(small), small);
  assert.deepEqual(resultBlocks([]), []);
  const mixed = resultBlocks([{ id: 'tiny', content: 'OK' }, { id: 'large', content: '漢'.repeat(30000) }]);
  assert.equal(mixed[0].content, 'OK');
  assert(byteLength(mixed) <= 10000);
  assert.throws(() => budgetToolResults([{ id: 'x'.repeat(30000), content: 'x' }]), RangeError);
  let writes = 0;
  let workout;
  const ctx = {
    writePage: ({markdown}) => { writes++; assert.equal(markdown, 'File contents'); return { ok: true, slug: 'real-file' }; },
    logWorkout: (input) => { workout = input; },
    readEnergy: (profile) => JSON.stringify({ profile, recordedNetKcal: 123, tdeeKcal: null, missing: ['heightCm'] }),
  };
  const file = runTool({ id: 'file', name: 'crea_file_testo', input: { titolo: 'File', testo: 'File contents' } }, ctx);
  assert(!file.isError); assert(file.content.includes('#/p/real-file')); assert.equal(writes, 1);
  const failedFile = runTool({ id: 'file2', name: 'crea_file_testo', input: {} }, { ...ctx, writePage: () => ({ok: false, error: 'Synthetic write failure'}) });
  assert(failedFile.isError); assert(!failedFile.content.includes('#/p/'));
  const measured = runTool({ id: 'workout', name: 'registra_allenamento', input: { titolo: 'Run', dettagli: 'Synthetic', minuti: 30, kcal_bruciate: 250, fonte_energia: 'measured' } }, ctx);
  assert(!measured.isError); assert.equal(workout.burnedKcal, 250); assert.equal(workout.energySource, 'measured');
  const unknown = runTool({ id: 'workout', name: 'registra_allenamento', input: { titolo: 'Run', dettagli: 'Synthetic', minuti: 30 } }, ctx);
  assert(!unknown.isError); assert.equal(workout.burnedKcal, undefined);
  assert(runTool({ id: 'bad', name: 'registra_allenamento', input: { minuti: 30, kcal_bruciate: 50 } }, ctx).isError);
  assert(runTool({ id: 'bad', name: 'registra_allenamento', input: { minuti: 30, kcal_bruciate: -50, fonte_energia: 'estimated' } }, ctx).isError);
  assert(!runTool({ id: 'energy', name: 'calcola_energia_giornaliera', input: {} }, ctx).isError);
  assert(runTool({ id: 'energy', name: 'calcola_energia_giornaliera', input: {} }, {}).isError);
  const unavailable = await executeRuntimeTool({ id: 'project', name: 'leggi_progetto', input: {} }, () => { throw new Error('must not run'); }, { token: null, projectId: null });
  assert(unavailable.isError);
  const local = await executeRuntimeTool({ id: 'local', name: 'local', input: {} }, (use) => ({ id: use.id, content: 'verified local' }), {token: null});
  assert.equal(local.content, 'verified local');
  const failed = await executeRuntimeTool({ id: 'local-fail', name: 'local', input: {} }, () => {throw new Error('secret must not leak');}, {token: null});
  assert(failed.isError); assert(!failed.content.includes('secret'));
  const originalFetch = globalThis.fetch;
  let project = { id: 'selected-project', title: 'Synthetic', context: 'SOURCE: sample.ts\nexport const value = 1;\nconst other = 2;', instructions: '', revision: 1, artifacts: [] };
  let posts = 0;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    if (options.method === 'POST') {
      posts++;
      const body = JSON.parse(options.body);
      assert.equal(body.projectId, 'selected-project');
      project = { ...project, revision: project.revision + 1, artifacts: [{ slug: 'artifact', title: body.title, markdown: body.markdown, revision: 1 }] };
    } else assert(String(url).includes('projectId=selected-project'));
    return new Response(JSON.stringify({project}), {status: 200, headers: {'Content-Type':'application/json'}});
  };
  try {
    const scope = {token: 'synthetic-token', projectId: 'selected-project'};
    const read = await executeRuntimeTool({id: 'read', name: 'leggi_sorgente_progetto', input: {cerca:'value', projectId:'not-selected'}}, () => { throw new Error('wrong executor'); }, scope);
    assert(!read.isError); const source = JSON.parse(read.content); assert.equal(source.projectId, 'selected-project'); assert.equal(source.lines[0].line, 2); assert(source.scope.includes('not filesystem'));
    const persisted = await executeRuntimeTool({id: 'write', name: 'scrivi_artifact_progetto', input: {titolo:'Artifact',markdown:'# Real saved text'}}, () => { throw new Error('wrong executor'); }, scope);
    assert(!persisted.isError); assert.equal(JSON.parse(persisted.content).status, 'saved-and-read-back'); assert.equal(posts,1);
    const stale = await executeRuntimeTool({id: 'stale', name: 'scrivi_artifact_progetto', input: {nome:'artifact',revisione_progetto:1,titolo:'Overwrite',markdown:'Stale'}}, () => { throw new Error('wrong executor'); }, scope);
    assert(stale.isError); assert.equal(posts,1);
  } finally { globalThis.fetch = originalFetch; }
  let reminderRows = []; let reminderWrites = 0;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(url, '/api/calendar');
    if (options.method === 'POST' || options.method === 'PUT') {
      reminderWrites++;
      const body = JSON.parse(options.body);
      reminderRows = [{event:{id:body.id,...body.event,reminderAt:body.event.reminderAt??undefined},version:String(reminderWrites)}];
      return new Response(JSON.stringify(reminderRows[0]), {status:200});
    }
    return new Response(JSON.stringify({events:reminderRows}), {status:200});
  };
  try {
    const scope={token:'synthetic-token'};
    const when=new Date(Date.now()+86400000).toISOString();
    const create={id:'reminder-tool',name:'programma_promemoria',input:{azione:'create',titolo:'Synthetic reminder',quando:when,fuso:'Europe/Rome'}};
    const first=await executeRuntimeTool(create,()=>{throw new Error('must not run locally');},scope);
    assert(!first.isError);assert.equal(JSON.parse(first.content).status,'saved-and-read-back');assert.equal(reminderWrites,1);
    const repeated=await executeRuntimeTool(create,()=>{throw new Error();},scope);
    assert(!repeated.isError);assert.equal(JSON.parse(repeated.content).status,'already-exists');assert.equal(reminderWrites,1);
    const id=reminderRows[0].event.id;
    const cancel=await executeRuntimeTool({id:'cancel',name:'programma_promemoria',input:{azione:'cancel',id,versione:'1'}},()=>{throw new Error();},scope);
    assert(!cancel.isError);assert.equal(JSON.parse(cancel.content).status,'reminder-disabled-event-preserved');assert.equal(reminderRows[0].event.status,'planned');
    const ambiguous=await executeRuntimeTool({id:'bad-time',name:'programma_promemoria',input:{azione:'create',titolo:'Do not guess',quando:'tomorrow',fuso:'Europe/Rome'}},()=>{throw new Error();},scope);
    assert(ambiguous.isError);assert.equal(reminderWrites,2);
  } finally { globalThis.fetch=originalFetch; }
  assert.equal(new Set(TOOLS.map(t=>t.name)).size, TOOLS.length);
  console.log('PASS tools: aggregate UTF-8/escaped/multiple budgets, stable IDs/order/error flags, truthful truncation, actual file reference only after write, workout provenance/missing energy, deterministic energy contract, absent project and exception safety, one catalog.');
} finally { await rm(directory, { recursive: true }); }
