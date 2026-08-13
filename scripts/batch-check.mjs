/* ============================================================================
   QA DEL GENERATORE — controllo da riga di comando

   Verifica il motore contro la GENERATION BIBLE v2.1, con lo scostamento
   voluto sulla radice (vedi docs/OPEN_ITEMS.md):
   • distribuzione sulle 18 Family e le 16 Affinity
   • §26 — la normalizzazione della rarità riproduce ESATTAMENTE le tabelle
   • il primo .mon è estratto, non canonico: semi diversi danno creature diverse
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
export { generateMon, generateFirstMon } from '${cwd}/src/engine/characterGenerator.ts';
export { selectHeritageOrigins } from '${cwd}/src/engine/heritage.ts';
export { neutralPersonality, EMPTY_NOVELTY, buildNoveltyMemory } from '${cwd}/src/engine/signals.ts';
export { initialHealthState, applyDay, simulateDayInput, DEFAULT_BIAS } from '${cwd}/src/engine/health.ts';
export { makeRng, randomSeed } from '${cwd}/src/engine/rng.ts';
export { isValidMonName } from '${cwd}/src/engine/naming.ts';
export { normalizePool } from '${cwd}/src/engine/rarity.ts';
export { planContinuity, EVOLVABLE_AXES, PROGRESSION } from '${cwd}/src/engine/progression.ts';
export { SCAN_QUESTIONS, seedFromAnswers, seedSpread } from '${cwd}/src/engine/personalityScan.ts';
export * as CONFIG from '${cwd}/src/engine/generation-config.ts';
export { FRAGMENT_LIBRARY, slug } from '${cwd}/src/assets-pipeline/fragments.ts';
export { extractFromMessage, extractionLabels } from '${cwd}/src/engine/chatExtract.ts';
export { parseDiet, parseTraining, adherenceOf, classifyFood, mealFromText, mealFromClock, expectedMeals, plannedFor } from '${cwd}/src/engine/protocol.ts';
export { eggReply, allEggSounds } from '${cwd}/src/engine/eggVoice.ts';
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
  `  ${C.FAMILIES.length} Family · ${archetypes} archetipi · ` +
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

/* Il primo .mon non è più canonico: si estrae. Il controllo che conta è che
   partite diverse comincino da creature diverse — se il primo nodo tornasse
   sempre uguale, la modifica non avrebbe avuto effetto. */

const firstRuns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((seed) =>
  m.generateFirstMon({
    input,
    mindlineNodeId: 'node_000',
    originNodeId: null,
    lineageNames: [],
    seed,
  }).record.data,
);
const root = { record: { data: firstRuns[0] } };

