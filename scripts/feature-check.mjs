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
   🔷 v1.14 — LA GEOMETRIA RETTANGOLARE

   `tokens.css` lo dice da sempre: «geometria rettangolare: niente card
   arrotondate», con 2px come unico ammorbidimento consentito su input e
   badge. Era scritto in un commento, e un commento non ferma nessuno: ho
   arrotondato le bolle della chat a 14px senza che niente protestasse, e il
   difetto e' arrivato da una foto — due grammatiche sulla stessa schermata.

   Le pillole complete (999px) restano ammesse: sono i pulsanti tondi e le
   etichette di sistema, che leggono come marcatori e non come contenitori
   di contenuto.
   ========================================================================= */

const CSS_FILES = [
  'src/styles/base.css',
  'src/system/system.css',
  'src/screens/screens.css',
];

const strayRadii = [];
for (const file of CSS_FILES) {
  for (const m of (read(file) ?? '').matchAll(/border-radius:\s*([^;]+);/g)) {
    const value = m[1].trim();
    const ok =
      value.startsWith('var(--radius') ||
      value === '999px' ||
      value === '50%' ||
      value === '0' ||
      value === '0px';
    if (!ok) strayRadii.push(`${file}: ${value}`);
  }
}

check(
  'GEOMETRIA',
  'nessun angolo arrotondato fuori dai token',
  strayRadii.length === 0,
  strayRadii.join(' · ') || 'solo var(--radius*), pillole e cerchi',
);

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

check(
  'ASSET §23',
  'sei tipi da generare, non sette',
  count(ASSETS, /^ {4}type: '/gm) === 6,
  `${count(ASSETS, /^ {4}type: '/gm)} — rotazione fuori in v1.11 §23.3, sigillo in v1.15 §23.5`,
);
check(
  'ASSET §23.5',
  'il sigillo non è più un asset da generare',
  lacks(ASSETS, "type: 'sigil'") && has(ASSETS, "QUI C'ERA IL SIGILLO"),
  'è un disegno del sito: leggibile a 24px, derivato dai dati, c’è dal primo giorno',
);
check(
  'ASSET §23.5',
  'ogni parte del sigillo dichiara da dove viene',
  has('src/engine/sigil.ts', 'OGNI PARTE HA UN PADRE') && has('src/engine/sigil.ts', 'from.push('),
  'senza, non è un sigillo: è decorazione',
);
check(
  'ASSET §23.5',
  'il sigillo non usa più il caso',
  lacks('src/engine/sigil.ts', 'rng') && lacks('src/engine/sigil.ts', 'Math.random'),
  'tre parametri su quattro erano un tiro di dado',
);
check(
  'ASSET §23',
  'nessuna rotazione da nessuna parte',
  lacks('src/engine/types.ts', "'rotation_sprite'") &&
    lacks('src/assets-pipeline/fragments.ts', 'rotation_sprite:') &&
    lacks('src/system/AssetSlot.tsx', 'export function RotationViewer'),
);
check(
  'ASSET §23',
  'il ciclo di riposo è quattro frame',
  has(ASSETS, 'frames: 4'),
);
check(
  'ASSET §23',
  'il manifest dichiara i frame del ciclo di riposo',
  has('src/assets-pipeline/manifest.ts', "def.type === 'idle_animation'"),
  'senza, chi genera non sa che è una striscia da quattro',
);
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
  has('src/screens/Incubation.tsx', 'composer--egg'),
);

/* ============================================================================
   🔶 v1.10 §5.3 — COSA MANGIO, NON SE MANGIO

   La differenza fra un contatore e un motore. `batch-check.mjs` verifica che
   il lettore funzioni su frasi vere; qui si verifica che le DECISIONI attorno
   ad esso non vengano smontate — soprattutto quella di tono, che è la più
   facile da perdere riscrivendo una stringa.
   ========================================================================= */

const PROTOCOL = 'src/engine/protocol.ts';

