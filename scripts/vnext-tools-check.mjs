/* vNext STEP 8 — CANONICAL TOOL MANIFEST + GENERALISED PERMITS. Offline. */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`); if (!ok) failures += 1; };
const dataDir = mkdtempSync(join(tmpdir(), 'vinz-tools-'));
Object.assign(process.env, { VINZMON_DATA_DIR: dataDir, VINZMON_TOKEN: 'synthetic-token-not-a-secret-000000', VINZMON_LOCAL_CORE: '1' });

const outfile = join(cwd, 'node_modules', `.vnext-tools-${process.pid}.mjs`);
await build({
  stdin: { contents: `export * from './src/mon-core/toolManifest.ts';
export { issueActionPermit, consumeActionPermit, verifiedConfirmation } from './netlify/functions/_shared/actionPermits.ts';
export { default as permits } from './netlify/functions/permits.ts';
export { default as repoOps } from './netlify/functions/repo-ops.ts';
export { default as ai } from './netlify/functions/ai.ts';`, resolveDir: cwd, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error', packages: 'external',
});
const m = await import(`file://${outfile}`);
rmSync(outfile, { force: true });
const auth = { authorization: `Bearer ${process.env.VINZMON_TOKEN}`, 'content-type': 'application/json' };
const post = async (handler, path, body) => { const r = await handler(new Request(`http://localhost${path}`, { method: 'POST', headers: auth, body: JSON.stringify(body) })); return { status: r.status, body: await r.json().catch(() => null) }; };

console.log('\n═══ vNext TOOL MANIFEST ═══\n');
try {
  // 1. Every defined tool is declared, and every declared tool exists.
  const names = (file, pattern) => [...readFileSync(join(cwd, file), 'utf8').matchAll(pattern)].map((match) => match[1]);
  const defined = new Set([
    ...names('src/ai/tools.ts', /^\s+name: '([a-z_]+)'/gm),
    ...names('src/ai/toolLayer.ts', /(?:TOOL_NAME = |name: )'([a-z_]+)'/g),
    ...names('netlify/functions/agent-lab.ts', /name: '([a-z_]+)'/g),
    ...names('scripts/hermes-vinz-mcp-server.mjs', /name: '(vinz_[a-z_]+)'/g),
    ...names('src/ai/healthEstimate.ts', /name: '([a-z_]+)'/g),
  ]);
  const declared = new Set(m.TOOL_MANIFEST.map((spec) => spec.name));
  const missing = [...defined].filter((name) => !declared.has(name));
  const orphan = [...declared].filter((name) => !defined.has(name));
  check(missing.length === 0, `every defined tool is in the manifest${missing.length ? ` — missing: ${missing.join(', ')}` : ''}`);
  check(orphan.length === 0, `no manifest entry without an implementation${orphan.length ? ` — ${orphan.join(', ')}` : ''}`);
  check(new Set(m.TOOL_MANIFEST.map((s) => s.name)).size === m.TOOL_MANIFEST.length, 'manifest names are unique');
  const writes = m.TOOL_MANIFEST.filter((s) => s.risk === 'write' || s.risk === 'destructive');
  check(writes.every((s) => s.executor !== 'lab'), 'Agent Lab exposes no write tool');
  check(['repo_write', 'repo_edit', 'vinz_registra_pasto', 'vinz_registra_allenamento', 'vinz_registra_peso'].every(m.requiresPermit), 'repo writes and CEREBRO health writes require a server permit');
  check(!m.isModelOfferableTool('rm_rf') && !m.isModelOfferableTool('vinz_registra_pasto') && m.isModelOfferableTool('leggi_me'), 'only browser/Local Core tools are offerable through /api/ai');

  // 2. The chat reads its questions from the manifest.
  const stream = readFileSync(join(cwd, 'src/brain/stream.ts'), 'utf8');
  check(/question: CONFIRMATION_QUESTIONS\.codice/.test(stream) && !/question: 'Confermi/.test(stream), 'confirmation questions come from the manifest');

  // 3. Permits.
  const q = m.CONFIRMATION_QUESTIONS;
  check(m.verifiedConfirmation('codice', 'Sì, modifica', `Ecco la modifica.\n\n${q.codice}`), 'a real yes to the code question verifies');
  check(!m.verifiedConfirmation('codice', 'no aspetta', `x ${q.codice}`), 'a no does not verify');
  check(!m.verifiedConfirmation('codice', 'sì', 'Vuoi che continui?'), 'a yes to a different question does not verify');
  check(m.verifiedConfirmation('meal', 'sì', 'Confermi che lo registro come **pranzo**?'), 'meal question verifies with the manifest pattern');
  await m.issueActionPermit('turn-meal', 'meal');
  check(await m.consumeActionPermit('turn-meal', 'meal') && !(await m.consumeActionPermit('turn-meal', 'meal')), 'a structured-write permit is one-shot');
  await m.issueActionPermit('turn-code', 'codice');
  check(!(await m.consumeActionPermit('turn-code', 'meal')), 'a permit is bound to its action');
  await m.issueActionPermit('turn-code2', 'codice');
  let uses = 0; while (await m.consumeActionPermit('turn-code2', 'codice')) uses += 1;
  check(uses === 8, `a confirmed code change allows a bounded number of edits (${uses})`);

  const refused = await post(m.permits, '/api/permits', { action: 'codice', requestId: 't-x', userText: 'sì', previousAssistantText: 'Vuoi un caffè?' });
  check(refused.status === 409, '/api/permits refuses an unverified confirmation');
  const granted = await post(m.permits, '/api/permits', { action: 'codice', requestId: 't-ok', userText: 'Sì, modifica', previousAssistantText: `Modifico docs.\n\n${q.codice}` });
  check(granted.status === 200 && granted.body?.permitId === 't-ok', '/api/permits issues a permit for a verified yes');

  // 4. /api/repo-ops enforces the permit (then the protected-path gate).
  const probe = `docs/.vnext-tools-probe-${process.pid}.md`;
  const noPermit = await post(m.repoOps, '/api/repo-ops', { action: 'repo-write', path: probe, content: 'x' });
  check(noPermit.status === 409 && !existsSync(join(cwd, probe)), 'repo-write without a permit is refused before touching disk');
  const withPermit = await post(m.repoOps, '/api/repo-ops', { action: 'repo-write', path: probe, content: 'x', permitId: 't-ok' });
  check(withPermit.status === 200 && withPermit.body?.ok === true && existsSync(join(cwd, probe)), 'repo-write with a verified permit succeeds');
  rmSync(join(cwd, probe), { force: true });
  await m.issueActionPermit('t-protected', 'codice');
  const protectedWrite = await post(m.repoOps, '/api/repo-ops', { action: 'repo-write', path: 'netlify/functions/_shared/auth.ts', content: 'x', permitId: 't-protected' });
  check(protectedWrite.body?.ok === false && /SCRITTURA NEGATA/.test(protectedWrite.body?.error ?? ''), 'a permit never unlocks a protected Core file');

  // 5. /api/ai rejects undeclared tools.
  const ai = await post(m.ai, '/api/ai', { capability: 'text-cheap', user: 'ciao', system: [], turns: [], tools: [{ name: 'rm_rf', description: 'x', schema: { type: 'object', properties: {} } }] });
  check(ai.status === 400 && ai.body?.code === 'TOOL_NOT_DECLARED', '/api/ai refuses a tool the manifest does not declare');
} finally { rmSync(dataDir, { recursive: true, force: true }); }

console.log(failures ? `\n✗ ${failures} tool check(s) failed.` : '\n✓ One tool manifest, permits enforced.');
process.exit(failures ? 1 : 0);