console.log('\n═══ PRIMO NODO ═══\n');
console.log(
  `  ${firstRuns
    .slice(0, 4)
    .map((d) => `${d.name} ${d.family}//${d.family_archetype}`)
    .join('   ')}\n`,
);
check(
  new Set(firstRuns.map((d) => d.family)).size >= 4,
  'partite diverse cominciano da Family diverse',
  `${new Set(firstRuns.map((d) => d.family)).size} Family su 12 semi`,
);
check(
  new Set(firstRuns.map((d) => d.name)).size === firstRuns.length,
  'ogni prima creatura ha un nome suo',
);
check(
  firstRuns.every((d) => d.heritage_traits.length === 0),
  'il primo nodo non eredita da nessuno',
);

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

const slime = results.filter((d) => d.family === 'SLIME');
check(slime.length === 0, 'la Family SLIME non esiste più', `${slime.length} casi`);

const invalidNames = lineage.filter((n) => !m.isValidMonName(n));
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
  'tutte le Family sono raggiungibili',
  unreachable.join(', ') || `${seenFamilies.size}/${C.SELECTABLE_FAMILIES.length}`,
);

const sizes = new Set(results.map((d) => d.size));
check(sizes.size === 3, 'le tre taglie di §6 compaiono tutte', [...sizes].join(', '));

/* --- Ancora di continuità, MASTER SPEC v1.8 §9.1 ---------------------------
   Due regole assolute e simmetriche, e vanno provate sul motore:

     ≥1 asse resta fermo   →  vietato «all axes changed»
     ≥1 asse cambia        →  vietato «all axes unchanged»

   La seconda è quella che si rompe da sola: con lo schema MINIMAL restano
   fermi sei assi su sette, e l'unico libero può riestrarre il valore che
   aveva già. Il generatore lo intercetta e forza; qui si controlla che lo
   faccia davvero. --------------------------------------------------------- */

const ANCHOR_TRIALS = 30;
const PATTERNS = ['MINIMAL', 'FOCUSED', 'MAJOR', 'FAMILY-ANCHORED', 'FAMILY-SHIFT'];
let anchorBroken = 0;
let anchorFrozen = 0;
let planIllegal = 0;
let forcedChanges = 0;

for (const pattern of PATTERNS) {
  let base = root.record;
  for (let i = 0; i < ANCHOR_TRIALS; i++) {
    const plan = m.planContinuity(m.makeRng(i * 31337 + 7), pattern);

    // Il piano stesso deve essere legale prima ancora di generare.
    if (plan.keeps.length === 0 || plan.keeps.length === m.EVOLVABLE_AXES.length) planIllegal += 1;
    if (plan.keeps.includes('family_archetype') && !plan.keeps.includes('family')) planIllegal += 1;

    const next = m.generateMon({
      input,
      mindlineNodeId: `form_${pattern}_${i}`,
      originNodeId: base.data.mindline_node,
      heritageOrigins: m.selectHeritageOrigins(m.makeRng(i * 7717 + 3), base),
      lineageNames: lineage,
      previous: base,
      continuity: plan.keeps,
      seed: m.randomSeed(),
    });
    lineage.push(next.record.data.name);
    const d = next.record.data;

    for (const axis of plan.keeps) {
      if (d[axis] !== base.data[axis]) anchorBroken += 1;
    }
    if (m.EVOLVABLE_AXES.every((a) => d[a] === base.data[a])) anchorFrozen += 1;
    if (next.trace.steps.some((st) => st.stage === 'CONTINUITÀ — VINCOLO')) forcedChanges += 1;

    base = next.record;
  }
}

check(planIllegal === 0, 'ogni piano di continuità è legale (§9.1)', `${planIllegal} piani fuori regola`);
check(
  anchorBroken === 0,
  'gli assi ancorati sopravvivono al cambio di forma',
  `${anchorBroken} assi cambiati quando non dovevano`,
);
check(
  anchorFrozen === 0,
  'una forma nuova non è mai identica alla precedente (§9.1)',
  `${anchorFrozen} forme identiche`,
);
console.log(
  `  ····  su ${PATTERNS.length * ANCHOR_TRIALS} trasformazioni il vincolo «qualcosa deve cambiare» è scattato ${forcedChanges} volte`,
);

/* --- Signal Scan §12 -------------------------------------------------------
   La prova che serve non è che la schermata esista, ma che **cambi qualcosa**.
   Un questionario che non sposta la Family estratta è decorazione.

   Si costruiscono tre profili — sempre la prima risposta, sempre l'ultima,
   alternate — e si guarda se le Family che escono sono diverse. Se lo scan
   fosse scollegato, i tre profili darebbero la stessa distribuzione.
   --------------------------------------------------------------------------- */

const profile = (choose) => {
  const answers = {};
  for (const q of m.SCAN_QUESTIONS) answers[q.index] = choose(q).id;
  return m.seedFromAnswers(answers);
};

const SCAN_PROFILES = {
  primo: profile((q) => q.answers[0]),
  ultimo: profile((q) => q.answers[q.answers.length - 1]),
  alterno: profile((q) => q.answers[q.index % q.answers.length]),
};

/* ⚠️ I semi sono FISSI, non casuali, ed è una correzione: con `randomSeed()`
   i tre profili estraevano 120 creature ciascuno da distribuzioni vicine e
   ogni tanto — circa una volta su cinque — la Family più frequente coincideva
   per tutti e tre. Il controllo falliva senza che niente fosse rotto.

   Un controllo che grida al lupo una volta su cinque è peggio di nessun
   controllo: insegna a ignorare i fallimenti. Con i semi fissi i tre profili
   ricevono ESATTAMENTE la stessa sequenza di estrazioni, quindi ogni
   differenza nel risultato viene dal seme di personalità e da nient'altro —
   che è precisamente la cosa che questo controllo vuole dimostrare. */
const SCAN_DRAWS = 240;
const SCAN_SEEDS = Array.from({ length: SCAN_DRAWS }, (_, i) => 0x5eed + i * 0x9e3779b1);
const scanFamilies = {};
for (const [name, personality] of Object.entries(SCAN_PROFILES)) {
  const seen = new Map();
  for (let i = 0; i < SCAN_DRAWS; i++) {
    const d = m.generateFirstMon({
      input: { ...input, personality },
      mindlineNodeId: `scan_${name}_${i}`,
      originNodeId: null,
      lineageNames: [],
      seed: SCAN_SEEDS[i],
    }).record.data;
    seen.set(d.family, (seen.get(d.family) ?? 0) + 1);
  }
  scanFamilies[name] = seen;
}

const neutralSpread = m.seedSpread(m.neutralPersonality());
check(neutralSpread === 0, 'il seme neutro è davvero neutro', `${neutralSpread}`);
check(
  Object.values(SCAN_PROFILES).every((p) => m.seedSpread(p) > 0.2),
  'ogni profilo di risposte modella il seme',
  Object.entries(SCAN_PROFILES)
    .map(([k, p]) => `${k} ${Math.round(m.seedSpread(p) * 100)}%`)
    .join(' · '),
);

/* Cosa si sta dimostrando: che rispondere diversamente porta a una creatura
   diversa. La Family più frequente è il segnale più leggibile, ma da sola è
   fragile — due profili possono preferire la stessa Family e differire su
   tutto il resto della distribuzione. Si guardano quindi entrambe le cose, e
   basta che una delle due parli. */
const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0][0];
const tops = Object.fromEntries(Object.entries(scanFamilies).map(([k, v]) => [k, top(v)]));

const distributions = Object.values(scanFamilies).map((seen) =>
  [...seen.entries()].sort().map(([f, n]) => `${f}:${n}`).join('|'),
);

check(
  new Set(Object.values(tops)).size >= 2 || new Set(distributions).size === distributions.length,
  'profili diversi portano a creature diverse (§12)',
  Object.entries(tops)
    .map(([k, v]) => `${k} → ${v}`)
    .join(' · '),
);

const familyCounts = tally((d) => d.family).map(([, n]) => n);
console.log(
  `  ····  su questo profilo la Family più favorita esce ${(Math.max(...familyCounts) / Math.min(...familyCounts)).toFixed(1)}× più della meno favorita (§17: è voluto)`,
);

/* ============================================================================
   🔶 v1.10 §5.3 — PROTOCOLLO ED ESTRAZIONE

   Fino a qui il motore di estrazione era coperto solo da controlli di
   presenza: «il file esiste», «la funzione si chiama così». Adesso decide cosa
   diventa la creatura — «il punto non è se mangio ma cosa mangio» — e va
   interrogato con frasi vere, che è l'unico modo di accorgersi che una parola
   manca dal vocabolario.
   ========================================================================= */

console.log('\n═══ §5.3 — PROTOCOLLO: LA DIETA DICHIARATA ═══\n');

const diet = m.parseDiet(
  'tante proteine e verdura, pochi carboidrati la sera, niente dolci né alcol, 5 pasti al giorno',
);

check(diet.pursue.includes('PROTEINE') && diet.pursue.includes('VERDURA'), 'legge cosa cercare', diet.pursue.join(', '));
check(
  ['CARBO', 'DOLCI', 'ALCOL'].every((g) => diet.avoid.includes(g)),
  'legge cosa evitare, anche con «pochi» e «niente»',
  diet.avoid.join(', '),
);
check(diet.mealsPerDay === 5, 'legge la frequenza dei pasti', String(diet.mealsPerDay));
check(
  !diet.pursue.some((g) => diet.avoid.includes(g)),
  'nessun gruppo è insieme da cercare e da evitare',
);

// La negazione non deve tracimare oltre la virgola: è l'errore che rende
// inutile un lettore di questo tipo, e non si vede finché non lo si prova.
const scoped = m.parseDiet('niente zuccheri, tanta frutta');
check(
  scoped.avoid.includes('DOLCI') && scoped.pursue.includes('FRUTTA'),
  'la negazione non tracima nella proposizione successiva',
  `evita ${scoped.avoid.join(',')} · cerca ${scoped.pursue.join(',')}`,
);

const training = m.parseTraining('pesi 4 volte a settimana, corsa il sabato, stretching la sera');
check(
  ['FORZA', 'CARDIO', 'MOBILITA'].every((k) => training.kinds.includes(k)),
  'legge i tipi di allenamento',
  training.kinds.join(', '),
);
check(training.sessionsPerWeek === 4, 'legge la frequenza settimanale', String(training.sessionsPerWeek));

console.log('\n═══ §5.3 — COSA MANGIO, NON SE MANGIO ═══\n');

/* Ogni riga è una frase che una persona scriverebbe davvero, con il risultato
   atteso accanto. Se domani il vocabolario perde una parola, fallisce qui. */
const MEALS = [
  ['pollo e broccoli', 'IN_LINEA'],
  ['carbonara e due birre', 'FUORI'],
  ['insalata di pollo ma anche un dolce', 'MISTO'],
  ['un po’ di formaggio', 'SCONOSCIUTA'],
];

for (const [phrase, expected] of MEALS) {
  const found = m.extractFromMessage(phrase, diet);
  check(
    found.adherence === expected,
    `«${phrase}» → ${expected}`,
    found.adherence === expected ? found.foodGroups.join(',') : `ottenuto ${found.adherence}`,
  );
}

check(
  m.extractFromMessage('carbonara e due birre', null).adherence === 'SCONOSCIUTA',
  'senza protocollo non esiste un giudizio sul cibo',
);

const full = m.extractFromMessage('oggi palestra e poi carbonara, sono distrutto', diet);
check(
  full.signals.FOOD && full.signals.WORKOUT && full.signals.MOOD,
  'una frase sola riempie i tre segnali del giorno (§5.1)',
  m.extractionLabels(full).join(' · '),
);
check(
  m.extractionLabels(full).some((l) => l.includes('fuori protocollo')),
  'la conferma dice come si colloca, non solo che ha capito',
);

console.log('\n═══ §5.4 — I PASTI E IL PIANO ═══\n');

/* Il pasto detto a parole vince sempre sull'ora: e' l'unico modo di poter
   correggere una deduzione sbagliata riscrivendo, che e' la promessa di §5.2. */
const seraTardi = new Date(2026, 7, 20, 21, 30);
const said = m.mealFromText('a pranzo pollo e broccoli', seraTardi);
check(
  said.slot === 'PRANZO' && said.fromClock === false,
  'il pasto detto a parole vince sull’ora',
  `${said.slot}, dall’orologio: ${said.fromClock}`,
);

const guessed = m.mealFromText('pollo e broccoli', seraTardi);
check(
  guessed.slot === 'CENA' && guessed.fromClock === true,
  'senza indizi si deduce dall’ora, e si dichiara',
  `${guessed.slot}, dall’orologio: ${guessed.fromClock}`,
);

for (const [h, expected] of [[8, 'COLAZIONE'], [11, 'SPUNTINO'], [13, 'PRANZO'], [17, 'MERENDA'], [23, 'CENA']]) {
  const got = m.mealFromClock(new Date(2026, 7, 20, h, 0));
  check(got === expected, `alle ${h} → ${expected}`, got === expected ? '' : `ottenuto ${got}`);
}

/* Il riepilogo mostra i pasti che il protocollo dichiara. Con tre pasti non si
   tengono i primi tre in ordine: nessuno fa colazione, spuntino e pranzo. */
const cinque = m.expectedMeals({ pursue: [], avoid: [], mealsPerDay: 5, text: '' });
check(cinque.length === 5, 'cinque pasti dichiarati → cinque caselle', cinque.join(', '));
const tre = m.expectedMeals({ pursue: [], avoid: [], mealsPerDay: 3, text: '' });
check(
  tre.join(',') === 'COLAZIONE,PRANZO,CENA',
  'tre pasti → i tre principali, non i primi in ordine',
  tre.join(', '),
);
check(
  m.expectedMeals(null) === null,
  'senza protocollo non si pretende nessun numero di pasti',
);

/* Il piano settimanale. La riga chiave e' l'ultima: un giorno che il piano non
   nomina NON e' riposo, e il sistema non deve deciderlo al posto tuo. */
const piano = m.parseTraining('pesi lunedi mercoledi venerdi, corsa il sabato, domenica riposo');
const DOM = new Date(2026, 7, 23); // domenica
const LUN = new Date(2026, 7, 24);
const MAR = new Date(2026, 7, 25);
const SAB = new Date(2026, 7, 22);

check(m.plannedFor(piano, DOM) === 'REST', 'domenica riposo, dal piano');
check(
  Array.isArray(m.plannedFor(piano, LUN)) && m.plannedFor(piano, LUN).includes('FORZA'),
  'lunedi pesi, dal piano',
  String(m.plannedFor(piano, LUN)),
);
check(
  Array.isArray(m.plannedFor(piano, SAB)) && m.plannedFor(piano, SAB).includes('CARDIO'),
  'sabato corsa, dal piano',
  String(m.plannedFor(piano, SAB)),
);
check(
  m.plannedFor(piano, MAR) === null,
  'un giorno che il piano non nomina NON diventa riposo',
  'inventare un riposo dove non e scritto sarebbe la bugia che §5 vieta ai sensori',
);
check(m.plannedFor(null, LUN) === null, 'senza piano, nessuna previsione');

console.log('\n═══ §7.2 — LA VOCE DELL’UOVO ═══\n');

/* La regola dell'uovo è UNA: non parla. Un suono che diventasse leggibile
   sarebbe una creatura che parla prima di esistere, cioè lo spoiler che
   §12/01 vieta. Il controllo è meccanico apposta. */
const sounds = m.allEggSounds();
check(sounds.length > 0, 'esiste un vocabolario di suoni', `${sounds.length} suoni`);
check(
  sounds.every((s) => /^[a-z·—?\s]+$/.test(s)),
  'nessun suono contiene lettere accentate, cifre o maiuscole',
  sounds.filter((s) => !/^[a-z·—?\s]+$/.test(s)).join(' ') || 'tutti puliti',
);

// Nessuna vocale doppia isolata tipo «ao»: quello che serve è che nessun suono
// sia una parola italiana. La lista è chiusa, quindi la si può controllare tutta.
const WORDS = ['si', 'no', 'ok', 'ciao', 'ho', 'ha', 'me', 'te', 'tu', 'io', 'mi', 'ti'];
check(
  !sounds.some((s) => WORDS.includes(s.trim())),
  'nessun suono è una parola',
);

const eggRng = m.makeRng(42);
const heard = m.eggReply(eggRng, m.extractFromMessage('pollo e broccoli', diet), 0);
check(
  heard.reaction === 'ACK',
  'al primo messaggio, se ha sentito qualcosa reagisce davvero',
  heard.reaction,
);
const nothing = m.eggReply(eggRng, m.extractFromMessage('boh', null), 0);
check(
  nothing.reaction === 'DORMANT',
  'a un messaggio da cui non esce niente, il primo giorno, resta quasi inerte',
  nothing.reaction,
);
const tense = m.eggReply(eggRng, m.extractFromMessage('sono stressatissimo', null), 0.5);
check(tense.reaction === 'ALERT', 'la tensione cambia il suono', tense.reaction);

console.log(
  failures === 0 ? '\n✓ Tutti i controlli superati.\n' : `\n✗ ${failures} controlli falliti.\n`,
);
process.exit(failures === 0 ? 0 : 1);
