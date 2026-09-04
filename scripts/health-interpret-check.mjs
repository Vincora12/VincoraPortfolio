/* Verifica offline della classificazione contestuale allenamento/riposo (CORE HEALTH INTERPRETATION). Nessuna API key o rete. */
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-health-interpret-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-health-interpret-check.mjs');

writeFileSync(
  entry,
  `
export { estimateHealthEntry } from '${cwd}/src/ai/healthEstimate.ts';
`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
});

const m = await import(`file://${out}?v=${Date.now()}`);
let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

console.log('\n═══ HEALTH INTERPRETATION — CONTESTO, NON PAROLE VIETATE ═══\n');

// Le parole "relax"/"riposo"/"pausa" possono comparire nel TESTO del prompt (per spiegare al
// modello la distinzione semantica — è così che gli si insegna il contesto). Quello che NON deve
// esistere è una blacklist nel CODICE: un confronto diretto o un pattern che decide da solo
// leggendo quelle parole, bypassando il modello.
const healthEstimateSource = readFileSync(join(cwd, 'src/ai/healthEstimate.ts'), 'utf8');
const blacklistPatterns = [
  /includes\(\s*['"]relax/i, /includes\(\s*['"]riposo/i, /includes\(\s*['"]pausa/i,
  /===\s*['"]relax['"]/i, /===\s*['"]riposo['"]/i, /===\s*['"]pausa['"]/i,
  /\/[^/\n]*\b(relax|riposo|pausa)\b[^/\n]*\/[a-z]*\.test\(/i,
];
check(
  !blacklistPatterns.some((pattern) => pattern.test(healthEstimateSource)),
  'nessuna blacklist di codice su "relax"/"riposo"/"pausa" — quelle parole compaiono solo nel testo del prompt che il modello legge, non in un confronto che decide al posto suo',
);

const originalFetch = globalThis.fetch;
let lastAiRequest;
let lastMemoryQuery;
let memoryReturn = { memories: [] };

globalThis.fetch = async (path, init) => {
  const body = init?.body ? JSON.parse(init.body) : {};
  if (path === '/api/me-memory') {
    lastMemoryQuery = body.query;
    return new Response(JSON.stringify(memoryReturn), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/api/ai') {
    lastAiRequest = body;
    const toolUse = { id: 't1', name: body.tools?.[0]?.name ?? '', input: aiToolInput };
    return new Response(JSON.stringify({ text: '', model: 'test-model', toolUses: [toolUse] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`unexpected fetch path: ${path}`);
};

let aiToolInput;

try {
  // ── Stage 1: non-workout ────────────────────────────────────────────────
  aiToolInput = { esito: 'non_allenamento' };
  const notWorkout = await m.estimateHealthEntry({ token: 'tok', kind: 'workout', label: 'ALLENAMENTO', text: 'Oggi relax, giornata tranquilla.' });
  check(notWorkout.outcome === 'not-workout', 'STAGE 1 — "Oggi relax, giornata tranquilla" non diventa un allenamento');
  check(!('minutes' in notWorkout) && !('burnedKcal' in notWorkout), 'STAGE 1 — nessuna durata o caloria inventata quando non è un allenamento');

  // ── Stage 2: real workout ───────────────────────────────────────────────
  aiToolInput = { esito: 'allenamento', title: 'Arrampicata', details: 'Sessione intensa su parete indoor', minutes: 45, burnedKcal: 420 };
  const realWorkout = await m.estimateHealthEntry({ token: 'tok', kind: 'workout', label: 'ALLENAMENTO', text: 'Ho fatto 45 minuti di arrampicata abbastanza intensa.', latestWeightKg: 78 });
  check(realWorkout.outcome === 'workout', 'STAGE 2 — un allenamento vero viene riconosciuto come tale');
  check(realWorkout.outcome === 'workout' && realWorkout.minutes === 45 && realWorkout.burnedKcal === 420 && realWorkout.title.length > 0 && realWorkout.details.length > 0, 'STAGE 2 — titolo, dettagli, durata e calorie stimate sono presenti e sensati');
  check(lastAiRequest.user.includes('PESO UTENTE DISPONIBILE: 78 kg'), 'STAGE 2 — il peso disponibile arriva nel prompt per stimare le calorie');

  // ── Stage 3: "relax" dentro un allenamento vero non lo cancella ────────
  aiToolInput = { esito: 'allenamento', title: 'Yoga', details: 'Sessione rilassata ma completa', minutes: 40, burnedKcal: 140 };
  const relaxedWorkout = await m.estimateHealthEntry({ token: 'tok', kind: 'workout', label: 'ALLENAMENTO', text: 'Ho fatto una sessione molto relax di yoga per 40 minuti.' });
  check(relaxedWorkout.outcome === 'workout' && relaxedWorkout.minutes === 40, 'STAGE 3 — "relax" dentro una descrizione di attività fisica reale non annulla l’allenamento — la classificazione segue la stessa strada dello stage 2, nessun ramo diverso nel nostro codice');

  // ── Stage 4: ambiguous ──────────────────────────────────────────────────
  aiToolInput = { esito: 'ambiguo' };
  const ambiguous = await m.estimateHealthEntry({ token: 'tok', kind: 'workout', label: 'ALLENAMENTO', text: 'Relax' });
  check(ambiguous.outcome === 'ambiguous', 'STAGE 4 — "Relax" da solo, senza contesto, non forza un allenamento');

  // ── Stage 5: relevant personal memory actually reaches the interpretation ──
  memoryReturn = { memories: [{ id: 'm1', text: 'RELAX non va trattato come allenamento salvo attività fisica reale descritta.' }] };
  aiToolInput = { esito: 'non_allenamento' };
  await m.estimateHealthEntry({ token: 'tok', kind: 'workout', label: 'ALLENAMENTO', text: 'Oggi relax.' });
  check(lastMemoryQuery === 'Oggi relax.', 'STAGE 5 — la ricerca di memoria personale viene fatta sul testo dell’utente, tramite /api/me-memory (boundary Core, non un secondo archivio)');
  check(lastAiRequest.user.includes('RELAX non va trattato come allenamento'), 'STAGE 5 — la memoria rilevante recuperata arriva davvero dentro il prompt di classificazione, non solo nella ricerca');

  // ── Memory search failure must not block classification ────────────────
  memoryReturn = null; // forces JSON parse to still work but memories missing -> treated as [] by result.data?.memories
  globalThis.fetch = async (path, init) => {
    if (path === '/api/me-memory') return new Response('not json', { status: 500 });
    const body = init?.body ? JSON.parse(init.body) : {};
    const toolUse = { id: 't1', name: body.tools?.[0]?.name ?? '', input: { esito: 'allenamento', title: 'Corsa', details: 'Corsa leggera', minutes: 20, burnedKcal: 150 } };
    return new Response(JSON.stringify({ text: '', model: 'test-model', toolUses: [toolUse] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const degraded = await m.estimateHealthEntry({ token: 'tok', kind: 'workout', label: 'ALLENAMENTO', text: 'Ho corso 20 minuti.' });
  check(degraded.outcome === 'workout', 'un guasto della ricerca di memoria non blocca la classificazione — degrada, non rompe');

  // ── Meal path unaffected ────────────────────────────────────────────────
  globalThis.fetch = async (path, init) => {
    if (path === '/api/me-memory') throw new Error('il pasto non deve mai cercare memoria personale');
    const body = init?.body ? JSON.parse(init.body) : {};
    const toolUse = { id: 't1', name: body.tools?.[0]?.name ?? '', input: { description: 'Pasta al pomodoro', kcal: 450, protein: 12, carbs: 80, fat: 8 } };
    return new Response(JSON.stringify({ text: '', model: 'test-model', toolUses: [toolUse] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const meal = await m.estimateHealthEntry({ token: 'tok', kind: 'meal', label: 'PRANZO', text: 'Pasta al pomodoro' });
  check(!('outcome' in meal) && meal.kcal === 450, 'il percorso pasto resta invariato: nessuna ricerca di memoria, nessun campo esito');
} finally {
  globalThis.fetch = originalFetch;
}

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
