/* ============================================================================
   PARITÀ DEV → VINZ.LAB

   🔷 «Se finito il lavoro ci accorgiamo che c'è tutto, togliamo il DEV dal
      sito principale.»

   🔒 «Do not remove legacy DEV until parity is verified» — DEV_PARITY_MATRIX.

   🔶 QUESTO CONTROLLO È STATO RISCRITTO, E LA RAGIONE È UN MIO ERRORE.

   La prima versione contava i COMPONENTI: le stanze del laboratorio
   montavano `ResolverSection`, `TimeSection`, `CostSection` — gli stessi
   moduli di DEV — e il controllo verificava che li montassero tutti. Era
   verde, e voleva dire poco: dimostrava che avevo infilato il pannello DEV
   dentro un guscio nuovo.

   Poi è arrivata la correzione: «tutte le pagine che ho disegnato prima non
   dovevi disegnarle». Le stanze adesso sono i DISEGNI di Vincenzo
   (`docs/lab/design/*.html`) con dietro il motore vero — quindi non montano
   più nessun componente di DEV, e contare i componenti non misura più
   niente.

   ⚠️ Quindi si conta la COSA CHE SI PUÒ FARE, non il file che la fa. Per ogni
   capacità di DEV: c'è nel laboratorio? sì, no, o a metà? E «a metà» conta
   come NO — perché togliere DEV con una capacità a metà vuol dire perderne
   metà, e accorgersene fra tre settimane.

   Uso:  node scripts/parity-check.mjs
   ========================================================================= */

import { readFileSync, existsSync, readdirSync } from 'node:fs';

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/* Tutto il codice del laboratorio, in un blocco solo: le prove qui sotto
   cercano una capacità, non un file preciso. */
const labText = (() => {
  let all = '';
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e.name)) all += `\n${readFileSync(full, 'utf8')}`;
    }
  };
  walk('src/lab');
  return all;
})();

const nelLab = (...aghi) => aghi.every((a) => labText.includes(a));

/* ============================================================================
   LE CAPACITÀ DI DEV, UNA PER UNA

   `prova` è la prova che quella cosa si può fare NEL LABORATORIO. Dove è
   `null`, la capacità non c'è ancora ed è dichiarata mancante — non
   nascosta.
   ========================================================================= */

