/* vNext STEP 5 — CANONICAL TURN DECISION: AUTO / ANSWER / ACTION / WORK.
   Offline: the pure decideTurn() table, the WORK-only /api/runs ingress, and
   the wiring of the chat orchestrator onto the decision. */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`); if (!ok) failures += 1; };
let n = 0;
const bundle = async (contents, extra = {}) => {
  const outfile = join(cwd, 'node_modules', `.vnext-modes-${process.pid}-${n++}.mjs`);
  await build({ stdin: { contents, resolveDir: cwd, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error', ...extra });
  try { return await import(`file://${outfile}`); } finally { rmSync(outfile, { force: true }); }
};

console.log('\n═══ vNext MON CORE MODES ═══\n');
const m = await bundle(`export { decideTurn, isWorkIntent } from './src/mon-core/turnDecision.ts';
export { shouldUseLocalTools } from './src/brain/stream.ts';`, { plugins: [{ name: 'fx', setup(b) {
  b.onResolve({ filter: /state\/store$|ai\/chatTrace$|system\/runtimeLog$/ }, (args) => ({ path: args.path, namespace: 'fx' }));
  b.onLoad({ filter: /.*/, namespace: 'fx' }, () => ({ loader: 'js', contents: 'export const useApp={getState:()=>({})};export const stepModel=()=>"x";export const runStep=async()=>null;export const traceClock=()=>({mark(){},elapsed:()=>0,steps:()=>[]});export const systemPromptComposition=()=>[];export const recordChatTrace=()=>{};export const persistChatTrace=async()=>null;export const postRuntimeEvent=()=>{};' }));
} }] });

const facts = (text, over = {}) => ({ requested: 'AUTO', text, project: 'global', pendingConfirmed: false, structuredAction: false, browserProductTool: false, toolRules: m.shouldUseLocalTools(text), attachments: false, previousWasCerebro: false, toolsAvailable: true, ...over });
const route = (text, over) => m.decideTurn(facts(text, over));

let r = route('Che cosa pensi della strategia di prezzo?', { project: 'project' });
check(r.mode === 'ANSWER' && r.executor === 'direct', 'plain Project question → ANSWER (no CEREBRO just because a Project is selected)');
r = route('Analizza il business plan e prepara un report con le criticità', { project: 'project' });
check(r.mode === 'WORK' && r.executor === 'cerebro', 'multi-step Project work → WORK / CEREBRO');
r = route('Analizza il business plan e prepara un report', { project: 'global' });
check(r.mode !== 'WORK', 'no WORK without a Project workspace');
r = route('Ho mangiato una pizza a pranzo', { project: 'project', structuredAction: true });
check(r.mode === 'ACTION' && r.executor === 'legacy-tools', 'structured write (meal) in a Project → ACTION, not CEREBRO');
r = route('Aggiungi un impegno in calendario domani alle 10', { project: 'project', browserProductTool: true });
check(r.mode === 'ACTION', 'browser product tool (calendar) → ACTION');
r = route('Come sto dormendo questa settimana?');
check(r.mode === 'ACTION', 'existing tool rules (health data) → ACTION');
r = route('Ciao, come va?');
check(r.mode === 'ANSWER', 'small talk → ANSWER');
r = route('guarda questa foto', { project: 'project', attachments: true });
check(r.mode === 'WORK', 'attachments inside a Project → WORK (local OCR / spreadsheet extraction in CEREBRO)');
r = route('sì, procedi', { project: 'project', previousWasCerebro: true });
check(r.mode === 'WORK', 'short continuation of a CEREBRO turn stays WORK');
r = route('e questo cosa significa?', { project: 'project', previousWasCerebro: true });
check(r.mode === 'ANSWER', 'a plain follow-up question after WORK is an ANSWER');
r = route('crea una immagine di un gatto', { specialRoute: 'image' });
check(r.executor === 'image', 'image route kept');

