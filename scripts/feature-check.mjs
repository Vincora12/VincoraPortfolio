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

import { readFileSync, existsSync, readdirSync } from 'node:fs';

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

/* ⚠️ In questo progetto i commenti spiegano anche le cose che NON si fanno, e
   per spiegarle le nominano. Un `lacks` sul testo intero inciampa nel commento
   che dice «non usare `localStorage.clear()`» e dichiara presente proprio la
   cosa che quel commento vieta. Questa versione guarda il codice. */
const stripComments = (t) =>
  (t ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lacksInCode = (file, needle) => !stripComments(read(file)).includes(needle);
const count = (file, re) => ((read(file) ?? '').match(re) ?? []).length;

/* ============================================================================
   🔶 GLI STRUMENTI NON SONO PIÙ IN UN FILE SOLO — e non è la prima volta che
   un ago si rompe così.

   Sei aghi puntavano a `src/dev/DevPanel.tsx` perché quel giorno la panchina
   delle vibrazioni, la conferma del reset e la telemetria stavano lì dentro.
   Adesso stanno in `src/dev/sections.tsx`, e domani — quando DEV verrà tolto
   dal sito — staranno in `src/lab/`.

   🔒 Ma la DECISIONE non è mai stata «questa cosa sta in quel file». È «esiste
   una superficie da cui si può fare questa cosa». Quindi l'ago guarda tutte
   le superfici di servizio insieme: DEV finché c'è, il laboratorio da adesso.
   Così il trasloco non lo rompe, e cancellarla per davvero sì — che è
   esattamente quello che un ago deve saper distinguere.
   ========================================================================= */
const SURFACE_DIRS = ['src/dev', 'src/lab'];
const surfaceText = (() => {
  let all = '';
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|css)$/.test(entry.name)) all += `\n${readFileSync(full, 'utf8')}`;
    }
  };
  SURFACE_DIRS.forEach(walk);
  return all;
})();
/** Vero se una qualsiasi superficie di servizio (DEV o LAB) contiene l'ago. */
const hasInSurface = (needle) => surfaceText.includes(needle);

const ROUTING_FILE = 'netlify/functions/_shared/routing.ts';
const IMPORT_UI = 'src/dev/AssetImport.tsx';
const PROVIDERS_FILE = 'netlify/functions/_shared/providers.ts';

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
/* 🔶 L'AGO ERA `phase: 'scan' as Phase` E ADESSO GUARDA UN'ALTRA COSA, perché
   la decisione è cambiata per davvero: VINZMON_COMPLETE_NARRATIVE_SYSTEM v4
   §3 mette il First Sync all'ingresso e §3.2 dichiara il vecchio percorso
   «no longer canonical».

   ⚠️ Ma NON si cancella: quello che va protetto adesso è la compatibilità.
   Un salvataggio fermo a metà delle dodici domande deve poterle finire, e
   l'unico modo perché resti vero è che qualcuno lo controlli. Quindi l'ago
   verifica che la fase esista ancora e che la schermata sia ancora montata. */
check('SIGNAL SCAN §12', 'resta raggiungibile per i salvataggi vecchi', has(STORE, "| 'scan'"));
check(
  'SIGNAL SCAN §12',
  'e la sua schermata è ancora montata',
  has('src/App.tsx', "case 'scan':"),
);

/* ============================================================================
   FIRST SYNC — VINZMON_COMPLETE_NARRATIVE_SYSTEM v4 §3
   ========================================================================= */

const SYNC = 'src/engine/firstSync.ts';
const syncQuestions = count(SYNC, /^ {4}index: \d+,$/gm);

check('FIRST SYNC §3', 'sedici domande', syncQuestions === 16, `${syncQuestions} trovate`);
check('FIRST SYNC §3', 'la schermata esiste', existsSync('src/screens/FirstSync.tsx'));
check('FIRST SYNC §3', 'è la prima fase della partita', has(STORE, "phase: 'first-sync' as Phase"));
/* 🔒 §3.1 — «Do not show percentages by default». L'ago guarda la schermata,
   non il motore: i conteggi ESISTONO e servono a DEV, quello che non deve
   esistere è una percentuale sotto gli occhi dell'utente. */
/* 🔒 §3.1 — «Do not show percentages by default». I conteggi per polo ESISTONO
   e servono a DEV; quello che non deve succedere è che finiscano nella
   schermata dell'utente. L'ago guarda proprio quello: `counts` non si legge
   in `FirstSync.tsx`. */
check(
  'FIRST SYNC §3.1',
  'i conteggi per polo non finiscono in interfaccia',
  !has('src/screens/FirstSync.tsx', '.counts'),
);
check(
  'FIRST SYNC §3.1',
  'e dice che non è una diagnosi',
  has('src/screens/FirstSync.tsx', 'Non è una diagnosi'),
);
/* §3: i 12 archetipi narrativi NON sono il test dell'utente. Se un giorno
   qualcuno li usasse qui, questo strato tornerebbe a essere quello che il
   brief passa tre paragrafi a dire che non è. */
check(
  'FIRST SYNC §3',
  'non usa i 12 archetipi narrativi come test',
  !has(SYNC, 'NARRATIVE_ARCHETYPES'),
);

/* --- §3.2 / §4 — niente incubazione, tre letture --- */

check('PRIMO MON §4', 'la scelta fra tre letture esiste', existsSync('src/screens/EggChoice.tsx'));
check('PRIMO MON §4', 'si vedono solo Family e Affinità', has('src/screens/EggChoice.tsx', 'egg.data.affinity'));
check(
  'PRIMO MON §4',
  'e le altre due non entrano nel Dex',
  has(STORE, 'eggs: []'),
);
check(
  'PRIMO MON §3.2',
  'il percorso nuovo non passa dall’incubazione',
  has(STORE, 'function afterProtocolPhase'),
);

/* --- §13 / §15.1 — mondo e categorie epistemiche --- */

const WORLD = 'src/engine/world.ts';
check('MONDO §13', 'il mondo esiste come strato suo', existsSync(WORLD));
check(
  'MONDO §13',
  'appartiene al MON e non alla forma',
  has(WORLD, 'IL MONDO APPARTIENE AL MON, NON ALLA FORMA'),
);
check(
  'MONDO §15.1',
  'ogni voce di canone dichiara da dove viene',
  has(WORLD, 'epistemic: Epistemic'),
);
check(
  'MONDO §15.1',
  'e un’ipotesi non si promuove da sola',
  has(WORLD, 'export function promoteConnection'),
);
check('MONDO §14', 'il ritorno non ricarica un salvataggio', has(WORLD, 'export function returnBlock'));
check('MONDO §10.2', 'il registro dice cosa non ripetere', has(WORLD, 'doNotRepeat'));

/* ============================================================================
   SPESA — le due tabelle di prezzi devono raccontare la stessa cosa

   🔴 Erano due e solo una era aggiornata: `spend.ts` (server, tetto vero) aveva
   i prezzi GPT-5.6, `usage.ts` (browser, pannello COSTI) no — quindi Luna
   veniva mostrata a venticinque volte il suo prezzo. Un contatore che
   sovrastima manda a risparmiare dove non serve, ed è così che si finisce a
   guardare il testo mentre a pesare sono le immagini.
   ========================================================================= */

const USAGE = 'src/ai/usage.ts';
const SPEND = 'netlify/functions/_shared/spend.ts';
const modelliDaPrezzare = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'];
const senzaPrezzoClient = modelliDaPrezzare.filter((m) => !has(USAGE, `'${m}'`));
check(
  'SPESA',
  'il pannello COSTI conosce i prezzi di tutti i modelli che usa',
  senzaPrezzoClient.length === 0,
  senzaPrezzoClient.join(', '),
);

/* La qualità delle immagini è il parametro che decide il conto: se smettesse
   di essere mandato, si tornerebbe a pagare il default senza accorgersene —
   che è esattamente com'era prima, e per mesi. */
check(
  'SPESA',
  'la qualità delle immagini viene dichiarata, non lasciata al default',
  has('netlify/functions/_shared/providers.ts', 'quality: ImageQuality'),
);
check(
  'SPESA',
  'e il tetto la prezza per quello che costa davvero',
  has(SPEND, 'QUALITY_FACTOR'),
);
check(
  'SPESA',
  'la bozza si può accendere da DEV',
  has('src/state/store.ts', 'draftImages'),
);
/* 🔒 E deve restare SPENTA di default: un interruttore da prove che si
   accende da solo peggiora il prodotto in silenzio. */
check(
  'SPESA',
  'ma resta spenta finché non la accendi tu',
  has('src/state/store.ts', 'draftImages: false'),
);

/* --- La qualità si paga dove si vede ----------------------------------------
   🔷 «Possiamo abbassare la qualità degli sticker, cose del genere?»

   Il criterio è UNO: a che dimensione l'asset finisce sotto gli occhi. Gli
   sticker sono sei facce dentro una tavola sola (~341×512 l'una) mostrate fra
   84 e 190px; il doodle è dichiarato «interpretazione da quaderno». I due che
   si guardano grandi — e il master, da cui gli altri DERIVANO — restano pieni.
   -------------------------------------------------------------------------- */

const ASSET_CATALOG = 'src/engine/assets.ts';
check(
  'QUALITÀ PER ASSET',
  'la qualità è dichiarata dal tipo di asset, non dal fornitore',
  has(ASSET_CATALOG, "quality?: 'low' | 'medium' | 'high'"),
);
check(
  'QUALITÀ PER ASSET',
  'sticker e doodle si vedono piccoli e nascono in bozza',
  (read(ASSET_CATALOG).match(/quality: 'low'/g) ?? []).length === 2,
);
/* 🔒 IL MASTER NON SI ABBASSA, e verrebbe voglia proprio perché non si vede
   mai: è l'immagine ALLEGATA come riferimento a tutti gli altri, quindi il
   risparmio non resterebbe su di lui — si propagherebbe agli altri tre. */
const masterBlock = read(ASSET_CATALOG).slice(
  read(ASSET_CATALOG).indexOf("type: 'character_master'"),
  read(ASSET_CATALOG).indexOf("type: 'character_toy'"),
);
check(
  'QUALITÀ PER ASSET',
  'ma il master resta pieno: è il riferimento da cui derivano gli altri',
  !masterBlock.includes('quality:'),
);
/* 🔒 E la bozza di DEV deve poter vincere su tutto: durante le prove si
   abbassa anche quello che in produzione resta pieno. */
check(
  'QUALITÀ PER ASSET',
  'la bozza di DEV vince sulla qualità dichiarata dall’asset',
  has('src/assets-pipeline/generate.ts', 'opts.quality ?? assetTypeDef(type).quality'),
);

/* --- La voce a due velocità -------------------------------------------------
   🔷 «Serve avere sempre tutto in alta? Usiamo delle AI basse, a chiamata si
   alzano.» — sì, e la letteratura del 2026 dà la stessa risposta: il routing
   taglia il 40-85% mandando al modello grosso solo il 14-26% delle chiamate.
   -------------------------------------------------------------------------- */

const ROUTING = 'netlify/functions/_shared/routing.ts';
check('VOCE A DUE VELOCITÀ', 'la voce ha un modello di tutti i giorni', has(ROUTING, 'everyday:'));
/* 🔒 LA STESSA CONDIZIONE decide se pensare e chi risponde. Separarle
   vorrebbe dire poter pagare il modello grosso per non farlo ragionare. */
check(
  'VOCE A DUE VELOCITÀ',
  'e a decidere è la stessa riga che accende il ragionamento',
  has(STORE, "stepModel('voice', pesante ? 'full' : 'everyday')"),
);
/* 🔒 Una presentazione è la prima frase di una forma che vivrà 28 giorni:
   non è un turno di tutti i giorni e non deve mai finire sul modello piccolo. */
check(
  'VOCE A DUE VELOCITÀ',
  'ma la presentazione alla nascita resta sempre piena',
  has(STORE, "stepModel('voice', 'full')"),
);
/* 🔒 Una scelta esplicita nel menu vince: chi mette Opus perché vuole Opus
   deve avere Opus anche su «ok». */
check(
  'VOCE A DUE VELOCITÀ',
  'e una scelta esplicita vince sul risparmio',
  has(ROUTING, "if (!chosen) return weight === 'everyday'"),
);
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
  hasInSurface('HapticBench'),
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
  has(APP, "phase === 'incubation' && onEgg") && has('src/screens/Splash.tsx', 'EggVessel'),
  'nei sette giorni non c’è barra sotto: la porta dell’uovo è l’unica che c’è',
);
check(
  'INGRESSO §13.7',
  'si entra quando si decide, non dopo un timer',
  lacks('src/screens/Splash.tsx', 'AUTO_ENTER_MS') &&
    has('src/screens/Splash.tsx', 'splash__enter'),
);
/* 🔶 QUESTI DUE AGHI CERCAVANO `'creature' | 'chat'`. Era lo stato che diceva
   se dentro MON stavi guardando la creatura o la conversazione — e la
   conversazione adesso è una TAB, non una vista dentro MON.

   🔷 «Il nav sotto deve avere prima la chat.»

   Le DECISIONI da tenere sono le stesse di allora, e valgono ancora: rientrare
   in una tab la riporta alla sua prima vista, e un cambio di fase riporta
   tutto all'inizio — quando l'uovo si schiude, quello che ti aspetta non è più
   lo stesso. Cambiano solo i nomi delle viste. */
check(
  'INGRESSO §13.7',
  'rientrare in una tab la riporta alla sua prima vista',
  has(APP, "if (next === 'mon') setMonView('mon');") &&
    has(APP, "if (next === 'me') setMeView('me');"),
  'una tab che si riapre dove l’avevi lasciata sembra non aver risposto al tocco',
);
check(
  'INGRESSO §13.7',
  'e a ogni cambio di fase si riparte dall’inizio',
  /useEffect\(\(\) => \{\s*setMonView\('mon'\);\s*setMeView\('me'\);\s*setOnEgg\(true\);\s*\}, \[phase\]\)/.test(
    read(APP) ?? '',
  ),
);
/* 🔷 «Appena entri c'è la chat aperta.» È l'inversione di gerarchia di tutta
   la barra: la conversazione non è più una cosa che si raggiunge da dentro un
   profilo, è il posto dove si arriva. */
check(
  'INGRESSO §13.7',
  'e appena entri c’è la chat',
  has(APP, "useState<Tab>('chat')") && has(APP, "{ id: 'chat', label: t.nav.chat"),
);
/* 🔒 Niente è stato tolto nel riordino: le quattro schermate della vecchia
   barra ci sono tutte, due scese di un livello sotto la voce di cui parlano.
   Un riordino che perde pezzi non è un riordino. */
check(
  'INGRESSO §13.7',
  'e il riordino non ha perso nessuna schermata',
  /* 🔶 `RoomScreen` era in questa lista, ed è uscita: MIND.SOCIAL è stata
     tolta su richiesta. Le altre quattro restano, e restano dove il riordino
     le ha messe. */
  ['MindlineMapScreen', 'DexScreen', 'CalendarScreen', 'MeOverviewScreen'].every((c) =>
    has(APP, `<${c}`),
  ),
  'mind.map e mind.dex sotto MON; il calendario sotto ME',
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
/* ============================================================================
   LA SCHERMATA DEL .MON, RIFATTA

   🔷 «Nome in alto. Sulla foto adesivi attaccati delle varie espressioni, come
      se fosse sticker, in basso. Poi abbiamo bio e doodle e altre cose su di
      lui, tutto nella prima schermata a scorrimento.»
   ========================================================================= */

const SPLASH = 'src/screens/Splash.tsx';
const SCREENS_CSS = 'src/screens/screens.css';
const STICKERS = 'src/system/LiveMon.tsx';

/* I sei posti degli adesivi, letti dal CSS: è lì che sono dichiarati. */
const STICK_RULES = [...(read(SCREENS_CSS) ?? '').matchAll(/\.stick--[a-zA-Z]+\s*\{[^}]*\}/g)].map(
  (m) => m[0],
);
const STICK_W = STICK_RULES.map((r) => Number(r.match(/width:\s*(\d+)px/)?.[1] ?? 0));


check(
  'INGRESSO §13.7',
  'il nome sta sopra la foto',
  (read(SPLASH) ?? '').indexOf('splash__id') < (read(SPLASH) ?? '').indexOf('splash__stage'),
  'sotto, si guardava una creatura senza sapere chi fosse',
);
/* 🔴 L'ago che sarebbe servito prima. Il nome c'era, in cima, con il suo corpo
   display — e non si vedeva: `100cqi` dentro un contenitore stretto sul
   contenuto vale zero, quindi il carattere veniva zero. Nessun errore da
   nessuna parte.

   ⚠️ Punta alla LARGHEZZA DICHIARATA, che è la decisione, non al valore del
   corpo: `min(1em, ...)` può cambiare, il fatto che la misura debba arrivare
   da fuori no. */
check(
  'INGRESSO §13.7',
  'e ha una larghezza vera su cui calcolarsi',
  /\.splash__id\s*\{[^}]*width:\s*100%/.test(read(SCREENS_CSS) ?? '') &&
    /\.splash__name\s*\{[^}]*width:\s*100%/.test(read(SCREENS_CSS) ?? ''),
  'con la larghezza presa dal contenuto, `100cqi` vale zero e il nome sparisce',
);
check(
  'INGRESSO §13.7',
  'quelli sulla foto sono ancorati alla foto, non al riquadro',
  has(SPLASH, 'splash__photo') && /\.splash__photo\s*\{[^}]*position:\s*relative/.test(read(SCREENS_CSS) ?? ''),
  'il riquadro è alto mezza videata sempre: ancorati lì restavano sospesi',
);
/* 🔒 Sopra c'è la creatura, che è la cosa per cui questa schermata esiste. */
check(
  'INGRESSO §13.7',
  'e stanno tutti e due in basso, mai sulla faccia',
  STICK_RULES.filter((r) => /\.stick--photo/.test(r)).every((r) => /bottom:/.test(r) && !/top:/.test(r)),
);
/* 🔶 QUESTI AGHI GUARDAVANO UNA TABELLA IN TYPESCRIPT. Gli adesivi stavano
   tutti sulla foto, sparpagliati da un array di coordinate, e gli aghi
   leggevano quell'array.

   🔷 «Più grandi e sparsi nella pagina in vari punti.»

   I posti adesso sono sei, lungo tutta la pagina, e ognuno è dichiarato nel
   CSS accanto al pezzo che lo ospita — perché la posizione di una cosa
   rispetto al nome, alla foto o al pulsante è un fatto di impaginazione, non
   di dati. Quindi gli aghi leggono il CSS. Le DECISIONI sono le stesse. */
check(
  'INGRESSO §13.7',
  'gli adesivi sono sparsi in sei punti diversi della pagina',
  STICK_RULES.length === 6,
  `${STICK_RULES.length} posti dichiarati`,
);
check(
  'INGRESSO §13.7',
  'e sbordano invece di stare allineati dentro',
  STICK_RULES.filter((r) => /(left|right|top|bottom):\s*-/.test(r)).length >= 4,
  'uno allineato dentro è una didascalia; uno che sborda è stato attaccato lì',
);
/* ⚠️ QUELLO CHE HO SBAGLIATO IO. La regola «mai sopra una riga di testo» era
   scritta nel commento del CSS mentre i numeri facevano il contrario: due
   adesivi finivano sopra la bio e sopra «COM'ERI QUANDO È NATO». Nessun
   controllo poteva vederlo — l'ho scoperto rendendo la pagina.

   🔒 Quello che un ago PUÒ tenere è che gli adesivi restino attaccati SOLO ai
   cinque punti in cui lo spazio c'è: il nome, la foto, il pulsante, l'angolo
   del disegno e il sigillo. Un nome nuovo qui dentro vuol dire un posto nuovo,
   e un posto nuovo va guardato a schermo prima di fidarsi. */
check(
  'INGRESSO §13.7',
  'e stanno solo dove la pagina ha spazio vero, mai su una riga da leggere',
  ['--bio', '--photoL', '--photoR', '--door', '--doodle', '--sigil'].every((n) =>
    STICK_RULES.some((r) => r.startsWith(`.stick${n}`)),
  ),
  'i blocchi di testo occupano tutta la colonna: lì un adesivo è un ostacolo',
);
/* ⚠️ L'ADESIVO SUL PULSANTE È IL MOTIVO PER CUI QUESTO AGO ESISTE. Senza
   `pointer-events: none`, il dito che tocca la parte di PARLAGLI coperta
   dall'adesivo NON apre la chat: colpisce l'adesivo. Un pulsante che smette
   di rispondere su un pezzo di sé sembra un'app bloccata. */
check(
  'INGRESSO §13.7',
  'e non rubano il tocco al pulsante che coprono',
  /\n\.sticker\s*\{[^}]*pointer-events:\s*none/.test(read(SCREENS_CSS) ?? ''),
);
/* 🔒 512 pixel di cella ridotti a 36 sono diciassette volte: la testa viene
   quindici pixel e l'occhio meno di due, e le sei espressioni si distinguono
   per differenze del volto. Sotto una certa misura non sono sei espressioni,
   sono sei macchie. */
check(
  'INGRESSO §13.7',
  'e sono abbastanza grandi perché un’espressione si veda',
  STICK_W.length === 6 && Math.min(...STICK_W) >= 80,
  `il più piccolo è ${Math.min(...STICK_W)}px — una cella del foglio è 512`,
);

/* 🔒 §18A. Il ripiego di `MonFace` è il ritratto: usato per sei adesivi
   darebbe sei volte la stessa faccia spacciata per sei espressioni. Una
   casella vuota dice la verità, sei copie no. */
check(
  'INGRESSO §13.7',
  'senza il foglio, gli adesivi restano vuoti invece di mostrare sei volte il ritratto',
  has('src/system/LiveMon.tsx', 'sticker--empty') &&
    !/ExpressionStickers[\s\S]{0,1200}<MonFace/.test(read('src/system/LiveMon.tsx') ?? ''),
);
/* 🔶 L'ago cercava `<BioPanel mon={mon} />` su una riga sola: la forma di
   quel giorno. Adesso il quaderno riceve anche un adesivo, quindi la chiamata
   sta su più righe — e la DECISIONE («la bio sta nella prima schermata, ed è
   quella vera») non è cambiata di un millimetro. */
check(
  'INGRESSO §13.7',
  'bio e doodle stanno nella prima schermata',
  has(SPLASH, '<BioPanel') && has(SPLASH, 'mon={mon}'),
  'tutto quello che il personaggio è, in una pagina che scorre',
);
/* ⚠️ La bio è UNA. Riscriverne una seconda versione qui sarebbe due quaderni
   che invecchiano separati — e il primo sintomo sarebbe che la scheda e la
   home raccontano due storie diverse della stessa creatura. */
check(
  'INGRESSO §13.7',
  'ed è lo stesso quaderno della scheda, non una copia',
  lacksInCode(SPLASH, 'readableBio') && has('src/screens/SpecimenProfile.tsx', 'BioPanel'),
);

/* ════════════════════════════════════════════════════════════════════════════
   🔷 «Permetti all'AI di poter modificare la UI — solo la UI, l'estetica.»
   ════════════════════════════════════════════════════════════════════════════ */
const SKIN = 'src/engine/skin.ts';

/* ⚠️ È L'AGO CHE CONTA. Uno strumento che accetta CSS libero può spegnere
   l'app — e l'unica strada per rimetterla a posto passa dall'app che nel
   frattempo non si vede. Il catalogo chiuso è tutta la sicurezza che c'è. */
check(
  'ASPETTO §10',
  'può cambiare solo le manopole dichiarate, mai CSS libero',
  has(SKIN, 'export const MANOPOLE') &&
    lacksInCode('src/ai/tools.ts', 'innerHTML') &&
    lacksInCode(SKIN, 'insertRule') &&
    lacksInCode(SKIN, 'styleSheet'),
  'un campo libero che finisce in un foglio di stile può rendere l’app illeggibile',
);
/* 🔒 §17 — uno stato colorato porta sempre anche una parola. Se il rosso
   dell'allarme diventasse verde, la parola resterebbe giusta e il colore
   mentirebbe. E `--char-*` è chi è la creatura, non una preferenza. */
