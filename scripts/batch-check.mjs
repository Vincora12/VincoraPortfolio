/* ============================================================================
   QA DEL GENERATORE — controllo da riga di comando

   Verifica il motore contro la GENERATION BIBLE v2.1:
   • distribuzione sulle 19 Family e le 16 Affinity
   • §26 — la normalizzazione della rarità riproduce ESATTAMENTE le tabelle
   • §3  — SLIME compare solo come radice, e la radice è sempre Vz.mon
   • §24 step 17 — genoma dei nomi e unicità in lineage
   • §23 — Heritage fra 1 e 3, sempre tradotto
   • §21.2 MASTER SPEC — un .mon nasce senza alcun asset
   • ogni voce di catalogo produce un frammento di prompt

   Uso:  node scripts/batch-check.mjs [N]
   ========================================================================= */

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const N = Number(process.argv[2] ?? 500);
const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-'));
const entry = join(dir, 'entry.ts');
const out = join(dir, 'out.mjs');

writeFileSync(
  entry,
  `
export { generateMon, generateRootMon } from '${cwd}/src/engine/characterGenerator.ts';
export { selectHeritageOrigins } from '${cwd}/src/engine/heritage.ts';
export { neutralPersonality, EMPTY_NOVELTY, buildNoveltyMemory } from '${cwd}/src/engine/signals.ts';
export { initialHealthState, applyDay, simulateDayInput, DEFAULT_BIAS } from '${cwd}/src/engine/health.ts';
export { makeRng, randomSeed } from '${cwd}/src/engine/rng.ts';
export { isValidMonName } from '${cwd}/src/engine/naming.ts';
export { normalizePool } from '${cwd}/src/engine/rarity.ts';
export * as CONFIG from '${cwd}/src/engine/generation-config.ts';
export { FRAGMENT_LIBRARY, slug } from '${cwd}/src/assets-pipeline/fragments.ts';
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

const m = await import(`file://${out}`);
const C = m.CONFIG;

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

/* ============================================================================
   §26 — NORMALIZZAZIONE DELLA RARITÀ
   È il punto più facile da sbagliare in silenzio: le tabelle del documento
   sono il test.
   ========================================================================= */

console.log('\n═══ §26 — NORMALIZZAZIONE DELLA RARITÀ ═══\n');

const EXPECTED_POOLS = [
  [['COMMON'], 'COMMON 100.0'],
  [['COMMON', 'UNCOMMON'], 'COMMON 64.0 / UNCOMMON 36.0'],
  [['COMMON', 'UNCOMMON', 'RARE'], 'COMMON 53.3 / UNCOMMON 30.0 / RARE 16.7'],
  [
    ['COMMON', 'UNCOMMON', 'RARE', 'EPIC'],
    'COMMON 49.5 / UNCOMMON 27.8 / RARE 15.5 / EPIC 7.2',
  ],
  [
    ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'MYTHIC'],
    'COMMON 48.2 / UNCOMMON 27.1 / RARE 15.1 / EPIC 7.0 / MYTHIC 2.5',
  ],
  [
    ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'MYTHIC', 'SINGULAR'],
    'COMMON 48.0 / UNCOMMON 27.0 / RARE 15.0 / EPIC 7.0 / MYTHIC 2.5 / SINGULAR 0.5',
  ],
];

for (const [ids, want] of EXPECTED_POOLS) {
  const got = m
    .normalizePool(C.RARITY_TIERS.filter((t) => ids.includes(t.id)))
    .map((p) => `${p.rarity} ${p.chance.toFixed(1)}`)
    .join(' / ');
  check(got === want, got, got === want ? '' : `atteso ${want}`);
}

/* ============================================================================
   CATALOGHI E LIBRERIA DI FRAMMENTI
   ========================================================================= */

console.log('\n═══ CATALOGHI (§3–§16) ═══\n');

const archetypes = C.FAMILIES.reduce((s, f) => s + f.archetypes.length, 0);
console.log(
  `  ${C.FAMILIES.length} Family (${C.SELECTABLE_FAMILIES.length} estraibili) · ${archetypes} archetipi · ` +
    `${C.AFFINITIES.length} Affinity · ${C.ROLES.length} Role · ${C.FASHIONS.length} Fashion · ` +
    `${C.MOODS.length} Mood · ${C.RARITY_TIERS.length} Rarità · ${C.VOICE_PRESETS.length} preset di voce`,
);
console.log(`  ${m.FRAGMENT_LIBRARY.size} frammenti di prompt in libreria\n`);

