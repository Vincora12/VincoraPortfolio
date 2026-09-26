/* vNext STEP 3 — CEREBRO / HERMES BOUNDARY. Offline; no Hermes process.
   Exercises the real /api/runs handler up to the point where it would open
   the Hermes gateway, with an isolated temporary data directory. */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`); if (!ok) failures += 1; };

const dataDir = mkdtempSync(join(tmpdir(), 'vinz-cerebro-boundary-'));
const workspace = mkdtempSync(join(tmpdir(), 'vinz-cerebro-ws-'));
Object.assign(process.env, {
  VINZMON_DATA_DIR: dataDir, VINZMON_LOCAL_CORE: '1', VINZMON_TOKEN: 'synthetic-token-not-a-secret-000000',
  VINZMON_ORCHESTRATOR: 'hermes', VINZMON_HERMES_API_URL: 'http://127.0.0.1:8642', VINZMON_HERMES_API_KEY: 'fixture',
  VINZMON_HERMES_WORKSPACE_ROOT: workspace, VINZMON_HERMES_MODEL: 'gpt-5.6-terra', VINZMON_HERMES_SANDBOXED: '1',
});
delete process.env.VINZMON_HERMES_PERSONAL_MEMORY;

const outfile = join(cwd, 'node_modules', `.vnext-cerebro-${process.pid}.mjs`);
await build({ stdin: { contents: `export { default as runs } from './netlify/functions/runs.ts';
export { writeLocalOnlyMode } from './netlify/functions/_shared/spend.ts';
export { hermesMemoryBoundaryConfirmed } from './netlify/functions/_shared/v2/hermesAdapter.ts';`, resolveDir: cwd, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error', packages: 'external' });
const m = await import(`file://${outfile}`);
rmSync(outfile, { force: true });

const post = async (body) => {
  const response = await m.runs(new Request('http://localhost/api/runs', { method: 'POST', headers: { authorization: `Bearer ${process.env.VINZMON_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json().catch(() => null) };
};
const turn = { stream: true, profile: 'project-chat', projectId: 'p-missing', conversationId: 'c1', input: 'Riassumi il documento del progetto' };

console.log('\n═══ vNext CEREBRO BOUNDARY ═══\n');
try {
  check(m.hermesMemoryBoundaryConfirmed({ VINZMON_HERMES_PERSONAL_MEMORY: 'off' }) && !m.hermesMemoryBoundaryConfirmed({}), 'memory boundary flag parsed');
  const unconfirmed = await post(turn);
  check(unconfirmed.status === 409 && unconfirmed.body?.code === 'HERMES_BOUNDARY_UNCONFIRMED', 'no delegation while Hermes personal memory is not confirmed off (409 → legacy fallback)');

  process.env.VINZMON_HERMES_PERSONAL_MEMORY = 'off';
  await m.writeLocalOnlyMode(true);
  const localOnlyDefault = await post(turn);
  check(localOnlyDefault.status === 403 && localOnlyDefault.body?.code === 'LOCAL_ONLY_BLOCKED', 'local-only mode blocks a cloud DEFAULT Hermes model');
  const localOnlyChosen = await post({ ...turn, model: 'gpt-5.6-terra' });
  check(localOnlyChosen.status === 403, 'local-only mode blocks a cloud model chosen per run');
  const localModel = await post({ ...turn, model: 'gpt-oss:20b' });
  check(localModel.status !== 403, 'local-only mode lets a local Hermes model through');
  await m.writeLocalOnlyMode(false);
  const cloudAllowed = await post(turn);
  check(cloudAllowed.status !== 403 && cloudAllowed.status !== 409, 'with local-only off the boundary checks pass (request proceeds to Project resolution)');
} finally {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
}

const client = readFileSync(join(cwd, 'src/assistant-original/hermes-project-runtime.ts'), 'utf8');
check(client.includes("'HERMES_BOUNDARY_UNCONFIRMED'"), 'browser treats an unconfirmed boundary as a fallback, not an error');
const runtime = readFileSync(join(cwd, 'src/assistant-original/netlify-runtime.ts'), 'utf8');
check(runtime.indexOf('captureChatMemoryForClient({') < runtime.indexOf('const hermes = runWithHermesProject('), 'VINZ memory capture runs before the CEREBRO branch (Hermes turns are captured)');
const adapter = readFileSync(join(cwd, 'netlify/functions/_shared/v2/hermesAdapter.ts'), 'utf8');
check(adapter.includes('Do not save facts about the user') && !adapter.includes('Hermes owns the agent loop, durable personal memory'), 'session instructions no longer grant Hermes personal memory');
const profile = readFileSync(join(cwd, 'docs/hermes-vinzmon-profile.example.yaml'), 'utf8');
check(/memory_enabled: false/.test(profile) && /user_profile_enabled: false/.test(profile) && /skills-enabled/.test(profile), 'reference Hermes profile: memory/profile off, enabled-only skills');

console.log(failures ? `\n✗ ${failures} boundary check(s) failed.` : '\n✓ CEREBRO boundary holds.');
process.exit(failures ? 1 : 0);
