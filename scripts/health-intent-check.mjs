// End-to-end shared tool-stream selection with a deterministic provider fixture.
// No model/provider calls, personal data, or real persistence.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const values = new Map();
globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
globalThis.window = { dispatchEvent: () => true };
values.set('vinzmon.prototype.v4', JSON.stringify({ state: { token: 'fixture-token-not-real' } }));
const { outputFiles } = await build({ stdin: { contents: `export * from './src/brain/stream'; export { runTool } from './src/ai/tools'; export { addMeal, addWorkout, addWeight, updateLatestMeal, updateLatestWorkout, updateLatestWeight, readHealthJournal } from './src/engine/healthJournal'; export { calculateDailyEnergy } from './src/engine/dailyEnergy';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', write: false });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const failures = [];
const check = (condition, label) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); if (!condition) failures.push(label); };
const realFetch = globalThis.fetch;
let request; let calls = 0;
const ctx = {
  logMeal: (input) => m.addMeal(input), updateMeal: (slot, input) => m.updateLatestMeal(slot, input),
  logWorkout: (input) => m.addWorkout(input), updateWorkout: (input) => m.updateLatestWorkout(input),
  logWeight: (kg) => m.addWeight(kg), updateWeight: (kg) => m.updateLatestWeight(kg),
  readEnergy: (profile) => JSON.stringify(m.calculateDailyEnergy(m.readHealthJournal(), new Date(), profile)),
};
async function exercise(user, expected, args = {}, meal, workout) {
  calls = 0; request = undefined;
  globalThis.fetch = async (url, options = {}) => {
    if (url !== '/api/ai') return new Response('{}', { status: 200 });
    const payload = JSON.parse(options.body); if (!request) request = payload;
    calls++;
    return new Response(JSON.stringify(calls === 1 && expected && payload.tools.some((tool) => tool.name === expected)
      ? { toolUses: [{ id: `fixture-${expected}`, name: expected, input: args }], model: 'fixture' }
      : { text: 'Fixture verified response.', model: 'fixture' }), { status: 200 });
  };
  await m.replyWithLocalTools([], user, new AbortController().signal, () => {}, (use) => m.runTool(use, ctx), null, [], meal, workout, [], { systemPrompt: 'Fixture technical context, no personal data.', requestId: 'fixture-request' });
  check(request.tools.length <= 12, `${user}: bounded catalog`);
  if (expected) {
    check(request.tools.some((tool) => tool.name === expected), `${user}: ${expected} available`);
    check(request.toolChoice === expected, `${user}: ${expected} forced`);
  }
  return request;
}
try {
  for (const text of ['Ho mangiato pollo e riso.', 'Ho bevuto un frullato.', 'Ho fatto colazione con yogurt.']) check(m.isMealLogIntent(text), `${text}: meal declaration`);
  for (const text of ['Correggi la cena: era riso non pasta.', 'Modifica il pranzo a 700 kcal.', 'Quanto ho mangiato a cena?', 'Non ho mangiato nulla.']) check(!m.isMealLogIntent(text), `${text}: not a new meal`);
  for (const text of ['Ho corso 30 minuti.', 'Ho nuotato per 45 minuti.', 'Mi sono allenato per 50 minuti.']) check(m.isWorkoutLogIntent(text), `${text}: completed activity declaration`);
  check(!m.isWorkoutLogIntent('Programma allenamento lunedì'), 'planned workout is not completed');
  const proposal = await exercise('Ho mangiato riso.', undefined, {}, { status: 'needs-confirmation', slot: 'pranzo' });
  check(!proposal.tools.some((tool) => tool.name === 'registra_pasto'), 'meal proposal cannot write');
  await exercise('Sì, pranzo', 'registra_pasto', { pasto: 'pranzo', descrizione: 'fixture rice', kcal: 600, proteine: 20, carboidrati: 100, grassi: 10 }, { status: 'confirmed', slot: 'pranzo' });
  const initialMeal = m.readHealthJournal().meals[0];
  await exercise('Correggi il pranzo a 700 kcal.', 'correggi_ultimo_pasto', { pasto: 'pranzo', kcal: 700 });
  check(m.readHealthJournal().meals.length === 1 && m.readHealthJournal().meals[0].id === initialMeal.id && m.readHealthJournal().meals[0].kcal === 700, 'meal correction changes same row');
  await exercise('Confermo allenamento', 'registra_allenamento', { titolo: 'fixture run', dettagli: '', minuti: 30, kcal_bruciate: 250, fonte_energia: 'estimated' }, undefined, { status: 'confirmed' });
  const initialWorkout = m.readHealthJournal().workouts[0];
  await exercise('Correggi la corsa: erano 35 minuti.', 'correggi_ultimo_allenamento', { minuti: 35, kcal_bruciate: 300, fonte_energia: 'estimated' });
  check(m.readHealthJournal().workouts.length === 1 && m.readHealthJournal().workouts[0].id === initialWorkout.id && m.readHealthJournal().workouts[0].minutes === 35, 'workout correction changes same row');
  await exercise('Oggi peso 80 kg.', 'registra_peso', { kg: 80 });
  const initialWeight = m.readHealthJournal().weights[0];
  await exercise('Correggi il peso: sono 79 kg.', 'correggi_ultimo_peso', { kg: 79 });
  check(m.readHealthJournal().weights.length === 1 && m.readHealthJournal().weights[0].id === initialWeight.id && m.readHealthJournal().weights[0].kg === 79, 'weight correction changes same row');
  for (const user of ['Quante calorie mi restano?', 'Sono in deficit?', 'Qual è il mio TDEE?', 'Quanto dovrei mangiare oggi?']) await exercise(user, 'calcola_energia_giornaliera');
  check(m.requiredWriteTool('Non peso 80 kg.') !== 'registra_peso', 'negated weight does not force registration');
  assert.equal(failures.length, 0, failures.join('\n'));
  console.log('PASS: varied health intents, required tools, same-record corrections, deterministic energy forced. All provider responses are fixtures.');
} finally { globalThis.fetch = realFetch; }
