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
export { replyWithLocalTools, shouldUseLocalTools, requiredWriteTool, isMealLogIntent, isWorkoutLogIntent, isWorkoutPlanIntent } from '${cwd}/src/brain/stream.ts';
export { runTool } from '${cwd}/src/ai/tools.ts';
export { addMeal, addWorkout, addWeight, configureHealthDisplay, configureHealthTargets, healthJournalReport, readHealthJournal, setDietPlan, setWorkoutPlan, updateLatestMeal, updateLatestWeight, updateLatestWorkout } from '${cwd}/src/engine/healthJournal.ts';
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
  readMe: (section) => m.healthJournalReport(section),
  logMeal: (input) => m.addMeal(input, 'chat'),
  updateMeal: (slot, patch) => m.updateLatestMeal(slot, patch),
  logWorkout: (input) => m.addWorkout(input, 'chat'),
  updateWorkout: (patch) => m.updateLatestWorkout(patch),
  logWeight: (kg) => m.addWeight(kg, 'chat'),
  updateWeight: (kg) => m.updateLatestWeight(kg),
  saveDiet: (title, text) => m.setDietPlan(title, text),
  saveWorkoutPlan: (title, text) => m.setWorkoutPlan(title, text),
  configureTargets: (targets) => m.configureHealthTargets(targets),
  configureHealth: (focus, goal) => m.configureHealthDisplay(focus, goal),
};

