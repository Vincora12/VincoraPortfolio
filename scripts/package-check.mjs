/* ============================================================================
   VERIFICA DEL PACCHETTO ASSET REQUEST

   Controlla i criteri 5 e 6 di §26:
   • «Any generated .mon can export a COMPLETE Asset Request package.»
   • «The Rotation Sprite prompt contains ENOUGH TECHNICAL INSTRUCTION for
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
export { generateMon } from '${cwd}/src/engine/characterGenerator.ts';
export { selectHeritageOrigins } from '${cwd}/src/engine/heritage.ts';
export { initialHealthState, applyDay, simulateDayInput, DEFAULT_BIAS } from '${cwd}/src/engine/health.ts';
export { makeRng } from '${cwd}/src/engine/rng.ts';
export { buildPackageFiles } from '${cwd}/src/assets-pipeline/exportPackage.ts';
export { buildManifest } from '${cwd}/src/assets-pipeline/manifest.ts';
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

const user = {
  day: 30,
  health,
  progression: { xp: 800, level: 2, bond: 0.5, evolutionSync: 1 },
  mood: 'normale',
  focus: 'forza',
  scanAnswers: [],
};

const first = m.generateMon({
  user,
  mindlineNodeId: 'node_000',
  originNodeId: null,
  heritageOrigins: [],
  lineageNames: [],
  seed: 1001,
});

const second = m.generateMon({
  user,
  mindlineNodeId: 'node_001',
  originNodeId: 'node_000',
  heritageOrigins: m.selectHeritageOrigins(m.makeRng(77), first.record),
  lineageNames: [first.record.data.name],
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

// §22.2 elenca 7 prompt + character data + manifest + readme = 10 file.
const EXPECTED = [
  '00_CHARACTER_DATA.json',
  '01_CHARACTER_MASTER_PROMPT.txt',
  '02_ROTATION_SPRITE_PROMPT.txt',
  '03_PROFILE_PORTRAIT_PROMPT.txt',
  '04_BIO_DOODLE_PROMPT.txt',
  '05_REACTION_PACK_PROMPT.txt',
  '06_ENCOUNTER_HERO_PROMPT.txt',
  '07_SIGIL_PROMPT.txt',
  'ASSET_MANIFEST.json',
  'README.txt',
];

const names = files.map((f) => f.name);
check(
  EXPECTED.every((e) => names.includes(e)) && names.length === EXPECTED.length,
  'i 10 file di §22.2, né uno di più né uno di meno',
  `${names.length} file`,
);

const prompts = files.filter((f) => f.name.endsWith('_PROMPT.txt'));
check(
  prompts.every((p) => p.content.length > 1200),
  'prompt completi, non brief',
  `il più corto è ${Math.min(...prompts.map((p) => p.content.length))} caratteri`,
);

// §22.1 — ogni prompt deve dire perché l'asset esiste e dove sarà usato.
check(
  prompts.every(
    (p) => p.content.includes('WHY THIS ASSET EXISTS') && p.content.includes('WHERE IT WILL BE USED'),
  ),
  'ogni prompt dichiara scopo e collocazione (§22.1)',
);

// §22.1 — il Character Master resta la fonte di verità visiva.
const derived = prompts.filter((p) => !p.name.startsWith('01_'));
check(
  derived.every((p) => p.content.includes('master_01') || p.content.includes('CHARACTER MASTER')),
  'ogni asset derivato rimanda al Character Master',
);

check(
  prompts.every((p) => p.content.includes('DO NOT redesign the character')),
  'nessun prompt consente di ridisegnare il .mon fra un asset e l’altro',
);

/* --- §24: sprite di rotazione ---------------------------------------------- */

console.log('\nSPRITE DI ROTAZIONE (§24)');

const rot = files.find((f) => f.name === '02_ROTATION_SPRITE_PROMPT.txt').content;

