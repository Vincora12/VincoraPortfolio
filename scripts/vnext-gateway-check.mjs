/* vNext STEP 6 — ONE MODEL GATEWAY. Offline: the provider is stubbed, the
   store is a temporary SQLite directory. */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`); if (!ok) failures += 1; };
const dataDir = mkdtempSync(join(tmpdir(), 'vinz-gateway-'));
process.env.VINZMON_DATA_DIR = dataDir;
globalThis.__calls = [];
globalThis.__reply = () => ({ ok: true, text: 'ok', usage: { inputTokens: 10, outputTokens: 10 }, model: 'x', toolUses: [], sources: [] });

const outfile = join(cwd, 'node_modules', `.vnext-gateway-${process.pid}.mjs`);
await build({
  stdin: { contents: `export * from './netlify/functions/_shared/modelGateway.ts';
export { writeLocalOnlyMode, writeMonthlyCap, recordSpend } from './netlify/functions/_shared/spend.ts';
export { LOCAL_CHEAP_ROUND_SENTINEL, LOCAL_CHEAP_ROUND_MODEL, voiceChoiceProblems } from './netlify/functions/_shared/routing.ts';`, resolveDir: cwd, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error', packages: 'external',
  plugins: [{ name: 'stub-provider', setup(b) {
    b.onLoad({ filter: /_shared\/providers\.ts$/ }, () => ({ loader: 'js', contents: 'export function callProvider(provider, req){ globalThis.__calls.push({provider, model:req.model}); const r = globalThis.__reply(provider, req); return Promise.resolve({ ...r, model: r.model === "x" ? req.model : r.model }); }' }));
  } }],
});
const g = await import(`file://${outfile}`);
rmSync(outfile, { force: true });

