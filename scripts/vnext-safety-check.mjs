/* vNext STEP 1 — SAFETY GATE. Offline, synthetic, no provider keys.
   Covers: protected Core paths (case/Unicode/separator variants), traversal,
   symlinks, NUL/control chars, repo_write/repo_edit held until an explicit
   `codice` confirmation, model-created skills born disabled, enabled-only
   skill export for CEREBRO, Hermes workspace isolation. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`); if (!ok) failures += 1; };
let bundles = 0;
const bundle = async (contents, plugins = []) => {
  const outfile = join(cwd, 'node_modules', `.vnext-safety-${process.pid}-${bundles++}.mjs`);
  await build({ stdin: { contents, resolveDir: cwd, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error', plugins });
  try { return await import(`file://${outfile}`); } finally { rmSync(outfile, { force: true }); }
};

console.log('\n═══ vNext SAFETY GATE ═══\n');

// ── 1. protected paths + write resolution ───────────────────────────────────
const ops = await bundle(`export { repoWrite, repoEdit, resolveWritablePath } from './netlify/functions/_shared/repoOps.ts';
export { protectedWriteReason, canonicalRepoPath } from './netlify/functions/_shared/protectedPaths.ts';`);
for (const path of ['netlify/functions/_shared/auth.ts', 'NETLIFY/functions/_shared/AUTH.ts', 'netlify\\functions\\_shared\\secrets.ts', './netlify//functions/_shared/spend.ts',
  'netlify/functions/_shared/v2/hermesAdapter.ts', 'src/brain/stream.ts', 'src/engine/lifeCycle.ts', 'package.json', 'AGENTS.md', 'netlify/functions/skills.ts', 'netlify/functions/_shared/protectedPaths.ts']) {
  check(Boolean(ops.protectedWriteReason(path)), `protected: ${path}`);
}
check(ops.protectedWriteReason('docs/NOTE.md') === null, 'docs/NOTE.md is not protected');
check(ops.protectedWriteReason('src/daily/MindPanel.tsx') === null, 'ordinary UI file is not protected');
check(ops.canonicalRepoPath('src/é.ts') === ops.canonicalRepoPath('src/é.ts'), 'NFD and NFC spell the same protected path');

const denied = (result) => result && result.ok === false;
check(denied(ops.repoWrite('netlify/functions/_shared/auth.ts', 'x')), 'repo_write refuses auth.ts');
check(denied(ops.repoWrite('Netlify/Functions/_shared/Auth.ts', 'x')), 'repo_write refuses a case variant of auth.ts');
check(denied(ops.repoEdit('src/brain/stream.ts', 'export', 'export')), 'repo_edit refuses the confirmation policy file');
check(denied(ops.repoWrite('../outside.ts', 'x')), 'repo_write refuses ../ traversal');
check(denied(ops.repoWrite('docs/../netlify/functions/_shared/auth.ts', 'x')), 'repo_write refuses traversal into a protected file');
check(denied(ops.repoWrite('/etc/passwd.md', 'x')), 'repo_write refuses an absolute path outside the repo');
check(denied(ops.repoWrite('docs/a\u0000b.md', 'x')), 'repo_write refuses NUL in the path');
check(denied(ops.repoWrite('docs/.env.md', 'x')), 'repo_write refuses secret-looking names');
check(denied(ops.repoWrite('server/core-server.ts', 'x')), 'repo_write refuses server/');

const probe = `docs/.vnext-safety-probe-${process.pid}.md`;
const ok = ops.repoWrite(probe, 'probe $& text');
check(ok.ok === true && existsSync(join(cwd, probe)), 'an ordinary docs file is still writable');
const edited = ops.repoEdit(probe, 'probe', '$& replaced');
check(edited.ok === true && readFileSync(join(cwd, probe), 'utf8') === '$& replaced $& text', 'repo_edit writes replacement text literally (no $& expansion)');
rmSync(join(cwd, probe), { force: true });

const link = `docs/.vnext-safety-link-${process.pid}.md`;
try {
  symlinkSync(join(cwd, 'netlify/functions/_shared/auth.ts'), join(cwd, link));
  check(denied(ops.repoWrite(link, 'x')), 'repo_write refuses a symlink that points at a protected file');
  check(readFileSync(join(cwd, 'netlify/functions/_shared/auth.ts'), 'utf8').length > 100, 'auth.ts untouched after the symlink attempt');
} finally { rmSync(join(cwd, link), { force: true }); }

// ── 2. repo write tools held until the `codice` confirmation ───────────────
globalThis.__safetyState = { token: 'synthetic-token-not-a-secret', activeMonName: null, mons: {}, voiceNotes: [], progression: { bond: 0 }, day: 1, world: null, mood: null, stepModels: {} };
const loop = await bundle(`export { replyWithLocalTools, isCodeWriteIntent, confirmableTools, REPO_WRITE_TOOLS, CONFIRMABLE_ACTIONS } from './src/brain/stream.ts';`, [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /state\/store$/ }, () => ({ path: 'store', namespace: 'fx' }));
  b.onResolve({ filter: /ai\/chatTrace$/ }, () => ({ path: 'trace', namespace: 'fx' }));
  b.onLoad({ filter: /.*/, namespace: 'fx' }, ({ path }) => ({ loader: 'js', contents: path === 'store'
    ? 'export const useApp={getState:()=>globalThis.__safetyState};export const stepModel=()=>"synthetic";export const runStep=async(_s,job)=>job("synthetic");'
    : 'export const traceClock=()=>({mark(){},elapsed:()=>0,steps:()=>[]});export const systemPromptComposition=()=>[];export const recordChatTrace=()=>{};export const persistChatTrace=async()=>null;' }));
} }]);
check(loop.isCodeWriteIntent('Modifica il codice di src/daily/MindPanel.tsx per cambiare il titolo'), 'code write intent recognised');
check(!loop.isCodeWriteIntent('Crea un file notes.md in FILES'), 'a FILES note is not a code write');
check(!loop.isCodeWriteIntent('Fammi il git status del repository'), 'a read-only repo question is not a code write');
check(loop.confirmableTools('codice').includes('repo_edit') && loop.confirmableTools('codice').includes('repo_write'), 'codice confirmation holds both repo_write and repo_edit');