check(
  C.RARITY_TIERS.reduce((s, t) => s + t.baseChance, 0) === 100,
  'le probabilità base di §15 sommano 100',
);
check(
  C.RARITY_SCORE_COMPONENTS.reduce((s, c) => s + c.max, 0) === 100,
  'le componenti di punteggio di §16 sommano 100',
);

const unnormalized = C.SELECTABLE_FAMILIES.filter(
  (f) => Math.abs(Object.values(f.fit).reduce((a, b) => a + b, 0) - 1) > 0.001,
);
check(unnormalized.length === 0, 'le formule di fit di §17 sono normalizzate a 1', unnormalized.map((f) => f.id).join(', '));

// Ogni voce di catalogo deve avere il suo frammento, altrimenti il compiler
// produrrebbe un id inesistente proprio per la combinazione più rara.
const missingFragments = [];
for (const f of C.FAMILIES) {
  if (!m.FRAGMENT_LIBRARY.has(`family.${m.slug(f.id)}`)) missingFragments.push(f.id);
  for (const a of f.archetypes) {
    if (!m.FRAGMENT_LIBRARY.has(`archetype.${m.slug(f.id)}.${m.slug(a.id)}`)) {
      missingFragments.push(`${f.id}/${a.id}`);
    }
  }
}
for (const a of C.AFFINITIES) if (!m.FRAGMENT_LIBRARY.has(`affinity.${m.slug(a.id)}`)) missingFragments.push(a.id);
for (const r of C.ROLES) if (!m.FRAGMENT_LIBRARY.has(`role.${m.slug(r.id)}`)) missingFragments.push(r.id);
for (const f of C.FASHIONS) if (!m.FRAGMENT_LIBRARY.has(`fashion.${m.slug(f.id)}`)) missingFragments.push(f.id);
for (const x of C.MOODS) if (!m.FRAGMENT_LIBRARY.has(`mood.${m.slug(x.id)}`)) missingFragments.push(x.id);

check(
  missingFragments.length === 0,
  'ogni voce di catalogo ha il suo frammento',
  missingFragments.slice(0, 5).join(', '),
);

/* ============================================================================
   BATCH
   ========================================================================= */

const rng = m.makeRng(20260812);
let health = m.initialHealthState();
for (let d = 1; d <= 40; d++) {
  health = m.applyDay(health, d, m.simulateDayInput(rng, health, m.DEFAULT_BIAS));
}

const input = {
  day: 40,
  health,
  personality: m.neutralPersonality(),
  moodHistory: [],
  cultural: {},
  novelty: m.EMPTY_NOVELTY,
  mindlineDepth: 10,
  bond: 88,
  dataConfidence: 80,
  activeDays: 38,
  branchCount: 3,
};

const root = m.generateRootMon({
  input,
  mindlineNodeId: 'node_000',
  originNodeId: null,
  lineageNames: [],
  seed: 1,
});

console.log('\n═══ §3 — NODO RADICE ═══\n');
check(root.record.data.name === 'Vz.mon', 'la radice si chiama Vz.mon', root.record.data.name);
check(root.record.data.family === 'SLIME', 'la radice è SLIME', root.record.data.family);
check(root.record.data.family_archetype === 'ROOT', 'archetipo ROOT', root.record.data.family_archetype);

const lineage = [root.record.data.name];
const results = [];
let previous = root.record;

for (let i = 0; i < N; i++) {
  const heritageOrigins = i % 3 === 0 ? m.selectHeritageOrigins(m.makeRng(i * 7919 + 1), previous) : [];
  const r = m.generateMon({
    input,
    mindlineNodeId: `node_${String(i + 1).padStart(3, '0')}`,
    originNodeId: `node_${String(i).padStart(3, '0')}`,
    heritageOrigins,
    lineageNames: lineage,
    previous,
    seed: m.randomSeed(),
  });
  lineage.push(r.record.data.name);
  results.push(r.record.data);
  previous = r.record;
}

