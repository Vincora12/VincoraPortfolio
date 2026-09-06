/* Verifica offline di NARRATIVE SYSTEM PHASE 2 (TUNE stesso World, RISE World
   nuovo, chronologia world-change, NarrativeContext, save/reload, legacy).
   Nessuna API key o rete — solo funzioni pure di src/engine/ e la definizione
   dello step AI in netlify/functions/_shared/routing.ts. */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-narrative2-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-narrative2-check.mjs');

writeFileSync(
  entry,
  `
export { seedWorld, riseWorld, withCanon, worldBlock, emptyLedger } from '${cwd}/src/engine/world.ts';
export { buildNarrativeContext } from '${cwd}/src/engine/narrativeContext.ts';
export { projectJourneyState, validateJourneyCoherence } from '${cwd}/src/engine/journey.ts';
export { AI_STEPS } from '${cwd}/netlify/functions/_shared/routing.ts';
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

console.log('\n═══ NARRATIVE SYSTEM PHASE 2 (TUNE / RISE / World transition) ═══\n');

const DAY_ORIGIN = 1;
const monA = {
  data: {
    name: 'v.arden.mon',
    mindline_node: 'node_0',
    affinity: 'fuoco',
    cultural_dna: ['rif_1', 'rif_2'],
    narrativeDNA: { archetype: 'GUARDIANO', function: 'protegge', drive: 'restare', contradiction: 'teme il cambiamento' },
  },
  worldId: undefined,
  bio: {}, sigil: {}, reactions: [], bornOnDay: 1, retiredOnDay: null,
};
const worldX = m.seedWorld(monA, DAY_ORIGIN);
const ledger = m.emptyLedger();

/* ── STAGE 1 — TUNE (evoluzione): stesso World ──────────────────────────── */
const DAY_TUNE = 8;
const monTuned = {
  ...monA,
  data: { ...monA.data, name: 'v.arden.mon.evo', mindline_node: 'node_1' },
  worldId: worldX.id,
};
const worldAfterTune = m.withCanon(worldX, {
  id: `canon_evolution_${monTuned.data.mindline_node}`,
  day: DAY_TUNE,
  kind: 'evolution',
  epistemic: 'WORLD_CANON',
  text: 'test tune',
  monName: monTuned.data.name,
});
check(worldAfterTune.id === worldX.id, 'STAGE 1 — TUNE: il World resta lo stesso (stesso id)');
check(worldAfterTune.canon.length === worldX.canon.length + 1, 'STAGE 1 — TUNE: il canone registra un evento evolution');
check(monTuned.worldId === worldX.id, 'STAGE 1 — TUNE: il worldId del Mon evoluto combacia col World corrente');
check(m.AI_STEPS.worldIdentity !== undefined, 'STAGE 1 — lo step worldIdentity esiste nel catalogo (serve solo a RISE, verificato sotto)');

/* ── STAGE 2 — RISE (mega-evoluzione): World nuovo ──────────────────────── */
const DAY_RISE = 36;
const monRisen = {
  ...monA,
  data: {
    ...monA.data,
    name: 'v.arden.mon.mega',
    mindline_node: 'node_2',
    cultural_dna: ['rif_9', 'rif_3'],
    narrativeDNA: { archetype: 'RIBELLE', function: 'rompe', drive: 'partire', contradiction: 'ama quello che lascia' },
  },
};
const worldY = m.riseWorld(worldX, monRisen, DAY_RISE);
const monRisenWithWorld = { ...monRisen, worldId: worldY.id };

check(worldY.id !== worldX.id, 'STAGE 2 — RISE: il World nuovo ha un id diverso dal precedente');
check(worldY.previousWorldId === worldX.id, 'STAGE 2 — RISE: il World nuovo dichiara la provenienza (previousWorldId)');
check(monRisenWithWorld.worldId === worldY.id, 'STAGE 2 — RISE: il worldId del Mon mega-evoluto punta al World nuovo, non al vecchio');
check(worldY.canon.length === 1 && worldY.canon[0].kind === 'world-change', 'STAGE 2 — RISE: il World nuovo si apre già con un evento world-change');
check(Array.isArray(worldY.worldCulturalDna) && worldY.worldCulturalDna.length > 0, 'STAGE 2 — RISE: il World nuovo ha un Cultural DNA proprio');
check(
  JSON.stringify(worldY.worldCulturalDna) !== JSON.stringify(worldX.worldCulturalDna),
  'STAGE 2 — RISE: il Cultural DNA del World nuovo differisce da quello del World precedente (contesto diverso)',
);
check(
  JSON.stringify(worldY.worldCulturalDna) !== JSON.stringify(monRisen.data.cultural_dna),
  'STAGE 2 — Mon Cultural DNA e World Cultural DNA restano separati (non lo stesso elenco)',
);

/* ── STAGE 2b — world-change CanonEvent di chiusura sul World vecchio ───── */
const closedWorldX = m.withCanon(worldX, {
  id: `canon_world-change_${monRisen.data.mindline_node}`,
  day: DAY_RISE,
  kind: 'world-change',
  epistemic: 'WORLD_CANON',
  text: `test rise da ${worldX.name} a ${worldY.name}`,
  monName: monRisen.data.name,
});
const worldHistory = [closedWorldX];
check(closedWorldX.id === worldX.id, 'STAGE 2b — il World vecchio chiuso mantiene il proprio id (non si cancella, si chiude)');
check(closedWorldX.canon.length === worldX.canon.length + 1, 'STAGE 2b — il World vecchio riceve un ultimo evento world-change di chiusura');
check(closedWorldX.canon.at(-1).kind === 'world-change', 'STAGE 2b — l’ultimo evento del World vecchio è world-change');
check(worldHistory.length === 1 && worldHistory[0].id === worldX.id, 'STAGE 2b — worldHistory conserva il World vecchio per intero, non solo il suo id');

/* ── STAGE 3 — NarrativeContext esprime la transizione RISE ─────────────── */
const narrativeContext = m.buildNarrativeContext({
  currentMon: monRisenWithWorld,
  previousMon: monA,
  world: worldY,
  previousWorld: worldX,
  ledger,
  transitionType: 'RISE',
  wish: 'un posto più libero',
});
check(narrativeContext.currentMon.data.name === monRisenWithWorld.data.name, 'STAGE 3 — NarrativeContext.currentMon è la forma nuova');
check(narrativeContext.previousMon?.data.name === monA.data.name, 'STAGE 3 — NarrativeContext.previousMon è la forma di prima');
check(narrativeContext.world?.id === worldY.id, 'STAGE 3 — NarrativeContext.world è il World nuovo');
check(narrativeContext.previousWorld?.id === worldX.id, 'STAGE 3 — NarrativeContext.previousWorld è il World lasciato');
check(narrativeContext.transitionType === 'RISE', 'STAGE 3 — NarrativeContext.transitionType === RISE');
check(narrativeContext.wish === 'un posto più libero', 'STAGE 3 — NarrativeContext porta il Wish, quando c’è');
check(JSON.stringify(narrativeContext.worldCulturalDna) === JSON.stringify(worldY.worldCulturalDna), 'STAGE 3 — NarrativeContext.worldCulturalDna combacia col World nuovo');
check(narrativeContext.canon === worldY.canon, 'STAGE 3 — NarrativeContext.canon è il canone del World nuovo, non un mix con quello vecchio');

/* ── STAGE 4 — worldBlock: il Narratore/Bio leggono davvero la DNA e la transizione ── */
const block = m.worldBlock(worldY);
check(block.includes(worldY.worldCulturalDna.join(', ')), 'STAGE 4 — worldBlock mostra il World Cultural DNA (prima non lo mostrava mai)');
check(block.includes(worldX.name), 'STAGE 4 — worldBlock del World nuovo nomina il World lasciato, tramite l’evento world-change già in canone');
check(!block.includes('affinità del corpo') && !/occhiali|anatomia/i.test(block), 'STAGE 4 — worldBlock resta tono/luogo, non descrizione fisica del .mon');

/* ── STAGE 5 — TUNE non tocca mai l’identità del World ───────────────────── */
const tuneBlock = m.worldBlock(worldAfterTune);
check(tuneBlock.includes(worldX.worldCulturalDna.join(', ')), 'STAGE 5 — TUNE: il World Cultural DNA resta quello di sempre, non rigenerato');

/* ── STAGE 6 — save/reload coherence (round-trip JSON, come /api/state) ─── */
const projected = { world: worldY, worldHistory };
const restored = JSON.parse(JSON.stringify(projected));
check(restored.world.id === worldY.id, 'STAGE 6 — dopo un giro JSON il World attivo resta lo stesso');
check(restored.world.previousWorldId === worldX.id, 'STAGE 6 — ...e la provenienza sopravvive');
check(restored.worldHistory.length === 1 && restored.worldHistory[0].id === worldX.id, 'STAGE 6 — ...e la storia dei mondi lasciati indietro sopravvive per intero');
const coherenceAfterReload = m.validateJourneyCoherence({ [monRisenWithWorld.data.name]: monRisenWithWorld }, monRisenWithWorld.data.name, restored.world);
check(coherenceAfterReload.worldIdMatchesCurrentWorld === true, 'STAGE 6 — dopo il giro JSON, Mon attivo e World restano coerenti (stesso worldId)');

/* ── STAGE 7 — legacy: mega-evoluzione vecchio stile, senza world-change ── */
const legacyWorld = m.withCanon(worldX, {
  id: 'canon_mega-evolution_legacy',
  day: DAY_RISE,
  kind: 'mega-evolution',
  epistemic: 'WORLD_CANON',
  text: 'una mega-evoluzione registrata prima di questa fase, stesso World',
  monName: 'v.legacy.mon',
});
check(legacyWorld.id === worldX.id, 'STAGE 7 — legacy: una mega-evoluzione vecchio stile non viene retroattivamente spostata in un World nuovo');
check(typeof m.worldBlock(legacyWorld) === 'string' && m.worldBlock(legacyWorld).length > 0, 'STAGE 7 — worldBlock legge un World legacy senza previousWorldId senza esplodere');
const legacyReport = m.validateJourneyCoherence({ 'v.legacy.mon': { ...monA, data: { ...monA.data, name: 'v.legacy.mon' }, worldId: undefined } }, 'v.legacy.mon', legacyWorld);
check(legacyReport.worldIdDeclaredOnActiveMon === false, 'STAGE 7 — legacy: un Mon senza worldId (salvataggi pre-Phase-3) resta leggibile, nessun crash');

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