const replies = [
  { text: 'Una banana media contiene circa 105 kcal.', costUsd: 0.001, model: 'test-model' },
  {
    toolUses: [{ id: 'meal-1', name: 'registra_pasto', input: {
      pasto: 'spuntino', descrizione: 'Una banana', kcal: 105,
      proteine: 1.3, carboidrati: 27, grassi: 0.4,
    } }],
    costUsd: 0.001,
    model: 'test-model',
  },
  { text: 'Pasto registrato in ME.', costUsd: 0.001, model: 'test-model' },
  {
    toolUses: [{ id: 'meal-2', name: 'registra_pasto', input: {
      pasto: 'spuntino', descrizione: 'Yogurt greco', kcal: 120,
      proteine: 15, carboidrati: 7, grassi: 2,
    } }],
    costUsd: 0.001,
    model: 'test-model',
  },
  { text: 'Pasto extra registrato in ME.', costUsd: 0.001, model: 'test-model' },
  { text: 'Hai corso per 45 minuti.', costUsd: 0.001, model: 'test-model' },
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
const toolCounts = [];
const toolNames = [];
const toolChoices = [];
const imageCounts = [];
globalThis.fetch = async (_url, init) => {
  const request = JSON.parse(String(init?.body ?? '{}'));
  toolCounts.push(Array.isArray(request.tools) ? request.tools.length : 0);
  toolNames.push(Array.isArray(request.tools) ? request.tools.map((tool) => tool.name) : []);
  toolChoices.push(request.toolChoice ?? null);
  imageCounts.push(Array.isArray(request.images) ? request.images.length : 0);
  return new Response(JSON.stringify(replies.shift()), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

try {
  check(m.shouldUseLocalTools('Ho mangiato riso e pollo'), 'un pasto raccontato attiva gli strumenti locali');
  check(m.shouldUseLocalTools('Mi sono allenato per 45 minuti'), 'un allenamento raccontato attiva gli strumenti locali');
  check(m.isMealLogIntent('Ho mangiato una banana.'), 'un pasto dichiarato avvia la conferma del momento');
  check(m.isMealLogIntent('Mangio questo come cena'), 'un pasto con foto avvia la conferma del momento');
  check(!m.isMealLogIntent('Cosa ho mangiato a pranzo?'), 'una domanda sul diario non viene scambiata per un nuovo pasto');
  check(!m.isMealLogIntent('Non ho mangiato nulla'), 'un pasto saltato non viene registrato per errore');
  check(m.isWorkoutLogIntent('Ho fatto 45 minuti di lower body.'), 'un allenamento dichiarato avvia la conferma');
  check(!m.isWorkoutLogIntent('Quanto mi sono allenato oggi?'), 'una domanda sullo sport non viene scambiata per un nuovo allenamento');
  check(m.requiredWriteTool('Ho mangiato una banana.') === undefined, 'il pasto non viene salvato prima della conferma');
  check(m.requiredWriteTool('Ho fatto 45 minuti di lower body.') === undefined, 'l’allenamento non viene salvato prima della conferma');
  check(m.isWorkoutPlanIntent('Inserisci allenamento il lunedì'), 'un allenamento assegnato a un giorno viene riconosciuto come piano');
  check(!m.isWorkoutLogIntent('Inserisci allenamento il lunedì'), 'un allenamento futuro non viene scambiato per uno svolto');
  check(m.requiredWriteTool('Inserisci allenamento il lunedì') === 'imposta_piano_allenamento', 'la modifica del lunedì aggiorna il piano in ME');
  const run = (use) => m.runTool(use, ctx);
  let proposal = '';
  await m.replyWithLocalTools(
    [], 'Ho mangiato una banana.', new AbortController().signal, (chunk) => { proposal += chunk; }, run, 'test-model',
    [{ mediaType: 'image/jpeg', data: 'foto-1' }, { mediaType: 'image/jpeg', data: 'foto-2' }],
    { status: 'needs-confirmation', slot: 'spuntino' },
  );
  await m.replyWithLocalTools(
    [], 'Sì', new AbortController().signal, () => {}, run, 'test-model',
    [], { status: 'confirmed', slot: 'spuntino' },
  );
  await m.replyWithLocalTools(
    [], 'Confermo', new AbortController().signal, () => {}, run, 'test-model',
    [], { status: 'confirmed', slot: 'spuntino' },
  );
  let workoutProposal = '';
  await m.replyWithLocalTools(
    [], 'Ho fatto 45 minuti di lower body.', new AbortController().signal,
    (chunk) => { workoutProposal += chunk; }, run, 'test-model', [], undefined,
    { status: 'needs-confirmation' },
  );
  await m.replyWithLocalTools(
    [], 'Sì', new AbortController().signal, () => {}, run, 'test-model', [], undefined,
    { status: 'confirmed' },
  );
  replies.push(
    { toolUses: [{ id: 'plan-1', name: 'imposta_piano_allenamento', input: { titolo: 'Piano settimanale', testo: 'Lunedì: allenamento' } }], costUsd: 0.001, model: 'test-model' },
    { text: 'Allenamento inserito lunedì nel piano.', costUsd: 0.001, model: 'test-model' },
  );
  await m.replyWithLocalTools(
    [], 'Inserisci allenamento il lunedì', new AbortController().signal, () => {}, run, 'test-model', [], undefined, undefined,
  );
  const journal = m.readHealthJournal();
  check(journal.meals.length === 2, 'i pasti confermati in chat entrano nel diario ME');
  check(journal.meals[0]?.description === 'Una banana', 'ME legge descrizione e nutrienti del pasto');
  check(journal.meals[0]?.slot === 'spuntino', 'il primo spuntino riempie il momento fisso');
  check(journal.meals[1]?.slot === 'extra', 'un secondo pasto nello stesso momento diventa extra');
  check(journal.workouts.length === 1, 'l’allenamento detto in chat entra nel diario ME');
  check(journal.workoutPlan?.text.includes('Lunedì'), 'l’allenamento futuro entra nel piano settimanale');
  check(journal.workouts[0]?.minutes === 45, 'ME legge durata e dettagli dell’allenamento');
  check(journal.meals[0]?.source === 'chat' && journal.workouts[0]?.source === 'chat', 'la provenienza resta CHAT');
  check(toolCounts.every((count) => count <= 12), 'ogni richiesta resta entro il limite di 12 strumenti');
  check(proposal.includes('Confermi che lo registro come **spuntino**?'), 'prima del salvataggio chiede conferma del momento intuito');
  check(toolChoices[0] === null && toolChoices[1] === 'registra_pasto', 'la scrittura del pasto diventa obbligatoria solo dopo il sì');
  check(workoutProposal.includes('Confermi che registro questo **allenamento** in ME?'), 'anche l’allenamento chiede conferma prima del salvataggio');
  check(toolChoices[6] === 'registra_allenamento', 'il backend forza la scrittura dell’allenamento solo dopo il sì');
  check(!toolNames[0]?.includes('registra_pasto') && !toolNames[5]?.includes('registra_allenamento'), 'prima della conferma gli strumenti di scrittura del nuovo log non vengono esposti al modello');
  check(imageCounts[0] === 2, 'le due foto del pasto arrivano insieme al ciclo che aggiorna ME');
  run({ id: 'diet-1', name: 'imposta_dieta', input: { titolo: 'Piano settimanale', testo: 'Colazione: yogurt' } });
  run({ id: 'targets-1', name: 'imposta_obiettivi_nutrizionali', input: { kcal: 2100, proteine: 160 } });
  run({ id: 'meal-fix-1', name: 'correggi_ultimo_pasto', input: { pasto: 'spuntino', kcal: 110 } });
  run({ id: 'workout-fix-1', name: 'correggi_ultimo_allenamento', input: { minuti: 50 } });
  run({ id: 'weight-1', name: 'registra_peso', input: { kg: 80 } });
  run({ id: 'weight-fix-1', name: 'correggi_ultimo_peso', input: { kg: 79.8 } });
  const updated = m.readHealthJournal();
  check(updated.dietPlan?.text.includes('yogurt'), 'l’AI può scrivere o sostituire la dieta in ME');
  check(updated.targets.kcal === 2100 && updated.targets.protein === 160, 'l’AI può modificare i target nutrizionali senza cambiare gli altri');
  check(updated.meals[0]?.kcal === 110 && updated.workouts[0]?.minutes === 50, 'l’AI può correggere pasti e allenamenti già presenti');
  check(updated.weights[0]?.kg === 79.8, 'l’AI può registrare e correggere il peso');
  check(m.healthJournalReport('all').includes('Piano settimanale'), 'l’AI può rileggere i valori reali prima di modificarli');
} finally {
  globalThis.fetch = originalFetch;
}

if (failures) process.exit(1);
console.log('\nChat → ME coerente.\n');