const originalFetch = globalThis.fetch;
const offered = [];
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  offered.push((body.tools ?? []).map((tool) => tool.name));
  return new Response(JSON.stringify({ text: 'ok', model: 'synthetic', costUsd: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const run = async (use) => ({ id: use.id, content: 'synthetic' });
const turn = async (user, actionConfirmation) => {
  offered.length = 0;
  /* Only the tool pool of the first request matters here; the synthetic
     provider does not stream, so the loop may reject afterwards. */
  await loop.replyWithLocalTools([], user, new AbortController().signal, () => {}, run, null, [], undefined, undefined, actionConfirmation, [], { systemPrompt: 'Synthetic scope', requestId: 'safety' }).catch(() => undefined);
  return offered[0] ?? [];
};
try {
  const repoOps = await turn('Fammi il git status e fai il typecheck');
  check(repoOps.some((name) => name.startsWith('git_')) && !repoOps.some((name) => loop.REPO_WRITE_TOOLS.has(name)), 'repo ops turn: git tools offered, write tools withheld');
  const audit = await turn('Fammi un audit del tool layer');
  check(!audit.some((name) => loop.REPO_WRITE_TOOLS.has(name)), 'audit turn: write tools withheld');
  const hold = await turn('Modifica il codice di src/daily/MindPanel.tsx', { action: 'codice', status: 'needs-confirmation' });
  check(hold.includes('code_read') && !hold.some((name) => loop.REPO_WRITE_TOOLS.has(name)), 'codice needs-confirmation: code read offered, writes withheld');
  const go = await turn('Sì, modifica', { action: 'codice', status: 'confirmed' });
  check(go.includes('repo_write') && go.includes('repo_edit'), 'codice confirmed: repo_write and repo_edit offered');
  const otherConfirmed = await turn('Sì', { action: 'riavvio', status: 'confirmed' });
  check(!otherConfirmed.some((name) => loop.REPO_WRITE_TOOLS.has(name)), 'a different confirmation (riavvio) never unlocks repo writes');
} finally { globalThis.fetch = originalFetch; delete globalThis.__safetyState; }

// ── 3. skills: born disabled, re-disabled on edit, enabled-only export ─────
const dataDir = mkdtempSync(join(tmpdir(), 'vinz-safety-skills-'));
process.env.VINZMON_DATA_DIR = dataDir;
const skills = await bundle(`export { default as handler, syncEnabledSkillsExport, enabledSkillsExportDirectory } from './netlify/functions/skills.ts';`);
process.env.VINZMON_TOKEN = 'synthetic-token-not-a-secret-000000';
const call = async (body) => {
  const response = await skills.handler(new Request('http://localhost/api/skills', { method: 'POST', headers: { authorization: `Bearer ${process.env.VINZMON_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
};
try {
  const created = await call({ action: 'create', name: 'Revisione creativa', description: 'Come fare una revisione.', markdown: '# Passi\n1. Leggi.' });
  check(created.status === 200 && created.body.skill?.enabled === false, 'model-created skill is born disabled');
  const exportDir = skills.enabledSkillsExportDirectory();
  check(existsSync(exportDir) && !existsSync(join(exportDir, `local__${created.body.skill.id}`)), 'disabled skill is absent from the CEREBRO export');
  await call({ action: 'enable', sourceId: 'local', id: created.body.skill.id });
  check(existsSync(join(exportDir, `local__${created.body.skill.id}`, 'SKILL.md')), 'explicitly enabled skill appears in the CEREBRO export');
  check(!existsSync(join(exportDir, `local__${created.body.skill.id}`, 'metadata.json')), 'export carries no VINZ metadata');
  const updated = await call({ action: 'update', sourceId: 'local', id: created.body.skill.id, markdown: '# Passi\n1. Rileggi.' });
  check(updated.body.skill?.enabled === false, 'model edit turns the skill off again');
  check(!existsSync(join(exportDir, `local__${created.body.skill.id}`)), 'edited (disabled) skill leaves the CEREBRO export');
  // An already-enabled skill installed before this gate stays enabled (no mass disable).
  const legacyDir = join(dataDir, 'skills', 'anthropics-skills__legacy');
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(join(legacyDir, 'SKILL.md'), '---\nname: legacy\n---\n');
  writeFileSync(join(legacyDir, 'metadata.json'), JSON.stringify({ id: 'legacy', name: 'legacy', description: '', sourceId: 'anthropics-skills', sourceLabel: 'x', repo: 'r', ref: 'main', homepage: '', installedAt: '2026-01-01', enabled: true, files: ['SKILL.md'], hasScripts: false }));
  skills.syncEnabledSkillsExport();
  check(existsSync(join(exportDir, 'anthropics-skills__legacy', 'SKILL.md')), 'existing enabled skills are not mass-disabled');
} finally { rmSync(dataDir, { recursive: true, force: true }); }

// ── 4. Hermes workspace isolation ───────────────────────────────────────────
const hermes = await bundle(`export { assertIsolatedHermesWorkspace } from './netlify/functions/_shared/v2/hermesAdapter.ts';`);
const throwsUnsafe = (fn) => { try { fn(); return false; } catch (error) { return /HERMES_WORKSPACE_UNSAFE/.test(String(error)); } };
check(throwsUnsafe(() => hermes.assertIsolatedHermesWorkspace(cwd, cwd, '/tmp/vinz-data')), 'Hermes workspace = VINZ repo is refused');
check(throwsUnsafe(() => hermes.assertIsolatedHermesWorkspace(join(cwd, 'src'), cwd, '/tmp/vinz-data')), 'Hermes workspace inside the VINZ repo is refused');
check(throwsUnsafe(() => hermes.assertIsolatedHermesWorkspace('/tmp/vinz-data/skills', '/opt/repo', '/tmp/vinz-data')), 'Hermes workspace inside VINZ data is refused');
check(throwsUnsafe(() => hermes.assertIsolatedHermesWorkspace('/opt', '/opt/repo', '/tmp/vinz-data')), 'Hermes workspace containing the VINZ repo is refused');
check(!throwsUnsafe(() => hermes.assertIsolatedHermesWorkspace('/Users/x/VinzMon/ffuoco', '/opt/repo', '/tmp/vinz-data')), 'a separate Project workspace is accepted');

console.log(failures ? `\n✗ ${failures} safety check(s) failed.` : '\n✓ vNext safety gate holds.');
process.exit(failures ? 1 : 0);
