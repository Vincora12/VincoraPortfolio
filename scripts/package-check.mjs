/* ============================================================================
   VERIFICA DEL PACCHETTO ASSET REQUEST

   Controlla i criteri 5 e 6 di §26:
   • «Any generated .mon can export a COMPLETE Asset Request package.»
   • «Ogni prompt contiene ABBASTANZA ISTRUZIONE TECNICA per
      ChatGPT to generate an implementable sprite strip.»

   E i contratti di §22.2 (contenuto del pacchetto), §24.4 (forma del manifest)
   e §13 (nessun campo fuori dagli assi canonici nei Character Data).

   Uso:  node scripts/package-check.mjs
   ========================================================================= */

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'vinz-pkg-'));
const entry = join(dir, 'entry.ts');
const out = join(dir, 'out.mjs');
const cwd = process.cwd();

writeFileSync(
  entry,
  `
export { generateMon, generateFirstMon } from '${cwd}/src/engine/characterGenerator.ts';
export { selectHeritageOrigins } from '${cwd}/src/engine/heritage.ts';
export { neutralPersonality, EMPTY_NOVELTY } from '${cwd}/src/engine/signals.ts';
export { initialHealthState, applyDay, simulateDayInput, DEFAULT_BIAS } from '${cwd}/src/engine/health.ts';
export { makeRng } from '${cwd}/src/engine/rng.ts';
export { buildPackageFiles } from '${cwd}/src/assets-pipeline/exportPackage.ts';
export { buildManifest } from '${cwd}/src/assets-pipeline/manifest.ts';
export { compilePrompt, validateFragmentIds, COMPILER_VERSION } from '${cwd}/src/assets-pipeline/compiler.ts';
export { FRAGMENT_LIBRARY } from '${cwd}/src/assets-pipeline/fragments.ts';
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

/* --- Genera un .mon nato da un branch, così l'Heritage entra nei prompt --- */

const rng = m.makeRng(4242);
let health = m.initialHealthState();
for (let d = 1; d <= 30; d++) {
  health = m.applyDay(health, d, m.simulateDayInput(rng, health, m.DEFAULT_BIAS));
}

const input = {
  day: 30,
  health,
  personality: m.neutralPersonality(),
  moodHistory: [],
  cultural: {},
  novelty: m.EMPTY_NOVELTY,
  mindlineDepth: 6,
  bond: 75,
  dataConfidence: 78,
  activeDays: 28,
  branchCount: 2,
};

const first = m.generateFirstMon({
  input,
  mindlineNodeId: 'node_000',
  originNodeId: null,
  lineageNames: [],
  seed: 1001,
});

const second = m.generateMon({
  input,
  mindlineNodeId: 'node_001',
  originNodeId: 'node_000',
  heritageOrigins: m.selectHeritageOrigins(m.makeRng(77), first.record),
  lineageNames: [first.record.data.name],
  previous: first.record,
  seed: 2002,
});

const record = second.record;
const files = m.buildPackageFiles(record);
const manifest = m.buildManifest(record);

/* --- Controlli -------------------------------------------------------------- */

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log(`\n═══ PACCHETTO ASSET REQUEST — ${record.data.name} ═══\n`);
console.log('CONTENUTO (§22.2)');

/* 🔷 v1.15 §23.5 — gli asset da generare sono SEI, non piu sette: il sigillo
   e uscito dalla pipeline ed e tornato a essere un disegno del sito. Un segno
   che deve reggere a 24px, derivare dai dati in modo verificabile ed esistere
   dal primo giorno e' una cosa che il codice fa meglio di un modello di
   immagini — che a «estremamente semplice» risponde aggiungendo dettaglio.

   Con character data, manifest, prompt compilato, id dei frammenti e readme
   fanno 11 file. */
const EXPECTED = [
  '00_CHARACTER_DATA.json',
  '01_CHARACTER_MASTER_PROMPT.txt',
  '02_PROFILE_PORTRAIT_PROMPT.txt',
  '03_BIO_DOODLE_PROMPT.txt',
  '04_REACTION_PACK_PROMPT.txt',
  '05_IDLE_ANIMATION_PROMPT.txt',
  '06_ENCOUNTER_HERO_PROMPT.txt',
  'compiled_prompt.txt',
  'fragment_ids.json',
  'ASSET_MANIFEST.json',
  'README.txt',
];

const names = files.map((f) => f.name);
check(
  EXPECTED.every((e) => names.includes(e)) && names.length === EXPECTED.length,
  'i file di §22.2 + §48, né uno di più né uno di meno',
  `${names.length} file`,
);

const prompts = files.filter((f) => f.name.endsWith('_PROMPT.txt'));
check(
  prompts.every((p) => p.content.length > 3000),
  'prompt completi, non brief (§30)',
  `il più corto è ${Math.min(...prompts.map((p) => p.content.length))} caratteri`,
);

/* §30 — «The exact same Character Data must compile consistently across
   Character Master, Portrait, Bio Doodle, Reactions, Idle, Hero and
   Reveal assets.» La consistenza non è una frase di cortesia dentro il testo:
   è il fatto che gli stessi frammenti di identità entrino in tutti quanti. */

const ASSET_TYPES = [
  'character_master', 'profile_portrait', 'bio_doodle',
  'reaction_pack', 'idle_animation', 'encounter_hero',
];

const compiled = ASSET_TYPES.map((t) => ({ type: t, ...m.compilePrompt(record, t) }));

const identityAxes = ['family.', 'archetype.', 'affinity.', 'size.', 'role.', 'fashion.', 'mood.'];
const identityOf = (c) =>
  c.fragmentIds.filter((id) => identityAxes.some((a) => id.startsWith(a))).join('|');

const reference = identityOf(compiled[0]);
const drifting = compiled.filter((c) => identityOf(c) !== reference).map((c) => c.type);
check(
  drifting.length === 0,
  'tutti gli asset compilano dagli stessi frammenti di identità (§30)',
  drifting.join(', '),
);

check(
  compiled.every((c) => c.text.includes('CREATURE FIRST. STYLING SECOND.')),
  'ogni prompt porta la priorità assoluta di §31',
);

/* 🔷 v1.14 §31.2 — «Transparent background» dice come SALVARLO, non come
   DISEGNARLO. La stessa immagine finisce sulla splash nera e sulla griglia
   chiara del DEX: se il contorno e' nero pieno sparisce sul primo fondo, se
   e' bianco pieno sparisce sul secondo. */
check(
  compiled.every((c) => c.text.includes('READS ON BOTH LIGHT AND DARK')),
  'ogni prompt dice che deve reggere su chiaro E su scuro (§31.2)',
);
check(
  compiled.every((c) => c.text.includes('No background fill of any colour')),
  'e che lo sfondo resta trasparente: il nero e della schermata, non del file',
);

check(
  compiled.every((c) => c.text.includes('Do not redesign')  || c.text.includes('DO NOT redesign') || c.text.includes('not to redesign') || c.text.includes('Allow pose/expression changes, not redesign')),
  'nessun prompt consente di ridisegnare il .mon fra un asset e l’altro',
);

// §48 — ogni id emesso deve esistere nella libreria.
const brokenIds = compiled.flatMap((c) => m.validateFragmentIds(c.fragmentIds));
check(brokenIds.length === 0, 'ogni fragment_id esiste in libreria (§48)', brokenIds.join(', '));

// §48 — fragment_ids.json deve registrare TUTTI gli asset con le versioni.
const fragmentIdsFile = JSON.parse(files.find((f) => f.name === 'fragment_ids.json').content);
check(
  Object.keys(fragmentIdsFile.fragments_by_asset).length === ASSET_TYPES.length,
  'fragment_ids.json copre tutti gli asset (§48)',
  `${Object.keys(fragmentIdsFile.fragments_by_asset).length}`,
);
check(
  typeof fragmentIdsFile.compiler_version === 'string' &&
    typeof fragmentIdsFile.generation_config_version === 'string' &&
    typeof fragmentIdsFile.seed === 'number',
  'fragment_ids.json registra compiler, config e seed (§48)',
);

/* --- §23.3: il ciclo di riposo ---------------------------------------------
   🔷 v1.11 — qui c'erano dodici controlli sullo SPRITE DI ROTAZIONE: griglia
   8 × 1, otto angoli espliciti, nessuna deriva di camera, ancoraggio
   bottom-center. Erano giusti, e l'asset non esiste più.

   Otto viste coerenti dello stesso personaggio sono la cosa più cara e più
   fragile che si possa chiedere a un modello di immagini, in cambio di un
   gesto che si prova una volta. Al suo posto c'è l'IDLE, che fa il lavoro che
   contava — la creatura è viva — con quattro frame invece di otto.
   -------------------------------------------------------------------------- */

console.log('\nCICLO DI RIPOSO (§23.3)');

const idle = files.find((f) => f.name === '05_IDLE_ANIMATION_PROMPT.txt').content;

const REQUIRED_IN_IDLE = [
  ['consistenza assoluta', 'ABSOLUTE CONSISTENCY'],
  ['sfondo trasparente', 'Transparent background'],
  ['inquadratura identica in ogni frame', 'Identical framing'],
  ['divisibile in 4 frame uguali', 'split into 4 equal sprite frames'],
  ['ping-pong dichiarato', 'ping-pong'],
];

for (const [label, needle] of REQUIRED_IN_IDLE) {
  check(idle.includes(needle), label);
}

/* --- §24.4: forma del manifest --------------------------------------------- */

console.log('\nMANIFEST (§24.4)');

const idleEntry = manifest.assets.find((a) => a.asset_id === 'idle_01');
check(idleEntry?.frames === 4, 'idle: frames = 4', String(idleEntry?.frames));
check(idleEntry?.columns === 4 && idleEntry?.rows === 1, 'idle: griglia 4 × 1');
check(
  !manifest.assets.some((a) => a.asset_id === 'rotation_01'),
  'nessuna rotazione nel manifest (§23.3)',
);
check(
  !manifest.assets.some((a) => a.asset_id === 'sigil_01'),
  'nessun sigillo fra gli asset da generare (§23.5)',
  'e un disegno del sito: leggibile a 24px, derivato, e c\'e dal primo giorno',
);

/* --- §13 / §21.1: contratto dei Character Data ----------------------------- */

console.log('\nCHARACTER DATA (§13, §21.1)');

const data = JSON.parse(files.find((f) => f.name === '00_CHARACTER_DATA.json').content);

const REQUIRED_FIELDS = [
  'name', 'family', 'family_archetype', 'affinity', 'size', 'role', 'fashion',
  'mood_primary', 'mood_secondary', 'appearance', 'rarity', 'rarity_score',
  'season', 'palette_dna', 'eyewear', 'hair_state', 'haircut', 'character_dna',
  'voice_preset', 'voice_dna', 'cultural_affinities', 'heritage_traits',
  'mindline_node', 'bond', 'data_confidence', 'generation_reason_summary',
  'asset_manifest_status',
];
const missing = REQUIRED_FIELDS.filter((f) => !(f in data));
check(missing.length === 0, 'i 27 campi di §27 presenti', missing.join(', ') || 'tutti');

// §13 SUPERSEDING RULE — campi fantasy espressamente vietati.
const FORBIDDEN = ['species', 'class', 'protector', 'seraphim', 'element', 'tier'];
const found = FORBIDDEN.filter((f) => f in data);
check(found.length === 0, 'nessun campo vietato da §13', found.join(', ') || 'nessuno');

check(
  data.heritage_traits.length >= 1 && data.heritage_traits.length <= 3,
  'heritage fra 1 e 3 tratti (§7.3)',
  `${data.heritage_traits.length}`,
);
check(
  data.heritage_traits.every((h) => h.origin && h.transformed && h.origin !== h.transformed),
  'ogni tratto è tradotto, non copiato (§7.3)',
);
check(
  Object.values(data.asset_manifest_status).every((s) => s === 'waiting'),
  'nasce con tutti gli slot asset vuoti (§21.2)',
);

/* --- Esito ------------------------------------------------------------------ */

console.log(
  failures === 0
    ? '\n✓ Pacchetto conforme.\n'
    : `\n✗ ${failures} controlli falliti.\n`,
);
process.exit(failures === 0 ? 0 : 1);