check(
  'ASPETTO §10',
  'e i segnali e l’accento del personaggio restano fuori dal catalogo',
  /* 🔒 `lacksInCode` toglie i commenti prima di cercare: qui sopra quei token
     sono NOMINATI, in un commento che spiega perché sono esclusi. Cercarli nel
     file grezzo farebbe fallire l'ago proprio sulla spiegazione della regola
     che deve difendere. */
  lacksInCode(SKIN, '--signal-') && lacksInCode(SKIN, '--char-'),
  'un rosso d’allarme che diventa verde fa mentire la parola che ci sta accanto',
);
/* ⚠️ Il catalogo non può escludere inchiostro e sfondo dello stesso colore:
   sono due modifiche legittime prese una alla volta. Serve una strada di
   ritorno che non abbia bisogno di vedere lo schermo. */
check(
  'ASPETTO §10',
  'e si torna indietro anche a schermo illeggibile',
  has('src/App.tsx', "get('aspetto') !== 'reset'") && has('src/state/store.ts', 'resetSkin: () => {'),
  '`?aspetto=reset` si scrive nella barra dell’indirizzo, che funziona sempre',
);
/* 🔒 I token CSS vivono su un elemento che al ricaricamento nasce pulito: la
   pelle sta nello stato salvato e va riscritta a ogni avvio, o sembrerebbe
   che la modifica non fosse mai stata fatta. */
check(
  'ASPETTO §10',
  'e l’aspetto scelto sopravvive a un ricaricamento',
  has('src/App.tsx', 'applySkin(skin);') && has('src/state/store.ts', '  skin: RESET_SKIN,'),
);

/* 🔷 «Staccagli tutto riguardante la sua personalità e la possibilità di
   fallback, facciamolo neutro, e usiamolo solo per modificare l'app.» */

/* ⚠️ NON SI AGGIUNGE UNA RIGA AL BRIEFING: SE NE USA UN ALTRO. Il briefing
   della voce è lungo sedicimila caratteri e dice, in fondo — cioè nel posto
   che pesa di più — «scegli una cosa da dire, una risposta corta è finita».
   Sono le regole giuste per conversare e quelle sbagliate per un turno in cui
   la cosa da fare è CHIAMARE UNO STRUMENTO. Una riga in più lì dentro è una
   regola in minoranza. */
check(
  'COSTRUZIONE',
  'in modalità costruzione il briefing del personaggio non parte proprio',
  has('src/ai/voicePrompt.ts', 'export function buildOperatorPrompt') &&
    has('src/ai/client.ts', '? [{ text: buildOperatorPrompt(), cache: true }]'),
  'aggiungere «usa gli strumenti» a un briefing che dice di conversare è una regola in minoranza',
);
/* 🔒 Memorie e opinioni sono materiale del personaggio: qui il personaggio non
   c'è, e portarsele dietro sarebbe rimettere per la porta di servizio quello
   che si è appena tolto. */
check(
  'COSTRUZIONE',
  'e non si porta dietro memoria né turni del personaggio',
  has('src/ai/client.ts', 'const turns: Turn[] = build ? [] : [...(memory?.turns ?? [])];'),
);
/* ⚠️ IL RIPIEGO È GIUSTO IN CHAT E VELENOSO SU UN BANCO DI LAVORO: dice «ok»
   dove non è successo niente, e chi legge crede che la modifica sia andata
   invece che la chiamata sia fallita. */
check(
  'COSTRUZIONE',
  'e un guasto si legge invece di nascondersi dietro una frase di cortesia',
  has('src/state/store.ts', "s0.buildMode ? `— nessuna risposta (${failure ?? 'errore'})` : spoken"),
  'una frase di ripiego su un banco di lavoro fa sembrare riuscita una chiamata fallita',
);
/* 🔴 E QUESTO ERA UN GUASTO VERO, non una scelta: `output_config.effort` era
   murato a `low` sul percorso Anthropic e ignorava chi chiamava. A sforzo
   basso il modello sceglie la strada corta — rispondere — invece di decidere
   quale strumento usare. */
check(
  'COSTRUZIONE',
  'e lo sforzo richiesto arriva davvero al fornitore',
  has('netlify/functions/_shared/providers.ts', "output_config: { effort: req.effort ?? 'low' }"),
  'era murato a `low`: ogni chiamata Anthropic girava a sforzo basso qualunque cosa avesse chiesto',
);

/* 🔷 «Vorrei anche togliere pulsanti e spostare elementi.» */
const LAYOUT = 'src/engine/layout.ts';

/* ⚠️ È L'AGO CHE CONTA, e non è lo stesso di `skin.ts`. Lì il rischio era un
   colore illeggibile; qui è un elemento che sparisce. Il modello non deve
   poter nominare un selettore: nomina un PEZZO di una tabella, e le regole le
   scrive il codice — due forme sole, `display:none` e `order`. */
check(
  'SCHERMATE §13',
  'può spostare solo i pezzi dichiarati, mai scrivere selettori',
  has(LAYOUT, 'export const PEZZI') &&
    has(LAYOUT, 'const noti = new Set(PEZZI.map((p) => p.attr));') &&
    lacksInCode(LAYOUT, 'querySelector') &&
    lacksInCode(LAYOUT, 'innerHTML'),
  'una regola scritta dal modello può nascondere qualsiasi cosa, compresa la via di ritorno',
);
/* 🔒 SENZA QUESTO L'INTERO STRUMENTO È UNA TRAPPOLA. Nascondere il campo di
   testo si può fare una volta sola: dopo, non c'è più nessun posto da cui
   chiedere di rimetterlo. */
check(
  'SCHERMATE §13',
  'e i tre pezzi che servono a disfare non si possono nascondere',
  has(LAYOUT, "export const INTOCCABILI = ['barra', 'campo-testo', 'dev']") &&
    has(LAYOUT, 'INTOCCABILI as readonly string[]).includes'),
  'la barra, il campo di testo e DEV sono le tre strade per dirgli di rimettere le cose',
);
/* 🔒 Le etichette devono esistere sugli elementi VERI: un catalogo che nomina
   pezzi inesistenti accetta il comando e non fa niente, che è peggio di
   rifiutarlo. */
check(
  'SCHERMATE §13',
  'e i pezzi del catalogo esistono davvero nelle schermate',
  ['nome', 'foto', 'parlagli', 'bio', 'statistiche', 'identita', 'sigillo'].every((id) =>
    has('src/screens/Splash.tsx', `data-pezzo="${id}"`),
  ) && has('src/screens/CompanionHome.tsx', 'data-pezzo="faccia"'),
);
/* 🔶 La via di fuga ripara ADESSO due cose. Da quando si nascondono pezzi,
   «non si vede niente» ha due cause e chi scrive quell'indirizzo non sa
   quale gli è capitata. */
check(
  'SCHERMATE §13',
  'e `?aspetto=reset` rimette anche i pezzi, non solo i colori',
  has('src/state/store.ts', 'set({ skin: RESET_SKIN, layout: RESET_LAYOUT });'),
  'una via di fuga che ripara solo una delle due cause non è una via di fuga',
);

/* 🔷 «È ancora nera questa schermata.»

   ⚠️ L'AGO PUNTA ALLA DECISIONE, NON AL COLORE. Non cerca `#ffffff` da nessuna
   parte: cerca che la home della creatura NON entri più nel campo inchiostro.
   È da lì che veniva il nero — `--white` diventa #0b0b0c sotto
   `[data-field='ink']` — e finché `onCreature` non concorre a `inkField`,
   qualunque bianco scritto nel CSS regge. Scritto al contrario, l'ago
   morirebbe alla prima riscrittura del foglio di stile. */
/* 🔷 «Ne carico uno e poi basta, non ne posso caricare altri.»

   ⚠️ Il guasto grosso — «01» come suffisso buono per tutto — lo prende
   `verify:package`, che fa girare il riconoscimento per davvero. Qui restano
   le due decisioni di INTERFACCIA che rendevano il sintomo peggiore di com'era:
   la lista che si azzerava, e il campo file che non riemetteva l'evento sullo
   stesso file. */
check(
  'IMPORT §22.3',
  'la lista degli import si accumula',
  has(IMPORT_UI, 'setPending((prev) => [...prev,') &&
    lacksInCode(IMPORT_UI, 'setPending(unmatched)'),
  'il secondo import buttava via i file del primo ancora da mappare',
);
check(
  'IMPORT §22.3',
  'e lo stesso file si può riscegliere',
  has(IMPORT_UI, "e.target.value = ''"),
  'senza svuotare il campo il browser non riemette `change` sullo stesso nome',
);
check(
  'IMPORT §22.3',
  'lo slot di un file importato lo dice il catalogo, non una lista a mano',
  has('src/assets-pipeline/assetStore.ts', 'ASSET_TYPES.find((a) => a.assetId === assetId)'),
  'la lista scritta a mano aveva perso `idle_01` per due versioni',
);
check(
  'INGRESSO §13.7',
  'la home della creatura non è più campo inchiostro',
  lacksInCode(APP, 'onCreature ||') && has(APP, "INK_PHASES.includes(phase) ||"),
  'il character master esce su fondo chiaro: sul nero se ne giudicano male i contorni',
);
check(
  'INGRESSO §13.7',
  'ma l’incubazione lo resta',
  has(APP, "'incubation'") && /INK_PHASES[^\n]*incubation/.test(read(APP) ?? ''),
  'lì non c’è nessun master da guardare: c’è un uovo, ed è un evento',
);
check(
  'INGRESSO §13.7',
  'la creatura non fluttua né sulla home né sulla scheda',
  has('src/screens/Splash.tsx', 'still />') && has('src/screens/SpecimenProfile.tsx', 'still'),
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
  hasInSurface('GenerationTelemetry'),
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
  /* 🔶 Puntava a `id: 'rarity' as const`, cioè alla FORMA in cui le linguette
     erano scritte quel giorno. Raggruppandole in due livelli è saltato, e non
     era saltata la decisione: la sezione c'era ancora. Adesso punta a quello
     che deve restare vero — la scheda è elencata da qualche parte, e qualcuno
     la disegna. */
  has('src/dev/DevPanel.tsx', "{ id: 'rarity', label: 'RARITÀ' }") &&
    has('src/dev/DevPanel.tsx', "tab === 'rarity' && <RaritySection />"),
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
  hasInSurface('function ResetAllButton'),
  'a due tocchi da ogni schermata, senza conferma sarebbe una trappola',
);
check(
  'DEV §26',
  'la conferma dice cosa stai per perdere, con i numeri veri',
  hasInSurface('Stai per cancellare'),
);
check(
  'DEV §26',
  'e dice se la teca ti salva qualcosa',
  hasInSurface('nella teca restano'),
);
check(
  'DEV §26',
  'la conferma non e un dialogo del browser',
  !hasInSurface('window.confirm'),
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
  /* 🔶 L'ago guardava la chiamata dentro `hatch`. Quella non c'è più: le
     immagini le chiede la schermata di nascita, una per una. La decisione che
     protegge è sempre la stessa — `askImage` non deve tornare a essere una
     funzione che non chiama nessuno — quindi adesso chiede che ci sia un
     chiamante NEL PRODOTTO, non in quella riga lì. */
  has('src/assets-pipeline/generate.ts', 'askImage(') &&
    has('src/screens/Encounter.tsx', 'forgeOne(monName, type)'),
);
check(
  'ASSET §22.4',
  'la nascita non aspetta le immagini',
  /* 🔶 Adesso la nascita UNA immagine la aspetta — è quello che è stato
     chiesto: «genera la prima, me la mostra, io approvo». Quello che non
     cambia è che l'attesa non possa intrappolarti: il pulsante che porta
     dentro non si disabilita mai, nemmeno mentre una chiamata è in volo. */
  lacksInCode('src/screens/Encounter.tsx', 'variant="primary" block disabled={busy}'),
  'sei chiamate di rete davanti a una schermata vuota non sono una nascita',
);
/* ════════════════════════════════════════════════════════════════════════════
   🔴 QUI C'ERANO DUE AGHI CHE DIFENDEVANO DUE ORDINI OPPOSTI.

   Il primo pretendeva `const first: AssetType[] = ['profile_portrait', …]` in
   `generate.ts` — «è l'unico che si vede subito». Il secondo pretendeva che
   lo store rimettesse il master in testa. E il commento in mezzo lo chiamava
   «una contraddizione voluta fra due regole vere».

   Non era voluta: era un guasto con una giustificazione addosso. Ogni asset
   derivato porta l'ordine «allega il CHARACTER MASTER, è lui il personaggio»,
   e quella riga compare solo se il master ESISTE. Con il ritratto per primo,
   la prima immagine di una creatura nasceva senza riferimento — e siccome era
   la prima che vedevi, diventava lei la faccia. Poi arrivava il master, che
   era un'altra creatura.

   🔒 L'ordine adesso è UNO e viene dalle dipendenze dichiarate. `verify:package`
   lo fa girare per davvero e controlla che nessun asset esca prima di quello
   da cui dipende; qui resta la decisione: nessuna seconda lista.
   ════════════════════════════════════════════════════════════════════════════ */
check(
  'ASSET §22.4',
  'l’ordine di generazione viene dalle dipendenze, non da una lista a mano',
  lacksInCode('src/assets-pipeline/generate.ts', "const first: AssetType[] = ['profile_portrait'") &&
    has('src/engine/assets.ts', 'a.dependsOn.every((d) => fatti.has(d))'),
  'il ritratto per primo faceva nascere la faccia canonica senza la faccia canonica',
);
check(
  'ASSET §22.4',
  'e non esiste più una seconda lista che possa contraddire la prima',
  count('src/assets-pipeline/generate.ts', /export function generationOrder/g) === 1 &&
    has('src/assets-pipeline/generate.ts', 'ordineCanonico().map'),
);
/* ════════════════════════════════════════════════════════════════════════════
   V1 — L'AI DECIDE UNA VOLTA, POI IL SISTEMA USA IL RISULTATO

   🔷 «Il Character Master è la decisione visiva. Gli asset derivati la
      conservano e la mettono in scena. Niente riscrittura AI in mezzo.»

   Il conto di prima, per una creatura nuova: sei riscritture di prompt da un
   modello di testo, più il Resolver, più la bio. Otto chiamate di testo. Cinque
   di quelle riscritture rimasticavano un personaggio già deciso.
   ════════════════════════════════════════════════════════════════════════════ */
check(
  'ASSET §22.4',
  'i cinque derivati hanno un template tecnico, non un briefing',
  has('src/assets-pipeline/derived.ts', 'export function derivedPrompt') &&
    has('src/assets-pipeline/promptFor.ts', "source: 'derivato'"),
  'il personaggio è già deciso e l’immagine viene allegata: al testo resta la trasformazione',
);
/* ⚠️ È L'AGO CHE VALE PIÙ DI TUTTI QUESTI. Una riscrittura chiesta per un
   asset derivato è, per costruzione, un modello di testo pagato per
   riformulare una decisione già presa. Il giorno che questa riga torna a
   chiamarla per tutti, il risparmio sparisce senza che niente si rompa —
   ed è il modo in cui una semplificazione si disfa in silenzio. */
check(
  'ASSET §22.4',
  'e per loro non si chiama più il riscrittore di prompt',
  has('src/state/store.ts', 'const tecnico = usaTemplateDerivati(prima) && derivedPrompt(type) !== null;') &&
    has('src/state/store.ts', 'if (!tecnico) {'),
  'chiamare un modello per riformulare quello che il programma già sa è spesa senza decisione',
);
/* 🔒 §29 — una creatura tiene la versione con cui è nata. Le vecchie non hanno
   una risoluzione, quindi non entrano mai in questa strada. */
check(
  'ASSET §22.4',
  'ma le creature nate prima restano sulla loro strada',
  has('src/assets-pipeline/promptFor.ts', 'record.resolution != null &&'),
  'senza risoluzione il template derivato non scatta e vale il prompt di sempre',
);
/* 🔷 «Genera il master, poi STOP. Solo dopo che lo tengo, il resto.» */
check(
  'ASSET §22.4',
  'sul master il pulsante dice che si sta accettando, non «avanti»',
  has('src/screens/Encounter.tsx', 'at === 0') &&
    has('src/screens/Encounter.tsx', 't.face.masterAccept') &&
    has('src/i18n/it.ts', 'GENERA IL RESTO'),
  'lì non si scorre una galleria: si accetta il personaggio e si autorizzano cinque immagini',
);

/* ════════════════════════════════════════════════════════════════════════════
   🔴 «SAI CHE NON RISPONDE»

   Le due catene che portano una risposta in chat finivano con `.then()` e
   basta. Costruire il briefing tocca quattro cataloghi — Family, Affinity,
   Role, Mood — e ognuna di quelle funzioni LANCIA su un valore che non
   conosce. Un .mon nato con un'etichetta poi rinominata faceva fallire la
   costruzione del prompt, la promessa veniva rifiutata, e nessuno la
   raccoglieva: `pending` restava vero per sempre.

   I puntini continuano. Non arriva niente. Non c'è nessun errore da nessuna
   parte. Da fuori è identico a «il modello ci sta mettendo molto», e non lo
   scopri mai.

   🔒 Il ripiego deterministico c'era già, calcolato PRIMA della chiamata
   apposta (§17). Era il pezzo che non veniva raggiunto.
   ════════════════════════════════════════════════════════════════════════════ */
