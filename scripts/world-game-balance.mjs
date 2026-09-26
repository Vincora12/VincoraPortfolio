import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Run from the repository root: node scripts/world-game-balance.mjs [trials]
// Real engine, seeded message ids, three builds, three repeatable player styles.
const trials = Number(process.argv[2] ?? 2000);
if (!Number.isInteger(trials) || trials < 100 || trials > 100000) throw new Error('trials deve essere tra 100 e 100000');
const dir = mkdtempSync(join(tmpdir(), 'vinz-combat-balance-'));
let game;
try {
  const entry = join(dir, 'entry.ts');
  const outfile = join(dir, 'engine.mjs');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(entry, `export * from '${process.cwd()}/src/engine/worldGame.ts';`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
  game = await import(`file://${outfile}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const world = { id: 'world_NUL', name: 'NUL', canon: [], inquiry: { question: 'Che cosa accade qui?' } };
const builds = {
  forma: { FORM: 2, CARE: 1, ATK: 0, SPD: 0, DEF: 0, REC: 0 },
  attacco: { FORM: 0, CARE: 1, ATK: 2, SPD: 0, DEF: 0, REC: 0 },
  difesa: { FORM: 0, CARE: 0, ATK: 0, SPD: 1, DEF: 2, REC: 0 },
};
function choice(quest, style) {
  if (style === 'solo attacco') return 'attack';
  if (style === 'colpo senza preparazione') return 'power';
  if (quest.foeCharging) return 'counter';
  if (quest.monHp <= 3 && !quest.recovered) return 'recover';
  if (quest.advantage > 0) return 'power';
  return quest.profile.FORM >= quest.profile.CARE && quest.profile.FORM >= quest.profile.SPD
    ? 'adapt' : quest.profile.SPD > quest.profile.CARE ? 'reposition' : 'help';
}
function simulate(kind, profile, style) {
  let wins = 0, turns = 0, survivingHp = 0, unresolved = 0;
  for (let index = 0; index < trials; index++) {
    const mon = { data: { mindline_node: `balance_${index}` }, bornOnDay: 1, combatProfile: profile };
    let quest = game.startWorldQuest(kind, world, mon, { history: [] }, 1);
    quest.status = 'combat';
    quest.advantage = 2; // Reward for the clues that opened the battle.
    for (let turn = 1; turn <= 40 && quest.status === 'combat'; turn++) {
      const result = game.resolveQuestTurn(quest, choice(quest, style), `balance-turn-${turn}`);
      if (!result) throw new Error('Turn rejected unexpectedly');
      quest = result.quest;
    }
    if (quest.status === 'complete') { wins++; survivingHp += quest.monHp; }
    if (quest.status === 'combat') unresolved++;
    turns += quest.turn;
  }
  if (unresolved) throw new Error(`${unresolved} fights did not resolve in 40 turns`);
  return { quest: kind, build: Object.entries(builds).find(([, value]) => value === profile)?.[0], style,
    winPercent: +(100 * wins / trials).toFixed(1), averageTurns: +(turns / trials).toFixed(1),
    averageWinningHp: wins ? +(survivingHp / wins).toFixed(1) : 0 };
}
const results = [];
for (const kind of ['TUNE', 'RISE']) {
  for (const profile of Object.values(builds)) {
    for (const style of ['solo attacco', 'colpo senza preparazione', 'tattico']) {
      results.push(simulate(kind, profile, style));
    }
  }
}
console.log(`Combattimenti simulati: ${trials} per scenario, motore reale, semi ripetibili`);
console.table(results);