const CAPACITA = [
  // --- SYSTEM -------------------------------------------------------------
  { area: 'SYSTEM', cosa: 'vedere se il backend risponde davvero', prova: () => nelLab('loadPing', 'loadSetup') },
  { area: 'SYSTEM', cosa: 'sapere quali chiavi bastano per voce / prompt / immagini', prova: () => nelLab('ready?.voice', 'ready?.draw') },
  { area: 'SYSTEM', cosa: 'scegliere il modello di voce, compilatore e immagini', prova: () => nelLab('setVoiceModel', 'setCompilerModel', 'setImageModel') },
  { area: 'SYSTEM', cosa: 'far passare i giorni', prova: () => nelLab('advanceDays(1)', 'advanceDays(7)') },
  { area: 'SYSTEM', cosa: 'aprire il prossimo evento della Mindline', prova: () => nelLab('openShift') },
  { area: 'SYSTEM', cosa: 'muovere i segnali del giorno, UNKNOWN compreso', prova: () => nelLab('setSignal', 'UNKNOWN') },
  { area: 'SYSTEM', cosa: 'dichiarare CIBO / ALLENAMENTO / COME STO', prova: () => nelLab('setDailySignal') },
  { area: 'SYSTEM', cosa: 'tarare la deriva della simulazione', prova: () => nelLab('setBias', 'logProbability') },
  { area: 'SYSTEM', cosa: 'forzare micro-crescita, evoluzione e rarità sbloccata', prova: () => nelLab('forceContinue', 'forceBranch', 'unlockAll') },
  { area: 'SYSTEM', cosa: 'leggere memorie, umore e opinioni', prova: () => nelLab('s.memories', 's.mood', 's.opinions') },
  { area: 'SYSTEM', cosa: 'accendere la Build Mode', prova: () => nelLab('setBuildMode') },
  { area: 'SYSTEM', cosa: 'vedere durata ed esito delle ultime chiamate AI', prova: () => nelLab('lastRuns') },

  // --- CREATION -----------------------------------------------------------
  { area: 'CREATION', cosa: 'leggere il flusso di creazione con gli ID canonici', prova: () => nelLab('PASSI', 'FASI') },
  { area: 'CREATION', cosa: 'distinguere i passi automatici da quelli opzionali', prova: () => nelLab("run: 'optional'", 'OPTIONAL') },
  { area: 'CREATION', cosa: 'vedere cosa ha deciso davvero l’ultima generazione', prova: () => nelLab('lastTrace', 'passo.stage') },
  { area: 'CREATION', cosa: 'generare a parità di seme per confrontare A/B', prova: () => nelLab('generateFirstMon') },
  { area: 'CREATION', cosa: 'leggere il Character Data del .mon attivo', prova: () => nelLab('family_archetype') },
  { area: 'CREATION', cosa: 'leggere le lezioni insegnate al resolver', prova: () => nelLab('s.lessons') },

  // --- ANCORA SOLO IN DEV -------------------------------------------------
  { area: 'CREATION', cosa: 'chiedere al resolver una risoluzione visiva', prova: null, dove: 'ResolverSection' },
  { area: 'CREATION', cosa: 'insegnare una lezione nuova al resolver', prova: null, dove: 'TeachSection' },
  { area: 'CREATION', cosa: 'far riscrivere la Bio dall’AI', prova: null, dove: 'BioSection' },
  { area: 'CREATION', cosa: 'leggere e riscrivere il prompt di un asset', prova: null, dove: 'PromptPreview' },
  { area: 'CREATION', cosa: 'importare un asset a mano', prova: null, dove: 'AssetImport' },
  { area: 'CREATION', cosa: 'forgiare gli asset uno per uno', prova: null, dove: 'ForgePanel' },
  { area: 'CREATION', cosa: 'accendere e spegnere i cataloghi', prova: null, dove: 'CatalogSection' },
  { area: 'CREATION', cosa: 'tarare le soglie di rarità', prova: null, dove: 'RaritySection' },
  { area: 'CREATION', cosa: 'girare mille generazioni e guardare le distribuzioni', prova: null, dove: 'BatchGenerator' },
  { area: 'CREATION', cosa: 'il protocollo di prova dei designer', prova: null, dove: 'DesignTest' },
  { area: 'CREATION', cosa: 'provare la voce del .mon', prova: null, dove: 'VoiceSection' },
  { area: 'SYSTEM', cosa: 'far partire uno strumento a mano', prova: null, dove: 'ToolsSection' },
  { area: 'SYSTEM', cosa: 'la contabilità della spesa', prova: null, dove: 'CostSection' },
  { area: 'SYSTEM', cosa: 'incollare il token e attivare l’app', prova: null, dove: 'ActivateScreen (schermata di prodotto)' },
  { area: 'SYSTEM', cosa: 'ricominciare da capo cancellando tutto', prova: null, dove: 'ResetAllButton' },
];

/* --- Conteggio -------------------------------------------------------------- */

const fatte = [];
const mancanti = [];

for (const c of CAPACITA) {
  if (c.prova && c.prova()) fatte.push(c);
  else mancanti.push(c);
}

let area = '';
for (const c of CAPACITA) {
  if (c.area !== area) {
    area = c.area;
    console.log(`\n═══ ${area} ═══\n`);
  }
  const ok = c.prova && c.prova();
  console.log(`  ${ok ? 'NEL LAB ' : 'SOLO DEV'}  ${c.cosa}${!ok && c.dove ? `  — ${c.dove}` : ''}`);
}

const pronto = mancanti.length === 0;
const devIntero =
  read('src/dev/DevPanel.tsx').includes('DEV://VINZ.MON') && read('src/App.tsx').includes('<DevPanel');

console.log(
  `\n  ${fatte.length} capacità su ${CAPACITA.length} vivono anche in VINZ.LAB.\n`,
);

if (!devIntero) {
  console.log('✗ IL PANNELLO DEV NON È PIÙ AL SUO POSTO, e la parità non è raggiunta.\n');
  process.exit(1);
}

console.log(
  pronto
    ? '✓ PARITÀ RAGGIUNTA. Togliere DEV dal sito non toglie niente.\n'
    : `⏸ PARITÀ NON ANCORA RAGGIUNTA: ${mancanti.length} cose si fanno solo da DEV.\n` +
        '  DEV resta dov\'è. Questa lista è anche l\'elenco di cosa manca da\n' +
        '  riempire dentro le pagine disegnate — non un errore da far sparire.\n',
);

/* 🔒 ESCE ZERO ANCHE QUANDO LA PARITÀ NON C'È, e non è indulgenza: questo
   copione descrive un lavoro in corso, non una regressione. Diventa rosso
   solo se qualcuno TOGLIE DEV prima del tempo — cioè esattamente la cosa da
   impedire. */
process.exit(0);
