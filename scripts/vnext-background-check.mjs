/* vNext STEP 7 — BACKGROUND MIND LOCAL-FIRST. Offline: provider stubbed,
   isolated temporary store. Uses the ME.MON machine (it reads the save, not
   personal memory) to exercise the shared machine pipeline. */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`); if (!ok) failures += 1; };
const dataDir = mkdtempSync(join(tmpdir(), 'vinz-background-'));
process.env.VINZMON_DATA_DIR = dataDir;
delete process.env.VINZMON_MEMORY_WRITER_MODE;
globalThis.__calls = [];
globalThis.__reply = () => ({ ok: false, text: '', usage: {}, model: 'x', toolUses: [], sources: [], error: 'down' });

const outfile = join(cwd, 'node_modules', `.vnext-background-${process.pid}.mjs`);
await build({
  stdin: { contents: `export { runMachine, machineSnapshot } from './netlify/functions/_shared/machines.ts';
export { writePersonalMemory } from './netlify/functions/_shared/core/memory.ts';
export { getStore } from './netlify/functions/_shared/localStore.ts';`, resolveDir: cwd, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'error', packages: 'external',
  plugins: [{ name: 'stub', setup(b) {
    b.onLoad({ filter: /_shared\/providers\.ts$/ }, () => ({ loader: 'js', contents: 'export function callProvider(provider, req){ globalThis.__calls.push({provider, model:req.model}); const r = globalThis.__reply(provider, req); return Promise.resolve({ ...r, model: req.model }); }' }));
    b.onLoad({ filter: /_shared\/pushDelivery\.ts$/ }, () => ({ loader: 'js', contents: 'export const sendPushNotification=async()=>({sent:0});export const machineInsightPayload=()=>({});export const pushStatus=async()=>({configured:false});' }));
  } }],
});
const m = await import(`file://${outfile}`);
rmSync(outfile, { force: true });