const tally = (fn) => {
  const map = new Map();
  for (const d of results) map.set(fn(d), (map.get(fn(d)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

const bar = (n) => '█'.repeat(Math.max(1, Math.round((n / N) * 32)));
const show = (title, rows) => {
  console.log(`\n${title}`);
  for (const [k, v] of rows) console.log(`  ${String(k).padEnd(16)} ${String(v).padStart(4)}  ${bar(v)}`);
};

console.log(`\n═══ BATCH DI ${N} .MON — SOLO DATI, NESSUNA IMMAGINE ═══`);
show('FAMILY', tally((d) => d.family));
show('AFFINITY', tally((d) => d.affinity));
show('SIZE', tally((d) => d.size));
show('RARITY', tally((d) => d.rarity));

const scores = results.map((d) => d.rarity_score).sort((a, b) => a - b);
const pct = (p) => scores[Math.min(scores.length - 1, Math.floor((p / 100) * scores.length))];
console.log(
  `\nPUNTEGGIO DI RARITÀ  min ${pct(0)} · mediana ${pct(50)} · p95 ${pct(95)} · max ${pct(100)}`,
);

/* --- Controlli ------------------------------------------------------------- */

console.log('\n═══ CONTROLLI ═══\n');

const slimeElsewhere = results.filter((d) => d.family === 'SLIME');
check(slimeElsewhere.length === 0, 'SLIME non compare mai fuori dalla radice (§3, §17)', `${slimeElsewhere.length} casi`);

const invalidNames = lineage.filter((n) => n !== 'Vz.mon' && !m.isValidMonName(n));
check(invalidNames.length === 0, 'genoma dei nomi V… Z… .mon (§24)', invalidNames.slice(0, 3).join(', '));

const dupes = lineage.length - new Set(lineage).size;
check(dupes === 0, 'nessun nome duplicato in lineage', `${dupes}`);

const branched = results.filter((d) => d.heritage_traits.length > 0);
const badHeritage = branched.filter(
  (d) => d.heritage_traits.length > 3 || d.heritage_traits.some((h) => !h.transformed || h.transformed === h.origin),
);
check(
  badHeritage.length === 0,
  'Heritage fra 1 e 3, sempre tradotto (§23)',
  `${branched.length} branch, ${badHeritage.length} irregolari`,
);

const withAssets = results.filter((d) =>
  Object.values(d.asset_manifest_status).some((s) => s !== 'waiting'),
);
check(withAssets.length === 0, 'ogni .mon nasce senza asset');

const eyewearMissing = results.filter((d) => {
  const fam = C.FAMILIES.find((f) => f.id === d.family);
  return fam?.supportsEyewear && d.eyewear === null;
});
check(eyewearMissing.length === 0, 'ottica presente dove l’anatomia lo consente (§9)', `${eyewearMissing.length}`);

const hairOnHairless = results.filter((d) => {
  const fam = C.FAMILIES.find((f) => f.id === d.family);
  return !fam?.supportsHair && d.hair_state !== null;
});
check(hairOnHairless.length === 0, 'nessuna parrucca su anatomie senza capelli (§9)', `${hairOnHairless.length}`);

const concepts = new Set(
  results.map((d) => [d.family, d.family_archetype, d.affinity, d.size, d.role].join('|')),
);
console.log(
  `  ····  varianza: ${concepts.size}/${N} concetti distinti (${Math.round((concepts.size / N) * 100)}%)`,
);

// NB: il batch gira su UN SOLO profilo utente, e §17 vuole proprio che le
// formule di fit favoriscano alcune Family per quel profilo. Quindi qui non si
// controlla l'uniformità — sarebbe testare il contrario di ciò che il
// documento chiede — ma che nessuna Family sia irraggiungibile.
const seenFamilies = new Set(results.map((d) => d.family));
const unreachable = C.SELECTABLE_FAMILIES.filter((f) => !seenFamilies.has(f.id)).map((f) => f.id);
check(
  unreachable.length === 0,
  'tutte le Family estraibili sono raggiungibili',
  unreachable.join(', ') || `${seenFamilies.size}/${C.SELECTABLE_FAMILIES.length}`,
);

const sizes = new Set(results.map((d) => d.size));
check(sizes.size === 3, 'le tre taglie di §6 compaiono tutte', [...sizes].join(', '));

const familyCounts = tally((d) => d.family).map(([, n]) => n);
console.log(
  `  ····  su questo profilo la Family più favorita esce ${(Math.max(...familyCounts) / Math.min(...familyCounts)).toFixed(1)}× più della meno favorita (§17: è voluto)`,
);

console.log(
  failures === 0 ? '\n✓ Tutti i controlli superati.\n' : `\n✗ ${failures} controlli falliti.\n`,
);
process.exit(failures === 0 ? 0 : 1);
