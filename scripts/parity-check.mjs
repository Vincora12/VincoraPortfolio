/* ============================================================================
   PARITÀ DEV → VINZ.LAB

   🔷 «Implementa tutto l'implementabile, poi se finito il lavoro ci accorgiamo
      che c'è tutto togliamo il DEV dal sito principale.»

   🔒 «Do not remove legacy DEV until parity is verified» — DEV_PARITY_MATRIX.

   Questo copione è quel «ci accorgiamo che c'è tutto». Senza, la decisione di
   togliere DEV si prende guardando due schermate e ricordandosi male: è
   esattamente il modo in cui si perde una funzione senza accorgersene, e in
   questo progetto è già successo (il reset finito in fondo a una scheda, il
   calendario uscito da ME con la sua riscrittura).

   Cosa fa, in concreto:

   1. legge quali sezioni monta DEV, dal codice di `DevPanel.tsx`;
   2. legge quali sezioni montano le stanze del laboratorio;
   3. fallisce se una sezione è in DEV e nel laboratorio non c'è;
   4. fallisce se una sezione è montata in DUE stanze — la matrice vieta i
      doppioni, e un doppione è due strumenti che divergono;
   5. dice, alla fine, se DEV si può togliere.

   ⚠️ QUELLO CHE NON PUÒ FARE. Guarda che il componente sia MONTATO, non che
   funzioni: la prova che funzioni è aprirlo. Ma un componente non montato non
   funziona di sicuro, ed è quello che si perde per distrazione.

   Uso:  node scripts/parity-check.mjs
   ========================================================================= */

import { readFileSync, existsSync, readdirSync } from 'node:fs';

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

let failures = 0;
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok, detail });
  if (!ok) failures++;
};

/* --- 1. Cosa monta DEV ------------------------------------------------------ */

const DEVPANEL = read('src/dev/DevPanel.tsx');

/* I componenti che il pannello RENDE davvero, non quelli che importa: un
   import senza uso è precisamente il caso che stiamo cercando di evitare. */
/* ⚠️ IL `<` DI JSX NON È IL `<` DEI TIPI. Un `<([A-Z]\w*)` nudo pesca anche
   `useState<DevGroup>` e `Record<DevTab, …>`, e il copione va a cercare nel
   laboratorio una «sezione» che è un tipo. In JSX il `<` sta a inizio riga o
   dopo uno spazio, una parentesi, una virgola: mai attaccato a un
   identificatore. */
const montati = (testo) =>
  new Set(
    [...testo.matchAll(/(?:^|[\s(){}[\],;:?=&|>])<([A-Z][A-Za-z0-9]*)\b/gm)].map((m) => m[1]),
  );

const IGNORA = new Set([
  'FolderTabs', 'IconButton', 'Button', 'Row', 'TextField', 'Icon',
  'ScreenHead', 'SystemLabel', 'HoldButton', 'LabRoom', 'PendingLab',
  'Suspense', 'StrictMode', 'ErrorBoundary',
]);

const inDev = [...montati(DEVPANEL)].filter((n) => !IGNORA.has(n)).sort();

/* --- 2. Cosa montano le stanze ---------------------------------------------- */

const stanze = {};
const roomDir = 'src/lab/rooms';
if (existsSync(roomDir)) {
  for (const f of readdirSync(roomDir).filter((n) => n.endsWith('.tsx') && n !== 'LabRoom.tsx')) {
    stanze[f.replace('.tsx', '')] = [...montati(read(`${roomDir}/${f}`))].filter((n) => !IGNORA.has(n));
  }
}

const casaDi = (nome) =>
  Object.entries(stanze)
    .filter(([, lista]) => lista.includes(nome))
    .map(([stanza]) => stanza);

/* --- 3. Ogni sezione di DEV ha una casa ------------------------------------- */

/* 🔒 `StartSection` NON è nell'elenco, e non è una dimenticanza: non è uno
   strumento, è l'atrio di DEV — le quattro cose che si fanno ogni volta, già
   presenti altrove una per una. Un atrio non si migra: si sostituisce con
   l'atrio del laboratorio, che è la pagina delle quattro porte. */
const NON_MIGRA = new Set(['StartSection']);

const senzaCasa = [];
const doppioni = [];

