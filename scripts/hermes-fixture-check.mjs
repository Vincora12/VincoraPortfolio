import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';

const workspace = resolve(process.env.VINZMON_HERMES_WORKSPACE_ROOT || '');
const model = process.env.VINZMON_HERMES_MODEL || '';
if (!process.env.HERMES_FIXTURE_ACK || !workspace) {
  throw new Error('Set HERMES_FIXTURE_ACK=1 and VINZMON_HERMES_WORKSPACE_ROOT (an isolated temporary fixture directory).');
}
if (!workspace.startsWith('/private/tmp/') && !workspace.startsWith('/tmp/')) throw new Error('Fixture workspace must be under the operating-system temporary directory.');
/* The native gateway transport reads VINZMON_LOCAL_CORE and
   HERMES_DASHBOARD_SESSION_TOKEN directly from process.env (see
   hermesAdapter.ts); this fixture only checks they are present so a missing
   one fails with a clear message instead of the adapter's own generic one. */
if (process.env.VINZMON_LOCAL_CORE !== '1') throw new Error('Set VINZMON_LOCAL_CORE=1 — this fixture talks to the native gateway, which only answers the Local Core.');
if (!process.env.HERMES_DASHBOARD_SESSION_TOKEN) throw new Error('Set HERMES_DASHBOARD_SESSION_TOKEN to the token `hermes dashboard` is running with.');

mkdirSync(workspace, { recursive: true });
for (const entry of readdirSync(workspace)) rmSync(join(workspace, entry), { recursive: true, force: true });
for (const file of ['src/ProductPage.tsx', 'src/mobile/ProductCard.tsx', 'src/ProductGrid.tsx']) mkdirSync(dirname(join(workspace, file)), { recursive: true });
writeFileSync(join(workspace, 'src/ProductPage.tsx'), `export function ProductPage() { return <button>BUY_X</button>; }\n`);
writeFileSync(join(workspace, 'src/mobile/ProductCard.tsx'), `export function ProductCard() { return <button>MOBILE_CTA</button>; }\n`);
writeFileSync(join(workspace, 'src/ProductGrid.tsx'), `export function ProductGrid() { return <section>Products</section>; }\n`);
writeFileSync(join(workspace, 'package.json'), JSON.stringify({ private: true, scripts: { 'test:cta': "grep -q 'BUY_Y' src/ProductPage.tsx" } }, null, 2));
execFileSync('git', ['init', '-q'], { cwd: workspace });
execFileSync('git', ['config', 'user.email', 'fixture@vinz.invalid'], { cwd: workspace });
execFileSync('git', ['config', 'user.name', 'VINZ Fixture'], { cwd: workspace });
execFileSync('git', ['add', '.'], { cwd: workspace });
execFileSync('git', ['commit', '-qm', 'fixture baseline'], { cwd: workspace });

const compiled = await build({
  stdin: { contents: `export * from './netlify/functions/_shared/v2/hermesAdapter';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
});
const adapter = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
// baseUrl/apiKey are unused by the native WS transport (kept only because
// HermesConfig still types them); the real endpoint is the fixed native
// gateway URL inside hermesAdapter.ts, gated by VINZMON_LOCAL_CORE.
const config = { baseUrl: 'http://127.0.0.1:9119', apiKey: 'unused-native-transport', workspaceRoot: workspace, model };
const projectId = 'project-ffuoco-fixture';
const fixtureNonce = Date.now();
const conversationId = `fixture-${fixtureNonce}`;
const run = async (input, requestId, turns = []) => {
  const events = [];
  for await (const event of adapter.streamHermesProjectRun(config, {
    requestId, projectId, projectName: 'FFuoco Fixture', workspaceRoot: workspace, conversationId, input,
    systemPrompt: 'You are the VINZ.MON Project coding worker. Follow the active Project and safety boundary exactly.', turns,
  })) events.push(event);
  const error = events.find((event) => event.type === 'error');
  if (error) throw new Error(error.message);
  return events;
};

const started = performance.now();
const first = await run('Find the product page and change the product CTA text from BUY_X to BUY_Y. Inspect files, make the smallest edit, run the existing targeted test exactly as `npm run test:cta` without extra arguments, then show the git diff.', `fixture-edit-${fixtureNonce}`);
const elapsed = Math.round(performance.now() - started);
assert.match(readFileSync(join(workspace, 'src/ProductPage.tsx'), 'utf8'), /BUY_Y/);
assert.match(readFileSync(join(workspace, 'src/mobile/ProductCard.tsx'), 'utf8'), /MOBILE_CTA/);
const diff = execFileSync('git', ['diff', '--', 'src/ProductPage.tsx'], { cwd: workspace, encoding: 'utf8' });
assert.match(diff, /-.*BUY_X/);
assert.match(diff, /\+.*BUY_Y/);
assert(first.some((event) => event.type === 'tool_started'), 'expected an intermediate tool event');
assert(first.some((event) => event.type === 'tool_completed' && !event.error), 'expected at least one successful tool_completed event');
assert(first.some((event) => event.type === 'final'), 'expected terminal completion');
const finalTimings = first.find((event) => event.type === 'final')?.timings;
const firstVisibleMs = finalTimings?.runStartedMs;
const firstHermesEventMs = finalTimings?.firstEventMs;
assert.equal(typeof firstVisibleMs, 'number');
assert.equal(typeof firstHermesEventMs, 'number');

const firstAnswer = first.find((event) => event.type === 'final')?.text || 'The requested Project edit completed.';
const second = await run('In the same Project, inspect the workspace and identify the mobile counterpart that remains unchanged. Do not edit it.', `fixture-follow-up-${fixtureNonce}`, [
  { role: 'user', content: 'Change the product CTA text from BUY_X to BUY_Y.' },
  { role: 'assistant', content: firstAnswer },
]);
assert(second.some((event) => event.type === 'final'), 'follow-up did not complete');
assert(second.some((event) => event.type === 'tool_started'), 'follow-up did not continue with Project tools');
assert.throws(() => adapter.assertHermesWorkspace(config, join(workspace, '..', 'outside')), /HERMES_WORKSPACE_MISMATCH/);
assert.match(readFileSync(join(workspace, 'src/mobile/ProductCard.tsx'), 'utf8'), /MOBILE_CTA/);

console.log(JSON.stringify({ pass: true, model: config.model, firstVisibleMs, firstHermesEventMs, totalMs: elapsed, events: first.map((event) => event.type) }));
