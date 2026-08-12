/* ============================================================================
   QA DEL GENERATORE — controllo da riga di comando (§20.2)

   Genera N .mon strutturati senza immagini e stampa la distribuzione, per
   valutare varianza, concetti duplicati, bilanciamento Family/Affinity,
   coerenza Heritage e qualità dei nomi — esattamente i criteri di §20.2.

   Uso:  node scripts/batch-check.mjs [N]

   Lo stesso controllo è disponibile nella UI dal pannello DEV; questa versione
   serve a verificare l'engine prima ancora che esistano le schermate.
   ========================================================================= */

import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const N = Number(process.argv[2] ?? 200);

const dir = mkdtempSync(join(tmpdir(), 'vinz-'));
const entry = join(dir, 'entry.ts');
const out = join(dir, 'out.mjs');

writeFileSync(
  entry,
  `
export { generateMon } from '${process.cwd()}/src/engine/characterGenerator.ts';
export { initialHealthState, applyDay, simulateDayInput, DEFAULT_BIAS } from '${process.cwd()}/src/engine/health.ts';
export { makeRng, randomSeed } from '${process.cwd()}/src/engine/rng.ts';
export { isValidMonName } from '${process.cwd()}/src/engine/naming.ts';
export { selectHeritageOrigins } from '${process.cwd()}/src/engine/heritage.ts';
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

/* --- Costruisce uno stato utente plausibile ------------------------------- */

const rng = m.makeRng(20260812);
let health = m.initialHealthState();
for (let d = 1; d <= 30; d++) {
  health = m.applyDay(health, d, m.simulateDayInput(rng, health, m.DEFAULT_BIAS));
}

const user = {
  day: 30,
  health,
  progression: { xp: 500, level: 2, bond: 0.4, evolutionSync: 0.5 },
  mood: 'normale',
  focus: 'forza',
  scanAnswers: [],
};

/* --- Batch ----------------------------------------------------------------- */

const lineage = [];
const results = [];
let previous = null;

for (let i = 0; i < N; i++) {
  // Un .mon su tre nasce da un branch, così testiamo anche l'Heritage.
  const heritageOrigins =
    previous && i % 3 === 0 ? m.selectHeritageOrigins(m.makeRng(i * 7919), previous) : [];

  const r = m.generateMon({
    user,
    mindlineNodeId: `node_${String(i).padStart(3, '0')}`,
    originNodeId: i === 0 ? null : `node_${String(i - 1).padStart(3, '0')}`,
    heritageOrigins,
    lineageNames: lineage,
    seed: m.randomSeed(),
  });

  lineage.push(r.record.data.name);
  results.push(r);
  previous = r.record;
}

/* --- Report ---------------------------------------------------------------- */

const tally = (fn) => {
  const map = new Map();
  for (const r of results) {
    const k = fn(r.record.data);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

const bar = (n) => '█'.repeat(Math.max(1, Math.round((n / N) * 40)));
const show = (title, rows) => {
  console.log(`\n${title}`);
  for (const [k, v] of rows) {
    console.log(`  ${String(k).padEnd(18)} ${String(v).padStart(4)}  ${bar(v)}`);
  }
};

console.log(`\n═══ BATCH DI ${N} .MON — SOLO DATI STRUTTURATI, NESSUNA IMMAGINE ═══`);

show('FAMILY', tally((d) => d.family));
show('AFFINITY', tally((d) => d.affinity));
show('APPEARANCE', tally((d) => d.appearance));
show('SIZE', tally((d) => d.size));
show('RARITY', tally((d) => d.rarity));

/* Distribuzione del punteggio grezzo: serve a tarare le soglie di §18. */
const scores = results.map((r) => r.rarity.score).sort((a, b) => a - b);
const pct = (p) => scores[Math.min(scores.length - 1, Math.floor((p / 100) * scores.length))];
console.log('\nPUNTEGGIO DI RARITÀ (grezzo, per tarare le soglie)');
console.log(
  `  min ${pct(0).toFixed(2)}  p25 ${pct(25).toFixed(2)}  mediana ${pct(50).toFixed(2)}  p75 ${pct(75).toFixed(2)}  p95 ${pct(95).toFixed(2)}  max ${pct(100).toFixed(2)}`,
);

/* --- Controlli di validità ------------------------------------------------- */

console.log('\n═══ CONTROLLI ═══');

const invalidNames = lineage.filter((n) => !m.isValidMonName(n));
console.log(
  `  genoma dei nomi (V… Z… .mon)   ${invalidNames.length === 0 ? 'OK' : `FALLITO: ${invalidNames.slice(0, 5).join(', ')}`}`,
);

const dupes = lineage.length - new Set(lineage).size;
console.log(`  nomi duplicati in lineage      ${dupes === 0 ? 'OK (0)' : `FALLITO (${dupes})`}`);

const branched = results.filter((r) => r.record.data.heritage.length > 0);
const badHeritage = branched.filter(
  (r) => r.record.data.heritage.length > 3 || r.record.data.heritage.some((h) => !h.transformed),
);
console.log(
  `  heritage 1–3 e sempre tradotto  ${badHeritage.length === 0 ? `OK (${branched.length} branch)` : `FALLITO (${badHeritage.length})`}`,
);

const noAssets = results.every((r) =>
  Object.values(r.record.data.assetStatus).every((s) => s === 'waiting'),
);
console.log(`  nasce senza asset (§21.2)      ${noAssets ? 'OK' : 'FALLITO'}`);

const eyewearRule = results.filter((r) => {
  const supports = ['ANGEL', 'BEAST', 'INSECT', 'AQUATIC', 'REPTILE', 'AVIAN', 'CONSTRUCT', 'PLANT', 'SPECTRE', 'AMORPHOUS'];
  return supports.includes(r.record.data.family) && r.record.data.fashion.eyewear === null;
});
console.log(
  `  occhiali dove plausibili (§6)   ${eyewearRule.length === 0 ? 'OK' : `FALLITO (${eyewearRule.length})`}`,
);

const uniqueConfigs = new Set(
  results.map((r) => {
    const d = r.record.data;
    return [d.family, d.familyArchetype, d.affinity, d.size, d.role, d.appearance].join('|');
  }),
);
console.log(
  `  configurazioni distinte         ${uniqueConfigs.size}/${N}  (${Math.round((uniqueConfigs.size / N) * 100)}% varianza)`,
);

console.log('\nEsempi:');
for (const r of results.slice(0, 6)) {
  const d = r.record.data;
  console.log(
    `  ${d.name.padEnd(14)} ${d.family}/${d.familyArchetype} · ${d.affinity} · ${d.size} · ${d.role} · ${d.appearance} · ${d.rarity}`,
  );
}
console.log();
