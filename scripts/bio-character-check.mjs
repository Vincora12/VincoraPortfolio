import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const source = execFileSync('git', ['show', '267768997723c46c1d021add3b8e69c77faba9b1:src/engine/characterGenerator.ts'], { encoding: 'utf8' });
const entry = `export { generateFirstMon, generateMon } from './src/engine/characterGenerator';
export { neutralPersonality, EMPTY_NOVELTY } from './src/engine/signals';
export { initialHealthState } from './src/engine/health';
export { generateCharacterBio, hasPhysicalBioDescription } from './src/engine/characterBio';
export { bioFactsOf, BIO_RULES } from './src/ai/bioWriter';`;
async function load(baseline) {
  const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', write: false,
    plugins: baseline ? [{ name: 'visual-baseline', setup(build) {
      build.onLoad({ filter: /src\/engine\/characterGenerator\.ts$/ }, () => ({ contents: source, loader: 'ts' }));
    } }] : [] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const before = await load(true); const after = await load(false);
const input = { day: 12, health: after.initialHealthState(), personality: after.neutralPersonality(), moodHistory: [], cultural: {}, novelty: after.EMPTY_NOVELTY,
  mindlineDepth: 0, bond: 10, dataConfidence: 0, activeDays: 1, branchCount: 0 };
let record;
for (let seed = 1; seed <= 40; seed++) {
  const ctx = { input, mindlineNodeId: 'node_test', originNodeId: null, lineageNames: [], seed };
  const oldResult = before.generateFirstMon(ctx); const newResult = after.generateFirstMon(ctx);
  const { bio: oldBio, ...oldRecord } = oldResult.record;
  const { bio, ...newRecord } = newResult.record;
  assert.deepEqual(newRecord, oldRecord, `visual/voice/sigil/reactions data unchanged for seed ${seed}`);
  assert.deepEqual(newResult.trace, oldResult.trace, `creation trace unchanged for seed ${seed}`);
  assert.equal(after.hasPhysicalBioDescription([bio.story, ...bio.annotations, ...bio.rememberedDetails].join(' ')), false);
  assert.notEqual(bio.story, oldBio.story);
  record = newResult.record;
}
const legacy = { ...record, data: { ...record.data, cultural_dna: undefined, heritage_traits: [] } };
assert.ok(after.generateCharacterBio(legacy.data).story.length > 40);
const poisoned = { ...record, bio: { ...record.bio, story: 'PHYSICAL_SENTINEL' }, data: { ...record.data,
  appearance: 'PHYSICAL_SENTINEL', eyewear: { description: 'PHYSICAL_SENTINEL' }, character_dna: { ...record.data.character_dna, anatomical_gimmick: 'PHYSICAL_SENTINEL', body_language: 'PHYSICAL_SENTINEL', silhouette_quirk: 'PHYSICAL_SENTINEL' },
  heritage_traits: [{ from_mon: 'OLD.mon', transformed: 'PHYSICAL_SENTINEL' }] } };
assert.equal(after.bioFactsOf(poisoned).includes('PHYSICAL_SENTINEL'), false, 'no physical or old bio inputs reach writer');
assert.equal(after.hasPhysicalBioDescription('Ho gli occhi verdi e capelli blu.'), true);
assert.equal(after.hasPhysicalBioDescription('Mi piacciono la musica elettronica e il design industriale.'), false);
assert.match(after.BIO_RULES, /NON descrivere MAI aspetto fisico/);
console.log('PASS: 40 seeds identical visual CharacterData/voice/sigil/reactions/trace; only Bio changes. Nonphysical fallback, legacy data, writer physical-input exclusion and output guard. No AI call.');