check('PROTOCOLLO §5.3', 'i gruppi alimentari esistono', has(PROTOCOL, 'FOOD_GROUPS'));
check('PROTOCOLLO §5.3', 'si dichiara all’ingresso', existsSync('src/screens/ProtocolSetup.tsx'));
check('PROTOCOLLO §5.3', 'è una fase, prima dell’incubazione', has(STORE, "phase: 'protocol'"));
check('PROTOCOLLO §5.3', 'si può saltare', has(STORE, 'skipProtocol'));
check('PROTOCOLLO §5.3', 'testo libero, nessun modulo', lacks('src/screens/ProtocolSetup.tsx', '<select'));
check(
  'PROTOCOLLO §5.3',
  'il cibo porta con sé COSA era',
  has('src/engine/chatExtract.ts', 'foodGroups'),
);
check(
  'PROTOCOLLO §5.3',
  'l’aderenza tocca la salute, mai il SYNC',
  has(STORE, 'adherenceTouch') && lacks(PROTOCOL, 'sync'),
);
check(
  'PROTOCOLLO §5.3',
  'CARE sale sempre, anche fuori protocollo',
  /FUORI: \{ FORM: -[\d.]+, CARE: \+[\d.]+ \}/.test(read(PROTOCOL) ?? ''),
  'è il modo in cui il codice rispetta il divieto di vergogna (§4)',
);
/* Le quattro etichette dell'aderenza sono l'unico posto in cui il sistema
   dice qualcosa su cosa hai mangiato, e devono DESCRIVERE. Non basta vietare
   le parole nel file — «non esiste un giorno sbagliato» contiene «sbagliato»
   ed è esattamente la frase giusta. Si guardano quindi solo le stringhe che
   l'utente legge davvero. */
const ADHERENCE = [...(read(PROTOCOL) ?? '').matchAll(/^ {2}(?:IN_LINEA|FUORI|MISTO|SCONOSCIUTA): '([^']+)'/gm)]
  .map((x) => x[1]);
const JUDGING = ['sbagliat', 'giust', 'bravo', 'male', 'sgarr', 'errore', 'colpa', 'peccato'];
check(
  'PROTOCOLLO §5.3',
  'nessuna etichetta di aderenza giudica',
  ADHERENCE.length === 4 && ADHERENCE.every((l) => !JUDGING.some((w) => l.includes(w))),
  ADHERENCE.join(' / ') || 'etichette non trovate',
);
check(
  'PROTOCOLLO §5.3',
  'senza protocollo non esiste un giudizio',
  has(PROTOCOL, "if (!diet || groups.length === 0) return 'SCONOSCIUTA'"),
);

/* ============================================================================
   🔶 v1.10 §7.2 — L'UOVO NON PARLA
   ========================================================================= */

const EGG = 'src/engine/eggVoice.ts';

