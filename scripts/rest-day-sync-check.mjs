/* Verifica offline che un giorno di riposo dichiarato conti per SYNC quanto un
   allenamento vero, e che un giorno davvero vuoto non ne approfitti (V1 SMALL
   FIXES — REST DAY SYNC). Usa le funzioni pure reali di engine/progression.ts,
   non una reimplementazione. Nessuna API key o rete. */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-rest-sync-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-rest-sync-check.mjs');

writeFileSync(
  entry,
  `
export { emptyDay, canCloseDay, knownSignals, isSignalKnown, DAILY_SIGNALS } from '${cwd}/src/engine/progression.ts';
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

console.log('\n═══ REST DAY → SYNC (engine/progression.ts, il vero cancello di canCloseDay) ═══\n');

const withSignals = (day, signals) => ({ ...day, signals: { ...day.signals, ...signals } });

// ── TEST 1 — "Riposo": FOOD+MOOD noti, WORKOUT NOT_APPLICABLE ──────────────
const restDay = withSignals(m.emptyDay(1), {
  FOOD: { status: 'KNOWN', note: 'pranzo leggero' },
  MOOD: { status: 'KNOWN', note: 'CALM' },
  WORKOUT: { status: 'NOT_APPLICABLE', note: 'riposo dichiarato' },
});
check(m.canCloseDay(restDay), 'TEST 1 — un giorno di riposo dichiarato (WORKOUT: NOT_APPLICABLE) chiude e conta per SYNC');
check(m.knownSignals(restDay) === m.DAILY_SIGNALS.length, 'TEST 1 — tutti e tre i segnali sono "noti" — NOT_APPLICABLE è noto quanto KNOWN, non un buco');

// ── TEST 2 — stesso esito per un testo di recupero diverso, stessa strada ──
const recoveryDay = withSignals(m.emptyDay(2), {
  FOOD: { status: 'KNOWN', note: 'pasti registrati' },
  MOOD: { status: 'KNOWN', note: 'STANCO' },
  WORKOUT: { status: 'NOT_APPLICABLE', note: 'giornata di recupero, niente allenamento' },
});
check(m.canCloseDay(recoveryDay), 'TEST 2 — "giornata di recupero" passa dallo stesso segnale NOT_APPLICABLE e chiude allo stesso modo');

// ── TEST 3 — un allenamento vero chiude comunque (nessuna regressione) ────
const workoutDay = withSignals(m.emptyDay(3), {
  FOOD: { status: 'KNOWN', note: 'pasti registrati' },
  MOOD: { status: 'KNOWN', note: 'ENERGICO' },
  WORKOUT: { status: 'KNOWN', note: '40 minuti di yoga' },
});
check(m.canCloseDay(workoutDay), 'TEST 3 — un allenamento vero (WORKOUT: KNOWN) continua a chiudere il giorno, nessuna regressione');

// ── TEST 4 — ambiguo: nessun segnale scritto, il giorno non chiude solo per questo ──
const ambiguousDay = withSignals(m.emptyDay(4), {
  FOOD: { status: 'KNOWN', note: 'pasti registrati' },
  MOOD: { status: 'KNOWN', note: 'NEUTRO' },
  // WORKOUT resta UNKNOWN: un esito "ambiguous" non scrive nessun segnale.
});
check(!m.canCloseDay(ambiguousDay), 'TEST 4 — un esito ambiguo non scrive WORKOUT: il giorno resta aperto, nessun credito SYNC inventato');
check(m.knownSignals(ambiguousDay) === 2, 'TEST 4 — restano esattamente due segnali noti su tre, non tre');

// ── TEST 5 — un giorno completamente non registrato non chiude da solo ────
const emptyDay = m.emptyDay(5);
check(!m.canCloseDay(emptyDay), 'TEST 5 — un giorno vuoto (nessun segnale) non riceve SYNC solo perché il supporto al riposo esiste');
check(m.knownSignals(emptyDay) === 0, 'TEST 5 — zero segnali noti su un giorno mai toccato');

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