check(
  'VOCE §17',
  'una risposta che fallisce non lascia la bolla appesa',
  /* 🔶 L'ago cercava `playReveal(..., spoken, ...)` alla lettera, e in modalità
     costruzione quel testo non è più `spoken`: è l'errore, scritto.

     ⚠️ E la decisione non è nemmeno «arrivare a playReveal»: i due punti la
     risolvono in due modi diversi e giusti — la risposta rivela un testo, la
     presentazione spegne e basta il `pending`, perché lì la bolla il suo testo
     ce l'ha già. La cosa che conta, e che vale per tutti e due, è che nessun
     `.catch` esca lasciando la bolla appesa. */
  count('src/state/store.ts', /\.catch\(\(e: unknown\) => \{/g) >= 2 &&
    count(
      'src/state/store.ts',
      /\.catch\(\(e: unknown\) => \{[\s\S]{0,600}?(playReveal\(|pending: false)/g,
    ) >= 2,
  'senza catch la promessa rifiutata non arriva mai a `playReveal` e i puntini restano per sempre',
);
check(
  'VOCE §17',
  'e nemmeno la presentazione alla nascita',
  has('src/state/store.ts', "console.warn('[voce] presentazione fallita"),
);
/* ⚠️ I CATALOGHI CONTINUANO A LANCIARE, ed è giusto: un'etichetta sconosciuta
   è un errore vero e va detto forte. Quello che non deve succedere è che un
   errore vero fermi la conversazione invece di degradarla. */
check(
  'VOCE §17',
  'ma la lettura della voce non lancia su un preset sconosciuto',
  has('src/engine/voiceBrief.ts', 'VOICE_PRESETS.find((p) => p.id === presetId)') &&
    lacksInCode('src/engine/voiceBrief.ts', 'voicePresetDef('),
  'un catalogo che cambia è normale; una chat che muore perché è cambiato non lo è',
);

/* ════════════════════════════════════════════════════════════════════════════
   V1 — LA VOCE È LATENTE, NON RECITATA
   ════════════════════════════════════════════════════════════════════════════ */
check(
  'VOCE §13',
  'il Voice DNA arriva al modello come tendenze, non come dodici numeri',
  has('src/engine/voiceBrief.ts', 'export function voiceBriefBlock') &&
    lacksInCode('src/ai/voicePrompt.ts', 'YOUR VOICE PARAMETERS'),
  'dodici parametri con l’ordine di farli vedere producono una risposta che li esibisce tutti',
);
/* 🔒 IL VOICE DNA NON È STATO TOLTO, ed è la cosa che questa revisione poteva
   rompere. Preset, mutazione ampia e deviazioni restano dov'erano. */
check(
  'VOCE §13',
  'ma il Voice DNA non è stato toccato: preset, mutazione, deviazioni',
  has('src/engine/voiceDna.ts', 'const preset = pickPreset(rng, dna, moodPrimary);') &&
    has('src/engine/voiceDna.ts', 'base + (rng() - 0.5) * 70') &&
    has('src/engine/voiceDna.ts', 'voice.deviations = deviations;'),
  '§14: il preset è una linea di base, non una classe',
);
check(
  'VOCE §13',
  'e il Character DNA continua a orientare il preset',
  has('src/engine/voiceDna.ts', "dna.traits.includes('teatrale')") &&
    has('src/engine/voiceDna.ts', "dna.traits.includes('tecnico')"),
);
/* 🔒 I numeri restano ispezionabili: una sintesi senza la fonte non si
   controlla. */
check(
  'VOCE §13',
  'i dodici numeri restano visibili dove si ispeziona una creatura',
  has('src/screens/SpecimenProfile.tsx', 'VOICE_AXES.map((axis)') &&
    has('src/screens/SpecimenProfile.tsx', 'voiceBrief(d.voice_dna, d.voice_preset)'),
  'la lettura sintetica accanto ai numeri da cui viene: è l’unico modo di vedere se ha perso qualcosa',
);
/* ⚠️ LA SINTESI È CODICE. Aggiungere una chiamata a un modello per farsi
   riformulare una tabella sarebbe la stessa spesa senza decisione che abbiamo
   appena tolto dai prompt derivati. */
check(
  'VOCE §13',
  'e la sintesi non costa una chiamata: è una tabella letta dal codice',
  lacksInCode('src/engine/voiceBrief.ts', 'ask(') && lacksInCode('src/engine/voiceBrief.ts', 'fetch('),
);

/* ════════════════════════════════════════════════════════════════════════════
   V1 — LA BIO SCEGLIE, NON COPRE
   ════════════════════════════════════════════════════════════════════════════ */
check(
  'BIO §8.1',
  'i fatti sono un serbatoio, non una lista da spuntare',
  has('src/ai/bioWriter.ts', 'SERBATOIO, NON UNA LISTA DA SPUNTARE') &&
    lacksInCode('src/ai/bioWriter.ts', 'non ne aggiungi e non ne togli'),
  '«non ne togli» è la riga che produceva il collage: ogni fatto vero, nessuna persona',
);
check(
  'BIO §8.1',
  'e il Voice DNA entra come voce, non come numeri',
  has('src/ai/bioWriter.ts', 'voiceBrief(d.voice_dna, d.voice_preset)'),
  'la stessa lettura che usa la chat: una creatura silenziosa scrive poco davvero',
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
   NOMI §10.6 — «Umore è diverso da mood vero?»

   Sì: tre cose diverse si chiamavano tutte «umore». Il temperamento con cui il
   .mon nasce, lo stato che gli cambia ogni giorno, e come stai tu. La parola
   resta di UNO solo — quello che si muove.
   ========================================================================= */

check(
  'NOMI §10.6',
  'il temperamento non si chiama «umore» in nessuna schermata',
  has('src/engine/progression.ts', "mood_primary: 'TEMPERAMENTO'") &&
    lacks('src/screens/SpecimenProfile.tsx', 'label="MOOD" value={`${d.mood_primary}') &&
    lacks('src/screens/Dex.tsx', 'label="MOOD"') &&
    lacks('src/screens/Splash.tsx', 'label="MOOD"'),
  '«UMORE: resta» sembrava dire che resterà di buonumore, e diceva che resterà SAD',
);
check(
  'NOMI §10.6',
  'come stai TU non si chiama come l’umore del .mon',
  has('src/engine/progression.ts', "MOOD: 'COME STO'") &&
    has('src/engine/chatExtract.ts', "out.push('COME STO')"),
);
check(
  'NOMI §10.6',
  'il nome del campo salvato non è stato toccato',
  has('src/engine/progression.ts', "'MOOD'] as const") &&
    has('src/engine/types.ts', 'mood_primary: string'),
  'i .mon già salvati e i pacchetti esportati contengono quelle chiavi',
);

/* ============================================================================
   FORNITORE, ATTIVAZIONE, DEV (§19.2 · §19.5 · §29)
   ========================================================================= */

check(
  '§19.2 FORNITORE',
  'cambiare fornitore non tocca niente di quello che il .mon è',
  has('src/state/store.ts', 'setVoiceModel: (model) => set({ voiceModel: model })'),
  'una riga sola: se un giorno ne comparisse una che azzera ricordi o umore, la premessa sarebbe smentita',
);
check(
  '§19.2 FORNITORE',
  'la preferenza dal browser non è un comando',
  /* La decisione: quello che arriva dal browser si CONFRONTA con un catalogo,
     non si instrada. Non guardo più la riga esatta che fa il confronto — quella
     è cambiata quando le scelte sono diventate due (voce e compilatore) — ma le
     due metà che la rendono vera: che un confronto ci sia, e che la stringa non
     finisca mai dritta dentro una rotta. */
  has('netlify/functions/ai.ts', 'resolveRoute(capability, payload.voiceModel)') &&
    count(ROUTING_FILE, /=== preferredModel/g) > 0 &&
    count(ROUTING_FILE, /return ROUTING\[capability\]/g) > 0 &&
    lacksInCode(ROUTING_FILE, 'model: preferredModel'),
  'un modello che il tetto non sa prezzare renderebbe cieco il contatore',
);
check(
  '§19.2 FORNITORE',
  'ogni scelta dice dove finiscono le tue conversazioni',
  has('netlify/functions/_shared/routing.ts', 'non dice dove finiscono i dati'),
);
check(
  '§19.2 FORNITORE',
  'i token in cache non si contano due volte',
  /* Vale per tutti i fornitori che parlano il protocollo OpenAI — Moonshot e
     OpenAI stesso — perché ora condividono lo stesso lettore di `usage`.
     La decisione è aritmetica: si SOTTRAGGONO, non si sommano. */
  count(PROVIDERS_FILE, /prompt_tokens[^\n]*\)\s*-\s*cached/g) > 0 &&
    lacksInCode(PROVIDERS_FILE, '+ cached'),
  'lì arrivano già dentro prompt_tokens: sommarli farebbe bloccare l’app prima del tempo',
);
check(
  '§19.2 FORNITORE',
  'un salvataggio scaricato non ti sposta di fornitore',
  has('src/state/store.ts', 'voiceModel: local.voiceModel'),
);
/* 🔷 «Per adesso metto tutto ChatGPT, mi conviene per provare se funziona.»
   Partire con un fornitore solo dev'essere possibile per DAVVERO, cioè anche
   per la voce — che è l'unica cosa che questa schermata dice di accendere. */
check(
  '§19.2 FORNITORE',
  'si può partire con un fornitore solo, voce compresa',
  count(ROUTING_FILE, /provider: 'openai'/g) >= 2,
  'con le sole immagini su OpenAI, una chiave sola non bastava ad accendere niente di parlante',
);
check(
  '§19.5 ATTIVAZIONE',
  'nessuna singola chiave è dichiarata obbligatoria',
  lacksInCode('netlify/functions/setup.ts', 'required: true'),
  'obbligatoria rispetto a cosa? a una scelta di fornitore che non hai ancora fatto',
);
/* ============================================================================
   §8.1 — LA BIO

   🔷 «Mi interessano le immagini e generare il personaggio, la bio, la storia.»
   Cinque frasi fisse coi buchi riempiti sono lo stesso difetto dei prompt
   concatenati, visto da un'altra parte.
   ========================================================================= */

check(
  '§8.1 BIO',
  'la bio la può scrivere un modello, non solo il modulo a cinque frasi',
  has('src/ai/bioWriter.ts', 'writeBioWithAi'),
);
check(
  '§8.1 BIO',
  'ma non può inventare fatti: si controlla che siano sopravvissuti',
  has('src/ai/bioWriter.ts', 'survivingFacts') &&
    has('src/ai/bioWriter.ts', 'fatti persi'),
);
check(
  '§8.1 BIO',
  'e non può ricopiare quella di prima',
  has('src/ai/bioWriter.ts', 'ha ricopiato quella di prima') &&
    has('src/ai/bioWriter.ts', 'riapre con la formula vecchia'),
  'riceve la bio deterministica come contesto, quindi ricopiarla è la strada più comoda',
);
check(
  '§8.1 BIO',
  'si scrive una volta sola',
  has('src/state/store.ts', 'if (rec.writtenBio) return null;'),
  'una bio che cambia a ogni apertura non è una bio',
);
check(
  '§8.1 BIO',
  'quella del motore non si butta: resta accanto',
  has('src/engine/types.ts', 'writtenBio?: BioFile') &&
    has('src/engine/types.ts', 'record.writtenBio ?? record.bio'),
  'è la rete per chi nasce senza chiave, ed è il termine di paragone in DEV',
);
check(
  '§8.1 BIO',
  'e le schermate leggono da un posto solo',
  lacksInCode('src/screens/BioPanel.tsx', 'mon.bio.') &&
    lacksInCode('src/screens/Splash.tsx', 'mon.bio.'),
  'due `??` sparsi sono due posti dove mostrare la versione vecchia senza accorgersene',
);

/* ============================================================================
   §9.2 — L'ICONA DELL'APP

   🔷 «Il logo del mostro deve apparire anche nell'icona dell'app.»
   🔷 «Ti dico che l'icona è ancora così.»
   ========================================================================= */

check(
  '§9.2 ICONA',
  'l’icona è il sigillo, non un globo',
  lacks('index.html', 'Globo wireframe') && has('index.html', 'il SIGILLO'),
  'un globo col cursore è precisamente il segnaposto che iOS disegna quando un’icona NON c’è',
);
check(
  '§9.2 ICONA',
  'la disegna lo stesso codice del sigillo dell’app',
  has('scripts/make-icon.mjs', "sigilGeometry } from"),
  'una copia ridisegnata a mano resterebbe indietro in silenzio quando la geometria cambia',
);
check(
  '§9.2 ICONA',
  'il segno non appartiene a nessuna Family',
  has('scripts/make-icon.mjs', 'arms: 9'),
  'FAMILY_ARMS arriva a 8: questo è il sigillo della stirpe, non di una creatura',
);
check(
  '§9.2 ICONA',
  'tutti i formati escono da una funzione sola',
  has('scripts/make-icon.mjs', "writeFileSync('public/favicon.svg'") &&
    lacksInCode('index.html', 'data:image/svg+xml'),
  'la favicon incollata a mano dentro index.html si era già rotta una volta senza che si vedesse',
);
check(
  '§9.2 ICONA',
  'c’è la versione mascherabile per Android',
  has('public/manifest.webmanifest', '"purpose": "maskable"'),
  'ritagliata a cerchio, un segno a filo del bordo perde le punte',
);

/* 🔷 «Mettimi la possibilità di cambiare tra le varie intelligenze di OpenAI,
   quindi Sol, Luna, Terra e altri. Metti anche il prezzo vicino, così mi
   ricordo quanto si spende per ognuno.» */
check(
  '§19.2 PREZZI',
  'i tre livelli di OpenAI ci sono tutti',
  ['luna', 'terra', 'sol'].every((t) => count(ROUTING_FILE, new RegExp(`gpt-5\\.6-${t}`, 'g')) >= 2),
  'uno solo dei tre non è una scelta, è un predefinito con un nome esotico',
);
check(
  '§19.2 PREZZI',
  'il prezzo arriva fino allo schermo',
  has('netlify/functions/setup.ts', 'price: c.price,') &&
    has('src/screens/Activate.tsx', 'per milione di token'),
  'i prezzi stavano nei cataloghi del server e non uscivano di lì: si sceglieva alla cieca proprio sulla cosa che si paga',
);
check(
  '§19.2 PREZZI',
  'e dove ha senso dice quanto costa UN uso',
  has('src/screens/Activate.tsx', 'a prompt · $') &&
    has('src/screens/Activate.tsx', 'a immagine · $'),
  '«$2 per milione di token» non dice niente finché non sai quanti token è una cosa',
);
check(
  '§19.2 PREZZI',
  'ma non se lo inventa dove non si sa',
  has('src/screens/Activate.tsx', 'Nessun `perUse` qui, di proposito'),
  'quanto costa un messaggio dipende da quanto scrivi: un numero inventato è peggio di nessun numero',
);
check(
  '§19.2 PREZZI',
  'le tre liste di scelte sono una riga sola di codice',
  count('src/screens/Activate.tsx', /<ChoiceRow/g) === 3 &&
    count('src/screens/Activate.tsx', /className="activate__voice"/g) === 1,
  'tre copie sarebbero tre posti dove scrivere il prezzo in tre modi diversi',
);
check(
  '§19.2 PREZZI',
  'il prezzo si legge davvero',
  has('src/screens/screens.css', '.activate__price') &&
    has('src/screens/screens.css', '--muted-strong'),
  'è la ragione per cui quella riga esiste: deve reggere il 4.5:1, non essere un sussurro',
);

/* 🔷 «Ma io non ho potuto scegliere che AI immagini usare, vorrei la più
   recente lato immagine.» */
check(
  '§22.4 CHI DISEGNA',
  'anche il disegnatore si sceglie, come la voce e il compilatore',
  has(ROUTING_FILE, 'export const IMAGE_CHOICES') &&
    has('src/screens/Activate.tsx', 'CHI DISEGNA'),
  'due menù e una riga inchiodata: la scelta che manca è proprio quella che si vede di più',
);
check(
  '§22.4 CHI DISEGNA',
  'la scelta arriva davvero fino alla chiamata',
  has('src/ai/backend.ts', 'imageModel?: string | null,') &&
    has('src/state/store.ts', 'get().imageModel,'),
  'un menù che non sposta niente è peggio di nessun menù',
);
check(
  '§22.4 CHI DISEGNA',
  'la scelta sopravvive al reset e a un salvataggio scaricato',
  has('src/state/store.ts', 'imageModel: get().imageModel,') &&
    has('src/state/store.ts', 'imageModel: local.imageModel,'),
  'è configurazione di questo browser, non un pezzo della partita',
);
check(
  '§22.4 CHI DISEGNA',
  'il prezzo stimato è dichiarato tale',
  has(ROUTING_FILE, 'arrotondati PER ECCESSO') &&
    has('netlify/functions/_shared/spend.ts', 'arrotondati PER ECCESSO'),
  'il listino non era raggiungibile: un contatore che sottostima è peggio di uno che non c’è',
);

/* 🔷 «Non possiamo fare che quando nasce una creatura lui automaticamente
   genera la prima immagine, me la mostra, io approvo e poi mi fa vedere le
   altre e le approvo tutte man mano?» */
check(
  '§22.4 NASCITA',
  'alla nascita si approvano tutte e sei, una per una',
  has('src/screens/Encounter.tsx', 'forgeOne') &&
    has('src/screens/Encounter.tsx', 't.face.step('),
  'prima si approvava solo il ritratto e le altre cinque partivano in sottofondo: il controllo era su un sesto della spesa',
);
check(
  '§22.4 NASCITA',
  'la prima parte da sola, le altre quando approvi',
  has('src/screens/Encounter.tsx', 'if (order.length > 0 && at === 0'),
  '«genera e me la mostra», non «genera se glielo dici» — ma le successive si pagano solo dopo un sì',
);
check(
  '§22.4 NASCITA',
  'il palco mostra l’immagine che stai approvando',
  has('src/screens/Encounter.tsx', 'type={showing ?? ') &&
    has('src/screens/Encounter.tsx', 'onStep={setShowing}'),
  'un palco che mostra una cosa mentre ne approvi un’altra è peggio di un palco vuoto',
);
check(
  '§22.4 NASCITA',
  'niente immagine ⇒ il pulsante entra, non avanza',
  has('src/screens/Encounter.tsx', 'if (!shot || last)'),
  'diceva ENTRA e faceva «avanti»: sei tocchi per uscire da una schermata che ti diceva di entrare',
);
check(
  '§22.4 NASCITA',
  'e si può sempre smettere a metà',
  has('src/screens/Encounter.tsx', 't.face.enough'),
  'sei immagini sono sei attese: nessuno deve arrivare in fondo per entrare in casa propria',
);
check(
  '§22.4 NASCITA',
  'nessuna immagine parte più fuori dalla sequenza',
  lacksInCode('src/state/store.ts', "generateAssetsFor(record.data.name"),
  'quella chiamata generava dal prompt CONCATENATO: il ritratto sarebbe stato l’unico dei sei mai approvato, e per giunta senza riferimento di consistenza',
);

/* 🔷 «NON RISCRITTO — chiamata fallita (error)»: il compilatore non ha mai
   funzionato nemmeno una volta, respinto da un tetto mio. */
check(
  '§10 COMPILATORE',
  'quello che genera l’app non viene sbarrato da un tetto scritto per la chat',
  has('netlify/functions/ai.ts', "capability === 'prompt-compile' ? LIMITS.compilerUserChars") &&
    /compilerUserChars:\s*200_000/.test(read('netlify/functions/ai.ts') ?? ''),
  'un tetto su una cosa che produce il mio stesso codice non protegge da niente: può solo scattare quando il MIO numero è sbagliato — e infatti il compilatore non è mai partito una volta',
);
check(
  '§10 COMPILATORE',
  'e chi difende il budget resta il tetto mensile',
  has('netlify/functions/_shared/spend.ts', 'MONTHLY_CAP_USD'),
  'la difesa vera è quella, e non si può aggirare: il resto sono allarmi',
);
/* ⚠️ UNA VERITÀ SOLA PER IL TETTO. Il rischio di questa modifica è precisamente
   quello che il LAB e il server finiscano a leggere due numeri diversi: la
   schermata direbbe «ancora venti dollari» mentre il server ha già chiuso. Gli
   aghi qui sotto guardano la DECISIONE — chi blocca legge la stessa funzione
   che il LAB mostra e scrive — non la forma delle righe. */
check(
  '§19.2 TETTO',
  'chi blocca legge il tetto configurato, non la costante',
  has('netlify/functions/_shared/spend.ts', 'readMonthlyCap()') &&
    /blocked:\s*ledger\.usd\s*>=\s*cap\.usd/.test(read('netlify/functions/_shared/spend.ts') ?? ''),
  'un tetto modificabile che `checkCap()` non legge è una manopola scollegata: gira e non succede niente',
);
check(
  '§19.2 TETTO',
  'e il LAB legge e scrive esattamente quello',
  has('netlify/functions/usage.ts', 'readMonthlyCap()') &&
    has('netlify/functions/usage.ts', 'writeMonthlyCap(') &&
    has('src/lab/rooms/SystemLab.tsx', 'saveMonthlyCap('),
  'due sorgenti per lo stesso numero vuol dire che prima o poi divergono, e la schermata mente',
);
check(
  '§19.2 TETTO',
  'il tetto vive sul server, mai nel browser',
  !/localStorage[^\n]*(?:cap|Cap)/.test(read('src/lab/rooms/SystemLab.tsx') ?? '') &&
    has('netlify/functions/_shared/spend.ts', "getStore({ name: CONFIG_STORE, consistency: 'strong' })"),
  'un limite nel browser lo aggira chiunque apra gli strumenti da sviluppatore: non è un limite, è un suggerimento',
);
check(
  '§19.2 TETTO',
  'e non contamina il registro delle spese',
  has('netlify/functions/_shared/spend.ts', "const CONFIG_STORE = 'vinzmon-config'") &&
    !has('netlify/functions/_shared/spend.ts', "getStore('vinzmon-spend').setJSON(CAP_KEY"),
  '`vinzmon-spend` è il registro degli eventi economici: la configurazione lì dentro diventerebbe un evento che nessuno ha pagato',
);
check(
  '§19.2 TETTO',
  'il nostro muro e quello del fornitore hanno due nomi diversi',
  has('netlify/functions/_shared/spend.ts', 'INTERNAL_CAP_EXCEEDED') &&
    has('netlify/functions/_shared/spend.ts', 'PROVIDER_QUOTA_EXCEEDED') &&
    has('netlify/functions/ai.ts', 'looksLikeProviderQuota('),
  '«The quota has been exceeded» del fornitore e il tetto nostro si riparano in due modi opposti: alzare il tetto quando è il credito a essere finito non serve a niente',
);
check(
  '§10 COMPILATORE',
  'e un tetto sforato dice di quanto',
  has('netlify/functions/ai.ts', 'caratteri contro un tetto di'),
  '«messaggio troppo lungo» senza numeri fa sembrare un limite mio un guasto di rete',
);
check(
  '§10 COMPILATORE',
  'anche il testo dice perché è fallito, non solo le immagini',
  /* 🔶 L'ago guardava la FORMA della riga — `{ error: …, reason:` tutto su una
     riga sola — e si è spento appena l'oggetto è andato a capo per far posto al
     codice tecnico della quota. La decisione da difendere non è dove va a capo:
     è che il ramo del testo rimandi indietro il motivo del fornitore. */
  has('netlify/functions/ai.ts', "error: 'risposta non disponibile'") &&
    has('netlify/functions/ai.ts', "reason: (result.error ?? '').slice(0, 300)") &&
    has('src/ai/promptCompiler.ts', 'rejected: detail ?? null'),
  'l’avevo sistemato per le immagini e lasciato muto per il testo: il compilatore è finito esattamente in quel buco',
);

/* ============================================================================
   §10 v1 — IL COMPILATORE A DUE STADI

   🔷 «Questo è quello fatto da ChatGPT, implementalo. Richiede comunque una
   LLM come resolver, ma passo a lui intanto per capire se gli output grezzi
   funzionano.»
   ========================================================================= */

check(
  '§10 DUE STADI',
  'al modello si chiedono DECISIONI, non un prompt scritto',
  has('src/assets-pipeline/resolver/vendor/resolver.ts', 'Your job is NOT to write the final image prompt'),
  'un testo si può solo rileggere, un oggetto si può controllare',
);
/* 🔷 «Non modificare il suo compilatore.» Avevo riscritto `compilePrompt` con
   la nostra prosa dei designer e le nostre regole di Appearance: se il codice
   non produce lo stesso testo che esce provando a mano in una chat, il
   confronto per cui questa cosa esiste non vale niente. */
check(
  '§10 DUE STADI',
  'i file del pacchetto stanno in vendor/ e non si toccano',
  has('src/assets-pipeline/resolver/vendor/compiler.ts', 'export function compilePrompt') &&
    has('src/assets-pipeline/resolver/vendor/rules.ts', 'DESIGN_DNA_RULES'),
  'la firma dei quattro file è controllata in verify:package: se cambiano, si vede',
);
check(
  '§10 DUE STADI',
  'e tutto l’adattamento sta in un file solo',
  has('src/assets-pipeline/resolver/adapter.ts', 'TRE FORZATURE DI TIPO, DICHIARATE'),
  'i suoi tipi sono più stretti dei nostri dati in tre punti: il valore vero passa, il tipo si forza dove si vede',
);
check(
  '§10 DUE STADI',
  'la risoluzione si può incollare a mano',
  /* La decisione è che la strada a mano ESISTA, non come si chiama il pulsante
     — che è già cambiato una volta quando la schermata è stata semplificata. */
  has('src/state/store.ts', 'useResolution: (monName, raw)') &&
    has('src/dev/ResolverSection.tsx', 'useResolution(mon.data.name, draft)'),
  'la domanda «il metodo è giusto» non deve restare in ostaggio di una decisione di hosting',
);
check(
  '§10 DUE STADI',
  'e chi incolla usa la stessa validazione della chiamata automatica',
  count('src/state/store.ts', /parseResolution\(/g) === 1 &&
    has('src/assets-pipeline/resolver/parse.ts', 'export function parseResolution'),
  'due copie vorrebbero dire che la strada a mano accetta cose che l’altra rifiuta',
);
/* 🔷 «JSON non leggibile: unrecognized token '"'» — con le virgolette giuste
   sotto gli occhi. Era iOS che le aveva riscritte copiando. */
check(
  '§10 DUE STADI',
  'le virgolette che iOS riscrive non fanno buttare una risposta buona',
  has('src/assets-pipeline/resolver/parse.ts', 'LE VIRGOLETTE DELL’IPHONE') ||
    has('src/assets-pipeline/resolver/parse.ts', "LE VIRGOLETTE DELL'IPHONE"),
  'da fuori sembra che il modello abbia risposto male, e invece ha risposto benissimo',
);
/* ============================================================================
   LA MEMORIA DEL RESOLVER (VINZ_MON_RESOLVER_MEMORY_v1)

   🔷 «Usala come memoria di progetto persistente SOLO per il Creative
      Resolver. Non è Character Data. I dati grezzi restano canonici. Il
      compilatore riceve le decisioni già prese e non deve reinterpretarla.»

   Quattro regole, quattro modi diversi di romperle, quattro aghi.
   ========================================================================= */
check(
  '§10 DUE STADI',
  'la memoria del gusto arriva al resolver, in testa e in cache',
  /* 🔶 Cercava `RESOLVER_MEMORY` secco. Da quando la memoria cresce con le
     lezioni il nome è `resolverMemoryWith(...)`, ma la decisione è la stessa:
     primo blocco, marcato per la cache. */
  /* 🔶 Cercava l'array intero su una riga. Da quando accanto alla memoria c'è
     il blocco dei vincoli, l'array ha due elementi — ma la decisione è sempre
     quella: la memoria è il PRIMO blocco ed è marcata per la cache. */
  has('src/ai/resolver.ts', 'resolverMemoryWith(lessons, custom), cache: true') &&
    has('src/ai/teach.ts', 'cache: true'),
  'un prefisso costante e primo è la condizione perché la cache agganci: in coda costerebbe pieno per sempre',
);
check(
  '§10 DUE STADI',
  '…e SOLO al resolver e alla sua chat: non alla voce, non alla vecchia riscrittura',
  /* 🔶 `roomVoice` è uscito con MIND.SOCIAL. */
  ['promptCompiler', 'client', 'voicePrompt', 'bioWriter', 'reflect', 'notebook']
    .every((f) => lacksInCode(`src/ai/${f}.ts`, 'RESOLVER_MEMORY')),
  'la riscrittura riscrive un prompt esistente: darle una memoria di gusto le farebbe cambiare decisioni che non è lei a prendere',
);
check(
  '§10 DUE STADI',
  'il prompt del pacchetto resta il messaggio utente, intero',
  has('src/ai/resolver.ts', 'user: buildCreativeResolverPrompt(input, numeric)'),
  'la memoria è un blocco separato sopra, non un pezzo aggiunto dentro: quel testo dev’essere identico a quello che si copia a mano',
);
check(
  '§10 DUE STADI',
  'il compilatore non può vederla nemmeno volendo',
  /* 🔶 Cercava «MEMORY» dappertutto, e il compilatore del pacchetto contiene
     legittimamente il suo MEMORY TEST. La decisione non è «la parola non
     compare»: è che il MODULO della memoria non è raggiungibile da lì. */
  lacksInCode('src/assets-pipeline/promptFor.ts', 'RESOLVER_MEMORY') &&
    lacksInCode('src/assets-pipeline/resolver/vendor/compiler.ts', 'RESOLVER_MEMORY') &&
    lacksInCode('src/assets-pipeline/resolver/vendor/compiler.ts', "from './memory"),
  'non è una promessa ma una proprietà dei tipi: compilePrompt prende CharacterData e CreativeResolution, e non c’è parametro da cui quel testo entri',
);
check(
  '§10 DUE STADI',
  'e la strada a mano copia prima la memoria, poi il prompt',
  has('src/dev/ResolverSection.tsx', '1 · COPIA LA MEMORIA') &&
    has('src/dev/ResolverSection.tsx', '3 · COPIA IL PROMPT DEL RESOLVER'),
  'se a mano si copiasse solo il prompt, i due percorsi non sarebbero confrontabili: uno saprebbe come si decide e l’altro no',
);

/* ============================================================================
   INSEGNARE AL RESOLVER

   🔷 «Vorrei poter parlare con il resolver: metti una chat con lui, così gli
      insegno io, e quello che gli insegno resta nella memoria anche se
      resetti.»
   ========================================================================= */
check(
  '§10 DUE STADI',
  'al resolver ci si può parlare, e non è la voce del .mon',
  has('src/ai/teach.ts', 'export async function teachResolver') &&
    has('src/dev/DevPanel.tsx', "{ id: 'teach', label: 'INSEGNA' }"),
  'il .mon parla di sé; questo è la parte che decide come sono fatte le creature, e ci parli come a un art director',
);
check(
  '§10 DUE STADI',
  'quello che gli insegni sopravvive a RICOMINCIA DA CAPO',
  has('src/state/store.ts', 'lessons: get().lessons,'),
  'ricominciare cancella la partita, non il mestiere: una lezione non apparteneva a nessuna delle creature buttate via',
);
/* 🔷 «No, devono sopravvivere sempre.» — cioè anche al telefono, non solo al
   reset. E questo non lo poteva fare il salvataggio della partita. */
check(
  '§10 DUE STADI',
  'e sopravvive al telefono: hanno una chiave sul server tutta loro',
  has('netlify/functions/lessons.ts', "export const config = { path: '/api/lessons' }") &&
    has('src/state/store.ts', 'export async function pushLessons'),
  '/api/state è arbitrato dal giorno di gioco, e dopo un reset il giorno torna a 1: da lì in poi non riuscirebbe più a scrivere niente',
);
check(
  '§10 DUE STADI',
  'una cancellazione lascia una pietra tombale, o tornerebbe indietro',
  has('src/state/store.ts', 'forgottenLessons: [...new Set([...cur.forgottenLessons, id])]') &&
    has('netlify/functions/lessons.ts', 'forgotten.includes(l.id)'),
  'la fusione unisce gli insiemi: senza la pietra, il server rimanderebbe indietro la lezione tolta e «DIMENTICALA» non funzionerebbe',
);
check(
  '§10 DUE STADI',
  'e non stanno anche nel salvataggio della partita: una sola sorgente',
  has('src/state/store.ts', 'lessons: _lessons,') &&
    has('src/state/store.ts', 'forgottenLessons: _forgotten,'),
  'scaricando un salvataggio più avanti l’app si porterebbe dietro le lezioni di quel giorno, cancellando tutto quello insegnato dopo',
);
check(
  '§10 DUE STADI',
  'e finisce davvero nella risoluzione, non solo nella chat',
  has('src/ai/resolver.ts', 'resolverMemoryWith(lessons, custom)') &&
    has('src/state/store.ts', 's.lessons,'),
  'una lezione che vale solo mentre gliela dici non è una lezione',
);
check(
  '§10 DUE STADI',
  'le lezioni stanno in CODA al documento, mai prima',
  /* 🔶 Cercava il nome della costante. Da quando il documento si può
     sostituire, la base è `base` — ma la decisione è identica: le lezioni si
     accodano a quello che c'era, non gli si mettono davanti. */
  has('src/assets-pipeline/resolver/memory.ts', 'return `${base}'),
  'il fornitore mette in cache un prefisso: mettendo davanti una parte che cambia a ogni lezione, la cache non aggancerebbe mai — stesso codice, dieci volte il prezzo, nessun errore',
);
check(
  '§10 DUE STADI',
  'e quello che hai detto tu resta accanto, parola per parola',
  has('src/dev/TeachSection.tsx', 'gli avevi detto') &&
    has('src/engine/types.ts', 'said: string;'),
  'se un giorno la riga tradotta risulta storta, il verbale è l’unico modo di sapere cosa intendevi',
);
/* 🔷 «Gli ho messo la lezione ma se faccio generare il prompt non sembra
   prenderla in considerazione.» */
check(
  '§10 DUE STADI',
  'le lezioni sono anche l’ultima cosa che legge prima del compito',
  has('src/ai/resolver.ts', 'ACTIVE CONSTRAINTS FROM VINZ') &&
    has('src/ai/resolver.ts', 'lessons.length > 0 ? [{ text: vincoliDa(lessons) }] : []'),
  'in fondo a diciassettemila caratteri, seguite da altri sedicimila, stavano nella posizione più debole del contesto',
);
check(
  '§10 DUE STADI',
  'e lì sono ordini, non racconto',
  has('src/ai/resolver.ts', 'THEY WIN'),
  '«Vinz preferisce X» e «X, e vince su tutto» sono la stessa informazione con due forze diverse',
);
check(
  '§10 DUE STADI',
  'si vede con quante lezioni è stata risolta',
  has('src/ai/resolver.ts', 'usedLessons: lessons.length') &&
    has('src/dev/ResolverSection.tsx', 'Risolto con'),
  '«non è arrivata» e «è arrivata e non l’ha usata» sono lo stesso schermo, e solo la prima è colpa del codice',
);
check(
  '§10 DUE STADI',
  'e si possono guardare le decisioni, non solo il prompt',
  has('src/dev/ResolverSection.tsx', 'VEDI LE 21 DECISIONI'),
  'nel prompt finale la lezione non comparirà mai per costruzione: cercarla lì è cercarla nell’unico posto dove abbiamo stabilito che non ci sarà',
);

/* ============================================================================
   UN MODELLO PER OGNI LAVORO (§19.3)

   🔷 «Non voglio che scegliere SOL per il Character Master obblighi
      automaticamente SOL per Bio, Teach o altri lavori.»
   ========================================================================= */
check(
  '§19.3 STEP',
  'ogni lavoro chiede il modello suo, non un menu condiviso',
  has(ROUTING_FILE, 'export const AI_STEPS') &&
    count('src/state/store.ts', /stepModel\('/g) >= 5,
  'quattro lavori con profili incompatibili condividevano `compilerModel`: alzarlo per il primo pagava a vuoto gli altri tre',
);
check(
  '§19.3 STEP',
  'anche i quattro che prima non avevano voce in capitolo',
  has('src/ai/reflect.ts', 'voiceModel: model') &&
    has('src/ai/notebook.ts', 'voiceModel: model') &&
    has('src/ai/client.ts', 'voiceModel: model'),
  'riflessione, taccuino e visione prendevano sempre il predefinito della rotta, senza che tu potessi dire niente',
);
check(
  '§19.3 STEP',
  'il catalogo si importa, non si ricopia',
  has('src/state/store.ts', "from '../../netlify/functions/_shared/routing'") &&
    lacksInCode('src/dev/ModelsSection.tsx', "'gpt-5.6-terra'"),
  'una seconda copia dei nomi dei modelli in src/ sarebbe la cosa che va fuori sincrono per prima, e in silenzio',
);
check(
  '§19.3 STEP',
  'e la difesa resta al server: una stringa dal browser non sceglie il modello',
  has(ROUTING_FILE, 'export function resolveRoute'),
  'senza quel filtro il tetto di spesa smetterebbe di sapere cosa sta contando',
);
check(
  '§19.3 STEP',
  'una vecchia installazione si carica e riceve i predefiniti nuovi',
  /* 🔒 Punta al file SENZA IMPORT, che è quello che `verify:backend` prova
     davvero su quattro casi. Dentro `store.ts` sarebbe stata dietro a zustand
     e a mezza app: verificabile solo aprendo l'app con un salvataggio vecchio,
     cioè quando un errore ha già fatto danno. */
  has('src/state/migrateSteps.ts', 'export function migratedStepModels') &&
    has('src/state/migrateSteps.ts', 'if (vecchio.voiceModel) next.voice = vecchio.voiceModel;'),
  'l’app è già in uso: nessuno deve resettare la partita per ricevere questa modifica',
);
check(
  '§19.3 STEP',
  '…ma `compilerModel` NON si migra, ed è una decisione dichiarata',
  has('src/state/migrateSteps.ts', 'compilerModel → NIENTE') &&
    lacksInCode('src/state/migrateSteps.ts', 'next.characterMaster = vecchio.compilerModel'),
  'non era la preferenza di uno step ma di quattro messi insieme: portarla su tutti e quattro rimetterebbe in piedi il difetto lo stesso giorno',
);
check(
  '§19.3 STEP',
  'il preset economico non tocca gli step critici per la qualità',
  /* 🔶 Era un ago sul testo letterale di `store.ts` ('if (step.qualityCritical)
     continue;'), e si è rotto quando la logica si è trasferita in
     `recommendedPreset` (routing.ts) — stessa decisione, riga diversa. Punta
     ora sulla decisione vera: `recommendedModel` restituisce sempre il
     `fallback` (mai un risparmio) per uno step qualityCritical, e
     `recommendedPreset` lo salta del tutto. */
  has(ROUTING_FILE, 'if (step.qualityCritical) {') &&
    has(ROUTING_FILE, 'if (AI_STEPS[id].qualityCritical) continue;'),
  '«non voglio un pulsante economico che mi peggiora i character»',
);
check(
  '§19.3 STEP',
  'e un controllo automatico impedisce di abbassare il Character Master',
  has(ROUTING_FILE, 'deve restare critico per la qualità e in background'),
  'se un giorno qualcuno lo abbassa «per far prima», si scopre alla build invece che guardando le creature',
);
check(
  '§19.3 STEP',
  'quanto ci mette ogni lavoro si misura, non si stima',
  has('src/ai/telemetry.ts', 'export function noteRun') &&
    has('src/state/store.ts', 'export async function runStep'),
  'in questa sessione ho dedotto due volte i tempi da numeri che misuravano altro, e tutte e due le volte ha guidato una decisione di architettura',
);
check(
  '§19.3 STEP',
  'e il cronometro sta in un posto solo',
  count('src/state/store.ts', /noteRun\(/g) === 2,
  'misurato in otto posti, ognuno conterebbe pezzi diversi: una tabella che sembra dire qualcosa e non dice niente',
);
check(
  '§19.3 STEP',
  'il ritiro di un lavoro lungo parte fitto e poi rallenta',
  has('src/ai/backend.ts', 'const RITMO_MS = [800, 1200, 1800, 2500];'),
  'a intervallo fisso un lavoro finito subito dopo una domanda resta invisibile per altri 2,5 secondi, che su una risposta veloce è quasi tutta l’attesa',
);

/* ============================================================================
   IL RIFERIMENTO ALLEGATO DAVVERO

   🔷 «Quando genero l'immagine portrait, lui come prompt non mette il
      character master. Controlla.»

   ⚠️ Il prompt lo prometteva dal primo giorno e nessuno lo manteneva: dal
   Profile Portrait in poi diceva «allega il CHARACTER MASTER, dove testo e
   immagine non concordano vince l'immagine», e la richiesta partiva su
   `/v1/images/generations`, che accetta solo testo.
   ========================================================================= */
check(
  '§23 ASSET',
  'il master si allega davvero, non si promette e basta',
  has(PROVIDERS_FILE, "'https://api.openai.com/v1/images/edits'") &&
    has('src/assets-pipeline/generate.ts', 'await assetBase64(name, dipende)'),
  'il modello riceveva l’ordine di consultare un riferimento assente E il testo dichiarato non autorevole: il peggio dei due mondi',
);
check(
  '§23 ASSET',
  'e si allega quello che `dependsOn` dichiara, non «il master» scritto a mano',
  has('src/assets-pipeline/generate.ts', 'assetTypeDef(type).dependsOn[0]'),
  'il giorno che un asset dipenderà anche dal ritratto, quella riga non cambia',
);
check(
  '§23 ASSET',
  'senza riferimento resta la strada di prima',
  has(PROVIDERS_FILE, 'const send = reference ? sendWithReference : sendText;'),
  'il CHARACTER MASTER non ha niente da allegare, ed è il primo che si genera',
);
check(
  '§23 ASSET',
  'il PNG in arrivo dal browser passa dallo stesso tetto in byte',
  has('netlify/functions/ai.ts', 'immagine di riferimento troppo grande'),
  'un tetto su una cosa che arriva da fuori non è mai una comodità',
);
check(
  '§23 ASSET',
  'e il riferimento si legge a pezzi, non in un colpo',
  has('src/assets-pipeline/assetStore.ts', 'const passo = 0x8000;'),
  '`String.fromCharCode(...bytes)` sfonda lo stack solo sulle immagini grandi: si scoprirebbe in produzione, non in prova',
);

/* 🔷 «La scheda mon su sfondo bianco, e non farlo fluttuare: tienilo fisso.» */
check(
  '§24 SCHEDA',
  'la scheda mostra il master sul bianco per cui è stato disegnato',
  has('src/screens/screens.css', 'background: #ffffff;') &&
    has('src/screens/screens.css', 'BIANCO VERO, NON `var(--white)`'),
  'il master esce con lo sfondo trasparente da un prompt che descrive una figura su fondo chiaro: sul nero si giudica male una creatura che è giusta',
);
check(
  '§24 SCHEDA',
  'e sta fermo: è un documento, non una presenza',
  has('src/system/LiveMon.tsx', 'still = false,') &&
    has('src/screens/SpecimenProfile.tsx', 'still />'),
  'sulla home il respiro serve — una creatura ferma lì è un ritaglio — ma una cosa che si legge non deve muoversi mentre la leggi',
);

/* 🔷 «Perché i temperamenti sono 2? Deve essere 1.» */
check(
  'MOOD §22',
  'una creatura nasce con UN temperamento',
  has(GEN, 'secondary: null,') && lacksInCode(GEN, 'chance(rng, 0.45)'),
  'due direzioni emotive da servire insieme non danno più ricchezza: danno meno decisione, e contraddicono «una sola contraddizione» della memoria',
);
check(
  'MOOD §22',
  'ma il campo resta, sempre vuoto',
  has('src/engine/types.ts', 'mood_secondary: string | null;'),
  '§27 conta ventisette campi, e un salvataggio vecchio che la sfumatura ce l’ha deve continuare a leggersi',
);

/* ============================================================================
   TEST PHASE 01 — 🔷 «FAMILY = ANGEL. SIZE = TINY. DESIGNER = KEN.»
   ========================================================================= */
check(
  'TEST PHASE',
  'tre assi fermi, dichiarati in un posto solo',
  /* 🔶 ERANO FERMATI DA `TEST_PHASE`, con tre chiamate a `locked()` dentro il
     generatore. Adesso i tre assi passano dal CATALOGO come tutti gli altri:
     il «posto solo» c'è ancora, ed è più vero di prima — è la stessa lista
     con acceso/spento che governa affinità, ruolo e stile.

     🔷 «Cerca la strada più semplice quando fai qualcosa, non complicarla.» */
  has('src/engine/catalogTuning.ts', 'const SEME:') &&
    has('src/engine/catalogTuning.ts', "'design', 'size'") &&
    lacksInCode('src/engine/characterGenerator.ts', "locked('"),
  'family, size e disegnatore: un meccanismo solo, non due che si somigliano',
);
check(
  'TEST PHASE',
  'è un’ancora, non una potatura: i cataloghi restano interi',
  lacksInCode('src/engine/generation-config.ts', 'DESIGN_DNA = DESIGN_DNA.filter'),
  'gli altri sei disegnatori devono restare disponibili per le fasi dopo',
);
check(
  'TEST PHASE',
  'il disegnatore si estrae comunque, e poi si sovrascrive',
  has('src/engine/characterGenerator.ts', 'const drawnDesigner = pick(rng'),
  'saltare l’estrazione sposterebbe la sequenza casuale di tutto quello che viene dopo: lo stesso seme darebbe creature diverse a fase accesa e spenta',
);
check(
  'TEST PHASE',
  'e la traccia dice che è ferma, non che è stata estratta',
  /* 🔶 La traccia diceva «ferma dalla TEST PHASE 01». Adesso dice qual è la
     ragione vera — una voce sola accesa nel catalogo — ma la decisione è la
     stessa: non far passare per sorteggio un risultato già deciso. */
  has('src/engine/characterGenerator.ts', 'una sola Family accesa nel catalogo') &&
    has('src/engine/characterGenerator.ts', 'una sola taglia accesa nel catalogo'),
  'una traccia che mostra dei candidati senza dire che il risultato era già deciso racconta un sorteggio che non è avvenuto',
);
check(
  'TEST PHASE',
  'il resolver sa che è una fase, non un personaggio da rifare',
  /* 🔶 Cercava `TEST_PHASE.enabled`. Adesso quel blocco legge la fase EFFETTIVA
     — quella che l'utente può spegnere da CREATION.LAB — quindi la riga è
     `FASE.enabled`. La decisione non è cambiata: al resolver va detto che è
     una FASE, e va detto anche quando la fase l'hai cambiata tu. */
  has('src/assets-pipeline/resolver/taste.ts', 'FASE.enabled') &&
    has('src/assets-pipeline/resolver/taste.ts', 'one fixed halo or wing construction'),
  'un modello che vede tre assi fermi e nient’altro tratta i tre valori come UN personaggio e comincia a rifarlo',
);
check(
  'TEST PHASE',
  'e che una taglia ferma non è una proporzione ferma',
  has('src/assets-pipeline/resolver/taste.ts', 'not a locked proportion'),
  'TINY è una strategia di compressione, e va decisa da capo per ogni forma',
);

/* ============================================================================
   IL GUSTO DI VINZ, RIATTACCATO AL RESOLVER

   ⚠️ La ricerca c'era da sempre in `generation-config.ts` — 18 grammatiche di
   moda con la loro `language`, 6 direzioni di taglio, 3 decolorazioni col loro
   `prompt`, la grammatica di Size, i livelli di Humanoidity col loro `avoid` —
   e il vecchio compilatore a frammenti la usava. Il resolver nuovo riceveva
   solo le ETICHETTE.
   ========================================================================= */
check(
  '§9 GUSTO',
  'al resolver arriva la grammatica dietro l’etichetta, non solo l’etichetta',
  has('src/assets-pipeline/resolver/taste.ts', 'export function tasteBrief') &&
    has('src/ai/resolver.ts', '{ text: tasteBrief(record, storia) },'),
  'STREET senza la sua `language` diventa felpa e sneaker; GIANT senza SIZE_GRAMMAR diventa un torso più grande',
);
check(
  '§9 GUSTO',
  'e il taglio, che al resolver non arrivava proprio',
  has('src/assets-pipeline/resolver/taste.ts', 'HAIRCUT DIRECTION') &&
    lacksInCode('src/assets-pipeline/resolver/adapter.ts', 'haircut'),
  'il motore sceglieva fra sei direzioni e il resolver non le vedeva: ogni testa non umana finiva a cinque punte',
);
check(
  '§9 GUSTO',
  'la ricerca viene dal progetto, non da me',
  has('src/assets-pipeline/resolver/taste.ts', "from '../../engine/generation-config'") &&
    has('src/assets-pipeline/resolver/taste.ts', 'riga di conoscenza generica'),
  'sostituire il gusto di Vinz con un gusto medio sulla moda sarebbe il modo esatto di perderlo una seconda volta',
);
check(
  '§9 GUSTO',
  'due tempi: prima la direzione, poi la soluzione per QUESTO corpo',
  has('src/assets-pipeline/resolver/taste.ts', 'STAGE A') &&
    has('src/assets-pipeline/resolver/taste.ts', 'STAGE B'),
  '«TRANSPARENT/CRYSTAL» è una direzione, non un visore; «FULL BLEACH» è un trattamento, non cinque punte',
);
check(
  '§9 GUSTO',
  'quello che Vinz ha SPENTO nei cataloghi arriva come rifiuto esplicito',
  has('src/assets-pipeline/resolver/taste.ts', 'function spentiDaVinz') &&
    has('src/assets-pipeline/resolver/taste.ts', 'WHAT VINZ HAS SWITCHED OFF'),
  'DEV → CATALOGHI è «accendere e spegnere quello che piace», e non arrivava a nessuna AI: serviva solo a filtrare il sorteggio',
);
check(
  '§9 GUSTO',
  'e le forme già risolte gli vengono dette, per non ripetersi',
  has('src/assets-pipeline/resolver/taste.ts', 'export function formeGiaViste') &&
    has('src/state/store.ts', 'formeGiaViste(Object.values(s.mons), monName)'),
  'senza, ogni creatura riparte senza sapere di stare rifacendo la stessa testa',
);
check(
  '§9 GUSTO',
  'il gusto NON sta nel prefisso in cache, e le cose statiche sì',
  has('src/ai/resolver.ts', 'cambia a ogni creatura, perché contiene la grammatica'),
  'contiene la grammatica di QUESTA creatura: davanti romperebbe il prefisso costante e la cache non aggancerebbe più niente',
);
check(
  '§9 GUSTO',
  'e non sostituisce i Character Data: li legge',
  has('src/assets-pipeline/resolver/taste.ts', 'Character Data stays canonical') &&
    lacksInCode('src/assets-pipeline/resolver/taste.ts', 'record.data.fashion ='),
  'FAMILY dice cosa È la creatura; questo blocco dice come si legge quello che è',
);
check(
  '§9 GUSTO',
  'la strada a mano copia gli stessi tre pezzi che viaggiano',
  has('src/dev/ResolverSection.tsx', '2 · COPIA CONTRATTO E GUSTO'),
  'altrimenti la strada a mano perderebbe proprio la ricerca che era il pezzo mancante',
);
check(
  '§9 GUSTO',
  'la stranezza non è deformazione',
  has('src/assets-pipeline/resolver/taste.ts', 'Weirdness is not deformation') &&
    has('src/assets-pipeline/resolver/taste.ts', 'Character appeal comes before biological novelty'),
  'umanoidità bassa vuol dire piano corporeo non umano, non grottesco',
);

/* ============================================================================
   IL CONTRATTO STRUTTURALE DEL RESOLVER
   🔷 «NON aggiungerle come L7/L8/L9 nella memoria. Sono regole strutturali.»
   ========================================================================= */
check(
  '§10 DUE STADI',
  'le tre regole del resolver sono un contratto, non lezioni di Vinz',
  has('src/assets-pipeline/resolver/contract.ts', 'STRUCTURAL RESOLVER CONTRACT') &&
    has('src/ai/resolver.ts', '{ text: RESOLVER_CONTRACT },'),
  'fra le lezioni si potevano cancellare con un tocco, o perdere riscrivendo la memoria in una chat',
);
check(
  '§10 DUE STADI',
  'l’Affinity è logica di trasformazione prima che oggetto',
  has('src/assets-pipeline/resolver/contract.ts', 'AFFINITY IS TRANSFORMATION LOGIC BEFORE OBJECT') &&
    has('src/assets-pipeline/resolver/contract.ts', 'must never become a PROP'),
  'MINERAL → cristallo appeso: l’immagine era giusta, l’errore era a monte',
);
check(
  '§10 DUE STADI',
  'nessun elemento può fare otto mestieri',
  has('src/assets-pipeline/resolver/contract.ts', 'NO CONCEPT MONOPOLY') &&
    has('src/assets-pipeline/resolver/contract.ts', 'at most TWO important functions'),
  'lo stesso oggetto era sagoma, affinità, dettaglio ridicolo, meccanismo, asimmetria, metafora, ricordo e colore',
);
check(
  '§10 DUE STADI',
  'e ogni massa grande deve sembrare inevitabile senza sapere la storia',
  has('src/assets-pipeline/resolver/contract.ts', 'MAJOR ELEMENT INEVITABILITY TEST') &&
    has('src/assets-pipeline/resolver/contract.ts', 'Lore cannot rescue arbitrary morphology'),
  'chi guarda vede la forma prima di leggere, e a quel punto ha già fallito',
);
check(
  '§10 DUE STADI',
  'il controllo di qualità è nella STESSA chiamata, non una seconda AI',
  has('src/assets-pipeline/resolver/contract.ts', 'SELF-CHECK BEFORE YOU OUTPUT') &&
    has('src/assets-pipeline/resolver/contract.ts', 'You get one output'),
  'una seconda chiamata che critica e una terza che corregge sarebbero tre volte il tempo e tre volte il prezzo',
);
check(
  '§10 DUE STADI',
  'e il contratto sta nel prefisso stabile, dopo la memoria e prima delle lezioni',
  has('src/ai/resolver.ts', 'Statico come la memoria e subito dopo di lei'),
  'statico prima, variabile dopo: è la condizione perché la cache regga',
);

/* ============================================================================
   IL LAVORO LUNGO NON SI ASPETTA

   🔷 «Voglio far funzionare l'app con Sol. Che devi fare?»

   ⚠️ Per due giorni ho affrontato il muro dei dieci secondi dalla parte
   sbagliata — abbassando il ragionamento finché la risposta ci stesse — e il
   risultato era che scegliere Sol costava il doppio senza dare niente.
   ========================================================================= */
check(
  '§19.1 FORNITORE',
  'un lavoro lungo parte e si va a riprendere, invece di aspettarlo',
  has('netlify/functions/_shared/background.ts', 'background: true') &&
    has('netlify/functions/_shared/background.ts', 'export async function pollBackground'),
  'nessuna delle chiamate aspetta il modello, quindi nessuna incontra il muro: il tempo lo tiene OpenAI, che non ne ha uno',
);
check(
  '§19.1 FORNITORE',
  'e lì il ragionamento si chiede sul serio',
  /* 🔶 Il valore non sta più scritto nel resolver: sta nel catalogo degli
     step, che è il posto giusto. La decisione è la stessa. */
  has(ROUTING_FILE, "effort: 'medium'") &&
    has('src/ai/resolver.ts', 'effort: AI_STEPS.characterMaster.effort') &&
    has('netlify/functions/ai.ts', "payload.effort ?? 'medium'"),
  'a ragionamento spento Sol era un Terra che costa il doppio: è l’unica ragione per cui esiste questa strada',
);
check(
  '§19.1 FORNITORE',
  'un giro di ritiro andato storto non butta via il lavoro',
  has('src/ai/backend.ts', "if (giro.failure === 'offline' || giro.failure === 'timeout') continue;"),
  'la rete di un telefono cade e torna: buttare un lavoro che gira ancora dall’altra parte per un buco di due secondi sarebbe assurdo',
);
check(
  '§19.1 FORNITORE',
  'la spesa si registra quando è finito, non a ogni «è pronto?»',
  has('netlify/functions/ai.ts', "if (out.status === 'completed' && (out.usage.inputTokens"),
  'contarla a ogni domanda moltiplicherebbe il conto per il numero di volte che abbiamo chiesto',
);
check(
  '§19.1 FORNITORE',
  'e il tetto dei token si alza, perché non serviva più a non aspettare',
  has(ROUTING_FILE, 'maxTokens: 8000,') &&
    has('src/ai/resolver.ts', 'maxTokens: AI_STEPS.characterMaster.maxTokens'),
  'un tetto stretto taglia il modello MENTRE pensa: produce un JSON troncato, non una risposta più corta',
);
check(
  '§19.1 FORNITORE',
  'e non si promette che chiudendo l’app il lavoro si ritrovi',
  has('src/dev/ResolverSection.tsx', 'l’app perde il filo'),
  'una riga che promette una comodità che non c’è fa chiudere l’app fidandosi, e perdere il lavoro credendo di averlo messo al sicuro',
);

/* 🔷 «Quando genero con resolver devo poter dare un feedback che diventa una
   lezione per lui.» */
check(
  '§10 DUE STADI',
  'il giudizio si dà davanti alla creatura appena risolta',
  has('src/dev/ResolverSection.tsx', 'COSA NON TORNA?') &&
    has('src/dev/ResolverSection.tsx', 'DIVENTA UNA LEZIONE'),
  'la correzione arriva nel momento in cui la vedi, non ricordandotela dopo in un’altra scheda',
);
check(
  '§10 DUE STADI',
  'e il modello vede la scelta che sta difendendo',
  has('src/ai/teach.ts', 'giudicando: CreativeResolution | null') &&
    has('src/dev/ResolverSection.tsx', 'void teach(testo, [], resolution)'),
  '«gli occhiali sono banali» nel vuoto diventa un consiglio da poster; detto davanti a eyewearConstruction diventa una regola che sa cosa stava sbagliando',
);
check(
  '§10 DUE STADI',
  'la risoluzione giudicata viaggia nel messaggio, non nel sistema',
  lacksInCode('src/ai/teach.ts', '{ text: JSON.stringify(giudicando'),
  'nel sistema sporcherebbe la cache: cambia a ogni creatura, e il prefisso costante è tutto il risparmio',
);
check(
  '§10 DUE STADI',
  'e si dice che vale dalla PROSSIMA creatura, non da questa',
  has('src/dev/ResolverSection.tsx', 'Vale dalla prossima creatura'),
  'una lezione non riscrive la risoluzione che hai davanti, e lasciarlo credere farebbe premere RIFALLO a vuoto',
);

/* 🔷 «Io adesso ne vedo sempre solo una: se ne metto un'altra si cancella
   quella di prima.» — era colpa mia: avevo scritto al modello «usalo» a
   proposito della sostituzione, e un modello trova che quasi tutto «tocca»
   qualcosa che ha già. */
check(
  '§10 DUE STADI',
  'una lezione può mandarne in pensione al massimo UNA, e il tetto è nel codice',
  has('src/state/store.ts', '.slice(0, 1);') &&
    has('src/ai/teach.ts', 'NEVER list more than one id'),
  'una regola scritta a un modello è una richiesta, non una garanzia: la garanzia è il tetto',
);

/* 🔷 «Vorrei poter scaricare tutta la sua memoria come un documento, lavorarci
   con ChatGPT, risistemarla e ridargliela senza dover passare da te.» */
check(
  '§10 DUE STADI',
  'la memoria si scarica come documento e si può ridare',
  has('src/assets-pipeline/resolver/memoryFile.ts', 'export function memoryDocument') &&
    has('src/dev/MemoryView.tsx', 'DA ADESSO È QUESTA LA SUA MEMORIA'),
  'finché la memoria è una costante nel codice, cambiarla vuol dire cambiare il codice e aspettare un deploy',
);
check(
  '§10 DUE STADI',
  'e quello che scarichi è il testo esatto che riceve, non un export addolcito',
  has('src/dev/MemoryView.tsx', 'memoryDocument(testo)'),
  'lavoreresti su una cosa e ne consegneresti un’altra, e nessuno se ne accorgerebbe finché le creature non vengono storte',
);
check(
  '§10 DUE STADI',
  'l’originale del pacchetto non si perde mai',
  has('src/assets-pipeline/resolver/memory.ts', 'export function baseMemory') &&
    has('src/dev/MemoryView.tsx', 'TORNA A QUELLA ORIGINALE'),
  'una modifica che non si può annullare non è una modifica, e questo è il documento su cui poggia tutto il disegno',
);
check(
  '§10 DUE STADI',
  'e il documento non si fonde come le lezioni: fra due vince il più recente',
  has('netlify/functions/lessons.ts', 'const piuRecente ='),
  'unire due versioni di un testo non dà un testo, dà un pasticcio',
);
check(
  '§10 DUE STADI',
  'dopo averlo ridato si possono svuotare le lezioni, ma lo decidi tu',
  has('src/state/store.ts', 'forgetAllLessons') &&
    has('src/dev/MemoryView.tsx', 'SONO GIÀ DENTRO: SVUOTA LE LEZIONI'),
  'non ho modo di sapere se le hai consolidate o se hai corretto una virgola: cancellare da sé quello che ti sei preso la briga di insegnare sarebbe il peggior automatismo dell’app',
);

/* 🔷 «Rendimi nell'app ben visibile tutta la sua memoria.» */
check(
  '§10 DUE STADI',
  'la memoria si legge dentro l’app, tutta e per sezioni',
  has('src/dev/MemoryView.tsx', 'export function MemoryView') &&
    has('src/dev/TeachSection.tsx', '<MemoryView testo={memoria} />'),
  'quindici titoli si scorrono in due secondi; diciassettemila caratteri aperti sono una parete che non si legge',
);
check(
  '§10 DUE STADI',
  'ed è il testo esatto che riceve, non un riassunto',
  has('src/dev/TeachSection.tsx', 'const memoria = resolverMemoryWith(lessons)'),
  'un riassunto mio letto al posto del suo è uno scarto che non si può più notare',
);

/* 🔷 «Deve capitare proprio come nella chat di ChatGPT: io parlo con lui, lui
   assegna delle informazioni e le mette insieme.» */
check(
  '§10 DUE STADI',
  'il discorso continua: si ricorda cosa gli hai detto due messaggi fa',
  has('src/ai/teach.ts', 'turns: detto.map(') &&
    has('src/dev/TeachSection.tsx', 'turni.map((t) => ({ mio: t.mio, testo: t.testo }))'),
  'senza, «no, intendevo il contrario» è una frase senza niente a cui riferirsi: non è una chat, sono biglietti staccati',
);
check(
  '§10 DUE STADI',
  'e le regole si UNISCONO invece di impilarsi',
  has('src/ai/teach.ts', 'REPLACES') &&
    has('src/state/store.ts', 'const sostituite = replaces'),
  'venti regole che si sovrappongono sono peggio di otto nette: al momento di risolvere non si sommano, si fanno concorrenza',
);
check(
  '§10 DUE STADI',
  'ma sostituire senza mettere niente al posto sarebbe cancellare',
  has('src/ai/teach.ts', 'replaces: lesson ? replaces : []'),
  'se non c’è una lezione nuova, le vecchie restano dove sono',
);
check(
  '§10 DUE STADI',
  'e «ha imparato» si giudica da cosa è cambiato, non da quante sono',
  has('src/dev/TeachSection.tsx', 'const primaIds = lessons.map((l) => l.id)'),
  'una lezione che ne sostituisce una vecchia lascia il conteggio identico: contare direbbe «niente di nuovo» proprio nel caso migliore',
);

check(
  '§10 DUE STADI',
  'si impara solo quando c’è qualcosa da imparare',
  has('src/state/store.ts', 'if (lesson) {') &&
    has('src/dev/TeachSection.tsx', 'non c’era niente di nuovo da tenere'),
  'un modello costretto a produrre una riga a ogni giro ne inventerebbe, e la memoria si riempirebbe di regole che nessuno ha chiesto',
);

/* 🔷 «Proviamo con un'API. Facciamogli fare solo il prompt finale, quello lo do
   a ChatGPT.» */
check(
  '§10 DUE STADI',
  'il resolver si può chiedere all’API, non solo copiare a mano',
  has('src/ai/resolver.ts', 'export async function resolveWithAi') &&
    has('src/dev/ResolverSection.tsx', 'DAMMI IL PROMPT'),
  'la parte che si può automatizzare (decidere) la fa l’API, quella che oggi non si può (disegnare) la fa lui portando il prompt dove vuole',
);
/* 🔷 «E fallo semplice che io possa cliccare e avviene tutto.» */
check(
  '§10 DUE STADI',
  'un pulsante solo, e gli attrezzi da riparazione stanno chiusi',
  has('src/dev/ResolverSection.tsx', 'showManual') &&
    has('src/dev/ResolverSection.tsx', 'useState(false)'),
  'mettere gli attrezzi davanti alla cosa che si usa ogni giorno fa sembrare difficile una cosa facile',
);
check(
  '§10 DUE STADI',
  'ma si aprono da sé quando qualcosa non va',
  has('src/dev/ResolverSection.tsx', 'if (out.problems.length > 0) setShowManual(true);'),
  'è esattamente il momento in cui servono, ed è l’unico in cui vale la pena mostrarli',
);
/* 🔶 QUI C'ERA: «e chiede molto meno di quello che moriva sul tempo»,
   `maxTokens: 3000`.

   ⚠️ QUELLA DECISIONE È STATA ROVESCIATA, non dimenticata. Il tetto stretto
   serviva a stare dentro i dieci secondi delle funzioni; da quando il lavoro
   parte in background e nessuno lo aspetta, quel motivo non esiste più — e
   un tetto stretto su un modello che ragiona è dannoso, perché lo taglia
   MENTRE pensa e produce un JSON troncato invece di una risposta più corta.

   Il tetto nuovo (8000) è difeso dall'ago «e il tetto dei token si alza,
   perché non serviva più a non aspettare», in §19.1. */
/* 🔷 «Il prompt carica ma non va.»
   Il livello di ragionamento non veniva mandato affatto, quindi il modello
   girava al suo predefinito e ci metteva decine di secondi: oltre il muro dei
   dieci. Le tre righe qui sotto tengono ferme le tre decisioni che ne sono
   uscite. */
check(
  '§10 DUE STADI',
  'quanto deve ragionare il modello lo decidiamo noi, non il suo predefinito',
  has(PROVIDERS_FILE, 'reasoning_effort: effort') && has(PROVIDERS_FILE, 'const effort ='),
  'lasciato al predefinito, un modello che ragiona sfonda i dieci secondi delle funzioni e la chiamata muore sempre',
);
check(
  '§10 DUE STADI',
  'e se un modello quel parametro non lo accetta, si riprova senza',
  has(PROVIDERS_FILE, "/reasoning/i.test(detail)"),
  'non tutte le famiglie lo prendono, e un 400 su un parametro non deve far sembrare rotta la chiave',
);
check(
  '§10 DUE STADI',
  'il resolver chiede il ragionamento basso: il suo lavoro è vincolato',
  has('src/ai/resolver.ts', 'thinking: false') &&
    lacksInCode('src/ai/resolver.ts', 'thinking: true'),
  'i fatti sono dati e il formato è dettato: non c’è niente da scoprire, solo da scegliere — è la voce che deve pensare davvero',
);
check(
  '§10 DUE STADI',
  'il prompt che gira è identico a quello che si copia',
  has('src/ai/resolver.ts', 'buildCreativeResolverPrompt(input, numeric)') &&
    has('src/dev/ResolverSection.tsx', 'buildCreativeResolverPrompt(input, numeric)'),
  'se i due percorsi mandassero testi diversi non si capirebbe più quale metodo stiamo giudicando',
);
check(
  '§10 DUE STADI',
  'e la risposta dell’API passa dalla stessa validazione di quella incollata',
  count('src/ai/resolver.ts', /parseResolution\(/g) === 1,
  'due controlli diversi vorrebbero dire che una strada accetta cose che l’altra rifiuta',
);

/* 🔷 «Unable to parse JSON string» — il messaggio di Safari, che non dice
   né dove né se il testo è semplicemente tagliato. */
check(
  '§10 DUE STADI',
  'un JSON che non si legge dice PERCHÉ, non solo che non si legge',
  has('src/assets-pipeline/resolver/parse.ts', 'function diagnose(') &&
    has('src/assets-pipeline/resolver/parse.ts', 'sembra tagliato prima della fine'),
  'un errore che dice «mancano tre graffe» si risolve in dieci secondi, «unable to parse» si risolve riprovando a caso',
);
check(
  '§10 DUE STADI',
  'e le graffe si contano fuori dalle stringhe, non dentro',
  /* La decisione è che il conteggio sappia dove si trova, non la frase con cui
     l'ho spiegata — che va a capo, e un ago su un commento a capo è un ago che
     inciampa nella formattazione invece che nel codice. */
  count('src/assets-pipeline/resolver/parse.ts', /inString/g) >= 4,
  'contarle tutte darebbe una diagnosi sbagliata proprio sui testi lunghi, che sono quelli che si tagliano',
);

check(
  '§10 DUE STADI',
  'ma la riparazione si dichiara, non si fa di nascosto',
  has('src/assets-pipeline/resolver/parse.ts', 'repaired: string[]') &&
    has('src/dev/ResolverSection.tsx', '{repaired.join('),
  'aggiustare in silenzio vorrebbe dire che un giorno una risposta davvero rotta passerebbe per buona',
);

check(
  '§10 DUE STADI',
  'cambiare risoluzione butta i prompt già compilati',
  has('src/state/store.ts', 'resolution, compiledPrompts: undefined'),
  'sono scritti DA quelle decisioni: tenerli sarebbe tenere il ritratto di un’altra creatura',
);
check(
  '§10 DUE STADI',
  'i moltiplicatori stanno solo nel file del pacchetto',
  lacksInCode(CONFIG, 'numeric: {') &&
    has('src/assets-pipeline/resolver/vendor/rules.ts', 'headScale'),
  'li avevo innestati anche nella nostra tabella: la seconda verità è sempre quella che resta indietro',
);
check(
  '§10 DUE STADI',
  'un prompt ha una porta sola, qualunque sia la sorgente',
  has('src/assets-pipeline/promptFor.ts', 'export function promptFor') &&
    count('src/assets-pipeline/generate.ts', /promptFor\(record, type\)/g) === 1 &&
    lacksInCode('src/dev/AssetImport.tsx', 'compilePrompt('),
  'erano tre sorgenti e quattro consumatori: dodici occasioni di consegnare il testo sbagliato senza che niente fallisca',
);
check(
  '§10 DUE STADI',
  'e il limite di v1 è dichiarato, non nascosto',
  has('src/assets-pipeline/promptFor.ts', 'RESOLVER_COVERS'),
  'copre solo il CHARACTER MASTER: gli altri cinque restano sulla concatenazione, e deve vedersi',
);

/* 🔷 «Ma i prompt sono riscritti dall'AI? Se no non sono quelli giusti.» */
check(
  '§10 COMPILATORE',
  'il pacchetto esportato porta il prompt migliore che c’è',
  /* 🔶 L'ago guardava il `??` scritto dentro l'export. Adesso la scelta la fa
     `promptFor`, in un posto solo, e le sorgenti sono tre invece di due: la
     decisione è la stessa — l'export non deve consegnare il concatenato
     quando esiste di meglio — quindi guarda che passi da lì. */
  has('src/assets-pipeline/exportPackage.ts', 'promptFor(record, def.type)'),
  'esportava sempre il concatenato: un pacchetto che sembra giusto e contiene il testo vecchio, cioè si provavano proprio i prompt che stavamo sostituendo',
);
check(
  '§10 COMPILATORE',
  'e dichiara da quale delle tre sorgenti viene',
  has('src/assets-pipeline/exportPackage.ts', 'prompt_source'),
  'aprendo uno zip di tre settimane fa non c’era modo di sapere da quale venivano',
);
check(
  '§10 COMPILATORE',
  'e a schermo si legge, non si deduce',
  has('src/dev/PromptPreview.tsx', 'CONCATENATO DAI FRAMMENTI'),
  'prima si capiva solo da quale pulsante era presente: è la domanda più importante che si possa fare a quella schermata',
);

/* 🔷 «immagine: offline» — mentre le chiamate di testo passavano. */
check(
  '§22.4 GUASTI',
  'una funzione uccisa non si chiama «offline»',
  has('src/ai/backend.ts', "killed ? 'timeout' : 'offline'"),
  '«offline» manda a controllare rete, deploy e token: tutte cose a posto, mentre la funzione era stata fermata dalla piattaforma',
);
/* 🔶 Questo ago cercava la frase «Netlify ferma una funzione dopo 10 secondi»,
   e quella frase adesso NON DEVE PIÙ ESISTERE: il numero era sbagliato per
   questo sito. La decisione però è la stessa di sempre — un limite di
   piattaforma si spiega a parole, non si sigla con un codice. */
check(
  '§22.4 GUASTI',
  'una funzione fermata si spiega, non si sigla',
  has('src/state/store.ts', 'fermata da Netlify') &&
    has('src/screens/Activate.tsx', 'Netlify l’ha fermata prima della risposta'),
  'riprovare non serve a niente: è un limite di piattaforma, non un guasto',
);

/* 🔷 «Nelle API c'è solo questo utilizzo»: cinque richieste di testo, ZERO di
   immagini. Non fallite — mai partite. */
check(
  '§22.4 GUASTI',
  'una riscrittura rifiutata non annulla l’immagine',
  lacksInCode('src/state/store.ts', 'if (why) return `prompt: ${why}`;'),
  'il prompt deterministico è sempre lì e sempre valido: rifiutare la riscrittura vuol dire usare quello di prima, non rinunciare all’immagine',
);
check(
  '§22.4 GUASTI',
  'e il motivo si sa lo stesso, dove serve',
  has('src/state/store.ts', '[forgia] prompt non riscritto per') &&
    has('src/dev/PromptPreview.tsx', 'RISCRIVI CON L’AI'),
  'in DEV si vede se un prompt è riscritto o no: la stessa informazione, detta dove si può usare',
);

/* 🔷 «Le immagini non vanno, ci provo e niente.» — e il motivo restava nei log
   del server, cioe' dove dal telefono non guardi. */
check(
  '§22.4 GUASTI',
  'quando un’immagine non parte, l’app dice PERCHÉ',
  has('netlify/functions/ai.ts', "reason: (result.error ?? '').slice(0, 300)") &&
    has('src/ai/backend.ts', "detail: reason") &&
    has('src/state/store.ts', 'immagine: ${detail ?? failure}'),
  '«modello inesistente» e «organizzazione non verificata» sono due problemi con due rimedi diversi',
);
check(
  '§22.4 GUASTI',
  'un parametro rifiutato non fa fallire tutta la richiesta',
  has('netlify/functions/_shared/providers.ts', "let res = await send({ background: 'transparent' });"),
  'lo sfondo trasparente è una comodità: i parametri accettati cambiano da un modello di immagini all’altro, e non vale perderci una generazione',
);

/* 🔷 «Ma la memoria, come la stai gestendo? Forse manca ancora un'AI che la
   gestisce, per questo parla un po' da coglione?» */
check(
  '§15.2 MEMORIA',
  'la creatura non presenta se stessa come una cosa che sa di lui',
  lacksInCode('src/engine/memoryContext.ts', 'THINGS YOU KNOW ABOUT HIM'),
  '`rememberedDetails` sono la sua sagoma e il suo motivo ricorrente: darglieli come fatti su Vincenzo è il tipo di errore che non rompe niente e fa parlare a vanvera',
);

/* 🔷 «Ora è tutto collegato ma genero e non vedo nulla.» */
check(
  '§29 DEV',
  'senza creatura i pannelli lo DICONO, non spariscono',
  lacksInCode('src/dev/ForgePanel.tsx', 'if (!mon) return null;') &&
    lacksInCode('src/dev/BioSection.tsx', 'if (!mon) return null;') &&
    lacksInCode('src/dev/PromptPreview.tsx', 'if (!mon) return null;') &&
    lacksInCode('src/dev/AssetImport.tsx', 'if (!mon) return null;'),
  'sparire non è un messaggio: la schermata c’era un secondo prima',
);
check(
  '§29 DEV',
  'e dicono che il batch NON fa nascere niente',
  has('src/dev/NoMon.tsx', 'non fa nascere niente') &&
    has('src/dev/ForgePanel.tsx', '<strong>non</strong> fa nascere'),
  'è il motivo più probabile per cui uno preme «genera» e non vede nulla',
);
check(
  '§29 DEV',
  'e offrono la strada, non solo la diagnosi',
  has('src/dev/ForgePanel.tsx', 'PORTAMI ALLA NASCITA'),
  'la strada passa da un’altra scheda e da un pulsante nel prodotto: se la so, la offro',
);
check(
  '§29 DEV',
  'saltare l’attesa non salta la nascita',
  has('src/dev/ForgePanel.tsx', 'Salta l’attesa, non la nascita'),
  'la schiusa resta un momento del prodotto, non un pulsante di DEV',
);

/* 🔷 «Adesso mi aspetto che tutto vada con un solo click.» */
check(
  '§22.4 FAI TUTTO',
  'un pulsante solo fa bio, prompt e immagini',
  has('src/state/store.ts', 'forgeEverything: async (monName)'),
);
/* 🔶 L'ago cercava che lo store rimettesse il master in testa a mano —
   `['character_master'].concat(generationOrder())`. Quella riga esisteva solo
   perché `generationOrder()` cominciava col ritratto: era una toppa. Adesso
   l'ordine canonico ha già il master primo per costruzione, e la toppa è
   uscita. La DECISIONE è la stessa e si controlla meglio: che i due giri —
   quello approvato a mano e quello completo — usino LO STESSO ordine. */
check(
  '§22.4 FAI TUTTO',
  'il giro approvato e quello completo usano lo stesso ordine',
  has('src/state/store.ts', 'return generationOrder();') &&
    lacksInCode('src/state/store.ts', "['character_master' as AssetType].concat"),
  'due ordini diversi per la stessa sequenza sono due sequenze che prima o poi divergono',
);
check(
  '§22.4 FAI TUTTO',
  'si compila e si genera un asset alla volta, non tutto e poi tutto',
  has('src/state/store.ts', 'only: [type],'),
  'compilare in blocco è quello che farebbe perdere il riferimento a tutti e sei',
);
check(
  '§22.4 FAI TUTTO',
  'al primo no ci si ferma',
  /* La decisione è che il ciclo sugli asset ESCA quando uno fallisce, non il
     testo del messaggio che stampa uscendo. */
  count('src/state/store.ts', /for \(const type of order\)[\s\S]{0,800}?break;/g) > 0,
  'insistere sui cinque rimasti produrrebbe cinque rifiuti invece di uno',
);
check(
  '§22.4 FAI TUTTO',
  'il prezzo si dice PRIMA di premere',
  has('src/dev/ForgePanel.tsx', '0,75 €'),
  'un pulsante che scopre il conto dopo non è un pulsante, è una trappola',
);

/* 🔷 «O con click consecutivi che mi mostra tutte le immagini, le approvo e
   andiamo avanti.» */
check(
  '§22.4 FORGIA',
  'si può approvare un asset alla volta, non solo tutto alla cieca',
  has('src/state/store.ts', 'forgeOne: async (monName, type, opts)') &&
    has('src/dev/ForgePanel.tsx', 'VA BENE, AVANTI'),
);
check(
  '§22.4 FORGIA',
  'il master si approva per primo',
  has('src/dev/ForgePanel.tsx', 'da questo dipendono gli altri cinque'),
  'un giro cieco scoprirebbe un master sbagliato alla sesta immagine, cioè dopo averlo pagato sei volte',
);
check(
  '§22.4 FORGIA',
  'rifare l’immagine e riscrivere il prompt sono due pulsanti diversi',
  has('src/dev/ForgePanel.tsx', 'RIFAI L’IMMAGINE') &&
    has('src/dev/ForgePanel.tsx', 'RISCRIVI IL PROMPT'),
  'uno costa quattro centesimi e l’altro quattordici: sullo stesso pulsante pagheresti la riscrittura ogni volta',
);
check(
  '§22.4 FORGIA',
  'il prompt si riscrive solo se lo chiedi tu',
  has('src/state/store.ts', 'if (opts?.rewritePrompt)'),
  '«una volta sola» vale contro la deriva silenziosa, non contro una tua decisione',
);
check(
  '§22.4 FORGIA',
  'l’immagine da approvare è grande abbastanza da giudicarla',
  has('src/dev/dev.css', '.dev__forgeshot'),
  'un francobollo accanto a tre pulsanti è una conferma alla cieca con un’anteprima addosso',
);
check(
  '§22.4 FAI TUTTO',
  'segnare gli slot risolti è scritto in un posto solo',
  has('src/state/store.ts', 'function markAssetsMade(') &&
    count('src/state/store.ts', /markAssetsMade\(set, get, monName, made\)/g) === 2,
  'due copie sono due posti dove dimenticare di marcare il master, e allora i prompt dopo perdono il riferimento in silenzio',
);

/* 🔷 «Scusa, che devo fare qui?» — con tre segreti diversi a schermo. */
/* 🔷 «Continua a cambiare, e anche se lo collego non mi dice attivato.» */
check(
  '§19.5 ATTIVAZIONE',
  'il segreto si genera UNA volta e si salva subito',
  has('src/screens/Activate.tsx', 'if (!token) setToken(freshSecret());') &&
    has('src/screens/Activate.tsx', 'const secret = token ?? \'\';'),
  'ne faceva uno nuovo a ogni apertura e non lo salvava: chi non chiudeva il giro al primo colpo trovava un valore diverso da quello appena messo su Netlify — e di là non si rilegge',
);
check(
  '§19.5 ATTIVAZIONE',
  'e non c’è più niente da incollare nel caso normale',
  has('src/screens/Activate.tsx', 'HO GIÀ UN SEGRETO ALTROVE'),
  'un campo da riempire con un valore che l’app ha già è un passaggio che esiste solo per farlo sbagliare',
);
check(
  '§19.5 ATTIVAZIONE',
  'e quando non è attivo dice QUALE delle tre cose manca',
  has('src/screens/Activate.tsx', 'LO STESSO, SU NETLIFY') &&
    has('src/screens/Activate.tsx', 'UNA CHIAVE CHE PARLA'),
  'una causa sola non basta: le cose che devono essere vere sono tre, e sapere quale manca è la differenza fra «riprovo» e «so cosa fare»',
);

check(
  '§19.5 ATTIVAZIONE',
  'ATTIVO vuol dire «qualcuno può rispondere», non «ci sono tutte le chiavi»',
  has('netlify/functions/setup.ts', 'voice: voices.some((v) => v.ready)') &&
    has('src/screens/Activate.tsx', 'setup.ready?.voice'),
  'una schermata che dice MANCA di fianco a un fornitore che hai scelto di non usare fa sembrare rotto quello che è una tua decisione',
);

check(
  '§19.5 ATTIVAZIONE',
  'il pulsante sta nel prodotto, non in DEV',
  has('src/App.tsx', 'ATTIVA VINZ.MON') && has('src/App.tsx', 'if (token) return null'),
  'chi apre l’app la prima volta non va a cercarlo nel pannello di sviluppo',
);
check(
  '§19.5 ATTIVAZIONE',
  'il segreto lo genera il caso, non tu',
  /* 🔶 Era un ago sul testo letterale di `Activate.tsx` — si è rotto quando
     `freshSecret` si è trasferita in `engine/secret.ts` per essere riusata
     anche dal generatore di VINZMON_SHORTCUT_TOKEN (brief Shortcuts §4):
     stessa funzione, un file diverso, non più duplicata a mano una seconda
     volta. Punta ora sulla decisione vera, dove vive davvero. */
  has('src/engine/secret.ts', 'crypto.getRandomValues') &&
    has('src/screens/Activate.tsx', "from '../engine/secret'"),
  'un token che uno ricorda è un token corto, e dietro c’è il budget',
);
check(
  '§19.5 ATTIVAZIONE',
  'il server dice SE una chiave c’è, mai cosa contiene',
  has('netlify/functions/setup.ts', 'present: Boolean(process.env[v.name])') &&
    lacks('netlify/functions/setup.ts', 'value: process.env'),
);
check(
  '§19.5 ATTIVAZIONE',
  'un server senza segreto lo dice invece di rispondere «non autorizzato»',
  has('netlify/functions/setup.ts', 'serverToken: false'),
  'è l’errore n.1 al primo deploy, e su quello il silenzio non protegge niente',
);
check(
  '§19.5 ATTIVAZIONE',
  'ogni modo di fallire ha la sua frase',
  has('src/screens/Activate.tsx', "case 'offline':") &&
    has('src/screens/Activate.tsx', "case 'unauthorized':"),
  '«token sbagliato, funzioni non pubblicate o rete assente» era una frase sola per tre problemi',
);

/* 🔷 «Non arriva proprio la richiesta su ChatGPT API.» — e non c'era modo di
   sapere se fosse vero. Quattro guasti diversi davano lo stesso schermo. */
check(
  '§19.5 ATTIVAZIONE',
  'si prova a parlare col fornitore, non solo a contare le chiavi',
  has('netlify/functions/ping.ts', 'export const config = { path: \'/api/ping\' }') &&
    has('src/screens/Activate.tsx', 'loadPing(withToken)'),
  '«la chiave c’è» non ha mai voluto dire «la chiave funziona», ed è in quello spazio che stava il guasto',
);
check(
  '§19.5 ATTIVAZIONE',
  'la prova chiede l’elenco dei modelli, che non costa e non può andare in timeout',
  has('netlify/functions/ping.ts', 'modelsWeUse'),
  'una diagnosi che può morire per lo stesso motivo che sta diagnosticando non diagnostica niente',
);
check(
  '§19.5 ATTIVAZIONE',
  'e dice se i nomi dei modelli che usiamo esistono davvero in quell’account',
  has('netlify/functions/ping.ts', 'unknownModels'),
  'un nome sbagliato viene rifiutato prima di essere pagato, quindi sul cruscotto non compare: da fuori è identico a «non arriva niente»',
);
check(
  '§19.5 ATTIVAZIONE',
  'la prova va sullo stesso indirizzo delle chiamate vere',
  has('netlify/functions/ping.ts', 'https://api.openai.com/v1/models') &&
    has('netlify/functions/_shared/providers.ts', 'https://api.openai.com/v1/'),
  'un esito verde su un host diverso da quello che fallisce non direbbe niente',
);
/* ⚠️ DUE VOLTE HO PUNTATO QUESTO AGO SULLA FORMA E DUE VOLTE È INCIAMPATO
   SULLE RIGHE GIUSTE: prima su `p.headers(key),`, poi su `'x-api-key': key`.
   Sono tutt'e due la chiave usata come si deve — nell'INTESTAZIONE DELLA
   RICHIESTA, che è il posto dove serve.

   🔒 La decisione non è «la parola chiave non compare». È: LA FORMA CHE
   ATTRAVERSA IL FILO NON HA UN CAMPO PER LA CHIAVE. E quella forma è
   dichiarata, si chiama `ProviderProbe`, e si può leggere. */
const PING_SHAPE =
  (read('netlify/functions/ping.ts') ?? '').match(
    /export interface ProviderProbe \{[\s\S]*?\n\}/,
  )?.[0] ?? '';
check(
  '§19.5 ATTIVAZIONE',
  'e non torna mai una chiave, nemmeno un pezzo',
  PING_SHAPE.includes('configured: boolean') && !/\bkey\b/i.test(PING_SHAPE),
  'una diagnosi che stampa la chiave è la cosa da cui §19.3 ci ha portati via',
);

/* 🔷 «Dice chiamata fallita offline. Adesso ha detto timeout.» — erano lo
   stesso evento riportato in due modi, e uno dei due mandava a controllare la
   rete mentre il problema era la piattaforma. */
check(
  '§19.5 ATTIVAZIONE',
  'una funzione uccisa si chiama timeout anche quando arriva come «offline»',
  has('src/ai/backend.ts', 'NETLIFY_WALL_MS') &&
    has('src/ai/backend.ts', "failure: wall() ? 'timeout' : 'offline'"),
  'Netlify non risponde sempre 502 quando uccide una funzione, ma ci mette sempre dieci secondi',
);
check(
  '§19.5 ATTIVAZIONE',
  'e le si distingue guardando l’orologio, non indovinando',
  has('src/ai/backend.ts', 'const startedAt = Date.now()'),
  'una rete che non c’è fallisce subito, una funzione uccisa fallisce dopo nove secondi e mezzo: è un ordine di grandezza, non una sfumatura',
);
check(
  '§19.1 FORNITORE',
  'con gli strumenti il ragionamento è `none`, che è l’unico valore che passa',
  has(PROVIDERS_FILE, 'req.tools?.length') && has(PROVIDERS_FILE, "? /* Con gli strumenti"),
  'GPT-5.6 rifiuta con 400 una richiesta con funzioni e uno sforzo diverso da none, e la rifiuta anche se non lo mandi: il suo predefinito è medium',
);

/* ⚠️ LA FORMA DELLA TAVOLA È UNA SCELTA DI COMPOSIZIONE, non un dettaglio
   del fornitore. Stava murata a 1024x1024 dentro l'adattatore, cioè nell'unico
   posto che non sa quale asset sta disegnando. */
check(
  '§23 ASSET',
  'ogni asset dichiara la sua forma, e non la decide chi disegna',
  has('src/engine/assets.ts', "size: '1536x1024'") &&
    has('src/assets-pipeline/generate.ts', 'assetTypeDef(type).size'),
  'l’EXPRESSION SHEET è una griglia 3×2 e il ciclo di riposo è una striscia: chiesti quadrati nascono storti',
);
check(
  '§23 ASSET',
  'e la misura che arriva da fuori si controlla dove non si può aggirare',
  has(PROVIDERS_FILE, 'export const IMAGE_SIZES') &&
    has('netlify/functions/ai.ts', 'IMAGE_SIZES.includes(asked as ImageSize)'),
  'una misura inventata farebbe fallire la chiamata dopo averla pagata in attesa',
);

/* 🔷 «Metti in tutti questi pulsanti un loader.» */
check(
  '§10.4 PRIMITIVE',
  'un pulsante che aspetta si muove, e non solo cambia scritta',
  has('src/system/components.tsx', 'export function Wait()') &&
    has('src/system/system.css', '@keyframes wait-pulse'),
  'una scritta ferma è lo stesso pixel al secondo zero e al secondo trenta: non distingue «sto lavorando» da «sono morto»',
);
check(
  '§10.4 PRIMITIVE',
  'e mentre aspetta non si può premere di nuovo',
  has('src/system/components.tsx', 'disabled={disabled || loading}'),
  'un secondo tocco è un secondo lavoro identico e una seconda spesa, ed è quello che si fa quando non si capisce se è vivo',
);
check(
  '§10.4 PRIMITIVE',
  'ma resta leggibile: sotto c’è scritto cosa sta facendo',
  has('src/system/system.css', '.btn--loading:disabled'),
  'l’opacità da disabilitato spegnerebbe proprio la riga che serve di più mentre aspetti',
);
check(
  '§10 DUE STADI',
  'quanto sta durando si vede mentre dura',
  has('src/dev/useElapsed.ts', 'export function useElapsed') &&
    has('src/dev/ResolverSection.tsx', 'waitingText(busy, waiting)') &&
    has('src/dev/ForgePanel.tsx', 'waitingText(busy, waiting)'),
  'morire al nono secondo e morire al quarantesimo sono due problemi senza niente in comune, e senza il numero sono lo stesso schermo che gira',
);
/* 🔷 «Ora va, anche se è arrivato a 17 secondi.» — cioè il tetto di questo
   sito è più alto di diciassette, e io avevo ripetuto «dieci» per due giorni
   prendendolo dalla documentazione generale invece che dal sito vero. */
check(
  '§19.5 ATTIVAZIONE',
  'i secondi veri finiscono nel messaggio, non solo la mia idea del limite',
  has('src/ai/backend.ts', 'function after(startedAt: number)') &&
    has('src/ai/backend.ts', 'detail: after(startedAt)'),
  'la soglia la posso sbagliare — l’ho fatto — i secondi trascorsi no',
);
/* 🔷 «Potrebbe essere anche che in quei secondi è contato altro.» — ed era
   l'obiezione giusta contro una mia deduzione fatta in fretta: da un totale
   che comprende caricamento del codice, costruzione del prompt e salvataggio
   non si conclude niente sulla funzione. */
check(
  '§19.5 ATTIVAZIONE',
  'il tempo della chiamata si misura separato da quello del pulsante',
  has('src/ai/backend.ts', 'ms: Date.now() - startedAt') &&
    has('src/dev/ResolverSection.tsx', 'di cui') &&
    has('src/dev/ResolverSection.tsx', 'lastTotal'),
  'da un numero solo si deducono cose sbagliate; con due non c’è più niente da dedurre',
);
check(
  '§19.5 ATTIVAZIONE',
  'e nessuna schermata annuncia un tetto che non ho verificato su questo sito',
  lacks('src/screens/Activate.tsx', '10 secondi') &&
    lacks('src/state/store.ts', "fermata a 10 secondi"),
  'dire un numero sbagliato con sicurezza manda a cambiare piattaforma per un problema che non c’era',
);

/* ============================================================================
   §12/06 LA CHAT VERA — «Neutro è il grande problema su tutto.»

   🔴 PRIMO TENTATIVO SBAGLIATO, e la correzione lo spiega da sé: qui c'era un
   ago che guardava QUALE componente monta `tab === 'chat'` (`CompanionHomeScreen`
   contro `LazyChat`). Vincenzo ha chiesto indietro l'estetica di `LazyChat`
   (markdown, allegati, composer) — «riporta la chat a prima» — e a quel punto
   l'ago sull'identità dello schermo sarebbe rimasto rosso per una decisione
   giusta. La schermata non era mai stata il problema: il problema era dentro
   `replyWithLocalTools` (brain/stream.ts), il percorso che si accende ogni
   volta che il messaggio tocca dati o azioni — cioè spesso — che aveva un
   system prompt neutro cablato invece di `buildVoiceSystemPrompt`. Il
   percorso senza strumenti (`netlify-runtime.ts`) lo faceva già bene.
   Questo ago guarda quell'invariante, non lo schermo che la ospita. */
{
  const streamSrc = read('src/brain/stream.ts') ?? '';
  const toolsFn = /export async function replyWithLocalTools[\s\S]*?\n}/.exec(streamSrc)?.[0] ?? '';
  const plainFn = /export async function streamReply[\s\S]*?\n}/.exec(streamSrc)?.[0] ?? '';
  check(
    '§12/06 CHAT',
    'la chat — con o senza strumenti — parla col personaggio quando c’è un .mon attivo, non con un assistente neutro cablato',
    streamSrc.includes('buildVoiceSystemPrompt') &&
      toolsFn.includes('characterVoiceBlock()') &&
      plainFn.includes('characterVoiceBlock()'),
    '«a neutral high-quality personal AI assistant» era il prompt letterale del percorso che usa gli strumenti — nessun DNA, nessun umore, nessuna memoria, proprio nei turni dove la chat tocca i tuoi dati',
  );
}

/* ============================================================================
   §12/06 FEEDBACK ME — «tutte le funzionalità che c'erano in cui io
   aggiungevo cibo ed allenamento uscita animazione e feedback sotto.»

   🔴 QUALE SCHERMO MONTA LA TAB CHAT È STATO SBAGLIATO DUE VOLTE in questa
   sessione, in due direzioni opposte — un ago che asserisce «deve essere
   X» ha già sbagliato una volta e sbaglierebbe di nuovo alla prossima
   inversione. Quello che NON deve sparire, a prescindere da quale
   schermo vince, è il feedback: `ChatGPT` (components/examples/chatgpt.tsx)
   ha `MessageUpdates` (mostra «Pasto aggiunto in ME» / «Allenamento
   aggiunto in ME» sotto il messaggio) e la reazione del .mon
   (`monReaction`) quando i suoi strumenti scrivono in ME. Questo ago
   guarda quello — non lo schermo che lo ospita. */
{
  const chatgptSrc = read('src/assistant-original/components/examples/chatgpt.tsx') ?? '';
  check(
    '§12/06 FEEDBACK ME',
    'quando la chat registra un pasto o un allenamento, lo si vede sotto al messaggio',
    chatgptSrc.includes('MessageUpdates') &&
      chatgptSrc.includes('Allenamento (?:aggiunto|corretto) in ME') &&
      chatgptSrc.includes('Pasto (?:aggiunto|corretto) in ME') &&
      chatgptSrc.includes('monReaction'),
    'senza questo feedback, scrivere "ho mangiato una pizza" salva il pasto ma non lo dice — e sembra che non abbia funzionato anche quando ha funzionato',
  );
}

check(
  '§19.3 STEP',
  'SYSTEM.LAB → AI legge lo stesso catalogo di DEV → AI/MODELLI, non i tre campi morti',
  has('src/lab/rooms/SystemLab.tsx', "from '../../../netlify/functions/_shared/routing'") &&
    lacksInCode('src/lab/rooms/SystemLab.tsx', 's.voiceModel') &&
    lacksInCode('src/lab/rooms/SystemLab.tsx', 's.compilerModel') &&
    lacksInCode('src/lab/rooms/SystemLab.tsx', 's.imageModel'),
  '«Non vedo modifiche alla schermata AI del lab» — scriveva su voiceModel/compilerModel/imageModel, che ogni chiamata vera (runStep/stepModel) ha smesso di leggere: una manopola collegata al niente',
);

{
  const routingSrc = read(ROUTING_FILE) ?? '';
  const textCheapBlock = /export const TEXT_CHEAP_CHOICES[\s\S]*?\n\];/.exec(routingSrc)?.[0] ?? '';
  check(
    '§19.3 STEP',
    'Gemini non è fra le alternative della riflessione settimanale',
    textCheapBlock.length > 0 && !textCheapBlock.includes("'google'"),
    'la riflessione legge mesi di storia personale: il piano gratuito di Google addestra sui dati, quello a pagamento no, e questo file non può sapere quale hai — finché non è una scelta guardando la fattura, resta fuori',
  );
}

check(
  '§29 DEV',
  'DEV si apre su INIZIO e non su quindici linguette',
  /* FINAL DEV → LAB CONSOLIDATION: `initialGroup` esiste solo per LAB, che
     apre DEV già sul gruppo giusto (`?openDevGroup=…`); senza, il default
     resta 'start' — la stessa cosa che questo controllo verificava prima. */
  has('src/dev/DevPanel.tsx', "useState<DevGroup>(initialGroup ?? 'start')") &&
    has('src/dev/DevPanel.tsx', 'GROUPS.map((g) => ({ id: g.id, label: g.label }))'),
);
check(
  '§29 DEV',
  'ricominciare da capo si trova in INIZIO, non sepolto in una scheda',
  hasInSurface('<ResetAllButton onReset={resetAll} keptCount={keptCount} />') &&
    hasInSurface('className="dev__danger"'),
  'stava in fondo a MINDLINE, e raggruppando le schede era sparito',
);
check(
  '§29 DEV',
  'ma staccato dai comandi di tutti i giorni',
  has('src/dev/dev.css', '.dev__danger'),
  'accanto a «+1 GIORNO» un dito storto costerebbe mesi',
);
check(
  '§29 DEV',
  'cambiando gruppo si apre la sua prima scheda',
  has('src/dev/DevPanel.tsx', 'const first = GROUPS.find((x) => x.id === g)?.tabs[0]'),
  'altrimenti resta a schermo una sezione che le linguette sopra non contengono',
);

/* ============================================================================
   MASTER CHARACTER SYSTEM v1.1 — §8 CHARACTER DESIGN DNA · §20.3 CATALOGHI
   ========================================================================= */

check(
  'DESIGN DNA §8',
  'la libreria ha i sette designer approvati',
  ['KEN SUGIMORI', 'GENNDY TARTAKOVSKY', 'AKIRA TORIYAMA', 'CRAIG McCRACKEN',
   'PENDLETON WARD', 'TETSUYA NOMURA', 'JAMIE HEWLETT']
    .every((n) => has(CONFIG, `id: '${n}'`)),
);
check(
  'DESIGN DNA §8',
  'Kaneko è dichiarato fuori, non semplicemente assente',
  has(CONFIG, "DESIGN_DNA_RETIRED = ['KAZUMA KANEKO']") &&
    lacks(CONFIG, "{\n    id: 'KAZUMA KANEKO'"),
  'un nome cancellato da un elenco rientra al primo che rilegge un documento vecchio',
);
check(
  'DESIGN DNA §8',
  'costruzione e resa restano due assi separati',
  has('src/assets-pipeline/fragments.ts', "axis: 'design_dna'") &&
    has('src/assets-pipeline/fragments.ts', 'that belongs to APPEARANCE'),
  'se il Design DNA potesse decidere la resa, due assi si contenderebbero lo stesso campo',
);
check(
  'DESIGN DNA §8',
  'il designer finisce davvero nei prompt, in tutti gli asset',
  has('src/assets-pipeline/compiler.ts', 'design.${slug(data.character_design_dna)}'),
  'un campo in CharacterData che nessun prompt legge è lavoro fatto a metà',
);
check(
  'DESIGN DNA §8',
  'non dipende dai segnali: è come si disegna, non chi è',
  /* 🔶 La variabile si chiama `drawnDesigner` da quando la TEST PHASE può
     sovrascriverla. La decisione non cambia: l'estrazione è un sorteggio dal
     catalogo, non una funzione dei segnali — e si fa comunque, anche da
     fermi, per non spostare la sequenza casuale. */
  has(GEN, "const drawnDesigner = pick(rng, keepEnabled('design'") &&
    has(GEN, 'const designDna = drawnDesigner;'),
  '«i .mon tristi si disegnano alla McCracken» sarebbe una regola che nessuno ha deciso',
);

check(
  'CATALOGHI §20.3',
  'il motore pesca solo da quello che è acceso',
  count(GEN, /keepEnabled\(/g) >= 6,
  `${count(GEN, /keepEnabled\(/g)} assi filtrati`,
);
check(
  'CATALOGHI §20.3',
  'il filtro sta PRIMA del punteggio, non dopo',
  has(GEN, "keepEnabled('family', SELECTABLE_FAMILIES"),
  'filtrare i vincitori farebbe girare il softmax su una distribuzione che non esiste',
);
check(
  'CATALOGHI §20.3',
  'non si può spegnere tutto',
  has('src/engine/catalogTuning.ts', 'ne devono restare almeno'),
);
check(
  'CATALOGHI §20.3',
  'una Family sola accesa è uno stato legittimo, e VISIBILE',
  /* 🔶 IL MINIMO ERA DUE, con la ragione «con una sola, ogni creatura nasce
     della stessa specie e il generatore diventa un timbro». La ragione era
     giusta e la difesa non difendeva niente: `TEST_PHASE` teneva ferma la
     Family passando SOPRA il catalogo, quindi il timbro c'era comunque — solo
     che non si vedeva e non si poteva togliere.

     🔷 «Io devo poter sbloccare o bloccare delle famiglie.» */
  has('src/engine/catalogTuning.ts', 'min: 1') &&
    has('src/engine/catalogTuning.ts', 'è uno stato VISIBILE'),
  'una difesa aggirata da un altro meccanismo non è una difesa: è una cosa che nasconde il timbro',
);
check(
  'CATALOGHI §20.3',
  'spegnere non tocca i .mon già nati',
  has('src/engine/catalogTuning.ts', 'SPEGNERE NON È CANCELLARE'),
);

check(
  'ICONA §23.6',
  'il sigillo va anche nell’icona dell’app, non solo nella scheda',
  has('src/App.tsx', 'applySigilAppIcon(sigil)') &&
    has('src/system/favicon.ts', "querySelector<HTMLLinkElement>('link[rel=\"apple-touch-icon\"]')"),
  'puntava a un PNG statico: chi si metteva l’app sul telefono si portava a casa il globo',
);
check(
  'ICONA §23.6',
  'l’icona non può rompere un avvio',
  has('src/system/favicon.ts', 'img.onerror = () => resolve(null)'),
);
check(
  'ICONA §23.6',
  'niente alpha: su iOS un’icona trasparente viene composta su nero',
  has('src/system/favicon.ts', "ctx.fillStyle = '#ffffff'"),
);

check(
  'ROTTURA §26',
  'un errore di render non può più dare schermo grigio',
  has('src/main.tsx', '<ErrorBoundary>') && existsSync('src/system/ErrorBoundary.tsx'),
  'il grigio è il fondo del body: vuol dire che non è stato disegnato niente',
);
check(
  'ROTTURA §26',
  'la schermata di rottura dice COSA si è rotto',
  has('src/system/ErrorBoundary.tsx', 'error.message || String(error)'),
  'da un telefono non c’è una console da aprire: un messaggio generico non si ripara mai',
);
check(
  'ROTTURA §26',
  'cancellare tocca solo la chiave dell’app, non tutto il dominio',
  has('src/system/ErrorBoundary.tsx', "localStorage.removeItem('vinzmon.prototype.v4')") &&
    lacksInCode('src/system/ErrorBoundary.tsx', 'localStorage.clear()'),
  'non è roba nostra da buttare',
);
check(
  'ROTTURA §26',
  'una creatura nata prima dei ruoli di palette non fa esplodere il compilatore',
  has('src/assets-pipeline/compiler.ts', 'generated before HOUSE COLOR DNA roles existed'),
  '§29: una creatura porta scritta la versione con cui è nata, non si riscrive',
);

check(
  'PROVE §12',
  'il protocollo di prova esiste come strumento, non come istruzioni',
  existsSync('src/dev/DesignTest.tsx') && has('src/dev/DevPanel.tsx', "id: 'designtest'"),
  'sette prove con quattordici assi da tenere identici non si fanno a mano',
);
check(
  'PROVE §12',
  'la forma è UNA, clonata: non sette creature simili',
  has('src/dev/DesignTest.tsx', 'function withDesigner'),
);
check(
  'PROVE §12',
  'scartare un designer è la stessa cosa che spegnerlo nei cataloghi',
  has('src/dev/DesignTest.tsx', "setCatalogEnabled('design'"),
  'due posti per la stessa decisione sarebbero due verità che divergono',
);
check(
  'PROVE §12',
  'la domanda del giudizio è dichiarata: ha cambiato la costruzione?',
  has('src/dev/DesignTest.tsx', 'ha cambiato la costruzione'),
  'guardando sette immagini si finisce a scegliere la più bella, che è la domanda sbagliata',
);
check(
  'DESIGN DNA §8',
  'il designer si vede anche nel prodotto, non solo in DEV',
  has('src/screens/SpecimenProfile.tsx', 'label="CHARACTER DESIGN DNA"'),
);

check(
  'VERSIONE §29',
  'la targhetta la scrive la build, non la mia memoria',
  has('vite.config.ts', '__BUILD__') && has('vite.config.ts', 'git rev-parse'),
  'un numero da alzare a mano direbbe «aggiornato» a un sito vecchio il primo giorno che dimentico',
);
check(
  'VERSIONE §29',
  'su Netlify il commit arriva da chi lo sa',
  has('vite.config.ts', 'COMMIT_REF'),
);
check(
  'VERSIONE §29',
  'se non si sa, si dice — non si inventa',
  has('vite.config.ts', "return 'sconosciuto'"),
  'una targhetta che mente è la ragione per cui la targhetta esiste',
);
check(
  'VERSIONE §29',
  'si vede aprendo DEV, non navigando dentro',
  has('src/dev/DevPanel.tsx', 'buildLabel()'),
);

check(
  'CATALOGHI §20.3',
  'quello che nasce spento è dichiarato in un posto solo',
  has('src/engine/catalogTuning.ts', 'const DEFAULT_OFF'),
);
check(
  'CATALOGHI §20.3',
  '«riporta ai predefiniti» non riaccende quello che hai spento per sempre',
  has('src/engine/catalogTuning.ts', 'off[axis] = new Set(DEFAULT_OFF[axis] ?? [])'),
  'un pulsante che riaccende tutto rimette dentro proprio le voci che non vuoi',
);
check(
  'CATALOGHI §20.3',
  'ELASTIC CARTOON è cancellata, non spenta',
  lacksInCode('src/engine/generation-config.ts', "'ELASTIC CARTOON'") &&
    lacksInCode('src/assets-pipeline/fragments.ts', "'ELASTIC CARTOON'"),
  'il master §10 elenca tre Appearance: quella era un residuo della spec vecchia',
);
check(
  'PROVE §12',
  'la forma si può comporre a mano',
  has('src/dev/DesignTest.tsx', 'const PICKERS'),
);
check(
  'PROVE §12',
  'e passa dal generatore vero, non da campi sovrascritti',
  has('src/dev/DesignTest.tsx', 'generateMon({') &&
    has('src/dev/DesignTest.tsx', 'continuity: axes'),
  'sovrascrivere i campi produrrebbe creature che non potrebbero mai nascere: su quelle non si impara niente',
);

check(
  'COMPILATORE §10',
  'il prompt lo può riscrivere un modello, non solo la concatenazione',
  existsSync('src/ai/promptCompiler.ts') && has('src/state/store.ts', 'compileAssetPrompt'),
  '265 frammenti incollati non sanno che QUESTO è uno squalo corriere',
);
check(
  'COMPILATORE §10',
  'ma non può cambiare i fatti: si controlla che siano sopravvissuti',
  has('src/ai/promptCompiler.ts', 'survivingConstraints') &&
    has('src/ai/promptCompiler.ts', 'vincoli persi'),
);
check(
  'COMPILATORE §10',
  'una riscrittura che perde un vincolo si BUTTA, non si rattoppa',
  has('src/ai/promptCompiler.ts', 'un prompt rattoppato è un'),
);
check(
  'COMPILATORE §10',
  'e si scrive una volta sola',
  has('src/state/store.ts', 'if (rec.compiledPrompts?.[assetType]) return null'),
  'un prompt che cambia produce sei immagini di sei creature diverse',
);
check(
  'COMPILATORE §10',
  'senza chiave resta quello deterministico',
  /* 🔶 Il ripiego non sta più dentro `generate.ts`: sta in `promptFor`, che è
     l'unico posto che sceglie fra le tre sorgenti. La decisione è che il
     concatenato sia sempre l'ULTIMA parola e non manchi mai. */
  has('src/assets-pipeline/promptFor.ts', "return { text: compilePrompt(record, assetType).text, source: 'concatenato' };"),
);

/* ============================================================================
   VINZ.LAB — la seconda porta
   ========================================================================= */

const ENTRY = 'src/lab/entrypoint.ts';
const MAIN = 'src/main.tsx';
const GUARDS = 'src/lab/design/installPreviewGuards.ts';
const PREVIEW = 'src/lab/design/DesignPreviewRoute.tsx';

check(
  'VINZ.LAB',
  'si entra da un indirizzo, non da un pulsante',
  has(ENTRY, "#\\/lab") && lacksInCode(APP, '/lab'),
  'un link nella UI normale renderebbe pubblico un laboratorio privato',
);
check(
  'VINZ.LAB',
  'e l\'indirizzo è ancorato: `#/p/labirinto` non apre il laboratorio',
  has(ENTRY, "/^#\\/lab(?:\\/(creation|soul|design|system))?\\/?$/"),
);
check(
  'VINZ.LAB',
  'una schermata inventata nell\'indirizzo non monta niente',
  has(ENTRY, 'DESIGN_SCREENS.includes(value as DesignScreenId)'),
  'il catalogo è chiuso come in `skin.ts`: fuori dalla lista si torna all\'app',
);
check(
  'VINZ.LAB',
  'il laboratorio si installa con nome, icona e manifest suoi',
  /* 🔶 CERCAVA QUESTE COSE IN `applyLabDocumentMeta.ts`, come se fosse lui a
     reggere l'installazione. Non lo è più: i tag stanno scritti nel documento
     del lab, e quel file è solo la rete di sicurezza per chi entra dal vecchio
     `#/lab`. L'ago guarda la decisione — «il lab si installa come sé stesso» —
     nel posto dove adesso vive davvero. */
  has('lab/index.html', 'href="/lab-manifest.webmanifest"') &&
    has('lab/index.html', 'href="/lab-icon-180.png') &&
    has('lab/index.html', 'content="VINZ.LAB"') &&
    has('public/lab-manifest.webmanifest', '"start_url": "/lab/"') &&
    has('src/lab/applyLabDocumentMeta.ts', 'apple-touch-icon'),
  '🔷 «nel file originale di ChatGPT c\'è una icona per la webapp solo legata al lab»: il manifest da solo non bastava, `apple-touch-icon` è il tag che iOS legge prima',
);
check(
  'VINZ.LAB',
  'e si entra anche da un indirizzo vero, non solo dal frammento',
  has(ENTRY, "^\\/lab(?:\\/(creation|soul|design|system))?\\/?$") &&
    has(ENTRY, 'window.location.pathname') &&
    has('netlify.toml', 'from = "/lab"'),
  '🔷 «non si apre la webapp, mi porta sempre a vinz.mon» — un frammento (`#/lab`) non è affidabile per un\'icona già installata: iOS segue lo `start_url` del manifest, e quello deve poter essere un indirizzo vero',
);
check(
  'VINZ.LAB',
  'e il lab ha un DOCUMENTO suo, non i tag dell\'app riscritti da JS',
  existsSync('lab/index.html') &&
    has('lab/index.html', '<link rel="manifest" href="/lab-manifest.webmanifest" />') &&
    has('lab/index.html', '<title>VINZ.LAB</title>') &&
    has('vite.config.ts', "lab: fileURLToPath(new URL('./lab/index.html'"),
  '🔴 «niente, stesso errore»: `<script type="module">` è differito, quindi Safari legge i tag PRIMA che il JS li corregga — e installa l\'icona con lo start_url di VINZ.MON',
);
check(
  'VINZ.LAB',
  'e le riscritture portano al documento del lab, non a quello dell\'app',
  has('netlify.toml', 'to = "/lab/index.html"') && lacksInCode('netlify.toml', 'to = "/index.html"'),
  'mandarle a `/index.html` rimetterebbe in piedi esattamente il difetto appena corretto',
);
check(
  'VINZ.LAB',
  'proporre una Family nuova non tocca mai il catalogo vero',
  has('src/engine/taxonomyProposals.ts', "import type { ArchetypeMass, SignalKey } from './generation-config'") &&
    lacksInCode('src/engine/taxonomyProposals.ts', 'FAMILIES.push') &&
    lacksInCode('src/engine/taxonomyProposals.ts', 'FAMILIES['),
  '🔷 «come faccio ad aggiungere altre idee di famiglia»: le proposte vivono in una coda a parte, mai in `generation-config.ts` — quello resta il catalogo che `verify:batch` verifica',
);
check(
  'VINZ.LAB',
  'e la bozza che scrive l\'AI usa solo segnali e masse che esistono già',
  has('src/ai/taxonomyDraftAI.ts', 'SIGNAL_KEYS as readonly string[]).includes(k)') &&
    has('src/ai/taxonomyDraftAI.ts', 'ARCHETYPE_MASSES as readonly string[]).includes'),
  'un segnale inventato nel `fit` sarebbe una voce che pesa la rarità senza che nessuno l\'abbia calibrata',
);
check(
  'VINZ.LAB',
  'e l\'icona del lab è il disegno vero di Vincenzo, guide di costruzione comprese',
  existsSync('docs/lab/reference/lab-icon-construction.png') &&
    existsSync('docs/lab/reference/lab-icon-master.png') &&
    has('scripts/make-lab-icon.mjs', "readFileSync('docs/lab/reference/lab-icon-master.png')") &&
    has('public/lab-manifest.webmanifest', '/lab-icon-180.png'),
  '🔷 «già che ci sei, l\'icona di VINZ.LAB» — non più i colori dell\'icona di VINZ.MON invertiti, ma il suo schema tecnico ripulito',
);
check(
  'VINZ.LAB',
  'ma tornando all\'app i quattro campi tornano quelli di `index.html`',
  has('src/lab/applyLabDocumentMeta.ts', "'#111111'"),
  "#000000 sarebbe stato un cambio di produzione mascherato da ripristino",
);
check(
  'VINZ.LAB',
  'i guardiani si installano PRIMA che lo store venga importato',
  has(MAIN, 'installPreviewGuards();') &&
    (read(MAIN) ?? '').indexOf('installPreviewGuards();') <
      (read(MAIN) ?? '').indexOf("await import('./lab/design/DesignPreviewRoute')"),
  'con l\'import statico lo store scriverebbe prima che ci sia chi glielo impedisce',
);
check(
  'VINZ.LAB',
  'e una scrittura di rete dalla preview alza un errore, non passa in silenzio',
  has(GUARDS, 'blocked preview network mutation'),
  'una scrittura ignorata in silenzio è un bug che si scopre fra tre settimane',
);
check(
  'VINZ.LAB',
  'la preview NON monta `App`: monterebbe sync, ingestione e primo messaggio',
  /* 🔒 L'AGO PUNTA ALLA DECISIONE, non alla forma: non «manca la stringa
     `<App`», ma «la preview non monta il contenitore che fa partire i motori».
     `lacksInCode` toglie i commenti, così spiegare perché non c'è non lo fa
     fallire. */
  lacksInCode(PREVIEW, '<App') &&
    has(MAIN, "await import('./lab/design/DesignPreviewRoute')"),
);
check(
  'VINZ.LAB',
  'e nemmeno `IntegratedChat`: monta la superficie, non il motore',
  lacksInCode('src/lab/design/DesignChatPreview.tsx', 'IntegratedChat') &&
    has('src/lab/design/DesignChatPreview.tsx', 'useLocalRuntime'),
  '`IntegratedChat` migra le conversazioni salvate e parla col server: aprire DESIGN.LAB migrerebbe l\'archivio',
);
check(
  'VINZ.LAB',
  'ma la cornice è quella vera, importata e non ricopiata',
  has(PREVIEW, 'MonTab') && has(PREVIEW, 'MeTab') && has(PREVIEW, 'TabBar') &&
    has(APP, 'export function MonTab({'),
  'DO NOT COPY THE UI: una copia è una copia vecchia il giorno dopo',
);
check(
  'VINZ.LAB',
  'e il campo nero si calcola dalla vista, non si dichiara una volta',
  has(PREVIEW, "monView !== 'mon'"),
  'un valore fisso sarebbe giusto al primo render e sbagliato al secondo',
);
check(
  'VINZ.LAB',
  'le porte sono quattro, e sono quelle disegnate',
  count('src/lab/LabApp.tsx', /nome: '/g) === 4 &&
    has('src/lab/LabApp.tsx', '🧬 CREATION.LAB') &&
    has('src/lab/LabApp.tsx', '👻 SOUL.LAB'),
  'una stanza senza porta è una stanza che nessuno apre',
);
check(
  'VINZ.LAB',
  'il pannello DEV non viene tolto prima che il laboratorio sappia farne le veci',
  /* FINAL DEV → LAB CONSOLIDATION: la parità è verde adesso (CREATURE e
     PERSONA aprono lo stesso pannello dentro un iframe), e questo prop in
     più è esattamente il collegamento — non una rimozione. */
  has(APP, "<DevPanel onClose={onClose} onGo={onGo} initialGroup={initialDevGroup} />"),
  'DEV_PARITY_MATRIX: «do not remove legacy DEV until parity is verified»',
);

/* ============================================================================
   VINZ.LAB — le stanze degli strumenti
   ========================================================================= */

check(
  'VINZ.LAB',
  'le stanze SONO le pagine disegnate, non un guscio inventato',
  /* 🔶 QUESTO AGO DICEVA IL CONTRARIO. Chiedeva che le stanze importassero i
     componenti di `src/dev/`: era giusto quando il laboratorio era il
     pannello DEV dentro un guscio nuovo, ed è diventato sbagliato appena
     Vincenzo ha detto che quel guscio non doveva esistere.

     🔷 «Tutte le pagine che ho disegnato prima non dovevi disegnarle, dovevi
        lasciarle così com'erano e integrare la parte che c'era dietro.»

     La decisione adesso è: il CSS delle stanze è COPIATO dai suoi file, e i
     suoi file stanno nel repo. Se un giorno qualcuno riscrive quel CSS a
     mano, questo ago non se ne accorge — ma se sparisce la fonte, sì. */
  existsSync('docs/lab/design/00-atrio.html') &&
    existsSync('docs/lab/design/creation-lab.html') &&
    existsSync('docs/lab/design/system-lab.html') &&
    has('src/lab/skin/atrio.css', 'NON RISCRIVERE QUESTO FILE A MANO'),
  'il disegno era già fatto: la fonte visiva sta nel repo, non nella mia testa',
);
check(
  'VINZ.LAB',
  'e il laboratorio non carica il foglio di stile dell\'app',
  has('src/main.tsx', "if (entry.kind !== 'lab') {") && has('src/main.tsx', "await import('./appStyles');"),
  'il disegno ha font e colori suoi: caricarci sopra i token del prodotto darebbe una terza cosa',
);
check(
  'VINZ.LAB',
  'TOKENS mostra il design system intero, non le 5 righe scelte a mano',
  has('src/engine/designTokens.ts', "id: 'griglia'") &&
    has('src/engine/designTokens.ts', "id: 'tipografia'") &&
    has('src/engine/designTokens.ts', "id: 'motion'"),
  '🔷 «Vedere il design system del progetto per intero»: sette gruppi, non un sottoinsieme',
);
check(
  'VINZ.LAB',
  'e un token modificato lì vale anche fuori dal lab, e sopravvive al riavvio',
  has('src/main.tsx', 'applyTokenOverrides') && has('src/engine/designTokens.ts', 'vinzmon.designTokens.v1'),
  '🔷 «poter modificare un valore che vale per tutti»: si applica al boot, prima dell\'app e della preview',
);
check(
  'VINZ.LAB',
  'e il Color DNA della creatura non si tocca da lì',
  has('src/engine/designTokens.ts', 'ADAPTIVE_VARS') && !has('src/engine/designTokens.ts', "'--char-primary', defaultValue"),
  '--char-primary e affini li scrive colorDna.ts a ogni cambio di .mon: un override qui litigherebbe con quel meccanismo',
);
check(
  'VINZ.LAB',
  'ed è LO STESSO assistente da CREATION, SYSTEM e DESIGN, non tre che non si parlano',
  has('src/lab/rooms/CreationLab.tsx', 'LabAssistantPanel') &&
    has('src/lab/rooms/SystemLab.tsx', 'LabAssistantPanel') &&
    has('src/lab/rooms/DesignLab.tsx', 'LabAssistantPanel'),
  'un componente solo, montato in tre stanze: la stessa cronologia, sincronizzata dal token',
);
/* 🔴 «Le pagine assistente devono essere interamente come quella della chat,
   con tutte le funzionalità, ma in bianco.» Scelto esplicitamente: «chat vera
   con gli strumenti», non solo l'aspetto — e questo SOSTITUISCE il vecchio
   giro chiedi→proposta→APPLICA/ANNULLA (scoped a cataloghi/pesi/token, mai
   una scrittura da sola) che questi aghi verificavano prima. Non è stato
   dimenticato: è la decisione esplicita di Vincenzo a rimpiazzarlo — vedi
   `LabAssistantPanel.tsx` per il perché per esteso. */
check(
  'VINZ.LAB',
  'e l\'assistente del lab è la STESSA chat di casa, con gli stessi strumenti',
  has('src/lab/assistant/LabAssistantPanel.tsx', "import { IntegratedChat } from '../../assistant-original/IntegratedChat';") &&
    has('src/lab/assistant/LabAssistantPanel.tsx', 'runTool={runChatTool}') &&
    has('src/lab/assistant/LabAssistantPanel.tsx', 'useApp.getState().runMonTool(use)'),
  '🔷 «chat vera con gli strumenti»: stessa `IntegratedChat`, stesso `runMonTool` della chat di casa — legge i dati, scrive pagine, promemoria, ricerca web',
);
check(
  'VINZ.LAB',
  'e resta bianco: niente `.dark` forzato sul documento del lab',
  has('src/lab/assistant/LabAssistantPanel.tsx', 'embedded') &&
    has('src/assistant-original/IntegratedChat.tsx', 'if (!embedded) document.documentElement.classList.add("dark")') &&
    has('src/assistant-original/chat-surface.tsx', 'bg-white text-[#0d0d0d]'),
  '🔷 «... ma in bianco, in questo modo la chat è utilizzabile» — `embedded` monta la STESSA superficie, non una copia: il clone ha già il suo tema chiaro nativo (`bg-white dark:bg-black`), qui basta non forzare `.dark`',
);
check(
  'VINZ.LAB',
  'e PROPONI detta con un composer suo, senza bisogno della chat intera per una richiesta sola',
  has('src/lab/rooms/TaxonomyLab.tsx', "import { DictationComposer } from '../../brain/DictationComposer';") &&
    has('src/brain/DictationComposer.tsx', "import './brain.css';"),
  'PROPONI resta una richiesta sola — descrivi, l\'AI scrive la scheda — non una conversazione: la dettatura basta, non serve il thread o gli strumenti della chat intera',
);
check(
  'VINZ.LAB',
  'e in DESIGN.LAB le schede non spariscono dietro un titolo che non serve',
  lacksInCode('src/lab/rooms/DesignLab.tsx', 'labtitle') &&
    has('src/lab/skin/design.css', '.tabs{flex:1;min-width:0;') &&
    has('src/lab/skin/atrio.css', '.lab .top{display:flex'),
  '🔷 «le tab in alto nascoste dal titolo della pagina, il titolo non serve» — un `.top` globale di atrio.css (mai scopato a `.lab .top`) metteva il titolo e le cinque schede fianco a fianco: con la quinta scheda aggiunta restava spazio solo per «UI» e mezza «TOKENS»',
);
check(
  'VINZ.LAB',
  'e SYSTEM.LAB può ricevere il segreto anche se VINZ.LAB, installato a parte, non lo eredita da VINZ.MON',
  has('src/lab/rooms/SystemLab.tsx', "showPaste ? 'CHIUDI' : token ? 'CAMBIA IL SEGRETO' : 'INCOLLA IL SEGRETO'") &&
    has('src/lab/rooms/SystemLab.tsx', 'setToken(draft.trim())'),
  '🔴 «il lab non sembra collegato, non vedo i token che avevo già messo nel dev» — su iOS un\'app installata come icona SUA non condivide il browser storage con VINZ.MON, nemmeno stessa origine: prima SETUP diceva solo «si imposta da ATTIVA VINZ.MON, sta lì e non qui» e non c\'era modo di rimediare da dentro il lab',
);
check(
  'VINZ.LAB',
  'e il token collega anche i DATI, non solo la chat — LabApp scarica il .mon vero appena può',
  has('src/lab/LabApp.tsx', "import { useApp, syncWithServer } from '../state/store';") &&
    has('src/lab/LabApp.tsx', 'if (!token) return;') &&
    has('src/lab/LabApp.tsx', 'await syncWithServer();'),
  '🔴 «ma se gli do il token sono coegate?» — il segreto da solo sincronizza le chat (`serverBackedStorage`) ma non il .mon: quello lo scarica `syncWithServer()`, che prima girava solo dentro `App.tsx` e il lab non montava mai `App`',
);
check(
  'VINZ.LAB',
  'e modificare un token, un catalogo o un peso nel lab si vede anche in VINZ.MON, non solo nel codice',
  has('src/engine/designTokens.ts', 'void serverBackedStorage.setItem(CHIAVE, JSON.stringify(overrides));') &&
    has('src/engine/catalogTuning.ts', 'void serverBackedStorage.setItem(CHIAVE, testo);') &&
    has('src/engine/axisTuning.ts', 'void serverBackedStorage.setItem(CHIAVE, testo);') &&
    has('src/App.tsx', 'pullTokenOverridesFromServer') &&
    has('src/lab/LabApp.tsx', 'pullCatalogFromServer'),
  '🔴 «eh no, allora sono manopole che devo modificare col codice — tutto questo è inutile»: TOKENS, CATALOGHI e i pesi vivevano in tre chiavi mai toccate dal giro server costruito per il .mon; ora `salva()` in ciascuno dei tre file spinge anche verso `/api/user-data`, e ogni app la riscarica appena ha un token',
);
check(
  'VINZ.LAB',
  'i comandi non spariscono in tema scuro',
  has('src/lab/skin/_base.css', 'color-scheme: light') &&
    has('src/lab/skin/_base.css', 'color: inherit'),
  '`<button>` non eredita il colore: prende `ButtonText`, che in scuro è bianco su bianco',
);
check(
  'VINZ.LAB',
  'e le sette sezioni che stavano dentro DevPanel adesso si possono montare da fuori',
  has('src/dev/sections.tsx', 'export function TimeSection') &&
    has('src/dev/DevPanel.tsx', "} from './sections';"),
);
check(
  'VINZ.LAB',
  'il pannello DEV resta intero finché la parità non è verde',
  has(APP, '<DevPanel') && has('src/dev/DevPanel.tsx', 'DEV://VINZ.MON'),
  'DEV_PARITY_MATRIX: «do not remove legacy DEV until parity is verified»',
);
check(
  'VINZ.LAB',
  'e la parità è una prova che gira, non un\'impressione',
  has('package.json', '"verify:parity"') && has('scripts/parity-check.mjs', 'PARITÀ RAGGIUNTA'),
  'è così che si perde una funzione senza accorgersene: guardando due schermate e ricordandosi male',
);


check(
  'VINZ.LAB',
  'le stanze che SCRIVONO lo dicono a schermo',
  has('src/lab/rooms/SystemLab.tsx', 'QUESTA PAGINA CAMBIA LA CREATURA VERA') &&
    has('src/lab/rooms/SystemLab.tsx', 'ANCHE QUI SI SCRIVE'),
  '🔴 il laboratorio si installa con un\'icona sua e sembra un\'app a parte: non lo è, e far passare un giorno qui lo fa passare davvero',
);
check(
  'VINZ.LAB',
  'e «PRODUCTION = READ ONLY» resta solo dove è vero',
  has('src/lab/rooms/CreationLab.tsx', 'PRODUCTION = READ ONLY') &&
    lacksInCode('src/lab/rooms/SystemLab.tsx', 'PRODUCTION = READ ONLY'),
  'una promessa giusta in una stanza diventa una bugia in quella accanto se nessuno dice dove finisce',
);

/* ============================================================================
   MODIFICARE IL FLUSSO — «fai in modo che escano di più»
   ========================================================================= */

const AXIS = 'src/engine/axisTuning.ts';

check(
  'CREATION.LAB',
  'gli occhiali si possono pesare, non solo accendere e spegnere',
  has(AXIS, "'eyewear'") && has('src/engine/characterGenerator.ts', "tunedPick(rng, 'eyewear'"),
  '🔷 «non togliere quelli da sole: fai uscire di più quelli da vista» — accendi/spegni non era la risposta giusta',
);
check(
  'CREATION.LAB',
  'e a pesi tutti uguali il motore genera IDENTICO a prima',
  has(AXIS, 'if (!tuned(axis)) {') && has(AXIS, 'list[Math.floor(rng() * list.length)]'),
  'accendere il meccanismo non deve cambiare le distribuzioni già verificate: se `verify:batch` diventa rosso senza che nessuno abbia toccato un peso, è questo file ad aver sbagliato',
);
check(
  'CREATION.LAB',
  'un peso non può azzerare la varietà di un asse',
  has(AXIS, 'PESO_MAX = 5'),
  'con un peso a 100 su una voce sola la creatura ha SEMPRE gli stessi occhiali: non è una preferenza, è un timbro',
);
check(
  'CREATION.LAB',
  'e portare tutto a zero non rompe la generazione',
  has(AXIS, 'if (totale <= 0) return'),
  '«non voglio nessun tipo di occhiali» è una richiesta impossibile: si dice nella UI, non ci si rompe dentro il motore',
);
check(
  'CREATION.LAB',
  'i comandi si agganciano al passo per NUMERO, non per nome',
  has('src/lab/rooms/CreationLab.tsx', "const COMANDI: Record<string, AsseDelPasso[]> = {") &&
    has('src/lab/rooms/CreationLab.tsx', "'09': ["),
  'gli ID canonici non cambiano, i nomi sì: un aggancio sul nome si stacca in silenzio',
);
check(
  'CREATION.LAB',
  'e ogni passo modificabile si può PROVARE, contando cosa esce',
  has('src/lab/rooms/StepTuning.tsx', 'PROVA · 200 CREATURE') &&
    has('src/lab/rooms/StepTuning.tsx', 'const N = 200;'),
  'sotto il centinaio le percentuali ballano da sole e si legge come effetto quello che è rumore',
);

/* ============================================================================
   IL MAZZO — come il .mon impara i tuoi gusti
   ========================================================================= */

const TRAIN = 'src/lab/rooms/training.ts';
const BUILD = 'src/lab/rooms/CreationLab.tsx';

check(
  'CREATION.LAB',
  'si guarda una creatura alla volta, sì o no',
  has(BUILD, "giudica('NO')") && has(BUILD, "giudica('SI')") && has(BUILD, 'className="deck"'),
  '🔷 «facciamo tipo Tinder: vediamo vari risultati e ci accorgiamo se qualcosa è una merda»',
);
check(
  'CREATION.LAB',
  'e il duello a coppie è stato tolto, non affiancato',
  lacksInCode(BUILD, 'duelcard') && lacksInCode(TRAIN, "'BOTH'"),
  '🔶 il duello ti costringe a scegliere anche quando fanno schifo tutte e due: aveva due voti che non contavano niente',
);
check(
  'CREATION.LAB',
  'una voce si giudica sullo SCARTO dalla tua media, non sulla percentuale nuda',
  has(TRAIN, 'scarto: x.si / x.viste - media') && has(TRAIN, 'LA TUA MEDIA È IL METRO'),
  '🔒 se dici sì all\'80% di tutto, una voce all\'80% non ti piace: è nella media',
);
check(
  'CREATION.LAB',
  'e sotto le cinque apparizioni non si dichiara niente',
  has(TRAIN, 'MINIMO_VISTE = 5') && has(TRAIN, 'p.viste >= MINIMO_VISTE'),
  'una regola imparata da due casi entra nel prompt del resolver e ci resta',
);
check(
  'CREATION.LAB',
  'anche quello che NON piace diventa una lezione',
  has(TRAIN, 'bocciate:') && has(BUILD, '💩 {ETICHETTA_ASSE[p.asse]}'),
  'una lezione fatta solo di gusti positivi lascia il resolver libero di rifare quello che hai scartato dieci volte',
);
check(
  'CREATION.LAB',
  'i giudizi stanno in una memoria loro, separata dalla partita',
  has(TRAIN, "'vinzlab.training.v2'") && lacksInCode(TRAIN, 'vinzmon.prototype'),
  'un allenamento non deve poter toccare la creatura vera',
);
check(
  'CREATION.LAB',
  'e diventano una lezione VERA solo dopo averla letta',
  has(BUILD, 'teachResolver(frase, [])') &&
    has(BUILD, 'COSA STO PER INSEGNARGLI') &&
    has(BUILD, 'APPROVA E INSERISCI'),
  '🔷 «lui genera delle lezioni, io le leggo, le approvo, e vengono inserite»',
);

/* ============================================================================
   COSA NASCE — le liste con acceso / spento
   ========================================================================= */

check(
  'CREATION.LAB',
  'Family, taglia e designer passano tutti e tre dal catalogo',
  has('src/engine/catalogTuning.ts', "label: 'TAGLIA'") &&
    has('src/engine/catalogTuning.ts', "'design', 'size'") &&
    lacksInCode('src/engine/characterGenerator.ts', "locked('family')"),
  '🔷 «cerca la strada più semplice»: erano due meccanismi che facevano la stessa cosa, e uno passava sopra all\'altro senza dirlo',
);
check(
  'CREATION.LAB',
  'e il catalogo si SALVA',
  has('src/engine/catalogTuning.ts', "'vinzmon.catalog.v1'") &&
    has('src/engine/catalogTuning.ts', 'function salva()'),
  '🔴 prima viveva in memoria: spegnevi una Family, ricaricavi, e tornava accesa senza dire niente',
);
check(
  'CREATION.LAB',
  'il primo avvio parte dallo stato vero: una Family accesa',
  has('src/engine/catalogTuning.ts', 'const SEME:') &&
    has('src/engine/catalogTuning.ts', "id !== 'ANGEL'"),
  'oggi nasce solo ANGEL: scritto come lista, si legge e si cambia',
);
check(
  'CREATION.LAB',
  'ma «rimetti a posto» torna ai predefiniti del MOTORE, non al seme',
  has('src/engine/catalogTuning.ts', 'export function resetCatalog') &&
    has('src/engine/catalogTuning.ts', 'È UN SEME, NON UN VALORE DI DEFAULT'),
  'i controlli sulle distribuzioni misurano l\'equità del motore, non com\'è configurato il gioco',
);
check(
  'CREATION.LAB',
  'e il flusso dice in cima cosa è acceso adesso',
  has('src/lab/rooms/CreationLab.tsx', 'ADESSO NASCE:') &&
    has('src/lab/rooms/CreationLab.tsx', 'function CosaEAcceso'),
  '«perché nasce sempre la stessa specie?» è la prima domanda: la risposta va per prima',
);

/* ============================================================================
   LE IMMAGINI DEL DUELLO
   ========================================================================= */

const DUELIMG = 'src/lab/rooms/duelImages.ts';

check(
  'CREATION.LAB',
  'il duello può disegnare le creature, non solo elencarle',
  has(DUELIMG, 'askImage') && has('src/lab/rooms/CreationLab.tsx', 'CON IMMAGINI'),
  '🔷 «si devono generare delle immagini» — un mostro lo scegli con l\'occhio, non leggendo le etichette',
);
check(
  'CREATION.LAB',
  'e dice quante ne stai per pagare PRIMA di partire',
  /* 🔶 Era `{quanti * 2}` quando le carte andavano a coppie. Il mazzo ne
     disegna una per creatura: il numero è quello, e la decisione — dirlo
     PRIMA — non cambia. */
  has('src/lab/rooms/CreationLab.tsx', '{quante} da disegnare e da pagare'),
  'un interruttore che non dice quanto costa è un interruttore che si accende per sbaglio',
);
check(
  'CREATION.LAB',
  'le immagini si chiedono UNA ALLA VOLTA',
  lacksInCode(DUELIMG, 'Promise.all') && has(DUELIMG, 'for (const x of piatte)'),
  'sedici richieste insieme sbattono tutte insieme contro il tetto di spesa: in fila, il primo rifiuto ferma il resto',
);
check(
  'CREATION.LAB',
  'e quello che è già stato pagato non si ripaga',
  has(DUELIMG, 'if (fatte.has(idImmagine(x.seed))) continue;'),
  'chiudere l\'app non deve voler dire ricominciare a pagare da capo',
);
check(
  'CREATION.LAB',
  'la notifica passa dal service worker, non da `new Notification`',
  has(DUELIMG, 'reg.showNotification') && lacksInCode(DUELIMG, 'new Notification('),
  'su iPhone, in un\'app della schermata Home, `new Notification` non esiste',
);
check(
  'CREATION.LAB',
  'e il permesso si chiede PRIMA di avviare il lavoro',
  has('src/lab/rooms/CreationLab.tsx', 'await chiediPermesso();'),
  'chiederlo alla fine vuol dire scoprire di non poter avvisare proprio quando c\'è qualcosa da dire',
);

/* ============================================================================
   I DUE TASTI A/B — e il .mon di prova
   ========================================================================= */

const TESTMON = 'src/lab/rooms/testMon.ts';

check(
  'CREATION.LAB',
  'il .mon di prova esiste, ed è quello della specifica',
  has(TESTMON, "seedFromString('VINZLAB_TEST_MON_V1')") &&
    has(TESTMON, "family: 'ANGEL'") &&
    has(TESTMON, "archetype: 'PUTTO'"),
  'TEST_MON_SPEC.md: una creatura deliberatamente noiosa, per cambiare UN valore e tenere fermo il resto',
);
check(
  'CREATION.LAB',
  'e i suoi campi generati NON sono scritti a mano',
  has(TESTMON, 'generateFirstMon') && lacksInCode(TESTMON, 'character_dna:'),
  'la specifica lo vieta: DNA, palette, voce e nome li produce il motore, poi si congelano',
);
check(
  'CREATION.LAB',
  'e se un valore canonico sparisce, si rompe a voce alta',
  has(TESTMON, 'non esistono più nel catalogo'),
  'sostituirne un altro in silenzio vuol dire fare A/B su una creatura diversa senza saperlo',
);
check(
  'CREATION.LAB',
  "l'A/B di un valore cambia SOLO quel campo",
  has(TESTMON, 'export function variante') &&
    has(TESTMON, 'Only the target being tested may change'),
  'se A e B vengono diversi, la differenza dev’essere attribuibile alla regola che stai provando',
);
check(
  'CREATION.LAB',
  'e non si può lanciare un A/B con A e B uguali',
  has('src/lab/rooms/StepAB.tsx', 'const uguali =') &&
    has('src/lab/rooms/StepAB.tsx', 'disabled={gira || !token || uguali}'),
  '🔴 sarebbe la stessa immagine due volte, pagata due volte, con l’aria di un test riuscito',
);
check(
  'CREATION.LAB',
  'il tasto in fondo al flusso passa i valori, non spera nello stato',
  has('src/lab/rooms/CreationLab.tsx', "void genera({ quante: 12, immagini: true, famiglia: '', archetipo: '', taglia: '' })") &&
    has('src/lab/rooms/CreationLab.tsx', 'const quanteOra = forza?.quante ?? quante;'),
  '🔴 partiva con i valori vecchi: numero sbagliato e nessuna immagine, con l’aria di funzionare',
);
check(
  'CREATION.LAB',
  'e non resta incollato a una Family scelta a mano in una sessione BUILD precedente',
  has('src/lab/rooms/CreationLab.tsx', 'const famigliaOra = forza?.famiglia ?? famiglia;') &&
    has('src/lab/rooms/CreationLab.tsx', 'if (famigliaOra) {'),
  '🔴 «genero le immagini in una pagina dove ho selezionato ALL con le family, ma avevo cliccato nel flow dove non c’erano tutte»: `genera()` chiudeva sulla Family di PRIMA del reset, perché il pulsante chiamava `setFamiglia(\'\')` e poi `genera()` nello stesso istante, prima che React aggiornasse lo stato — lo schermo diceva ALL, il motore generava ancora quella vecchia',
);
check(
  'CREATION.LAB',
  'e la lezione si LEGGE prima di approvarla',
  has('src/lab/rooms/CreationLab.tsx', 'COSA STO PER INSEGNARGLI') &&
    has('src/lab/rooms/CreationLab.tsx', 'APPROVA E INSERISCI'),
  '🔷 «lui genera delle lezioni, io le leggo, le approvo, e vengono inserite»',
);

/* ============================================================================
   SOUL — la faccia viva
   ========================================================================= */

const SOUL_EXPR = 'src/soul/soulExpressions.ts';
const SOUL_GEO = 'src/soul/soulGeometry.ts';

check(
  'SOUL',
  'lo schizzo di riferimento sta nel progetto, non solo nel pacchetto',
  existsSync('docs/lab/reference/soul-master-sketch.png'),
  'SOUL_EXPRESSION_AI_BRIEF: ogni proposta deve partire da quell\'immagine',
);
check(
  'SOUL',
  'una espressione e un insieme di numeri, non un disegno per espressione',
  has(SOUL_EXPR, 'Record<SoulExpression, SoulFaceState>') && count(SOUL_EXPR, /^  [a-z]+: f\(/gm) === 12,
  'dodici disegni vorrebbero dire dodici file da rifare a ogni ritocco della forma',
);
check(
  'SOUL',
  'le tre ancore dello schizzo sono dichiarate come tali',
  has(SOUL_EXPR, 'ANCORA — centro dello schizzo') &&
    has(SOUL_EXPR, 'ANCORA — sinistra dello schizzo') &&
    has(SOUL_EXPR, 'ANCORA — destra dello schizzo'),
);
check(
  'SOUL',
  'e scocciato e arrabbiato si distinguono per l\'INCLINAZIONE, non per un occhio diverso',
  has(SOUL_EXPR, 'leftEyeTilt: 26') && has(SOUL_EXPR, "sleepy: f({ leftEyeOpen: 0.34"),
  'tre forme diverse sarebbero tre occhi diversi: la faccia smetterebbe di essere la stessa creatura',
);
check(
  'SOUL',
  'il corpo non e un cerchio perfetto',
  lacksInCode(SOUL_GEO, '<circle') && has(SOUL_GEO, 'roundness'),
  'un cerchio esatto e un\'icona di interfaccia, non una creatura disegnata a mano',
);
check(
  'SOUL',
  'la fiamma ha gli spigoli vivi',
  has(SOUL_GEO, 'export function wispPath') && lacksInCode(SOUL_GEO, 'wispCurve'),
  'con le curve diventa fumo, e lo schizzo dice fulmine',
);
check(
  'SOUL',
  'l\'umore modula il colore, non lo sostituisce',
  has('src/soul/SoulMoodAdapter.ts', 'hueMood') &&
    lacksInCode('src/soul/SoulMoodAdapter.ts', "'blue'") &&
    has('src/soul/soulExpressions.ts', 'hueMood: 8'),
  'triste=blu sostituirebbe l\'identita del .mon: sarebbe un\'altra creatura ogni sera',
);
check(
  'SOUL',
  'e il colore del corpo viene dal .mon attivo',
  has('src/soul/SoulController.ts', 'monPrimary ?? tuning.color.bodyTest') &&
    has('src/lab/rooms/SoulLab.tsx', 'palette_dna?.primary'),
);
check(
  'SOUL',
  'i sei strati di movimento hanno durate diverse fra loro',
  count('src/soul/soul.css', /animation: soul-/g) >= 5 &&
    has('src/soul/soul.css', 'animation-delay: -1.1s'),
  'in fase, sei animazioni diventano una GIF che rimbalza',
);
check(
  'SOUL',
  'e chi ha chiesto meno movimento non ne riceve',
  has('src/soul/soul.css', 'prefers-reduced-motion'),
);
check(
  'SOUL',
  'SOUL.LAB produce i due file di passaggio',
  has('src/lab/rooms/SoulLab.tsx', 'soul-v1-tuning.json') &&
    has('src/lab/rooms/SoulLab.tsx', 'soul-v1-handoff.txt'),
  'il JSON serve a chi implementa, il testo a chi deve capire cosa hai approvato',
);
check(
  'SOUL',
  'e non scrive niente da nessuna parte',
  lacksInCode('src/lab/rooms/SoulLab.tsx', 'setState(') &&
    lacksInCode('src/lab/rooms/SoulLab.tsx', 'saveRemote'),
  'la taratura vive nella schermata: da qui esce un file, non una modifica',
);

/* ============================================================================
   Shortcut API — brief «VINZ.MON iOS Shortcuts — Background Integration»
   ========================================================================= */

const SHORTCUT = 'netlify/functions/shortcut.ts';

check(
  'SHORTCUTS',
  'le Shortcut hanno un secondo segreto, non lo stesso token dell\'app',
  has('netlify/functions/_shared/auth.ts', "authorizeAgainst(request, 'VINZMON_SHORTCUT_TOKEN')") &&
    has('netlify/functions/_shared/auth.ts', "authorizeAgainst(request, 'VINZMON_TOKEN')"),
  'revocabile da solo: cambiarlo non tocca voce, immagini, salvataggio',
);
check(
  'SHORTCUTS',
  'chi scrive (POST, le Shortcut) e chi legge (GET, il .mon) usano token diversi',
  has(SHORTCUT, 'authorizeShortcut(request)') && has(SHORTCUT, 'authorize(request)'),
);
check(
  'SHORTCUTS',
  'il tetto di spesa si controlla solo dove si spende davvero',
  (read(SHORTCUT) ?? '').split('checkCap()').length - 1 === 1,
  'peso, come stai e allenamento non chiamano AI: un tetto pieno non deve fermarli',
);
check(
  'SHORTCUTS',
  'un pasto che il modello non sa leggere non riceve numeri inventati',
  has(SHORTCUT, "kcal: 0, protein: 0, carbs: 0, fat: 0, confidence: 'low'"),
  'un numero sbagliato con l\'aria di una misura è peggio di nessun numero',
);
check(
  'SHORTCUTS',
  'ricordo e obiettivo sono registrati ma non hanno un ramo proprio',
  lacksInCode(SHORTCUT, "actionId === 'memory'") && lacksInCode(SHORTCUT, "actionId === 'goal'"),
  'brief §11/§14: «future/secondary V1» — dichiarati nel registro, non ancora costruiti',
);
check(
  'SHORTCUTS',
  'un segnale del giorno già dichiarato non viene corretto da una Shortcut',
  has('src/state/store.ts', "record.signals.MOOD?.status ?? 'UNKNOWN') === 'UNKNOWN'") &&
    has('src/state/store.ts', "record.signals.FOOD?.status ?? 'UNKNOWN') === 'UNKNOWN'"),
  'stessa regola di §21: si riempie solo uno sconosciuto, mai si sovrascrive',
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