r = route('Analizza il business plan e prepara un report', { project: 'project', requested: 'ANSWER' });
check(r.mode === 'ANSWER' && r.source === 'override', 'ANSWER override honoured');
r = route('Ciao', { requested: 'ACTION' });
check(r.mode === 'ACTION' && r.source === 'override', 'ACTION override honoured');
r = route('Ciao', { requested: 'WORK', project: 'project' });
check(r.mode === 'WORK' && r.source === 'override', 'WORK override honoured inside a Project');
r = route('Ciao', { requested: 'WORK', project: 'global' });
check(r.mode === 'ANSWER' && r.overrideRejected === 'work-needs-project', 'WORK override outside a Project is rejected and recorded');
r = route('Attacco il Veilborn', { requested: 'WORK', project: 'world' });
check(r.mode !== 'WORK' && r.overrideRejected === 'world-is-deterministic', 'WORK override in Vinz.World is rejected');
r = route('Ho pesato 80 kg', { requested: 'WORK', project: 'project', structuredAction: true });
check(r.mode === 'ACTION' && r.overrideRejected === 'structured-write-is-action', 'WORK override cannot carry a structured write');
r = route('sì', { requested: 'ANSWER', pendingConfirmed: true });
check(r.mode === 'ACTION' && r.source === 'pending-confirmation', 'a pending confirmation beats any override');
r = route('Ciao', { requested: 'ACTION', toolsAvailable: false });
check(r.overrideRejected === 'action-needs-tools', 'ACTION override without a tool executor is rejected');

// /api/runs refuses non-WORK stream turns.
const dataDir = mkdtempSync(join(tmpdir(), 'vinz-modes-'));
const workspace = mkdtempSync(join(tmpdir(), 'vinz-modes-ws-'));
Object.assign(process.env, { VINZMON_DATA_DIR: dataDir, VINZMON_LOCAL_CORE: '1', VINZMON_TOKEN: 'synthetic-token-not-a-secret-000000', VINZMON_ORCHESTRATOR: 'hermes', VINZMON_HERMES_API_URL: 'http://127.0.0.1:8642', VINZMON_HERMES_API_KEY: 'fixture', VINZMON_HERMES_WORKSPACE_ROOT: workspace, VINZMON_HERMES_MODEL: 'gpt-oss:20b', VINZMON_HERMES_SANDBOXED: '1', VINZMON_HERMES_PERSONAL_MEMORY: 'off' });
try {
  const runs = await bundle(`export { default as runs } from './netlify/functions/runs.ts';`, { packages: 'external' });
  const post = async (body) => (await runs.runs(new Request('http://localhost/api/runs', { method: 'POST', headers: { authorization: `Bearer ${process.env.VINZMON_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }))).json();
  const refused = await post({ stream: true, profile: 'project-chat', mode: 'ANSWER', projectId: 'p', conversationId: 'c', input: 'x' });
  check(refused.code === 'MODE_NOT_WORK', '/api/runs stream refuses an ANSWER turn');
  const legacy = await post({ stream: true, profile: 'project-chat', projectId: 'p', conversationId: 'c', input: 'x' });
  check(legacy.code !== 'MODE_NOT_WORK', 'a client that sends no mode is still accepted');
} finally { rmSync(dataDir, { recursive: true, force: true }); rmSync(workspace, { recursive: true, force: true }); }

const runtime = readFileSync(join(cwd, 'src/assistant-original/netlify-runtime.ts'), 'utf8');
check(runtime.includes('const routing = decideTurn({') && runtime.includes("if (executor === 'cerebro' && projectId)"), 'chat orchestrator dispatches on decideTurn, not on projectId');
check(!/projectId && projectId !== WORLD_PROJECT_ID\) \|\| mealConfirmation/.test(runtime), 'the old "Project selected ⇒ tools" shortcut is gone');
const ui = readFileSync(join(cwd, 'src/assistant-original/components/examples/chatgpt.tsx'), 'utf8');
check(ui.includes('<ModePill') && ui.includes('<MonCoreLine />'), 'mode selector and execution line are rendered in the chat');

console.log(failures ? `\n✗ ${failures} mode check(s) failed.` : '\n✓ MON CORE modes work.');
process.exit(failures ? 1 : 0);
