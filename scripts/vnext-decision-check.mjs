/* vNext STEP 2 — TURN DECISION RECORD. Offline, synthetic provider.
   Verifies that the decision is observational (content-free), that the
   ACTION executor amends it with its real tool pool and withheld writes, and
   that the runtime log accepts and keeps its metadata. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.cwd();
let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`); if (!ok) failures += 1; };
let n = 0;
const bundle = async (contents, plugins = []) => {
  const outfile = join(cwd, 'node_modules', `.vnext-decision-${process.pid}-${n++}.mjs`);
  await build({ stdin: { contents, resolveDir: cwd, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error', plugins });
  try { return await import(`file://${outfile}`); } finally { rmSync(outfile, { force: true }); }
};

console.log('\n═══ vNext TURN DECISION RECORD ═══\n');

const core = await bundle(`export * from './src/mon-core/turnDecision.ts';`);
check(core.modeForExecutor('direct') === 'ANSWER' && core.modeForExecutor('legacy-tools') === 'ACTION' && core.modeForExecutor('cerebro') === 'WORK', 'executor → mode table');
const secretText = 'il mio conto in banca è 12345';
const decision = core.newTurnDecision({ turnId: 't1', executor: 'legacy-tools', source: 'rule', rules: ['TOOL_INTENT'], toolsOffered: ['leggi_me'], toolsWithheld: ['registra_pasto'] });
const meta = core.decisionLogMetadata(decision);
check(decision.requested === 'AUTO' && decision.mode === 'ACTION', 'default request is AUTO; mode derived from executor');
check(!JSON.stringify(meta).includes(secretText) && meta.withheld === 'registra_pasto' && meta.count === 1, 'log metadata carries names/counts only');

globalThis.__decisionState = { token: 'synthetic-token-not-a-secret', activeMonName: null, mons: {}, voiceNotes: [], progression: { bond: 0 }, day: 1, world: null, mood: null, stepModels: {} };
globalThis.__traces = []; globalThis.__events = [];
const loop = await bundle(`export { replyWithLocalTools, matchedIntentRules } from './src/brain/stream.ts';
export { recordTurnDecision } from './src/mon-core/decisionLog.ts';
export { newTurnDecision } from './src/mon-core/turnDecision.ts';`, [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /state\/store$/ }, () => ({ path: 'store', namespace: 'fx' }));
  b.onResolve({ filter: /ai\/chatTrace$/ }, () => ({ path: 'trace', namespace: 'fx' }));
  b.onResolve({ filter: /system\/runtimeLog$/ }, () => ({ path: 'log', namespace: 'fx' }));
  b.onLoad({ filter: /.*/, namespace: 'fx' }, ({ path }) => ({ loader: 'js', contents: path === 'store'
    ? 'export const useApp={getState:()=>globalThis.__decisionState};export const stepModel=()=>"synthetic";export const runStep=async(_s,job)=>job("synthetic");'
    : path === 'log' ? 'export const postRuntimeEvent=(e)=>globalThis.__events.push(e);export const postChatDiagnostic=()=>{};export const postChatClientError=()=>{};'
    : 'export const traceClock=()=>({mark(){},elapsed:()=>0,steps:()=>[]});export const systemPromptComposition=()=>[];export const recordChatTrace=(t)=>globalThis.__traces.push(t);export const persistChatTrace=async()=>null;' }));
} }]);
const rules = loop.matchedIntentRules('Ho mangiato una pizza a pranzo');
check(rules.includes('TOOL_INTENT') && rules.includes('MEAL_LOG_INTENT'), 'intent rules are reported by name');
check(loop.matchedIntentRules('ciao come va').length === 0, 'small talk matches no rule');

const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  globalThis.__lastTools = (body.tools ?? []).map((tool) => tool.name);
  return new Response(JSON.stringify({ text: 'ok', model: 'synthetic', costUsd: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
};
try {
  loop.recordTurnDecision(loop.newTurnDecision({ turnId: 'turn-1', executor: 'legacy-tools', source: 'rule', rules: ['TOOL_INTENT'] }));
  await loop.replyWithLocalTools([], 'Ho mangiato una pizza a pranzo', new AbortController().signal, () => {}, async (use) => ({ id: use.id, content: 'x' }), null, [], { status: 'needs-confirmation', slot: 'pranzo' }, undefined, undefined, [], { systemPrompt: 'Synthetic', requestId: 'turn-1' }).catch(() => undefined);
  const trace = globalThis.__traces.at(-1);
  check(Boolean(trace?.decision), 'the tool-loop trace carries the decision');
  check(trace?.decision?.toolsOffered?.length > 0 && trace.decision.toolsOffered.every((name) => globalThis.__lastTools.includes(name)), 'toolsOffered equals the pool actually sent');
  check(trace?.decision?.toolsWithheld?.includes('registra_pasto'), 'a meal awaiting confirmation is recorded as withheld');
  check(trace?.decision?.maxRounds === 4, 'round cap recorded');
  const event = globalThis.__events.find((item) => item.eventType === 'TURN_DECISION');
  check(event?.metadata?.executor === 'legacy-tools' && event.requestId === 'turn-1', 'one TURN_DECISION runtime event emitted');
  check(!JSON.stringify(event).includes('pizza'), 'runtime event contains no user text');
} finally { globalThis.fetch = originalFetch; }

const log = await bundle(`export { sanitizeRuntimeEvent } from './netlify/functions/_shared/runtimeLog.ts';`);
const kept = log.sanitizeRuntimeEvent({ eventType: 'TURN_DECISION', status: 'PASS', scope: 'chat', metadata: { mode: 'ACTION', executor: 'legacy-tools', rules: 'TOOL_INTENT', withheld: 'registra_pasto', prompt: 'must be dropped' } });
check(kept?.metadata?.mode === 'ACTION' && kept.metadata.executor === 'legacy-tools' && !('prompt' in kept.metadata), 'server keeps decision metadata and drops unknown keys');
check(readFileSync(join(cwd, 'netlify/functions/runtime-log.ts'), 'utf8').includes("'TURN_DECISION'"), 'runtime-log endpoint accepts TURN_DECISION');

console.log(failures ? `\n✗ ${failures} decision check(s) failed.` : '\n✓ Turn Decision Record works.');
process.exit(failures ? 1 : 0);