console.log('\n═══ vNext BACKGROUND MIND ═══\n');
const reflection = (question) => JSON.stringify({ reflections: [{ question, answer: 'Forse perché il DNA lo dice.', type: 'identity', confidence: 0.6, sourceIds: ['NOME'] }] });
try {
  await m.getStore({ name: 'vinzmon-state', consistency: 'strong' }).setJSON('save', { day: 3, state: { activeMonName: 'VAZ.mon', mons: { 'VAZ.mon': { data: { name: 'VAZ.mon', family: 'ombra' } } }, personality: { curiosita: 3 }, health: {}, progression: { bond: 0.2 }, firstSync: {} } });

  let state = await m.runMachine('memon', null, 'scheduled');
  check(globalThis.__calls.length === 1 && globalThis.__calls[0].provider === 'ollama', 'scheduled run tries the LOCAL model first');
  check(/locale non disponibile/i.test(state.lastOutput ?? '') && globalThis.__calls.every((c) => c.provider === 'ollama'), 'scheduled run with local down is skipped — no cloud call');

  globalThis.__calls = [];
  globalThis.__reply = (provider) => provider === 'ollama'
    ? { ok: true, text: 'not json at all', usage: {}, model: 'x', toolUses: [], sources: [] }
    : { ok: true, text: reflection('Perché sono fatto di ombra?'), usage: { inputTokens: 10, outputTokens: 10 }, model: 'x', toolUses: [], sources: [] };
  state = await m.runMachine('memon', null, 'manual');
  check(globalThis.__calls.map((c) => c.provider).join(',') === 'ollama,openai', 'manual run: invalid local JSON escalates to the cloud default');
  check(state.observations.length === 1 && state.usage?.provider === 'openai', 'the escalated result is stored with its real provider');

  globalThis.__calls = [];
  state = await m.runMachine('memon', null, 'manual');
  check(globalThis.__calls.length === 0 && /nessun materiale nuovo/i.test(state.lastOutput ?? ''), 'same evidence twice → no model call (idempotent)');

  // New evidence, local answers, duplicate statement is not stored twice.
  await m.getStore({ name: 'vinzmon-state', consistency: 'strong' }).setJSON('save', { day: 4, state: { activeMonName: 'VAZ.mon', mons: { 'VAZ.mon': { data: { name: 'VAZ.mon', family: 'ombra' } } }, personality: { curiosita: 4 }, health: {}, progression: { bond: 0.3 }, firstSync: {} } });
  globalThis.__calls = [];
  globalThis.__reply = () => ({ ok: true, text: reflection('Perché sono fatto di ombra?'), usage: {}, model: 'x', toolUses: [], sources: [] });
  state = await m.runMachine('memon', null, 'scheduled');
  check(globalThis.__calls.length === 1 && globalThis.__calls[0].provider === 'ollama' && state.usage?.provider === 'ollama', 'valid local answer is accepted (no cloud)');
  check(state.observations.length === 1, 'a repeated interpretation is not appended again');

  // Bounded growth.
  const machines = m.getStore('vinzmon-machines');
  const raw = await machines.get('machine-state-v1', { type: 'json' });
  raw.memon.observations = Array.from({ length: 120 }, (_, i) => ({ type: 'identity', statement: `pensiero numero ${i}`, confidence: 0.5, sourceIds: ['NOME'], timestamp: new Date(0).toISOString() }));
  raw.memon.lastInputHash = null;
  raw.memon.pendingInsights = Array.from({ length: 80 }, (_, i) => ({ id: `i${i}`, machineId: 'memon', statement: `s${i}`, sourceIds: [], importance: 0.8, confidence: 0.8, createdAt: new Date(0).toISOString(), status: i < 5 ? 'pending' : 'discussed', notification: 'in_app', dedupeKey: `s${i}` }));
  await machines.setJSON('machine-state-v1', raw);
  globalThis.__reply = () => ({ ok: true, text: reflection('Una domanda del tutto nuova?'), usage: {}, model: 'x', toolUses: [], sources: [] });
  state = await m.runMachine('memon', null, 'scheduled');
  check(state.observations.length <= 60, `observations are bounded (${state.observations.length} ≤ 60)`);
  check(state.pendingInsights.filter((i) => i.status === 'pending').length >= 5 && state.pendingInsights.length <= 5 + 30 + 1, 'pending insights kept, settled ones bounded');

  // Memory capture: local-first in AUTO.
  globalThis.__calls = [];
  globalThis.__reply = (provider) => ({ ok: true, text: JSON.stringify({ version: '1', memoryWorthy: false, entities: [], relations: [], episodes: [] }), usage: {}, model: 'x', toolUses: [], sources: [] });
  await m.writePersonalMemory({ text: 'Mi piace il caffè amaro', messageId: 'm1' }, 'custom');
  check(globalThis.__calls[0]?.provider === 'ollama', 'memory capture in AUTO extracts on the local model');
  globalThis.__calls = [];
  await m.writePersonalMemory({ text: 'Mi piace il tè', messageId: 'm2', preferredModel: 'claude-haiku-4-5' }, 'custom');
  check(globalThis.__calls[0]?.model === 'claude-haiku-4-5', 'an explicit MEMORY model choice is honoured');
} finally { rmSync(dataDir, { recursive: true, force: true }); }

const feedback = readFileSync(join(cwd, 'src/assistant-original/chat-memory-feedback.ts'), 'utf8');
check(!feedback.includes("stepModel('memory'") && feedback.includes('explicitMemoryModel()'), 'the browser sends a memory model only when chosen by hand');
const store = readFileSync(join(cwd, 'src/state/store.ts'), 'utf8');
check(/runStep\(\s*'reflection',\s*\(model\) => m\.reflectOnWeek/.test(store) && store.includes("runStep('reflection', (model) => m.reviewVoice"), 'weekly reflection and monthly voice review run local-first through runStep');

console.log(failures ? `\n✗ ${failures} background check(s) failed.` : '\n✓ Background Mind is local-first, bounded and idempotent.');
process.exit(failures ? 1 : 0);