for (const nome of inDev) {
  if (NON_MIGRA.has(nome)) continue;
  const case_ = casaDi(nome);
  if (case_.length === 0) senzaCasa.push(nome);
  if (case_.length > 1) doppioni.push(`${nome} → ${case_.join(' + ')}`);
}

check(
  'ogni sezione di DEV è montata anche nel laboratorio',
  senzaCasa.length === 0,
  senzaCasa.length ? `manca: ${senzaCasa.join(', ')}` : `${inDev.length - NON_MIGRA.size} sezioni`,
);

check(
  'e nessuna è montata in due stanze',
  doppioni.length === 0,
  doppioni.join(' · ') || 'la matrice vieta i doppioni: due strumenti uguali divergono',
);

/* --- 4. E il laboratorio le monta VERE, non ricopiate ----------------------- */

/* 🔶 CHIEDEVA CHE **OGNI** STANZA IMPORTASSE DA `../../dev/`, e sbagliava
   bersaglio: SOUL.LAB non eredita niente da DEV — la Soul è nata qui, dallo
   schizzo — quindi era rossa per aver fatto la cosa giusta.

   🔒 La decisione non è «ogni stanza pesca da DEV». È: una sezione che
   esisteva in DEV, nel laboratorio dev'essere QUELLA, non una riscrittura.
   Quindi si guarda sezione per sezione, e le stanze che non ne ospitano
   nessuna non hanno niente da dimostrare. */
const copiate = [];
for (const [stanza, lista] of Object.entries(stanze)) {
  const testo = read(`${roomDir}/${stanza}.tsx`);
  for (const nome of lista) {
    if (!inDev.includes(nome)) continue; // non viene da DEV: non è una migrazione
    const importata = new RegExp(`import \\{[^}]*\\b${nome}\\b[^}]*\\} from '\\.\\./\\.\\./dev/`).test(testo);
    if (!importata) copiate.push(`${stanza}/${nome}`);
  }
}
check(
  'ogni sezione ereditata da DEV è importata, non ricopiata',
  copiate.length === 0,
  copiate.length ? copiate.join(' · ') : 'una copia è una copia vecchia il giorno dopo',
);

/* --- 5. I divieti di doppione dichiarati dalla matrice ---------------------- */

const SOLO_IN = [
  ['RaritySection', 'CreationLab', 'la taratura della rarità'],
  ['BioSection', 'CreationLab', 'la Bio'],
  ['VoiceSection', 'CreationLab', 'il DNA della voce'],
  ['AssetImport', 'CreationLab', "l'import degli asset"],
  ['TimeSection', 'SystemLab', "l'avanzamento dei giorni"],
  ['MoodSection', 'SystemLab', 'umore e memoria'],
  ['ModelsSection', 'SystemLab', 'la scelta del modello'],
];

for (const [comp, stanza, cosa] of SOLO_IN) {
  const case_ = casaDi(comp);
  check(
    `${cosa} sta solo in ${stanza}`,
    case_.length === 1 && case_[0] === stanza,
    case_.length === 0 ? 'non è montata da nessuna parte' : case_.join(' + '),
  );
}

/* --- 6. E DEV, finché c'è, resta intero ------------------------------------- */

check(
  'il pannello DEV è ancora al suo posto, intero',
  DEVPANEL.includes('DEV://VINZ.MON') && read('src/App.tsx').includes('<DevPanel'),
  'finché la parità non è verde, togliere DEV è togliere e basta',
);

/* --- Stampa ---------------------------------------------------------------- */

for (const r of results) {
  console.log(`  ${r.ok ? 'OK  ' : 'FAIL'}  ${r.label}${r.detail ? `  — ${r.detail}` : ''}`);
}

console.log('\n  Stanze:');
for (const [nome, lista] of Object.entries(stanze)) {
  console.log(`    ${nome}: ${lista.length} sezioni`);
}

console.log(
  failures === 0
    ? '\n✓ PARITÀ RAGGIUNTA. Ogni strumento di DEV vive anche in VINZ.LAB:\n  togliere DEV dal sito non toglie niente.\n'
    : `\n✗ PARITÀ NON RAGGIUNTA: ${failures} controlli falliti.\n  DEV NON si tocca finché questa riga non diventa verde.\n`,
);
process.exit(failures === 0 ? 0 : 1);