console.log('\n═══ vNext MODEL GATEWAY ═══\n');
try {
  check(g.resolveModelRoute('character-voice', g.LOCAL_CHEAP_ROUND_SENTINEL).provider === 'ollama', 'client sentinel → local round model');
  check(g.resolveModelRoute('text-cheap', 'local').location === 'local', "'local' → local route");
  check(g.resolveModelRoute('text-cheap', null, { localFirst: true }).location === 'local', 'localFirst without a user choice → local');
  check(g.resolveModelRoute('character-voice', 'gpt-5.6-sol', { localFirst: true }).model === 'gpt-5.6-sol', 'an explicit user choice beats localFirst');
  check(g.resolveModelRoute('image').location === 'cloud', 'image stays cloud');
  check(g.voiceChoiceProblems().length === 0, 'the voice catalog (incl. local choices) is consistent');

  await g.writeLocalOnlyMode(true);
  let code = null;
  try { await g.assertRouteAllowed({ provider: 'openai', model: 'gpt-5.6-luna' }, { purpose: 'test' }); } catch (e) { code = e.code; }
  check(code === 'LOCAL_ONLY_BLOCKED', 'local-only mode refuses a cloud route centrally');
  let passed = true;
  try { await g.assertRouteAllowed({ provider: 'ollama', model: 'qwen2.5:14b' }, { purpose: 'test' }); } catch { passed = false; }
  check(passed, 'local-only mode lets a local route through');
  code = null;
  try { await g.callModel({ capability: 'text-cheap', purpose: 'machines' }, { system: [], turns: [], user: 'x' }); } catch (e) { code = e.code; }
  check(code === 'LOCAL_ONLY_BLOCKED' && globalThis.__calls.length === 0, 'callModel: a cloud call in local-only mode never reaches the provider');
  await g.writeLocalOnlyMode(false);

  globalThis.__calls = [];
  globalThis.__reply = (provider) => provider === 'ollama' ? { ok: false, text: '', usage: {}, model: 'x', toolUses: [], sources: [], error: 'ollama down' } : { ok: true, text: 'cloud', usage: { inputTokens: 5, outputTokens: 5 }, model: 'x', toolUses: [], sources: [] };
  const skipped = await g.callModel({ capability: 'text-cheap', purpose: 'machines', localFirst: true, onLocalFailure: 'skip' }, { system: [], turns: [], user: 'x' });
  check(skipped.skipped === true && globalThis.__calls.every((c) => c.provider === 'ollama'), "background 'skip': local failure never escalates to cloud");
  globalThis.__calls = [];
  const escalated = await g.callModel({ capability: 'text-cheap', purpose: 'chat', localFirst: true, onLocalFailure: 'escalate' }, { system: [], turns: [], user: 'x' });
  check(escalated.ok && escalated.route.location === 'cloud' && globalThis.__calls.length === 2, "interactive 'escalate': local failure falls back to cloud");
  globalThis.__calls = [];
  globalThis.__reply = (provider) => ({ ok: true, text: provider === 'ollama' ? 'not json' : '{"ok":true}', usage: {}, model: 'x', toolUses: [], sources: [] });
  const validated = await g.callModel({ capability: 'text-cheap', purpose: 'machines', localFirst: true, onLocalFailure: 'escalate', acceptLocal: (r) => r.text.startsWith('{') }, { system: [], turns: [], user: 'x' });
  check(validated.text === '{"ok":true}', 'a local answer rejected by its validator follows the failure policy');

  await g.writeMonthlyCap(1).catch(() => g.writeMonthlyCap(5));
  await g.recordSpend('character-voice', 'gpt-5.6-sol', { inputTokens: 2e6, outputTokens: 2e6 }, { action: 'test', subsystem: 'test' });
  code = null;
  try { await g.assertRouteAllowed({ provider: 'openai', model: 'gpt-5.6-luna' }, { purpose: 'test' }); } catch (e) { code = e.code; }
  check(code === 'INTERNAL_CAP_EXCEEDED', 'the monthly cap is enforced centrally');
  passed = true;
  try { await g.assertRouteAllowed({ provider: 'openai', model: 'gpt-5.6-luna' }, { purpose: 'memory', enforceCap: false }); } catch { passed = false; }
  check(passed, 'a caller may opt out of the cap explicitly (memory capture)');
  passed = true;
  try { await g.assertRouteAllowed({ provider: 'ollama', model: 'qwen2.5:14b' }, { purpose: 'test' }); } catch { passed = false; }
  check(passed, 'local routes are never capped');

  check(g.resolveWorkModel(undefined, 'gpt-oss:20b')?.location === 'local', 'CEREBRO default local model resolved by VINZ');
  check(g.resolveWorkModel('gpt-5.6-terra', 'gpt-oss:20b')?.location === 'cloud', 'CEREBRO per-run cloud choice resolved by VINZ');
  check(g.resolveWorkModel('made-up-model', 'gpt-oss:20b') === null, 'an unknown CEREBRO model is refused, never substituted');
  check(g.resolveWorkModel(undefined, 'unlisted-default')?.location === 'cloud', 'an unlisted runtime default is treated as cloud (conservative)');
  const run = g.resolveRunModel('chat');
  check(run.local && g.resolveRunModel('lab').location === 'cloud', 'run profiles resolve through the gateway (chat local-first, lab cloud)');
} finally { rmSync(dataDir, { recursive: true, force: true }); }

// No server feature picks a provider on its own any more.
const offenders = [];
const walk = (dir) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) { const src = readFileSync(p, 'utf8'); if (/\bcallProvider\(/.test(src) && !/(modelGateway|providers|ai|ai-chat-background|runEngine)\.ts$/.test(p)) offenders.push(p); } } };
walk(join(cwd, 'netlify/functions'));
check(offenders.length === 0, `callProvider is only reached through the gateway or the chat/run executors${offenders.length ? ` — ${offenders.join(', ')}` : ''}`);
check(!readFileSync(join(cwd, 'src/brain/stream.ts'), 'utf8').includes("'gpt-5.6-luna'"), 'no model literal left in the chat tool loop');
check(!readFileSync(join(cwd, 'netlify/functions/runs.ts'), 'utf8').includes('HERMES_LOCAL_MODELS'), 'CEREBRO ingress holds no model tables of its own');

console.log(failures ? `\n✗ ${failures} gateway check(s) failed.` : '\n✓ Model gateway enforces one policy.');
process.exit(failures ? 1 : 0);