check('UOVO §7.2', 'ha una voce fatta di suoni', existsSync(EGG));
check('UOVO §7.2', 'si può scrivergli', has(STORE, 'sendToEgg'));
check('UOVO §7.2', 'la chat sta nell’incubazione', has('src/screens/Incubation.tsx', 'eggsound'));
check(
  'UOVO §7.2',
  'nessuna chiamata AI durante l’incubazione',
  lacks(EGG, 'ai/client') && !/sendToEgg[\s\S]{0,2000}requestReply/.test(read(STORE) ?? ''),
  'la cosa non ha ancora una voce: non c’è niente da far scrivere a un modello',
);
check(
  'UOVO §7.2',
  'registra come la chat normale',
  /sendToEgg[\s\S]{0,2000}applyExtraction/.test(read(STORE) ?? ''),
);
check(
  'UOVO §7.2',
  'quello che gli dici prima di nascere non si perde',
  has(STORE, 'Prima di nascere'),
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
   🔷 v1.10 §7.3 / §13.5 — INTERFACCIA

   Le correzioni di questo giro sono quasi tutte CANCELLATURE, e una cancellatura
   è la cosa più facile da annullare per sbaglio: basta che qualcuno rimetta
   l'elemento «perché mancava». Ognuna diventa un controllo.
   ========================================================================= */

check('UOVO §7.3', 'il guscio cambia a ogni giorno chiuso', existsSync('src/system/EggVessel.tsx'));
check(
  'UOVO §7.3',
  'una crepa per giorno sincronizzato',
  has('src/system/EggVessel.tsx', 'crackPaths'),
);
check(
  'UOVO §7.3',
  'chiudere una giornata si vede',
  has('src/system/EggVessel.tsx', 'egg--jolt') && has('src/system/system.css', 'egg-jolt'),
);
check(
  'UOVO §7.3',
  'niente sagoma dentro il guscio (§12/01)',
  has('src/system/EggVessel.tsx', 'MASSA') || has('src/system/EggVessel.tsx', 'massa'),
  'quello che cresce dentro non deve leggersi come una creatura',
);
check(
  'UOVO §7.3',
  'via la barra a segmenti: adesso lo dice l’uovo',
  !/segments=\{inc\.total\}/.test(read('src/screens/Incubation.tsx') ?? ''),
);

/* 🔷 v1.11 §23.4 — il movimento di riposo viene dall'anatomia. */

check(
  'MOVIMENTO §23.4',
  'il movimento si ricava dalla creatura',
  existsSync('src/engine/idleMotion.ts'),
);
check(
  'MOVIMENTO §23.4',
  'il prompt non elenca più ipotesi',
  has('src/assets-pipeline/fragments.ts', '{{IDLE_MOTION}}') &&
    lacks('src/assets-pipeline/fragments.ts', 'or whatever the FAMILY anatomy actually has'),
  'un modello che legge un elenco di ipotesi sceglie la prima, e tutti i .mon respirano uguale',
);
check(
  'MOVIMENTO §23.4',
  'il compilatore riempie il segnaposto',
  has('src/assets-pipeline/compiler.ts', "f.id === 'asset.idle_animation'"),
);
check(
  'MOVIMENTO §23.4',
  'il budget di movimento resta piccolo',
  has('src/assets-pipeline/fragments.ts', 'Feet stay planted') &&
    has('src/engine/idleMotion.ts', 'IL BUDGET DI MOVIMENTO RESTA PICCOLO'),
  'un idle che recita stanca al terzo giro',
);

/* 🔷 v1.11 §14.3 — il timbro sul giorno chiuso. */

check(
  'TIMBRO §14.3',
  'un giorno chiuso porta il sigillo, non un pallino',
  has('src/screens/SyncCalendar.tsx', 'cal__stamp'),
);
check(
  'TIMBRO §14.3',
  'è il .mon di QUEL periodo, non quello di adesso',
  has('src/screens/SyncCalendar.tsx', 'const monOn ='),
);
check(
  'TIMBRO §14.3',
  'funziona senza nessuna immagine importata',
  has('src/screens/SyncCalendar.tsx', '<Sigil seed='),
  'il sigillo è generato dal seme: esiste sempre',
);

/* 🔷 v1.11 §5.4 — i pasti, il piano, il riepilogo. */

check('PASTI §5.4', 'cinque fasce, non una casella sola', has(PROTOCOL, 'MEAL_SLOTS'));
check(
  'PASTI §5.4',
  'il pasto si deduce dall’ora quando non è detto',
  has(PROTOCOL, 'mealFromClock'),
);
check(
  'PASTI §5.4',
  'una deduzione dall’ora si dichiara sempre',
  has('src/engine/chatExtract.ts', 'mealFromClock') &&
    has('src/system/DaySummary.tsx', 'fromClock'),
  'dedurre in silenzio è la bugia che §5 vieta ai sensori',
);
check(
  'PASTI §5.4',
  'i pasti NON decidono se il giorno conta',
  has('src/engine/progression.ts', 'NON entrano in `canCloseDay`') &&
    !/canCloseDay[\s\S]{0,300}meals/.test(read('src/engine/progression.ts') ?? ''),
  'far dipendere il SYNC dal ricordarsi la merenda sarebbe una checklist da non sbagliare',
);
check(
  'PASTI §5.4',
  'il piano sa quali giorni sono riposo',
  has(PROTOCOL, 'parseWeekdays') && has(PROTOCOL, 'plannedFor'),
);
check(
  'PASTI §5.4',
  'un giorno che il piano non nomina non diventa riposo',
  has(STORE, "!== 'REST') return"),
);
check(
  'PASTI §5.4',
  'il piano non sovrascrive quello che hai raccontato',
  has(STORE, "!== 'UNKNOWN') return"),
);
check(
  'PASTI §5.4',
  'un allenamento previsto non diventa mai un allenamento mancato',
  has(STORE, 'il piano è un\'intenzione, non un debito'),
  '§4 vieta la vergogna, e segnare le assenze la reintrodurrebbe dal retro',
);
/* Si guardano SOLO le stringhe del riepilogo, non tutto il file: cercare
   «ti manca» ovunque pescava «dati mancanti» a cavallo di due parole, che è
   una frase perfettamente innocente. Un controllo troppo largo trova
   colpevoli che non esistono. */
const SUMMARY_STRINGS = (read('src/i18n/it.ts') ?? '').match(/summary: \{[\s\S]*?\n  \},/)?.[0] ?? '';
const SHAMING = ['ti manca', 'mancano', 'non hai', 'dovresti', 'incompleto', 'saltato'];
check(
  'PASTI §5.4',
  'il riepilogo esiste e non rimprovera',
  existsSync('src/system/DaySummary.tsx') &&
    SUMMARY_STRINGS.length > 0 &&
    !SHAMING.some((w) => SUMMARY_STRINGS.includes(w)),
  SUMMARY_STRINGS.length > 0 ? '' : 'blocco `summary` non trovato in it.ts',
);

/* 🔷 v1.10 §13.9 — «vorrei che l'app fosse viva». */

check(
  'VIVA §13.9',
  'l’uovo salta, ma solo dove sta in grande',
  has('src/system/EggVessel.tsx', 'lively = false') &&
    has('src/screens/Splash.tsx', 'lively') &&
    lacks('src/screens/Incubation.tsx', 'lively'),
  'nella barra della chat sarebbe un elemento di interfaccia che si muove da solo',
);
check('VIVA §13.9', 'toccare l’uovo lo fa saltare', has('src/screens/Splash.tsx', 'splash__poke'));
check(
  'VIVA §13.9',
  'la creatura sulla home è viva, non girevole',
  has('src/screens/Splash.tsx', 'IdleMon'),
  'la rotazione a trascinamento è uscita col suo asset (§23.3)',
);
check(
  'VIVA §13.9',
  'la creatura respira quando nessuno la tocca',
  has('src/screens/screens.css', 'creature-breath'),
);
check(
  'VIVA §13.9',
  'il palco della creatura non è un pulsante',
  lacks('src/screens/Splash.tsx', 'className="splash__stage" onClick'),
  'un trascinamento dentro un pulsante finisce in un click involontario',
);
check(
  'VIVA §13.9',
  'ogni animazione rispetta chi ha chiesto meno movimento',
  count('src/system/system.css', /prefers-reduced-motion/g) >= 2 &&
    has('src/screens/screens.css', 'prefers-reduced-motion'),
);
check(
  'VIVA §13.9',
  'la vibrazione si può provare da DEV',
  has('src/dev/DevPanel.tsx', 'HapticBench'),
  'su iPhone è una scorciatoia che va verificata sul telefono, non nel codice',
);
check(
  'VIVA §13.9',
  'nessuna informazione passa solo dalla vibrazione (§17)',
  has('src/system/haptics.ts', 'nessuna informazione critica passa solo dall'),
);

/* 🔷 v1.10 §13.8 — ogni trasformazione si tiene premuta. */

for (const [file, what] of [
  ['src/screens/Incubation.tsx', 'nascere'],
  ['src/screens/NewBranch.tsx', 'cambiare forma'],
  ['src/screens/MindlineShift.tsx', 'maturare'],
]) {
  check('TRASFORMAZIONI §13.8', `${what} si tiene premuto`, has(file, 'HoldButton'));
}

check(
  'TRASFORMAZIONI §13.8',
  'il riempimento arriva in fondo prima di cambiare schermata',
  has('src/system/components.tsx', 'window.setTimeout(onComplete, 180)'),
);

/* 🔷 v1.10 §13.7 — DUE SCHERMATE, DUE LAVORI: l'ingresso è la creatura, la
   chat è la conversazione. */

check(
  'INGRESSO §13.7',
  'l’ingresso vale anche durante l’incubazione',
  has(APP, "phase === 'incubation' ||") && has('src/screens/Splash.tsx', 'EggVessel'),
);
check(
  'INGRESSO §13.7',
  'si entra quando si decide, non dopo un timer',
  lacks('src/screens/Splash.tsx', 'AUTO_ENTER_MS') &&
    has('src/screens/Splash.tsx', 'splash__enter'),
);
check(
  'INGRESSO §13.7',
  'la home è il personaggio, non una schermata da superare',
  has(APP, "useState<'creature' | 'chat'>('creature')") &&
    has(APP, "if (next === 'mon') setMonView('creature');"),
  'rientrando nella tab MON si riparte sempre dalla creatura',
);
check(
  'INGRESSO §13.7',
  'si riparte dalla creatura a ogni cambio di fase',
  has(APP, "useEffect(() => setMonView('creature'), [phase])"),
);
/* 🔷 v1.14 — l'ago cercava la riga letterale `{phase === 'live' && !overlay &&
   <TabBar`. La condizione e' stata estratta in una costante perche' serve
   anche al margine di sistema del composer, e il controllo e' fallito su una
   decisione che nel codice c'e' ancora tale e quale.

   E' il terzo ago che si rompe cosi. La regola che ne esce: un ago deve
   puntare alla DECISIONE, non alla forma in cui era scritta quel giorno —
   qui, che la barra dipenda da `live` senza overlay e che venga resa. */
check(
  'INGRESSO §13.7',
  'la barra di navigazione resta anche sulla creatura',
  has(APP, "phase === 'live' && !overlay") && has(APP, '<TabBar tab={tab}'),
  'è una tab, non una schermata che copre tutto',
);
check(
  'INGRESSO §13.7',
  'un overlay vince sempre sull’ingresso',
  (read(APP) ?? '').indexOf('overlay ? (') < (read(APP) ?? '').indexOf('onCreature ? ('),
  'con la splash aperta il pannello DEV si apriva sotto e non si vedeva',
);
check(
  'INGRESSO §13.7',
  'la faccia sta in alto, non accanto a ogni battuta',
  has('src/screens/CompanionHome.tsx', 'home__face') &&
    !/bubblerow[\s\S]{0,200}<MonFace/.test(read('src/screens/CompanionHome.tsx') ?? ''),
);
check(
  'INGRESSO §13.7',
  'la Home non ha più la creatura a mezzo schermo',
  lacks('src/screens/CompanionHome.tsx', 'home__stage'),
  'quel lavoro è diventato una schermata sua',
);
check(
  'INGRESSO §13.7',
  'toccare la faccia riporta all’ingresso',
  has('src/screens/CompanionHome.tsx', 'onClick={onBack}'),
);
check(
  'INTERFACCIA',
  'il campo del composer riempie la larghezza',
  has('src/system/system.css', '.composer .field {'),
);

/* 🔷 v1.10 §13.6 — «in una schermata c'è troppo». */

const INC = 'src/screens/Incubation.tsx';

check(
  'INCUBAZIONE §13.6',
  'la chat prende tutto lo spazio che avanza',
  has('src/screens/screens.css', '.incubation__chat {') &&
    count('src/screens/screens.css', /\.incubation__chat \{/g) === 1,
  'una regola sola: due si contraddicevano e vinceva quella con max-height',
);
check(
  'INCUBAZIONE §13.6',
  'niente vocabolario del motore su schermo',
  lacks(INC, 'STAT_KEYS') && lacks(INC, 'SEGNALI LETTI'),
  'i sei chip FORM/ATK/SPD e SIGNAL STABILITY erano duplicati di DEV → SEGNALI',
);
check(
  'INCUBAZIONE §13.6',
  'HATCH compare solo quando è pronto',
  has(INC, 'inc.ready ? (') && lacks(INC, 'notReady'),
  'restava sette giorni a dire «non ancora», nel posto migliore dello schermo',
);
check(
  'INCUBAZIONE §13.6',
  'una striscia sola sopra il composer',
  count(INC, /incubation__strip/g) >= 2,
);
check(
  'INCUBAZIONE §13.6',
  'la simulazione segue la dev mode (§29)',
  has(INC, 'devEnabled && ('),
);

check(
  'INTERFACCIA',
  'nessuna sigla di espressione accanto alle battute',
  lacks('src/system/LiveMon.tsx', 'monface__tag'),
  'si cerca la classe, non la frase: il commento che spiega la rimozione la nomina',
);
check(
  'INTERFACCIA',
  'niente seed né config su superfici di prodotto (§29)',
  lacks('src/screens/SpecimenProfile.tsx', 'label="SEED"') &&
    lacks('src/screens/SpecimenProfile.tsx', 'generation_config_version'),
);
check(
  'INTERFACCIA',
  'la telemetria di generazione sta in DEV',
  has('src/dev/DevPanel.tsx', 'GenerationTelemetry'),
);
check(
  'INTERFACCIA',
  'DATA CONFIDENCE fuori dal prodotto, tutte e tre le volte',
  ['src/screens/SpecimenProfile.tsx', 'src/screens/MeOverview.tsx', 'src/screens/DailyScan.tsx']
    .every((f) => lacks(f, 'confidenceTitle') && lacks(f, 'label="DATA CONFIDENCE"')),
  'ME, profilo e daily scan: la mostravano tutte e tre',
);
check(
  'INTERFACCIA',
  'un annuncio solo: via il banner MINDLINE SHIFT',
  lacks('src/screens/CompanionHome.tsx', 'home__shift') &&
    lacks('src/screens/screens.css', '.home__shift {'),
);
check(
  'INTERFACCIA',
  'l’annuncio è la linea di SYNC che si riempie',
  has('src/screens/CompanionHome.tsx', 'home__sync--ready'),
);
check(
  'INTERFACCIA',
  'il calendario non ripete l’annuncio della Home',
  has('src/screens/SyncCalendar.tsx', '{!event.ready && ('),
);
check(
  'INTERFACCIA',
  'la legenda del calendario ha tre voci, non sette',
  lacks('src/screens/SyncCalendar.tsx', 'MILESTONES.origin.mark} prima forma'),
);
check(
  'INTERFACCIA',
  'il nome apre il profilo, senza icona muta',
  has('src/screens/CompanionHome.tsx', 'className="home__identity"'),
);
check(
  'INTERFACCIA',
  'in REGISTRA la lettura viene prima della foto',
  (read('src/screens/UniversalInput.tsx') ?? '').indexOf('capture__read') <
    (read('src/screens/UniversalInput.tsx') ?? '').indexOf('capture__photo'),
);
check(
  'INTERFACCIA',
  'un solo modo per annullare la registrazione',
  lacks('src/screens/UniversalInput.tsx', 't.input.cancel'),
);
check(
  'INTERFACCIA',
  'le chip del profilo dicono di cosa sono',
  has('src/screens/SpecimenProfile.tsx', 'RARITÀ · '),
);

/* ============================================================================
   Costi — MASTER SPEC §18.1
   ========================================================================= */

check('COSTI §18.1', 'registro delle chiamate', existsSync('src/ai/usage.ts'));
check('COSTI §18.1', 'schermata in DEV', existsSync('src/dev/CostSection.tsx'));
check('COSTI §18.1', 'i prezzi sono dichiarati come stime', has('src/ai/usage.ts', 'DA RICONTROLLARE') || has('src/dev/CostSection.tsx', 'DA RICONTROLLARE'));

/* ============================================================================
   RARITÀ TARABILE — §15.3

   Il difetto che queste righe sorvegliano non è un errore di calcolo: è che il
   sistema torni a essere impossibile da capire. Una rarità decisa in due
   passaggi che si moltiplicano non si può tarare, e una taratura che il motore
   non legge è peggio di nessuna taratura.
   ========================================================================= */

check(
  'RARITÀ §15.3',
  'la rarità non viene tirata una seconda volta',
  lacks('src/engine/rarity.ts', 'let r = rng() * 100'),
  'il punteggio decide, il dado non c’è più',
);
check(
  'RARITÀ §15.3',
  'il motore legge le soglie tarabili, non quelle scolpite',
  has('src/engine/rarity.ts', 'rarityThresholds()'),
);
check(
  'RARITÀ §15.3',
  'una taratura incoerente non si applica a metà',
  has('src/engine/rarityTuning.ts', 'if (problems.length === 0) active = candidate'),
);
check(
  'RARITÀ §15.3',
  'la taratura salvata torna dentro il motore al ricaricamento',
  has('src/state/store.ts', 'onRehydrateStorage'),
  'senza questo il pannello mostrerebbe soglie che non hanno effetto',
);
check(
  'RARITÀ §15.3',
  'il pannello scrive attraverso lo store, non nel modulo',
  has('src/dev/RaritySection.tsx', 'tuneRarity') &&
    lacks('src/dev/RaritySection.tsx', 'setRarityThresholds(draft)'),
  'due sorgenti di verità divergerebbero al primo ricaricamento',
);
check(
  'RARITÀ §15.3',
  'DEV → RARITÀ esiste ed è raggiungibile',
  has('src/dev/DevPanel.tsx', "id: 'rarity' as const"),
);
check(
  'RARITÀ §15.3',
  'la simulazione non fa nascere niente',
  has('src/state/store.ts', 'sampleRarity') &&
    lacks('src/dev/RaritySection.tsx', 'useApp.setState'),
);
check(
  'RARITÀ §15.3',
  'il pannello dice quante volte capita in una vita, non solo la percentuale',
  has('src/dev/RaritySection.tsx', 'FORMS_IN_A_LIFETIME'),
  'una percentuale non si sente; «tredici volte in tutta la vita» sì',
);
check(
  'RARITÀ §15.3',
  'il traguardo è una spinta, non un cancello',
  lacks('src/engine/generation-config.ts', 'hiddenTrigger: true'),
  'pretenderlo rendeva SINGULAR impossibile',
);
check(
  'RARITÀ §15.3',
  'la posizione nel catalogo non vale piu punti di rarità',
  lacks('src/engine/characterGenerator.ts', 'findIndex((a) => a.id === archetype) >= 4') &&
    has('src/engine/rarity.ts', 'massSizeTension'),
  'quattro punti su cento assegnati in base all’ordine in cui li ho scritti',
);
check(
  'RARITÀ §16',
  'il grilletto nascosto viene davvero acceso da qualcuno',
  has('src/state/store.ts', 'hiddenEventFor({'),
  'era previsto dalla spec e non lo chiamava nessuno',
);

/* ============================================================================
   §21 — GLI STRUMENTI

   Le decisioni qui sotto sono tutte della stessa famiglia: dove gira il
   codice, e chi può scrivere cosa. Sono le prime che, se saltano, non
   producono un errore ma un cambio di natura del prodotto.
   ========================================================================= */

check(
  'STRUMENTI §21',
  'gli strumenti girano nel browser, non sul server',
  has('src/ai/tools.ts', 'export function runTool') &&
    lacks('netlify/functions/ai.ts', 'runTool'),
  'un server che li eseguisse dovrebbe prima farsi mandare tutto l’archivio',
);
check(
  'STRUMENTI §21',
  'la funzione resta un relè: passa i nomi, non sa cosa fanno',
  has('netlify/functions/ai.ts', 'toolUses: result.toolUses'),
);
check(
  'STRUMENTI §21',
  'il ciclo degli strumenti ha un tetto di giri',
  has('src/ai/client.ts', 'MAX_TOOL_ROUNDS'),
  'senza tetto un modello che richiama lo stesso strumento non finisce più',
);
check(
  'STRUMENTI §21',
  'all’ultimo giro gli strumenti si tolgono',
  has('src/ai/client.ts', 'round < MAX_TOOL_ROUNDS'),
  'altrimenti può chiuderne uno nuovo quando non c’è più nessuno a eseguirlo',
);
check(
  'STRUMENTI §21',
  'ogni giro di strumenti viene contato nella spesa',
  has('src/ai/client.ts', 'recordVoiceUsage(subsystem, res.data)'),
  'contarne uno solo farebbe sembrare gratis proprio la parte nuova',
);
check(
  'STRUMENTI §21',
  'il .mon sa di avere degli strumenti',
  has('src/ai/voicePrompt.ts', 'WHAT YOU CAN ACTUALLY DO'),
);
check(
  'STRUMENTI §21',
  'e sa che deve guardare invece di indovinare',
  has('src/ai/voicePrompt.ts', 'LOOK BEFORE YOU GUESS'),
);
check(
  'STRUMENTI §21',
  'gli strumenti si possono provare senza chiavi',
  has('src/dev/ToolsSection.tsx', 'runMonTool'),
  'sono l’unica parte del motore che non parte da sola',
);

/* --- Le pagine ------------------------------------------------------------- */

check(
  'PAGINE §21.2',
  'il markdown non diventa mai HTML',
  /* ⚠️ Si cerca la CHIAMATA, non la parola: la parola sta nel commento che
     spiega perché non si fa, e cercarla faceva fallire il controllo proprio
     grazie alla spiegazione. Un ago deve puntare alla decisione, non alla
     forma in cui è stata scritta quel giorno. */
  lacks('src/system/Markdown.tsx', 'dangerouslySetInnerHTML={') &&
    lacks('src/engine/markdown.ts', 'dangerouslySetInnerHTML={'),
  'l’app tiene nel browser mesi della sua vita: non esiste la strada',
);
check(
  'PAGINE §21.2',
  'solo http, https e mailto diventano link',
  has('src/engine/markdown.ts', 'SAFE_SCHEME'),
);
check(
  'PAGINE §21.2',
  'una pagina si aggiorna per sezioni, non riscrivendola',
  has('src/engine/pages.ts', 'export function replaceSection'),
  'riscrivere è come si perde quello che c’era',
);
check(
  'PAGINE §21.2',
  'ogni pagina ha un indirizzo suo, per la schermata home',
  has('src/App.tsx', "#\\/p\\/") && has('src/screens/PageReader.tsx', '#/p/'),
);
check(
  'PAGINE §21.2',
  'l’indirizzo non impila voci nella cronologia',
  has('src/App.tsx', 'replaceState'),
);
check(
  'PAGINE §21.2',
  'il PDF si stampa, non si genera',
  has('src/screens/PageReader.tsx', 'window.print()') &&
    has('src/screens/screens.css', '@media print'),
  'una libreria per rifare peggio una cosa di sistema è peso in cambio di niente',
);
check(
  'PAGINE §21.2',
  'le spunte si vedono ma non si toccano',
  lacks('src/system/Markdown.tsx', 'type="checkbox"'),
  'una spunta che si scorda al ricaricamento è peggio di una disegnata',
);
check(
  'PAGINE §21.2',
  'l’elenco delle pagine non compare finché non ce n’è una',
  has('src/screens/MeOverview.tsx', 'if (pages.length === 0) return null'),
);
check(
  'PAGINE §21.2',
  'ogni scrittura del .mon può essere rifiutata',
  has('src/state/pagesSlice.ts', 'outcome: { ok: false'),
  'è la differenza fra «me l’ha detto» e «il salvataggio ha smesso di funzionare»',
);

/* --- I promemoria ---------------------------------------------------------- */

check(
  'PROMEMORIA §21.3',
  'un promemoria passa dal canale che esiste già',
  has('src/state/store.ts', 'dueReminder(s.reminders, s.day)') &&
    has('src/state/store.ts', 'lastUnpromptedDay: s.day'),
  'un canale suo vorrebbe dire due messaggi non richiesti nello stesso giorno',
);
check(
  'PROMEMORIA §21.3',
  'un promemoria ripetuto non si accumula mentre l’app è chiusa',
  has('src/state/pagesSlice.ts', 'dueDay: day + r.everyDays'),
  'ripartire dalla scadenza vecchia darebbe quattordici messaggi in fila',
);

/* ============================================================================
   IL PANNELLO DEV E SEMPRE RAGGIUNGIBILE — §26, scostamento dichiarato

   🔷 «La modalità DEV in alto sempre presente anche se accedo senza url dev,
   tanto scelgo io di non cliccare ed entrare.»

   §26 vieta i controlli DEV in produzione. Quella regola protegge GLI UTENTI
   di un prodotto: qui l'utente e uno, e il proprietario, ed e quello che ha
   scritto la regola. Lo scostamento e voluto e sta scritto in App.tsx.

   Ma cambia una cosa vera: il reset totale e passato da «in fondo a un
   corridoio» a «in salotto». La conferma non e un vezzo, e la contropartita.
   ========================================================================= */

check(
  'DEV §26',
  'il pannello DEV si raggiunge senza l’indirizzo speciale',
  lacks('src/App.tsx', "get('dev') === '1'"),
);
check(
  'DEV §26',
  'e lo scostamento da §26 e dichiarato dove succede',
  has('src/App.tsx', "l'utente è uno, è il proprietario"),
);
check(
  'DEV §26',
  'il reset totale chiede conferma prima di cancellare',
  has('src/dev/DevPanel.tsx', 'function ResetAllButton'),
  'a due tocchi da ogni schermata, senza conferma sarebbe una trappola',
);
check(
  'DEV §26',
  'la conferma dice cosa stai per perdere, con i numeri veri',
  has('src/dev/DevPanel.tsx', 'Stai per cancellare'),
);
check(
  'DEV §26',
  'e dice se la teca ti salva qualcosa',
  has('src/dev/DevPanel.tsx', 'nella teca restano'),
);
check(
  'DEV §26',
  'la conferma non e un dialogo del browser',
  lacks('src/dev/DevPanel.tsx', 'window.confirm'),
  'su iPhone compare in un punto imprevedibile e si chiude per sbaglio',
);

/* ============================================================================
   LE IMMAGINI SI GENERANO DA SOLE — §22.4

   «Ma aspetta, quando generi un personaggio automaticamente generi tutte le
   immagini no?» No, e aveva ragione lui che dovrebbe: `askImage` esisteva e
   non la chiamava nessuno.

   Il difetto da sorvegliare non e che smetta di funzionare: e che torni a
   BLOCCARE. Una nascita che aspetta sei chiamate di rete non e piu una
   nascita, e una che si rigenera ogni volta cambia faccia alla creatura.
   ========================================================================= */

check(
  'ASSET §22.4',
  'qualcuno chiama davvero il generatore di immagini',
  has('src/assets-pipeline/generate.ts', 'askImage(') &&
    has('src/state/store.ts', "generateAssetsFor(record.data.name, { only: ['profile_portrait'] })"),
);
check(
  'ASSET §22.4',
  'la nascita non aspetta le immagini',
  has('src/state/store.ts', 'void import(\'../assets-pipeline/generate\')'),
  'sei chiamate di rete davanti a una schermata vuota non sono una nascita',
);
check(
  'ASSET §22.4',
  'il ritratto si chiede per primo',
  has('src/assets-pipeline/generate.ts', "const first: AssetType[] = ['profile_portrait'"),
  'e l’unico che si vede subito: generarlo per ultimo vuol dire aspettare gli altri',
);
check(
  'ASSET §22.4',
  'quello che c’e non si rigenera mai',
  has('src/assets-pipeline/generate.ts', 'getAssetUrlSync(name, t) === null'),
);
check(
  'ASSET §22.4',
  'si chiedono in serie, non tutte insieme',
  has('src/assets-pipeline/generate.ts', 'for (const type of wanted)'),
  'sei in parallelo supererebbero il tetto di spesa di sei immagini invece che di una',
);
check(
  'ASSET §22.4',
  'entrano dalla stessa porta dell’import a mano',
  has('src/assets-pipeline/generate.ts', 'importAssetFile(record, file'),
  'due strade per far entrare un’immagine sono due posti dove sbagliare lo slot',
);
check(
  'ASSET §22.4',
  'l’avanzamento non finisce nei salvataggi',
  has('src/state/store.ts', 'assetProgress: _p'),
);

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
