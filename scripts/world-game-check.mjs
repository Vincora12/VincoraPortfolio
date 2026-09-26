import { strict as assert } from 'node:assert';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'vinz-world-game-'));
const entry = join(dir, 'entry.ts');
const out = join(dir, 'entry.mjs');
writeFileSync(entry, `export * from '${process.cwd()}/src/engine/worldGame.ts';`);
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const game = await import(`file://${out}`);

const world = { id: 'world_NUL', name: 'NUL', description: 'Una spiaggia spoglia.', canon: [], inquiry: { question: 'Che cosa possiamo rendere possibile qui?' } };
const health = { history: [{ day: 1, stats: { FORM: 35, ATK: 85, SPD: 60, DEF: 50, REC: 40, CARE: 75 } }] };
const mon = { data: { name: 'test.mon', mindline_node: 'node_1' }, bornOnDay: 1 };
const profile = game.combatProfileFor(mon, health);
assert.equal(profile.ATK, 2);
assert.equal(profile.CARE, 1);
assert.equal(Object.values(profile).reduce((a, b) => a + b, 0), 3);
const unknown = game.combatProfileFor(mon, { history: [] });
assert.equal(Object.values(unknown).reduce((a, b) => a + b, 0), 3, 'unknown health does not weaken the Mon');

let quest = game.startWorldQuest('TUNE', world, mon, health, 1);
assert.equal(quest.status, 'investigate');
assert.equal(quest.foe.maxHp, 6);
const opening = game.questOpening(quest, world);
assert.match(opening, /^\*Sulla spiaggia di NUL, un abitante si ferma davanti a una striscia di Nebbia/);
assert.match(opening, /Veilborn della soglia/);
assert(opening.endsWith('*') && !/Potete parlare|zona del World|\n\n/.test(opening), 'quest opening stays one clear narrator paragraph');
const premature = game.resolveQuestTurn(quest, 'attack', 'early');
assert.equal(premature.quest.foe.hp, 6, 'Veilborn cannot be beaten before discovery');
quest = premature.quest;
assert.equal(game.resolveQuestTurn(quest, 'observe', 'clue1').quest.clues.length, 1);
quest = game.resolveQuestTurn(quest, 'observe', 'clue1').quest;
assert.equal(game.resolveQuestTurn(quest, 'talk', 'clue2').quest.status, 'combat');
quest = game.resolveQuestTurn(quest, 'talk', 'clue2').quest;
assert.equal(game.resolveQuestTurn(quest, 'attack', 'clue2'), null, 'same message cannot advance twice');
for (let i = 0; i < 40 && quest.status === 'combat'; i++) {
  quest = game.resolveQuestTurn(quest, i % 2 ? 'attack' : 'help', `fight-${i}`).quest;
}
assert(['complete', 'failed'].includes(quest.status), 'fight reaches an outcome');
if (quest.status === 'failed') {
  const retry = game.retryWorldQuest(quest);
  assert.equal(retry.attempt, 2);
  assert.equal(retry.foe.hp, retry.foe.maxHp);
  assert.equal(retry.monHp, retry.maxMonHp);
  assert.equal(retry.status, 'investigate');
} else {
  assert.equal(quest.foe.hp, 0);
  assert.equal(game.resolveQuestTurn(quest, 'attack', 'after-win'), null);
}
const rise = game.startWorldQuest('RISE', world, mon, health, 2);
assert(rise.foe.maxHp > 6 && rise.foe.atk > 1, 'RISE boss has its own stronger values');
const riseFirst = game.resolveQuestTurn(rise, 'observe', 'rise-observe').quest;
const riseSecond = game.resolveQuestTurn(riseFirst, 'talk', 'rise-talk').quest;
assert.equal(riseSecond.status, 'investigate', 'RISE has another linked scene before the final fight');
assert.match(riseSecond.lastOutcome, /serve ancora un indizio ottenuto in un altro modo/);
const riseThird = game.resolveQuestTurn(riseSecond, 'reposition', 'rise-reposition').quest;
assert.equal(riseThird.status, 'combat', 'RISE final fight opens after three different discoveries');
const arena = { ...riseThird, foe: { ...riseThird.foe }, profile: { FORM: 2, ATK: 0, SPD: 0, DEF: 0, REC: 0, CARE: 1 }, advantage: 0 };
const sampleDamage = (action, advantage) => Array.from({ length: 240 }, (_, index) => {
  const fresh = { ...arena, foe: { ...arena.foe }, advantage, lastMessageId: undefined };
  const result = game.resolveQuestTurn(fresh, action, `sample-${index}`);
  return fresh.foe.hp - result.quest.foe.hp;
});
const quick = sampleDamage('attack', 0);
const heavy = sampleDamage('power', 0);
const preparedHeavy = sampleDamage('power', 4);
assert(quick.includes(0) && quick.includes(2) && quick.includes(3), 'quick strike has misses, hits and strong hits');
assert(Math.max(...preparedHeavy) === 4 && preparedHeavy.some(damage => damage >= 3), 'prepared power strike reaches 3–4 HP');
assert(preparedHeavy.reduce((a, b) => a + b, 0) > heavy.reduce((a, b) => a + b, 0), 'preparation makes the power strike worthwhile');
const prepared = game.resolveQuestTurn(arena, 'adapt', 'adapt-opening').quest;
assert(prepared.advantage >= 4 && prepared.lastOutcome.includes('3–4 HP'), 'FORM prepares a visible heavy strike');
const charging = { ...arena, foe: { ...arena.foe }, foeCharging: true, profile: { ...arena.profile, SPD: 2 } };
let interrupted = null;
for (let index = 0; index < 240 && !interrupted; index++) {
  const result = game.resolveQuestTurn(charging, 'counter', `counter-${index}`).quest;
  if (result.foe.hp < charging.foe.hp) interrupted = result;
}
assert(interrupted && !interrupted.foeCharging && interrupted.monHp === charging.monHp, 'timed counter damages and cancels the charged enemy attack');
let guarded = null;
for (let index = 0; index < 240 && !guarded; index++) {
  const messageId = `guard-charge-${index}`;
  const exposed = game.resolveQuestTurn(charging, 'adapt', messageId).quest;
  const protectedTurn = game.resolveQuestTurn(charging, 'guard', messageId).quest;
  if (exposed.monHp < charging.monHp && protectedTurn.monHp > exposed.monHp) guarded = protectedTurn;
}
assert(guarded && guarded.advantage > 0, 'guard reduces a charged hit and builds a smaller opening');
let chargedHit = null;
for (let index = 0; index < 240 && !chargedHit; index++) {
  const fresh = { ...arena, turn: 4, foe: { ...arena.foe }, foeCharging: false };
  const loaded = { ...fresh, foeCharging: true };
  const messageId = `charged-damage-${index}`;
  const ordinary = game.resolveQuestTurn(fresh, 'attack', messageId).quest;
  const chargedResult = game.resolveQuestTurn(loaded, 'attack', messageId).quest;
  if (ordinary.monHp < fresh.monHp && chargedResult.monHp < loaded.monHp) chargedHit = { ordinary, chargedResult };
}
assert(chargedHit && chargedHit.chargedResult.monHp < chargedHit.ordinary.monHp, 'a charged enemy hit deals more damage than an ordinary hit');
const retreat = game.retryWorldQuest({ ...charging, status: 'failed', monHp: 0, advantage: 4, shield: 2 });
assert(retreat && retreat.advantage === 0 && retreat.shield === 0 && !retreat.foeCharging, 'retry clears tactical state');

console.log('World game checks: PASS');
