/* ============================================================================
   AUDIT DELLE DECISIONI PRESE

   Ogni decisione di prodotto che abbiamo preso in conversazione diventa qui
   un controllo automatico. Serve a rispondere a una domanda precisa —
   «sei sicuro che le cose di prima ci siano ancora?» — senza doversi fidare
   della memoria di nessuno, né mia né del documento.

   È diverso dagli altri tre controlli:
   • `verify`        percorre l'app e guarda che non esploda
   • `verify:batch`  interroga il motore di generazione
   • `verify:package` controlla il pacchetto asset
   • **questo**      controlla che le DECISIONI siano ancora nel codice

   Un controllo qui fallisce quando qualcuno rimette una cosa che avevamo
   tolto, o toglie una cosa che avevamo messo. È l'unico modo di accorgersene
   in una sessione lunga.

   Uso:  node scripts/feature-check.mjs
   ========================================================================= */

import { readFileSync, existsSync } from 'node:fs';

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

let failures = 0;
const results = [];

/**
 * @param {string} area
 * @param {string} label   cosa deve essere vero
 * @param {boolean} ok
 * @param {string} [detail]
 */
function check(area, label, ok, detail = '') {
  results.push({ area, label, ok, detail });
  if (!ok) failures++;
}

const has = (file, needle) => (read(file) ?? '').includes(needle);
const lacks = (file, needle) => !(read(file) ?? '').includes(needle);
const count = (file, re) => ((read(file) ?? '').match(re) ?? []).length;

/* ============================================================================
   Separazione fra testo di interfaccia e testo dei prompt

   È la distinzione più facile da rompere per sbaglio, perché i due testi
   descrivono la stessa cosa: le rese italiane (`it`) parlano all'utente e
   possono essere evocative; i campi `effect` / `language` / `translation`
   vanno nei prompt immagine e DEVONO restare descrittivi e visivi.
   ========================================================================= */

const FRAGMENTS = 'src/assets-pipeline/fragments.ts';

check(
  'COPY / PROMPT',
  'nessuna resa italiana finisce nei prompt immagine',
  count(FRAGMENTS, /\.it\b/g) === 0,
  'i prompt devono usare effect / language / translation',
);
check('COPY / PROMPT', 'i prompt di Affinity usano `effect`', has(FRAGMENTS, 'a.effect'));
check('COPY / PROMPT', 'i prompt di Fashion usano `language`', has(FRAGMENTS, 'f.language'));
check('COPY / PROMPT', 'i prompt di Role usano `translation`', has(FRAGMENTS, 'r.translation'));

/* I campi visivi devono restare pieni di sostantivi concreti: sono quelli che
   il modello di immagini legge. Un `effect` accorciato a una frase evocativa
   sarebbe una regressione silenziosa. */
const CONFIG = 'src/engine/generation-config.ts';
const effects = [...(read(CONFIG) ?? '').matchAll(/effect: '([^']+)'/g)].map((m) => m[1]);
check(
  'COPY / PROMPT',
  'le descrizioni visive delle Affinity sono ancora concrete',
  effects.length >= 16 && effects.every((e) => e.length > 40),
  `${effects.length} descrizioni, la più corta ${Math.min(...effects.map((e) => e.length))} caratteri`,
);

/* ============================================================================
   Modello di progressione — SYNC
   ========================================================================= */

const STORE = 'src/state/store.ts';

check('SYNC', '`economy.ts` non esiste più', !existsSync('src/engine/economy.ts'));
check('SYNC', '`progression.ts` è la fonte', existsSync('src/engine/progression.ts'));
check(
  'SYNC',
  'niente XP né livelli nello stato',
  lacks(STORE, 'progression.level') && lacks(STORE, 'grantXp'),
);
check('SYNC', 'un giorno vale +1 e una volta sola', has(STORE, 'syncAwarded'));
check(
  'SYNC',
  'il tempo che passa non dà SYNC',
  has(STORE, 'Nessun SYNC qui'),
);
check('SYNC', 'la pausa (GRACE) si può dichiarare', has(STORE, 'setDayGrace'));
check(
  'SYNC',
  'la pausa NON dà SYNC',
  has('src/engine/progression.ts', 'E NON dà SYNC'),
);

