/* vNext STEP 11 — CANONICAL MEMORY READ CONTRACT. Offline. One read path
   (`recall`) with provenance + derived flag; ME reaches a WORK context once. */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`); if (!ok) failures += 1; };
const dataDir = mkdtempSync(join(tmpdir(), 'vinz-recall-'));
Object.assign(process.env, { VINZMON_DATA_DIR: dataDir, VINZMON_LOCAL_CORE: '1' });

const outfile = join(cwd, 'node_modules', `.vnext-recall-${process.pid}.mjs`);
await build({
  stdin: { contents: `export { recall } from './netlify/functions/_shared/recall.ts';
export { canonicalDomains } from './netlify/functions/_shared/v2/domains.ts';
export { assembleContext } from './netlify/functions/_shared/v2/contextAssembler.ts';
export { loadCoreContext } from './netlify/functions/_shared/coreContext.ts';
export { getStore } from './netlify/functions/_shared/localStore.ts';`, resolveDir: cwd, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error', packages: 'external',
  plugins: [{ name: 'fixture-memory', setup(b) {
    b.onLoad({ filter: /_shared\/core\/memory\.ts$/ }, () => ({ loader: 'js', contents: `export async function searchPersonalMemory(query, limit) { return [{ id: 'm1', text: 'Vincenzo lavora al progetto ARCADIA', score: 0.9 }].slice(0, limit); }` }));
  } }],
});
const m = await import(`file://${outfile}`);
rmSync(outfile, { force: true });

const ME = 'RIASSUNTO-ME-UNICO: dorme poco nei giorni di scadenza.';
console.log('\n═══ vNext RECALL ═══\n');
try {
  await m.getStore('vinzmon-machines').setJSON('machine-state-v1', { me: { meSummary: { summary: ME } }, memon: { observations: [{ statement: 'Noto che torna sempre ai progetti la sera.', timestamp: 't1', sourceIds: ['m1'] }] } });
  await m.getStore({ name: 'vinzmon-projects', consistency: 'strong' }).setJSON('projects/p1', { id: 'p1', title: 'Arcadia', context: 'Contesto Arcadia.', instructions: '', artifacts: [], files: [] });

  const personal = await m.recall('arcadia', { sources: ['personal'] });
  check(personal.length === 1 && personal[0].provenance === 'core/memory' && personal[0].derived === false, 'personal memory is recalled with provenance, not derived');
  check((await m.recall('che tempo fa domani', { sources: ['me'] })).length === 0, 'the ME projection is not injected into unrelated turns');
  const me = await m.recall('come sto questa settimana', { sources: ['me'] });
  check(me.length === 1 && me[0].derived === true && me[0].provenance === 'machines/me', 'the ME projection is marked derived');
  const reflection = await m.recall('x', { sources: ['reflection'] });
  check(reflection.length === 1 && reflection[0].derived === true && reflection[0].id === 'memon:t1', 'Mon reflections are recalled as derived');
  const project = await m.recall('x', { sources: ['project'], projectId: 'p1' });
  check(project.length === 1 && project[0].provenance === 'projects' && project[0].derived === false, 'a Project is recalled read-only with provenance');

  // WORK context: ME once, through recall, not also inside the identity block.
  const context = await m.assembleContext(m.canonicalDomains, { query: 'come sto con arcadia', projectId: 'p1' });
  const system = context.system.map((block) => block.text).join('\n');
  check(system.split('RIASSUNTO-ME-UNICO').length - 1 === 1, 'the ME summary reaches the WORK context exactly once');
  check(context.trace.some((item) => item.source === 'me' && item.selected) && context.trace.some((item) => item.source === 'global-memory' && item.selected), 'memory and ME are ranked and traced by the assembler');

  // The chat identity path is unchanged: it still carries ME.
  const chat = await m.loadCoreContext({ query: 'ciao', body: 'web' });
  check(chat.systemPrompt.includes('RIASSUNTO-ME-UNICO'), 'the chat core context still includes ME (no behaviour change)');

  const source = readFileSync(join(cwd, 'netlify/functions/_shared/recall.ts'), 'utf8');
  check(!/setJSON|\.set\(|\.delete\(|writePersonalMemory|captureMemory/.test(source), 'recall has no write path');
  const domains = readFileSync(join(cwd, 'netlify/functions/_shared/v2/domains.ts'), 'utf8');
  const coreContext = readFileSync(join(cwd, 'netlify/functions/_shared/coreContext.ts'), 'utf8');
  check(!domains.includes('searchPersonalMemory') && !coreContext.includes('searchPersonalMemory'), 'context assembly reads memory only through recall');
} finally { rmSync(dataDir, { recursive: true, force: true }); }

console.log(failures ? `\n✗ ${failures} recall check(s) failed.` : '\n✓ One memory read contract; CEREBRO receives, never owns.');
process.exit(failures ? 1 : 0);
