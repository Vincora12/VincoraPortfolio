/* Verifica offline del boundary Journey (CORE EXTRACTION PHASE 3: Mon State + World + Story
   Ledger). Nessuna API key o rete — solo funzioni pure di src/engine/. */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-journey-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-journey-check.mjs');

writeFileSync(
  entry,
  `
export { resolveActiveMon, validateJourneyCoherence, projectJourneyState } from '${cwd}/src/engine/journey.ts';
export { seedWorld, withCanon, worldBlock, emptyLedger } from '${cwd}/src/engine/world.ts';
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

console.log('\n═══ JOURNEY BOUNDARY (Mon State + World + Story Ledger) ═══\n');

const NOW_DAY = 12;
const monA = {
  data: { name: 'v.arden.mon', mindline_node: 'node_0', affinity: 'fuoco' },
  worldId: undefined,
  bio: {}, sigil: {}, reactions: [], bornOnDay: 1, retiredOnDay: null,
};
const world = m.seedWorld(monA, 1);
const monAWithWorld = { ...monA, worldId: world.id };
const mons = { [monAWithWorld.data.name]: monAWithWorld };
const ledger = m.emptyLedger();

// ── resolveActiveMon ────────────────────────────────────────────────────
check(m.resolveActiveMon(mons, 'v.arden.mon')?.data.name === 'v.arden.mon', 'un nome attivo valido risolve al record giusto');
check(m.resolveActiveMon(mons, null) === null, 'nessun nome attivo → null, onestamente');
check(m.resolveActiveMon(mons, 'v.ghost.mon') === null, 'un nome attivo che non esiste in mons → null, non un errore silenzioso');

// ── STAGE 1 — active Mon ────────────────────────────────────────────────
const coherentReport = m.validateJourneyCoherence(mons, 'v.arden.mon', world);
check(coherentReport.activeMonResolved === true, 'STAGE 1 — Mon attivo valido risolve correttamente');
check(coherentReport.issues.length === 0, 'STAGE 1 — nessun problema quando Mon/World sono coerenti');

const danglingReport = m.validateJourneyCoherence(mons, 'v.ghost.mon', world);
check(danglingReport.activeMonResolved === false, 'STAGE 1 — un activeMonName senza record viene segnalato, non nascosto');
check(danglingReport.issues.some((i) => i.includes('v.ghost.mon')), 'STAGE 1 — il problema nomina il Mon mancante');

// ── STAGE 2 — World link ────────────────────────────────────────────────
check(coherentReport.worldIdDeclaredOnActiveMon === true && coherentReport.worldIdMatchesCurrentWorld === true, 'STAGE 2 — worldId del Mon attivo combacia col World corrente');

const otherWorld = m.seedWorld({ ...monA, data: { ...monA.data, mindline_node: 'node_9' } }, 5);
const mismatchReport = m.validateJourneyCoherence(mons, 'v.arden.mon', otherWorld);
check(mismatchReport.worldIdMatchesCurrentWorld === false, 'STAGE 2 — un worldId che non combacia col World corrente viene rilevato');
check(mismatchReport.issues.some((i) => i.includes('non combacia')), 'STAGE 2 — il disallineamento è nella lista dei problemi, non solo nel booleano');

const noWorldIdMon = { ...monA, worldId: undefined };
const noIdReport = m.validateJourneyCoherence({ [noWorldIdMon.data.name]: noWorldIdMon }, noWorldIdMon.data.name, world);
check(noIdReport.worldIdDeclaredOnActiveMon === false && noIdReport.worldIdMatchesCurrentWorld === 'not-applicable', 'STAGE 2 — un Mon senza worldId (oggi: ogni forma evoluta) non produce un falso disallineamento');

// ── STAGE 3 — legacy World fallback ─────────────────────────────────────
const noActiveReport = m.validateJourneyCoherence(mons, null, null);
check(noActiveReport.issues.length === 0, 'STAGE 3 — nessun Mon attivo e nessun World: stato di partenza legittimo, non un errore');
const preWorldReport = m.validateJourneyCoherence(mons, 'v.arden.mon', null);
check(preWorldReport.activeMonWithoutWorld === true, 'STAGE 3 — Mon attivo senza World viene segnalato per consapevolezza...');
check(m.worldBlock(null).includes('NESSUN MONDO ANCORA'), 'STAGE 3 — ...ed è esattamente il caso che worldBlock(null) gestisce già onestamente, non un fallback nuovo');

// ── STAGE 4 — TUNE (evoluzione): stesso World, canone aggiornato ───────
const beforeTune = world.canon.length;
const afterTune = m.withCanon(world, { id: 'canon_evolution_test', day: NOW_DAY, kind: 'evolution', epistemic: 'WORLD_CANON', text: 'test', monName: 'v.arden.mon' });
check(afterTune.id === world.id, 'STAGE 4 — TUNE (evoluzione): il World resta lo stesso — stesso id');
check(afterTune.canon.length === beforeTune + 1, 'STAGE 4 — TUNE: il canone registra l’evento');

// ── STAGE 5 — RISE (mega-evoluzione): verificato contro il codice reale ─
const afterRise = m.withCanon(world, { id: 'canon_mega_test', day: NOW_DAY, kind: 'mega-evolution', epistemic: 'WORLD_CANON', text: 'test', monName: 'v.arden.mon' });
check(
  afterRise.id === world.id,
  'STAGE 5 — RISE (mega-evoluzione) nel codice REALE (store.ts:revealFormEvolution chiama esattamente withCanon, mai seedWorld, per entrambi i job.kind): il World NON cambia id — discrepanza rispetto all’assunzione "RISE = nuovo World", documentata come tale, non corretta qui',
);

// ── STAGE 6 — save/reload coherence (round-trip JSON, come /api/state) ──
const projected = m.projectJourneyState({ mons, activeMonName: 'v.arden.mon', world, ledger });
const restored = JSON.parse(JSON.stringify(projected));
const restoredReport = m.validateJourneyCoherence({ [restored.activeMon.data.name]: restored.activeMon }, restored.activeMon.data.name, restored.world);
check(restored.activeMon.data.name === projected.activeMon.data.name, 'STAGE 6 — dopo un giro JSON (come /api/state) il Mon attivo resta lo stesso');
check(restored.world.id === projected.world.id, 'STAGE 6 — ...e anche il World');
check(restoredReport.issues.length === coherentReport.issues.length, 'STAGE 6 — la coerenza dopo il giro JSON è la stessa di prima — non solo bytes identici, la stessa relazione');

// ── STAGE 7 — Story Ledger separation ───────────────────────────────────
check(!('monName' in ledger) && !('kind' in ledger), 'STAGE 7 — lo Story Ledger (motivi/fili/setup) non ha la forma di AppState.memories — non sono lo stesso archivio');
check(Array.isArray(projected.ledger.setups) && Array.isArray(projected.world.canon), 'STAGE 7 — la proiezione espone Ledger (craft narrativo) e World.canon (cronologia) come due cose distinte, non fuse in una');
check(JSON.stringify(projected).length < JSON.stringify({ mons, activeMonName: 'v.arden.mon', world, ledger, extraneousAppStateField: 'x'.repeat(1000) }).length, 'STAGE 7 — la proiezione è più piccola dell’AppState opaco intero — non lo sostituisce');

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