/* ============================================================================
   Ancora di continuità — MASTER SPEC §9.1
   ========================================================================= */

const PROG = 'src/engine/progression.ts';
const GEN = 'src/engine/characterGenerator.ts';

for (const pattern of ['MINIMAL', 'FOCUSED', 'MAJOR', 'FAMILY-ANCHORED', 'FAMILY-SHIFT']) {
  check('CONTINUITÀ §9.1', `schema ${pattern}`, has(PROG, `'${pattern}'`));
}
check('CONTINUITÀ §9.1', 'il generatore accetta un’ancora', has(GEN, 'continuity?: readonly'));
check(
  'CONTINUITÀ §9.1',
  'una forma nuova non può essere identica alla precedente',
  has(GEN, 'CONTINUITÀ — VINCOLO'),
);
check(
  'CONTINUITÀ §9.1',
  'l’archetipo non si ancora senza la Family',
  has(PROG, 'function legalise'),
);

/* ============================================================================
   Signal Scan — MASTER SPEC §12
   ========================================================================= */

const SCAN = 'src/engine/personalityScan.ts';
const questions = count(SCAN, /^ {4}index: \d+,$/gm);

check('SIGNAL SCAN §12', 'dodici domande', questions === 12, `${questions} trovate`);
check('SIGNAL SCAN §12', 'la schermata esiste', existsSync('src/screens/PersonalityScan.tsx'));
check('SIGNAL SCAN §12', 'è la prima fase della partita', has(STORE, "phase: 'scan' as Phase"));
check(
  'SIGNAL SCAN §12',
  'nessuna risposta nomina una Family',
  !/answers: \[[^\]]*(ANGEL|DEMON|MACHINE|DRAGON|UNDEAD)/s.test(read(SCAN) ?? ''),
);
check('SIGNAL SCAN §12', 'CTA vincolata: LOCK SIGNAL', has('src/i18n/it.ts', "lock: 'LOCK SIGNAL'"));

/* ============================================================================
   Genere — MASTER SPEC §2.4
   ========================================================================= */

check('GENERE §2.4', 'frammento immagine', has(FRAGMENTS, 'global.gender'));
check('GENERE §2.4', 'incluso in ogni prompt', has('src/assets-pipeline/compiler.ts', "'global.gender'"));
check('GENERE §2.4', 'regola nella voce', has('src/ai/voicePrompt.ts', 'YOUR GENDER'));
check(
  'GENERE §2.4',
  'il .mon parla di sé al maschile',
  has('src/ai/voicePrompt.ts', 'sono stanco'),
);

/* ============================================================================
   Asset — MASTER SPEC §23.1 / §23.2
   ========================================================================= */

const ASSETS = 'src/engine/assets.ts';