const REQUIRED_IN_ROTATION = [
  ['griglia 8 × 1', '8 columns × 1 row'],
  ['angoli espliciti', '0 / 45 / 90 / 135 / 180 / 225 / 270 / 315 degrees'],
  ['ordine orario', 'clockwise'],
  ['sfondo trasparente', 'background: transparent'],
  ['dimensioni di frame identiche', 'identical dimensions'],
  ['registrazione bottom-centre', 'bottom-centre registration'],
  ['corpo intero senza tagli', 'full body visible in every frame'],
  ['nessun testo o etichetta', 'no text, no labels'],
  ['nessuna deriva di camera', 'no camera-height drift'],
  ['risoluzione di output', '8192'],
];

for (const [label, needle] of REQUIRED_IN_ROTATION) {
  check(rot.includes(needle), label);
}

// §24.2 — la lista di consistenza assoluta, tutte e dodici le voci.
const CONSISTENCY = [
  'same anatomy and proportions',
  'same facial identity',
  'same haircut and bleach state',
  'same eyewear',
  'same outfit / fashion solution',
  'same accessories',
  'same wings / tail / horns / appendages',
  'same Colour DNA',
  'same materials / Appearance',
  'same neutral reference pose',
  'same image scale and anchor',
];
check(
  CONSISTENCY.every((c) => rot.includes(c)),
  'lista di consistenza assoluta completa (§24.2)',
  `${CONSISTENCY.filter((c) => rot.includes(c)).length}/${CONSISTENCY.length}`,
);

/* --- §24.4: forma del manifest --------------------------------------------- */

console.log('\nMANIFEST (§24.4)');

const rotEntry = manifest.assets.find((a) => a.asset_id === 'rotation_01');
check(rotEntry?.type === 'sprite_rotation', 'type = sprite_rotation');
check(rotEntry?.frames === 8, 'frames = 8');
check(rotEntry?.columns === 8 && rotEntry?.rows === 1, 'columns = 8, rows = 1');
check(
  JSON.stringify(rotEntry?.sequence_degrees) === JSON.stringify([0, 45, 90, 135, 180, 225, 270, 315]),
  'sequence_degrees corretta',
);
check(rotEntry?.anchor === 'bottom-center', 'anchor = bottom-center');
check(rotEntry?.background === 'transparent', 'background = transparent');
check(rotEntry?.interaction === 'horizontal-drag', 'interaction = horizontal-drag');
check(Array.isArray(rotEntry?.usage) && rotEntry.usage.length > 0, 'usage popolato');
check(manifest.assets.length === 7, 'sette tipi di asset canonici (§23)', `${manifest.assets.length}`);

/* --- §13 / §21.1: contratto dei Character Data ----------------------------- */

console.log('\nCHARACTER DATA (§13, §21.1)');

const data = JSON.parse(files.find((f) => f.name === '00_CHARACTER_DATA.json').content);

const REQUIRED_FIELDS = [
  'name', 'family', 'familyArchetype', 'role', 'fashion', 'affinity', 'mood',
  'size', 'characterDna', 'appearance', 'rarity', 'colorDna', 'voiceDna',
  'mindlineNodeId', 'originNodeId', 'heritage', 'assetStatus',
];
const missing = REQUIRED_FIELDS.filter((f) => !(f in data));
check(missing.length === 0, 'campi minimi di §21.1 presenti', missing.join(', ') || 'tutti');

// §13 SUPERSEDING RULE — campi fantasy espressamente vietati.
const FORBIDDEN = ['species', 'class', 'protector', 'seraphim', 'element', 'tier'];
const found = FORBIDDEN.filter((f) => f in data);
check(found.length === 0, 'nessun campo vietato da §13', found.join(', ') || 'nessuno');

check(
  data.heritage.length >= 1 && data.heritage.length <= 3,
  'heritage fra 1 e 3 tratti (§7.3)',
  `${data.heritage.length}`,
);
check(
  data.heritage.every((h) => h.origin && h.transformed && h.origin !== h.transformed),
  'ogni tratto è tradotto, non copiato (§7.3)',
);
check(
  Object.values(data.assetStatus).every((s) => s === 'waiting'),
  'nasce con tutti gli slot asset vuoti (§21.2)',
);

/* --- Esito ------------------------------------------------------------------ */

console.log(
  failures === 0
    ? '\n✓ Pacchetto conforme.\n'
    : `\n✗ ${failures} controlli falliti.\n`,
);
process.exit(failures === 0 ? 0 : 1);
