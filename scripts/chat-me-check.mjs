/* Verifica offline del percorso conversazione → tool → diario ME. */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-chat-me-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-chat-me-check.mjs');

writeFileSync(entry, `
export { replyWithLocalTools, shouldUseLocalTools } from '${cwd}/src/brain/stream.ts';
export { runTool } from '${cwd}/src/ai/tools.ts';
export { addMeal, addWorkout, readHealthJournal } from '${cwd}/src/engine/healthJournal.ts';
`);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
});

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
};
globalThis.window = { dispatchEvent: () => true };
localStorage.setItem('vinzmon.prototype.v4', JSON.stringify({ state: { token: 'test-token' } }));

const m = await import(`file://${out}?v=${Date.now()}`);
let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

const ctx = {
  day: 1,
  health: { stats: {}, condition: 0, disc: 0 },
  protocol: { diet: null, training: null },
  days: {}, memories: [], pages: [], monName: null,
  writePage: () => ({ ok: false }), updatePage: () => ({ ok: false }),
  remember: () => ({ ok: false }), skinNow: () => '', changeSkin: () => ({ ok: false }),
  resetSkin: () => {}, layoutNow: () => '', showPiece: () => ({ ok: false }),
  movePiece: () => ({ ok: false }),
  logMeal: (input) => m.addMeal(input, 'chat'),
  logWorkout: (input) => m.addWorkout(input, 'chat'),
  logWeight: () => {}, saveDiet: () => {}, configureHealth: () => {},
};

const replies = [
  {
    toolUses: [{ id: 'meal-1', name: 'registra_pasto', input: {
      pasto: 'pranzo', descrizione: 'Riso e pollo', kcal: 540,
      proteine: 42, carboidrati: 62, grassi: 11,
    } }],
    costUsd: 0.001,
    model: 'test-model',
  },
  { text: 'Pasto registrato in ME.', costUsd: 0.001, model: 'test-model' },
  {
    toolUses: [{ id: 'workout-1', name: 'registra_allenamento', input: {
      titolo: 'Lower body', dettagli: 'Squat e affondi', minuti: 45,
    } }],
    costUsd: 0.001,
    model: 'test-model',
  },
  { text: 'Allenamento registrato in ME.', costUsd: 0.001, model: 'test-model' },
];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify(replies.shift()), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

try {
  check(m.shouldUseLocalTools('Ho mangiato riso e pollo'), 'un pasto raccontato attiva gli strumenti locali');
  check(m.shouldUseLocalTools('Mi sono allenato per 45 minuti'), 'un allenamento raccontato attiva gli strumenti locali');
  const run = (use) => m.runTool(use, ctx);
  await m.replyWithLocalTools([], 'A pranzo ho mangiato riso e pollo.', new AbortController().signal, () => {}, run, 'test-model');
  await m.replyWithLocalTools([], 'Ho fatto 45 minuti di lower body.', new AbortController().signal, () => {}, run, 'test-model');
  const journal = m.readHealthJournal();
  check(journal.meals.length === 1, 'il pasto detto in chat entra nel diario ME');
  check(journal.meals[0]?.description === 'Riso e pollo', 'ME legge descrizione e nutrienti del pasto');
  check(journal.workouts.length === 1, 'l’allenamento detto in chat entra nel diario ME');
  check(journal.workouts[0]?.minutes === 45, 'ME legge durata e dettagli dell’allenamento');
  check(journal.meals[0]?.source === 'chat' && journal.workouts[0]?.source === 'chat', 'la provenienza resta CHAT');
} finally {
  globalThis.fetch = originalFetch;
}

if (failures) process.exit(1);
console.log('\nChat → ME coerente.\n');