check('ASSET §23', 'otto tipi', count(ASSETS, /^ {4}type: '/gm) === 8, `${count(ASSETS, /^ {4}type: '/gm)}`);
check('ASSET §23', 'idle animation', has('src/engine/types.ts', 'idle_animation'));
check('ASSET §23', 'griglia espressioni indicizzabile', has(ASSETS, 'EXPRESSION_SPEC'));
check('ASSET §23', 'ordine di produzione a stadi', has(ASSETS, 'GENERATION_STAGES'));
check(
  'ASSET §23',
  'i derivati allegano il CHARACTER MASTER',
  has('src/assets-pipeline/compiler.ts', 'global.master_reference'),
);
check(
  'ASSET §23',
  'il master NON allega sé stesso',
  has('src/assets-pipeline/compiler.ts', "assetType !== 'character_master'"),
);

/* ============================================================================
   Registrazione e voce — MASTER SPEC §5.1 / §5.2
   ========================================================================= */

check('REGISTRARE §5', 'estrazione dalla chat', existsSync('src/engine/chatExtract.ts'));
check('REGISTRARE §5', 'misure dal testo libero', has('src/engine/chatExtract.ts', 'extractMeasures'));
check('REGISTRARE §5', 'un campo solo, niente moduli', has(STORE, 'captureEntry'));
check('REGISTRARE §5', 'la foto la legge il modello', has('src/ai/client.ts', 'readPhotoSignals'));
check('REGISTRARE §5', 'l’AI risponde in chat', has('src/ai/client.ts', 'generateReply'));
check(
  'REGISTRARE §5',
  'la lettura automatica non sovrascrive quello che hai detto',
  has(STORE, "=== 'UNKNOWN'"),
);
check(
  'REGISTRARE §5',
  'si registra anche durante l’incubazione',
  has('src/screens/Incubation.tsx', 'incubation__today'),
);

/* ============================================================================
   Superfici — MASTER SPEC §8.1 / §13 / §14 / §15.1
   ========================================================================= */

const APP = 'src/App.tsx';

check('SUPERFICI', 'BIO in prima persona', has(GEN, 'Sono arrivato il giorno'));
check('SUPERFICI', 'BIO è una scheda del profilo', has('src/screens/SpecimenProfile.tsx', 'BioPanel'));
check('SUPERFICI', 'niente tasto matita muto', lacks('src/screens/BioPanel.tsx', 'icon="edit"'));
check('SUPERFICI', 'memorie solo in DEV', existsSync('src/dev/MemorySection.tsx'));
check('SUPERFICI', 'memorie non più in prodotto', lacks(APP, "case 'memories'"));
check('SUPERFICI', 'calendario a date vere', has('src/screens/SyncCalendar.tsx', 'MONTH_NAMES'));
check('SUPERFICI', 'oggi in grande', has('src/screens/SyncCalendar.tsx', 'cal__todaynum'));
check('SUPERFICI', 'schermata d’ingresso', existsSync('src/screens/Splash.tsx'));
check('SUPERFICI', 'espressioni accanto alle battute', has('src/screens/CompanionHome.tsx', 'MonFace'));
check('SUPERFICI', 'il + apre la registrazione', has('src/screens/CompanionHome.tsx', "onGo('input')"));
check('SUPERFICI', 'niente DISC in ME', lacks('src/screens/MeOverview.tsx', 'discTitle'));
check('SUPERFICI', 'ME dichiara che non è un punteggio', has('src/i18n/it.ts', 'preamble:'));

/* ============================================================================
   Costi — MASTER SPEC §18.1
   ========================================================================= */

check('COSTI §18.1', 'registro delle chiamate', existsSync('src/ai/usage.ts'));
check('COSTI §18.1', 'schermata in DEV', existsSync('src/dev/CostSection.tsx'));
check('COSTI §18.1', 'i prezzi sono dichiarati come stime', has('src/ai/usage.ts', 'DA RICONTROLLARE') || has('src/dev/CostSection.tsx', 'DA RICONTROLLARE'));

/* ============================================================================
   Sicurezza e tono — non negoziabili
   ========================================================================= */

check(
  'TONO §28',
  'nessuna schermata dice addio',
  lacks('src/i18n/it.ts', 'SALUTA') && lacks('src/screens/NewBranch.tsx', 'goodbye'),
);
check(
  'TONO §28',
  'nessun giorno è colpa di nessuno',
  has('src/i18n/it.ts', 'Non è un giorno perso'),
);
check('TONO §28', 'niente serie da difendere', has('src/i18n/it.ts', 'noStreak'));
check('TONO §28', 'SLIME non è una Family', lacks(CONFIG, "id: 'SLIME',\n    coreAnatomy"));

/* --- Stampa ---------------------------------------------------------------- */

let area = '';
for (const r of results) {
  if (r.area !== area) {
    area = r.area;
    console.log(`\n═══ ${area} ═══\n`);
  }
  console.log(`  ${r.ok ? 'OK  ' : 'FAIL'}  ${r.label}${r.detail ? `  — ${r.detail}` : ''}`);
}

console.log(
  failures === 0
    ? `\n✓ ${results.length} decisioni ancora nel codice.\n`
    : `\n✗ ${failures} decisioni su ${results.length} non sono più nel codice.\n`,
);
process.exit(failures === 0 ? 0 : 1);
