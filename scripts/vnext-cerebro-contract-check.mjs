/* vNext STEP 9 — CEREBRO CONTRACT. Offline. Proves the WORK ingress speaks
   only the runtime-agnostic contract: a fake runtime replaces Hermes and a
   full WORK turn (decision → events → final → spend/files) still works. */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`); if (!ok) failures += 1; };
const dataDir = mkdtempSync(join(tmpdir(), 'vinz-cerebro-contract-'));
const workspaces = mkdtempSync(join(tmpdir(), 'vinz-cerebro-ws-'));
Object.assign(process.env, { VINZMON_DATA_DIR: dataDir, VINZMON_WORKSPACE_DIR: workspaces, VINZMON_LOCAL_CORE: '1', VINZMON_TOKEN: 'synthetic-token-not-a-secret-000000' });
globalThis.__fake = { runs: [], cancelled: [] };

const outfile = join(cwd, 'node_modules', `.vnext-cerebro-contract-${process.pid}.mjs`);
await build({
  stdin: { contents: `export { default as runs } from './netlify/functions/runs.ts';
export { getStore } from './netlify/functions/_shared/localStore.ts';
export { hermesCerebro } from './netlify/functions/_shared/v2/hermesAdapter.ts';`, resolveDir: cwd, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error', packages: 'external',
  plugins: [{ name: 'fake-cerebro', setup(b) {
    b.onLoad({ filter: /_shared\/cerebro\/index\.ts$/ }, () => ({ loader: 'js', contents: `
      const fake = {
        id: 'fake', approvalPolicy: 'deny',
        configured: () => ({ workspaceRoot: globalThis.__fake.workspace, model: 'gpt-oss:20b' }),
        boundaryConfirmed: () => true,
        assertWorkspace: (config, root) => { if (root !== config.workspaceRoot) throw new Error('HERMES_WORKSPACE_MISMATCH: x'); },
        providerFor: (p) => p ? 'fake-' + p : null,
        async *run(config, request) {
          globalThis.__fake.runs.push(request);
          const at = new Date().toISOString();
          yield { type: 'status', runId: 'fake-run', status: 'starting', at };
          yield { type: 'tool_started', runId: 'fake-run', tool: 'read_file', at };
          yield { type: 'tool_completed', runId: 'fake-run', tool: 'read_file', at };
          yield { type: 'final', runId: 'fake-run', text: 'lavoro fatto', model: 'gpt-oss:20b', timings: { requestReceivedMs: 0 }, at };
        },
        cancel: async (_c, runId) => { globalThis.__fake.cancelled.push(runId); return true; },
        resetSession: async () => {},
      };
      export function activeCerebro() { return fake; }` }));
  } }],
});
const m = await import(`file://${outfile}`);
rmSync(outfile, { force: true });

console.log('\n═══ vNext CEREBRO CONTRACT ═══\n');
try {
  const h = m.hermesCerebro;
  check(h.id === 'hermes' && h.approvalPolicy === 'deny' && ['configured', 'boundaryConfirmed', 'assertWorkspace', 'providerFor', 'run', 'cancel', 'resetSession'].every((key) => typeof h[key] === 'function'), 'Hermes implements the CEREBRO runtime interface (v1, approvals denied)');
  check(h.providerFor('openai') === 'openai-api' && h.providerFor('ollama') === 'custom' && h.providerFor('google') === null, 'the adapter only translates provider ids VINZ chose');

  await m.getStore({ name: 'vinzmon-projects', consistency: 'strong' }).setJSON('projects/p1', { id: 'p1', title: 'Fixture', revision: 1, artifacts: [], files: [], context: 'Contesto di prova.', instructions: '' });
  // The fake runtime is scoped to the workspace VINZ resolves for this project.
  const map = await m.getStore({ name: 'vinzmon-workspace', consistency: 'strong' });
  globalThis.__fake.workspace = join(workspaces, 'fixture');
  await map.setJSON('project-folders', { p1: 'fixture' }).catch(() => {});

  const response = await m.runs(new Request('http://localhost/api/runs', { method: 'POST', headers: { authorization: `Bearer ${process.env.VINZMON_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ stream: true, profile: 'project-chat', mode: 'WORK', projectId: 'p1', conversationId: 'c1', input: 'Analizza il documento e prepara un report', model: 'gpt-oss:20b' }) }));
  const text = await response.text();
  const events = text.split('\n\n').map((frame) => frame.replace(/^data: /, '')).filter(Boolean).map((line) => JSON.parse(line));
  check(response.status === 200 && events[0]?.type === 'decision' && events[0].mode === 'WORK', 'VINZ emits the WORK decision before delegating');
  check(events.some((e) => e.type === 'tool_started') && events.at(-1)?.type === 'final' && events.at(-1).text === 'lavoro fatto', 'a replacement runtime streams a full WORK turn through the same ingress');
  const request = globalThis.__fake.runs[0];
  check(request?.projectId === 'p1' && request.workspaceRoot === globalThis.__fake.workspace && request.provider === 'fake-ollama' && typeof request.systemPrompt === 'string' && request.systemPrompt.length > 0, 'the runtime receives VINZ\'s package: Project, workspace, VINZ-chosen model, context');
  check(/no structured write is authorized/i.test(request?.actionPolicy ?? ''), 'no structured write is authorised without a verified permit');

  const cancel = await m.runs(new Request('http://localhost/api/runs', { method: 'POST', headers: { authorization: `Bearer ${process.env.VINZMON_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel', runId: 'fake-run' }) }));
  check(cancel.status === 200 && globalThis.__fake.cancelled.includes('fake-run'), 'cancellation goes through the contract');
} finally { rmSync(dataDir, { recursive: true, force: true }); rmSync(workspaces, { recursive: true, force: true }); }

const runsSource = readFileSync(join(cwd, 'netlify/functions/runs.ts'), 'utf8');
check(!runsSource.includes('hermesAdapter') && runsSource.includes("from './_shared/cerebro'"), 'the WORK ingress imports only the CEREBRO contract, never Hermes');
check(!readFileSync(join(cwd, 'netlify/functions/_shared/cerebro/contract.ts'), 'utf8').match(/from ['"].*hermes/i), 'the contract has no Hermes dependency');

console.log(failures ? `\n✗ ${failures} contract check(s) failed.` : '\n✓ CEREBRO is a replaceable contract; Hermes is v1.');
process.exit(failures ? 1 : 0);
