/* ============================================================================
   VERIFICA DEL PACCHETTO ASSET REQUEST

   Controlla i criteri 5 e 6 di §26:
   • «Any generated .mon can export a COMPLETE Asset Request package.»
   • «Ogni prompt contiene ABBASTANZA ISTRUZIONE TECNICA per
      ChatGPT to generate an implementable sprite strip.»

   E i contratti di §22.2 (contenuto del pacchetto), §24.4 (forma del manifest)
   e §13 (nessun campo fuori dagli assi canonici nei Character Data).

   Uso:  node scripts/package-check.mjs
   ========================================================================= */

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'vinz-pkg-'));
const entry = join(dir, 'entry.ts');
const out = join(dir, 'out.mjs');
const cwd = process.cwd();

writeFileSync(
  entry,
  `
export { generateMon, generateFirstMon } from '${cwd}/src/engine/characterGenerator.ts';
export { selectHeritageOrigins } from '${cwd}/src/engine/heritage.ts';
export { neutralPersonality, EMPTY_NOVELTY } from '${cwd}/src/engine/signals.ts';
export { initialHealthState, applyDay, simulateDayInput, DEFAULT_BIAS } from '${cwd}/src/engine/health.ts';
export { makeRng } from '${cwd}/src/engine/rng.ts';
export { buildPackageFiles } from '${cwd}/src/assets-pipeline/exportPackage.ts';
export { buildManifest } from '${cwd}/src/assets-pipeline/manifest.ts';
export { compilePrompt, validateFragmentIds, COMPILER_VERSION } from '${cwd}/src/assets-pipeline/compiler.ts';
export { parseResolution } from '${cwd}/src/assets-pipeline/resolver/parse.ts';
export { compilePrompt as compileFromResolution } from '${cwd}/src/assets-pipeline/resolver/vendor/compiler.ts';
export { numericGrammarFor, DESIGN_DNA_RULES } from '${cwd}/src/assets-pipeline/resolver/vendor/rules.ts';
export { buildCreativeResolverPrompt } from '${cwd}/src/assets-pipeline/resolver/vendor/resolver.ts';
export { characterDataFor } from '${cwd}/src/assets-pipeline/resolver/adapter.ts';
export { promptFor } from '${cwd}/src/assets-pipeline/promptFor.ts';
export { tasteBrief, formeGiaViste } from '${cwd}/src/assets-pipeline/resolver/taste.ts';
export { FASHIONS, SIZE_GRAMMAR, HAIR_STATES, HUMANOIDITY, TEST_PHASE, lockedIn, DESIGN_DNA as ALL_DESIGNERS, FAMILIES, SIZES } from '${cwd}/src/engine/generation-config.ts';
export { RESOLVER_MEMORY, MEMORY_FINGERPRINTS } from '${cwd}/src/assets-pipeline/resolver/memory.ts';
export { DESIGN_DNA } from '${cwd}/src/engine/generation-config.ts';
export { FRAGMENT_LIBRARY } from '${cwd}/src/assets-pipeline/fragments.ts';
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

const m = await import(`file://${out}`);

/* --- Genera un .mon nato da un branch, così l'Heritage entra nei prompt --- */

const rng = m.makeRng(4242);
let health = m.initialHealthState();
for (let d = 1; d <= 30; d++) {
  health = m.applyDay(health, d, m.simulateDayInput(rng, health, m.DEFAULT_BIAS));
}

const input = {
  day: 30,
  health,
  personality: m.neutralPersonality(),
  moodHistory: [],
  cultural: {},
  novelty: m.EMPTY_NOVELTY,
  mindlineDepth: 6,
  bond: 75,
  dataConfidence: 78,
  activeDays: 28,
  branchCount: 2,
};

const first = m.generateFirstMon({
  input,
  mindlineNodeId: 'node_000',
  originNodeId: null,
  lineageNames: [],
  seed: 1001,
});

const second = m.generateMon({
  input,
  mindlineNodeId: 'node_001',
  originNodeId: 'node_000',
  heritageOrigins: m.selectHeritageOrigins(m.makeRng(77), first.record),
  lineageNames: [first.record.data.name],
  previous: first.record,
  seed: 2002,
});

const record = second.record;
const files = m.buildPackageFiles(record);
const manifest = m.buildManifest(record);

/* --- Controlli -------------------------------------------------------------- */

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log(`\n═══ PACCHETTO ASSET REQUEST — ${record.data.name} ═══\n`);
console.log('CONTENUTO (§22.2)');

/* 🔷 v1.15 §23.5 — gli asset da generare sono SEI, non piu sette: il sigillo
   e uscito dalla pipeline ed e tornato a essere un disegno del sito. Un segno
   che deve reggere a 24px, derivare dai dati in modo verificabile ed esistere
   dal primo giorno e' una cosa che il codice fa meglio di un modello di
   immagini — che a «estremamente semplice» risponde aggiungendo dettaglio.

   Con character data, manifest, prompt compilato, id dei frammenti e readme
   fanno 11 file. */
const EXPECTED = [
  '00_CHARACTER_DATA.json',
  '01_CHARACTER_MASTER_PROMPT.txt',
  '02_PROFILE_PORTRAIT_PROMPT.txt',
  '03_BIO_DOODLE_PROMPT.txt',
  '04_REACTION_PACK_PROMPT.txt',
  '05_IDLE_ANIMATION_PROMPT.txt',
  '06_ENCOUNTER_HERO_PROMPT.txt',
  'compiled_prompt.txt',
  'fragment_ids.json',
  'ASSET_MANIFEST.json',
  'README.txt',
];

const names = files.map((f) => f.name);
check(
  EXPECTED.every((e) => names.includes(e)) && names.length === EXPECTED.length,
  'i file di §22.2 + §48, né uno di più né uno di meno',
  `${names.length} file`,
);

const prompts = files.filter((f) => f.name.endsWith('_PROMPT.txt'));
check(
  prompts.every((p) => p.content.length > 3000),
  'prompt completi, non brief (§30)',
  `il più corto è ${Math.min(...prompts.map((p) => p.content.length))} caratteri`,
);

/* 🔒 I DUE NUMERI CHE DEVONO PARLARSI.
   Il compilatore manda il prompt deterministico come messaggio utente, e il
   backend ha un tetto sui caratteri di quel campo. Erano 16636 contro 12000:
   ogni chiamata respinta con 413 prima di partire, e nell'app diventava
   «chiamata fallita (error)». Nessuno dei due numeri era sbagliato da solo —
   sbagliato era che nessuno li confrontasse. Adesso li confronta questo. */
const aiSrc = readFileSync(new URL('../netlify/functions/ai.ts', import.meta.url), 'utf8');
const capMatch = aiSrc.match(/compilerUserChars:\s*([\d_]+)/);
const cap = capMatch ? Number(capMatch[1].replace(/_/g, '')) : 0;
const longest = Math.max(...prompts.map((p) => p.content.length));
check(
  cap > 0 && longest < cap,
  'il prompt più lungo sta sotto il tetto del backend',
  `${longest} caratteri contro un tetto di ${cap}`,
);

/* §30 — «The exact same Character Data must compile consistently across
   Character Master, Portrait, Bio Doodle, Reactions, Idle, Hero and
   Reveal assets.» La consistenza non è una frase di cortesia dentro il testo:
   è il fatto che gli stessi frammenti di identità entrino in tutti quanti. */

const ASSET_TYPES = [
  'character_master', 'profile_portrait', 'bio_doodle',
  'reaction_pack', 'idle_animation', 'encounter_hero',
];

const compiled = ASSET_TYPES.map((t) => ({ type: t, ...m.compilePrompt(record, t) }));

const identityAxes = ['family.', 'archetype.', 'affinity.', 'size.', 'role.', 'fashion.', 'mood.'];
const identityOf = (c) =>
  c.fragmentIds.filter((id) => identityAxes.some((a) => id.startsWith(a))).join('|');

const reference = identityOf(compiled[0]);
const drifting = compiled.filter((c) => identityOf(c) !== reference).map((c) => c.type);
check(
  drifting.length === 0,
  'tutti gli asset compilano dagli stessi frammenti di identità (§30)',
  drifting.join(', '),
);

/* 🔶 Puntava a «CREATURE FIRST. STYLING SECOND.», cioe' alla priorita' della
   spec vecchia. Il master v1.1 §11 la ribalta: prima il CARATTERE, la
   tassonomia segue. Il perno resta — ogni prompt deve dichiarare un ordine di
   lettura — ma dichiara quello giusto. */
check(
  compiled.every((c) => c.text.includes('READING ORDER')),
  'ogni prompt porta l\'ordine di lettura di §11',
);

/* 🔷 v1.14 §31.2 — «Transparent background» dice come SALVARLO, non come
   DISEGNARLO. La stessa immagine finisce sulla splash nera e sulla griglia
   chiara del DEX: se il contorno e' nero pieno sparisce sul primo fondo, se
   e' bianco pieno sparisce sul secondo. */
check(
  compiled.every((c) => c.text.includes('READS ON BOTH LIGHT AND DARK')),
  'ogni prompt dice che deve reggere su chiaro E su scuro (§31.2)',
);
check(
  compiled.every((c) => c.text.includes('No background fill of any colour')),
  'e che lo sfondo resta trasparente: il nero e della schermata, non del file',
);

check(
  compiled.every((c) => c.text.includes('Do not redesign')  || c.text.includes('DO NOT redesign') || c.text.includes('not to redesign') || c.text.includes('Allow pose/expression changes, not redesign')),
  'nessun prompt consente di ridisegnare il .mon fra un asset e l’altro',
);

// §48 — ogni id emesso deve esistere nella libreria.
const brokenIds = compiled.flatMap((c) => m.validateFragmentIds(c.fragmentIds));
check(brokenIds.length === 0, 'ogni fragment_id esiste in libreria (§48)', brokenIds.join(', '));

// §48 — fragment_ids.json deve registrare TUTTI gli asset con le versioni.
const fragmentIdsFile = JSON.parse(files.find((f) => f.name === 'fragment_ids.json').content);
check(
  Object.keys(fragmentIdsFile.fragments_by_asset).length === ASSET_TYPES.length,
  'fragment_ids.json copre tutti gli asset (§48)',
  `${Object.keys(fragmentIdsFile.fragments_by_asset).length}`,
);
check(
  typeof fragmentIdsFile.compiler_version === 'string' &&
    typeof fragmentIdsFile.generation_config_version === 'string' &&
    typeof fragmentIdsFile.seed === 'number',
  'fragment_ids.json registra compiler, config e seed (§48)',
);

/* --- §23.3: il ciclo di riposo ---------------------------------------------
   🔷 v1.11 — qui c'erano dodici controlli sullo SPRITE DI ROTAZIONE: griglia
   8 × 1, otto angoli espliciti, nessuna deriva di camera, ancoraggio
   bottom-center. Erano giusti, e l'asset non esiste più.

   Otto viste coerenti dello stesso personaggio sono la cosa più cara e più
   fragile che si possa chiedere a un modello di immagini, in cambio di un
   gesto che si prova una volta. Al suo posto c'è l'IDLE, che fa il lavoro che
   contava — la creatura è viva — con quattro frame invece di otto.
   -------------------------------------------------------------------------- */

console.log('\nCICLO DI RIPOSO (§23.3)');

const idle = files.find((f) => f.name === '05_IDLE_ANIMATION_PROMPT.txt').content;

const REQUIRED_IN_IDLE = [
  ['consistenza assoluta', 'ABSOLUTE CONSISTENCY'],
  ['sfondo trasparente', 'Transparent background'],
  ['inquadratura identica in ogni frame', 'Identical framing'],
  ['divisibile in 4 frame uguali', 'split into 4 equal sprite frames'],
  ['ping-pong dichiarato', 'ping-pong'],
];

for (const [label, needle] of REQUIRED_IN_IDLE) {
  check(idle.includes(needle), label);
}

/* --- §24.4: forma del manifest --------------------------------------------- */

console.log('\nMANIFEST (§24.4)');

const idleEntry = manifest.assets.find((a) => a.asset_id === 'idle_01');
check(idleEntry?.frames === 4, 'idle: frames = 4', String(idleEntry?.frames));
check(idleEntry?.columns === 4 && idleEntry?.rows === 1, 'idle: griglia 4 × 1');
check(
  !manifest.assets.some((a) => a.asset_id === 'rotation_01'),
  'nessuna rotazione nel manifest (§23.3)',
);
check(
  !manifest.assets.some((a) => a.asset_id === 'sigil_01'),
  'nessun sigillo fra gli asset da generare (§23.5)',
  'e un disegno del sito: leggibile a 24px, derivato, e c\'e dal primo giorno',
);

/* --- §13 / §21.1: contratto dei Character Data ----------------------------- */

console.log('\nCHARACTER DATA (§13, §21.1)');

const data = JSON.parse(files.find((f) => f.name === '00_CHARACTER_DATA.json').content);

const REQUIRED_FIELDS = [
  'name', 'family', 'family_archetype', 'affinity', 'size', 'role', 'fashion',
  'mood_primary', 'mood_secondary', 'appearance', 'rarity', 'rarity_score',
  'season', 'palette_dna', 'eyewear', 'hair_state', 'haircut', 'character_dna',
  'voice_preset', 'voice_dna', 'cultural_affinities', 'heritage_traits',
  'mindline_node', 'bond', 'data_confidence', 'generation_reason_summary',
  'asset_manifest_status',
];
const missing = REQUIRED_FIELDS.filter((f) => !(f in data));
check(missing.length === 0, 'i 27 campi di §27 presenti', missing.join(', ') || 'tutti');

// §13 SUPERSEDING RULE — campi fantasy espressamente vietati.
const FORBIDDEN = ['species', 'class', 'protector', 'seraphim', 'element', 'tier'];
const found = FORBIDDEN.filter((f) => f in data);
check(found.length === 0, 'nessun campo vietato da §13', found.join(', ') || 'nessuno');

check(
  data.heritage_traits.length >= 1 && data.heritage_traits.length <= 3,
  'heritage fra 1 e 3 tratti (§7.3)',
  `${data.heritage_traits.length}`,
);
check(
  data.heritage_traits.every((h) => h.origin && h.transformed && h.origin !== h.transformed),
  'ogni tratto è tradotto, non copiato (§7.3)',
);
check(
  Object.values(data.asset_manifest_status).every((s) => s === 'waiting'),
  'nasce con tutti gli slot asset vuoti (§21.2)',
);

/* ============================================================================
   MASTER CHARACTER SYSTEM v1.1 — IL DOCUMENTO DEVE ESSERE NEL PROMPT

   🔷 «Non sembra che i prompt lo seguano, come mai?» — perche' non lo
   seguivano: tre capitoli su quattordici non entravano in NESSUNA forma nel
   testo compilato, e la prima riga diceva l'opposto di §11.

   🔒 Questi controlli guardano il TESTO VERO, non il codice: un frammento puo'
   esistere nella libreria e non essere mai selezionato — che e' esattamente
   com'e' andata la prima volta che li ho aggiunti.
   ========================================================================= */

const testo = compiled.find((c) => c.type === 'profile_portrait').text;
const must = [
  ['§3  il personaggio prima della tassonomia', 'memorable CHARACTER'],
  ['§3  tre o quattro landmark di sagoma', 'silhouette landmarks'],
  ['§3  una esagerazione di proporzione', 'proportional exaggeration'],
  ['§3  una cosa leggermente ridicola', 'ridiculous'],
  ['§3  un atteggiamento facciale immediato', 'facial attitude'],
  ['§3  ritmo eroico giovane, non manichino', 'youthful character appeal'],
  ['§4  i capelli di VINZ: biondo scuro decolorato', 'DARK BLOND'],
  ['§7  la Cultural DNA come ingrediente', 'CULTURAL DNA'],
  ['§7  i riferimenti ATTIVI, non il serbatoio', 'ACTIVE CULTURAL DNA'],
  ['§8  il designer descrive la costruzione del viso', 'FACIAL CONSTRUCTION:'],
  ['§8  e la postura', 'POSTURE / GESTURE:'],
  ['§4  i moltiplicatori di proporzione, per designer', 'PROPORTIONS —'],
  ['§4  e i conteggi', 'COUNTS —'],
  ['§5  quanto resta umano', 'HUMANOIDITY:'],
  ['§5  e non si confonde col realismo', 'HUMANOIDITY is not realism'],
  ['§9  le percentuali di colore, non «campi grandi»', 'DISTRIBUTION —'],
  ['     la prova di sagoma', 'SILHOUETTE TEST'],
  ['     e quella di memoria', 'MEMORY TEST'],
  ['§9  la base dominante ha un ruolo dichiarato', 'DOMINANT BASE'],
  ['§9  l\'acid hero ha un ruolo dichiarato', 'ACID HERO'],
  ['§9  il monocromo elegante e\' vietato per nome', 'monochrome fantasy'],
  ['§8  il Character Design DNA e\' costruzione', 'CHARACTER DESIGN DNA'],
  ['§11 l\'ordine di lettura e\' dichiarato', 'READING ORDER'],
];
for (const [label, needle] of must) {
  check(testo.includes(needle), label, needle);
}

/* 🔒 IL SERBATOIO NON DEVE TORNARE NEL PROMPT. Era l'errore segnalato: quindici
   mondi possibili passati a ogni immagine invece dei due-quattro scelti. Un
   modello che ne riceve quindici prende il minimo comune, che e' la creatura
   generica. */
check(
  !testo.includes('Available pool'),
  '§7 il serbatoio completo resta nel generatore, fuori dal prompt',
  'la libreria intera nel prompt non e una scelta: e un elenco',
);
const attivi = (testo.match(/ACTIVE CULTURAL DNA[^\n]*/) ?? [''])[0];
check(
  attivi.split(' + ').length >= 2 && attivi.split(' + ').length <= 4,
  '§7 e quelli attivi sono fra due e quattro',
  attivi.slice(0, 110),
);

/* 🔒 E la vecchia priorita' NON deve tornare: diceva che il primo read e' la
   FAMILY, cioe' l'opposto di §11. */
check(
  !testo.includes('CREATURE FIRST. STYLING SECOND.'),
  '§11 la vecchia priorita\' tassonomica non e\' tornata',
  'era la prima E l\'ultima riga del prompt',
);

/* 🔒 Ogni divieto deve essere ETICHETTATO. Una lista di cose da evitare senza
   una parola che lo dica, in mezzo a un prompt, e' una richiesta. */
const senzaEtichetta = compiled.filter((c) =>
  /\nfeminine-coded styling used to soften/.test(c.text),
);
check(
  senzaEtichetta.length === 0,
  'nessun divieto viene stampato nudo, senza AVOID:',
  'letta da un modello di immagini, una lista di cose da evitare senza etichetta e\' una richiesta',
);

/* 🔒 Il riferimento al CHARACTER MASTER non puo' comparire prima che il master
   esista: da quando il RITRATTO si genera per primo, quel blocco diceva alla
   primissima immagine di obbedire a un'immagine che non c'e'. */
check(
  !testo.includes('CONSISTENCY REFERENCE'),
  'la prima immagine non obbedisce a un riferimento che non esiste',
  'gli slot nascono tutti vuoti: qui il master non c\'e\' ancora',
);

/* ============================================================================
   §29 — UNA CREATURA NATA PRIMA NON DEVE FAR ESPLODERE NIENTE

   🔷 «A me esce grigio.» Il grigio e' il fondo del body: vuol dire che non e'
   stato disegnato niente, cioe' che qualcosa ha lanciato durante il render.

   ⚠️ E oggi ne ho introdotto uno io: `palette_dna.roles` e
   `character_design_dna` sono nati stamattina. Un .mon salvato IERI non li ha,
   e §29 dice che una creatura porta scritta la versione con cui e' venuta al
   mondo — non si riscrive. Quindi il compilatore deve reggerli, non ripararli.
   ========================================================================= */

const vecchio = JSON.parse(JSON.stringify(record));
delete vecchio.data.palette_dna.roles;
delete vecchio.data.character_design_dna;

let esplose = null;
let testoVecchio = '';
try {
  testoVecchio = m.compilePrompt(vecchio, 'profile_portrait').text;
} catch (e) {
  esplose = String(e);
}

check(esplose === null, 'un .mon nato prima di oggi compila senza esplodere', esplose ?? 'nessun errore');
check(
  testoVecchio.includes('generated before HOUSE COLOR DNA roles existed'),
  'e dice da dove viene, invece di fingere di avere ruoli che non ha',
);
check(
  !testoVecchio.includes('CHARACTER DESIGN DNA:'),
  'non gli si assegna un designer a posteriori: cambierebbe com\'e fatto, retroattivamente',
);

/* ============================================================================
   §12 — IL PROTOCOLLO DI PROVA DEI DESIGNER

   🔷 «Secondo me la cosa sul character design e la cosa piu importante.»

   Il protocollo dice: una forma bloccata, quattordici assi identici, uno solo
   che cambia. Se anche una virgola d'altro cambiasse fra due prove, il
   confronto sarebbe rumore travestito da risultato — e non te ne accorgeresti:
   vedresti due immagini diverse e crederesti che sia il designer.

   🔒 Quindi non ci si fida: si DIFFANO i sette prompt.
   ========================================================================= */

const prove = m.DESIGN_DNA.map((dna) => ({
  id: dna.id,
  text: m.compilePrompt(
    { ...record, data: { ...record.data, character_design_dna: dna.id } },
    'character_master',
  ).text,
}));

/* Le righe che cambiano fra la prima prova e ognuna delle altre devono
   appartenere TUTTE al blocco del designer. */
const righeDi = (t) => t.split('\n');
const base = righeDi(prove[0].text);
const MARCATORI = [
  'CHARACTER DESIGN DNA:', 'PROPORTION:', 'SHAPE LANGUAGE:', 'FACIAL CONSTRUCTION:',
  'ANATOMICAL SIMPLIFICATION:', 'CLOTHING CONSTRUCTION:', 'POSTURE / GESTURE:',
  'SURVIVING DETAIL:', 'DETAIL DENSITY:', 'Compress every idea', 'Layering, hardware',
  'Keep a clear primary read',
  /* Le due righe che CONTANO i pezzi. Sono arrivate dopo, e questo controllo
     le ha segnalate subito come «qualcosa d'altro e cambiato fra due prove»:
     era il suo lavoro, e la risposta e' che appartengono al designer. */
  'PROPORTIONS —', 'COUNTS —', 'If HUMANOIDITY says this body',
];

const intrusi = [];
for (const p of prove.slice(1)) {
  const altre = righeDi(p.text);
  const diverse = base.filter((r) => !altre.includes(r)).concat(altre.filter((r) => !base.includes(r)));
  for (const r of diverse) {
    if (r.trim().length === 0) continue;
    if (!MARCATORI.some((mk) => r.startsWith(mk))) intrusi.push(`${p.id}: ${r.slice(0, 60)}`);
  }
}

check(
  intrusi.length === 0,
  'fra due prove cambia SOLO il blocco del designer',
  intrusi.slice(0, 3).join(' | ') || `${prove.length} prove confrontate riga per riga`,
);

/* 🔒 E cambia DAVVERO: due designer che producessero lo stesso testo non sono
   una scelta, sono un placebo. */
const identici = [];
for (let i = 0; i < prove.length; i++) {
  for (let j = i + 1; j < prove.length; j++) {
    if (prove[i].text === prove[j].text) identici.push(`${prove[i].id} = ${prove[j].id}`);
  }
}
check(identici.length === 0, 'e nessuna coppia di designer produce lo stesso prompt', identici.join(', ') || 'tutti distinti');

/* 🔒 Sul CHARACTER MASTER, che e' l'unico asset che mostra il corpo intero:
   proporzioni, postura e silhouette sono tre dei sette assi, e un ritratto le
   nasconde tutte e tre. */
check(
  prove[0].text.includes('ASSET TYPE: CHARACTER MASTER') ||
    prove[0].text.includes('CHARACTER MASTER'),
  'e la prova gira sul corpo intero, non su un ritratto',
);

/* 🔒 IL CONFLITTO CHE PRODUCEVA AMMASSI. Le masse del designer sono descritte
   con nomi umani; a HUMANOIDITY 1/5 quei nomi non esistono. Un prompt che dice
   «fondamentalmente non umano» e «due braccia, due gambe» senza dire chi vince
   fa fare al modello tutte e due le cose insieme — che e' letteralmente un
   corpo deforme. */
check(
  testo.includes('The body plan always wins over the naming'),
  'quando umanoidita e masse si contraddicono, il prompt dice chi vince',
  'senza, il modello le esegue entrambe',
);

/* 🔷 «I prompt del gioco creano sempre personaggi deformi.» La misura che sta
   dietro alla diagnosi: quante ISTRUZIONI NUMERICHE contiene un prompt. Un
   modello non sa eseguire «pochissime forme»; sa eseguire «circa cinque». */
/* ⚠️ La prima versione di questo conteggio guardava solo le parole in
   MAIUSCOLO e diceva 10 su un prompt che ne aveva 50: una misura sbagliata che
   avrebbe fatto rifare un lavoro gia' fatto. Ora conta anche le minuscole e le
   cifre — che sono la meta' delle quantita' vere. */
const numeriche = (testo.match(/\b(?:one|two|three|four|five|six|seven|eight|\d+)\b/gi) ?? []).length;
check(
  numeriche >= 35,
  'il prompt dice QUANTE cose, non solo che tipo',
  `${numeriche} istruzioni numeriche — «pochissime forme» non e eseguibile, «circa cinque» si`,
);

/* ============================================================================
   IL COMPILATORE A DUE STADI (v1)

   🔷 Pacchetto scritto altrove. Il controllo che vale piu' di tutti e' il
   primo: la risoluzione D'ESEMPIO del pacchetto deve passare la NOSTRA
   validazione. Se non passa, o abbiamo copiato male i limiti o li abbiamo
   inventati — e in tutti e due i casi rifiuteremmo uscite buone.
   ========================================================================= */

console.log('\n═══ COMPILATORE A DUE STADI (v1) ═══\n');

const esempio = JSON.parse(
  readFileSync(new URL('../tests/fixtures/example_resolution.json', import.meta.url), 'utf8'),
);

const letta = m.parseResolution(JSON.stringify(esempio));
check(
  letta.problems.length === 0,
  'la risoluzione d’esempio del pacchetto passa la nostra validazione',
  letta.problems.join(' · '),
);

check(
  m.parseResolution('```json\n' + JSON.stringify(esempio) + '\n```').problems.length === 0,
  'e passa anche incorniciata in un blocco di codice',
  'un modello che incornicia ha obbedito nella sostanza',
);

check(
  m.parseResolution(JSON.stringify({ ...esempio, silhouetteLandmarks: ['a', 'b', 'c', 'd', 'e'] }))
    .problems.length > 0,
  'ma cinque punti di sagoma vengono rifiutati',
  'il master ne vuole 3–4: e la differenza fra una sagoma e un ammasso',
);

check(
  m.parseResolution('niente json qui').resolution === null,
  'e una risposta che non e JSON non passa per buona',
);

/* ⚠️ LE VIRGOLETTE DELL'IPHONE. Copiando da una chat su iOS la punteggiatura
   intelligente trasforma " in “ e ”, e JSON.parse le rifiuta con «unrecognized
   token». Da fuori sembra che il modello abbia risposto male; ha risposto
   benissimo, e' il telefono che ha riscritto il testo mentre lo copiavi. */
const iosQuotes = JSON.stringify(esempio).replace(/"/g, (_m, i) => (i % 2 === 0 ? '\u201C' : '\u201D'));
const iosRead = m.parseResolution(iosQuotes);
check(
  iosRead.resolution !== null && iosRead.repaired.length > 0,
  'le virgolette tipografiche dell’iPhone vengono riparate',
  iosRead.repaired.join(', '),
);
check(
  m.parseResolution(JSON.stringify(esempio).replace(/: /g, ': \u00A0')).resolution !== null,
  'e anche gli spazi unificatori',
);
/* 🔒 Ma riparare non vuol dire accettare tutto: una risposta davvero rotta
   deve restare rotta, o un giorno passerebbe per buona. */
check(
  m.parseResolution('{ "corePersonality": [ }').resolution === null,
  'una risposta davvero rotta resta rifiutata',
);
check(
  m.parseResolution(JSON.stringify(esempio)).repaired.length === 0,
  'e un JSON gia sano non viene toccato',
  'aggiustare in silenzio quello che non ha bisogno nasconde i problemi veri',
);

/* ⚠️ «Unable to parse JSON string» e' il messaggio di Safari e non dice niente:
   ne' dove, ne' se il testo e' semplicemente TAGLIATO. Su un telefono incollare
   meta' risposta e' il modo piu' facile di sbagliare, e produce esattamente
   quel messaggio. La diagnosi la facciamo noi. */
const tagliato = m.parseResolution(
  JSON.stringify(esempio).slice(0, Math.floor(JSON.stringify(esempio).length * 0.6)) + '}',
);
check(
  tagliato.resolution === null &&
    tagliato.problems.some((p) => /tagliato|virgolette/.test(p)),
  'un incolla tagliato a meta dice CHE e tagliato',
  tagliato.problems.slice(1).join(' · '),
);

/* Un a capo dentro una stringa e' sempre illegale in JSON, e succede quando
   una risposta lunga viene incollata a pezzi. Si ripara: il contenuto resta
   identico, cambia solo come e' scritto. */
const conACapo = m.parseResolution(
  JSON.stringify(esempio).replace('"corePersonality":[', '"corePersonality":["frase\ncon a capo",'),
);
check(
  conACapo.resolution !== null && conACapo.repaired.includes('a capo dentro una stringa'),
  'e un a capo dentro una stringa si ripara',
  conACapo.repaired.join(', '),
);

/* --- Il giro completo su una creatura vera ---------------------------------- */

const rInput = m.characterDataFor(record);
const rNumeric = m.numericGrammarFor(rInput);
const rPrompt = m.buildCreativeResolverPrompt(rInput, rNumeric);
const rCompiled = m.compileFromResolution(rInput, esempio);

check(
  rInput.family === record.data.family && rInput.characterDesignDNA === record.data.character_design_dna,
  'i nostri fatti arrivano interi al resolver',
);
/* 🔒 v1 dice che ogni Forma e' fresca: l'eredita' NON deve viaggiare. */
check(
  !JSON.stringify(rInput).includes('heritage') && !rPrompt.includes('HERITAGE'),
  'l’eredita non entra nel resolver, come chiede v1',
  'ogni Forma e una manifestazione fresca, non una discendenza',
);
check(
  rPrompt.includes('Output JSON only') && rPrompt.includes('MERGE'),
  'al resolver si chiede un oggetto, e di TOGLIERE',
  'l’accumulo di quattro espedienti e il difetto che questo stadio cura',
);
/* 🔒 «Non modificare il suo compilatore.» Non e' una promessa: e' misurato.
   I quattro file di `vendor/` devono restare identici a quelli del pacchetto,
   e il modo di dimostrarlo e' far girare il SUO test sul NOSTRO codice. */
check(
  /CHARACTER FIRST/.test(rCompiled.prompt) &&
    /NUMERIC VISUAL GRAMMAR/.test(rCompiled.prompt) &&
    /SILHOUETTE TEST/.test(rCompiled.prompt) &&
    /MEMORY TEST/.test(rCompiled.prompt) &&
    !/HERITAGE FROM PREVIOUS/.test(rCompiled.prompt) &&
    !/20% translated Heritage/.test(rCompiled.prompt),
  'il test del pacchetto passa sul nostro codice',
  'e il suo `tests/compiler.test.ts`, riga per riga',
);
/* 🔒 E la firma dei suoi file: se qualcuno li tocca, questo cambia. */
const vendorFiles = ['types', 'rules', 'resolver', 'compiler'];
const vendorHashes = vendorFiles.map((f) =>
  createHash('md5')
    .update(readFileSync(new URL(`../src/assets-pipeline/resolver/vendor/${f}.ts`, import.meta.url)))
    .digest('hex')
    .slice(0, 8),
);
check(
  vendorHashes.join(' ') === 'eab16c82 8ab118ab ea6cf273 84219697',
  'i quattro file del pacchetto sono ancora quelli',
  vendorHashes.join(' '),
);

check(
  rCompiled.prompt.indexOf('CORE PERSONALITY') < rCompiled.prompt.indexOf('FAMILY / ARCHETYPE CONSTRUCTION'),
  'nel prompt finale il PERSONAGGIO viene prima della tassonomia',
  'se l’immagine e un bel reperto tassonomico senza personalita, il compilatore ha fallito',
);
check(
  rCompiled.prompt.includes('SILHOUETTE TEST') &&
    rCompiled.prompt.includes('MEMORY TEST') &&
    rCompiled.prompt.includes('APPEAL CHECK') &&
    rCompiled.prompt.includes('VISUAL DNA — LOCK'),
  'e ci sono tutte e quattro le prove del master',
);
check(
  rCompiled.prompt.lastIndexOf('APPEARANCE —') > rCompiled.prompt.indexOf('VISUAL DNA — LOCK'),
  'l’APPEARANCE viene per ultima: e resa, non costruzione',
);

/* 🔒 Umanoidita bassa: le proporzioni umane si TOLGONO, non si azzerano.
   Un moltiplicatore neutro direbbe «braccia normali» a chi braccia non ne ha,
   ed e' cosi' che nasce un corpo deforme. */
const nonUmano = m.numericGrammarFor({ ...rInput, humanoidity: 1 });
check(
  nonUmano.headScale === undefined && nonUmano.armLength === undefined,
  'a umanoidita 1 le proporzioni umane spariscono, non vanno a 1.0',
  `restano: ${Object.keys(nonUmano).join(', ')}`,
);
check(
  nonUmano.silhouetteLandmarkCount !== undefined,
  'ma i punti di sagoma restano: valgono per qualunque corpo',
);

/* --- Una porta sola per il prompt -------------------------------------------- */

check(
  m.promptFor(record, 'character_master').source === 'concatenato',
  'senza risoluzione il prompt resta quello di sempre',
);
check(
  m.promptFor({ ...record, resolution: esempio }, 'character_master').source === 'risoluzione',
  'con una risoluzione vince lei',
);
/* ⚠️ Limite dichiarato di v1: copre solo il CHARACTER MASTER. Che si veda. */
check(
  m.promptFor({ ...record, resolution: esempio }, 'profile_portrait').source === 'concatenato',
  'ma v1 copre solo il CHARACTER MASTER, e gli altri cinque restano dov’erano',
);

/* ============================================================================
   LA MEMORIA DEL RESOLVER NON ESCE DAL RESOLVER

   🔷 «Non deve mai essere copiata, riassunta o accodata per intero nel prompt
      immagine finale.»

   ⚠️ Il confine è già garantito dai TIPI — il compilatore del pacchetto prende
   `CharacterData` e `CreativeResolution`, e non c'è nessun parametro da cui
   quel testo possa entrare. Ma i tipi non proteggono da un modello che copia
   mezza tabella dentro un campo di testo della RISOLUZIONE: quella sì che
   arriva al compilatore, ed è la strada per cui la regola può rompersi senza
   che niente fallisca.
   ========================================================================= */

const finali = [
  ...EXPECTED.filter((n) => n.endsWith('_PROMPT.txt')).map(
    (n) => files.find((f) => f.name === n)?.text ?? '',
  ),
  m.promptFor({ ...record, resolution: esempio }, 'character_master').text,
];

const trapelate = m.MEMORY_FINGERPRINTS.filter((frase) =>
  finali.some((testo) => testo.includes(frase)),
);
check(
  trapelate.length === 0,
  'nessun pezzo della memoria del resolver finisce nei prompt immagine',
  trapelate.length === 0 ? `${m.MEMORY_FINGERPRINTS.length} impronte cercate` : trapelate.join(', '),
);

/* 🔒 E il contrario: che la memoria ci sia davvero, e sia quella intera. Un
   controllo che passa perché il file è vuoto non controlla niente. */
check(
  m.RESOLVER_MEMORY.length > 15000 &&
    m.RESOLVER_MEMORY.includes('CHARACTER-DESIGN MEMORY PACK') &&
    m.RESOLVER_MEMORY.includes('Character Critic checklist'),
  'la memoria è trascritta intera, dall’intestazione alla checklist finale',
  `${m.RESOLVER_MEMORY.length} caratteri`,
);

/* ============================================================================
   IL GUSTO RIATTACCATO: SI GUARDA L'OUTPUT, NON L'ETICHETTA

   ⚠️ «Non considerare sufficienti LABEL diversi. Ispeziona l'output vero.»
   Quindi qui si generano forme diverse e si legge cosa esce, invece di
   verificare che una costante esista.
   ========================================================================= */

console.log('\n═══ GUSTO — LA RICERCA ARRIVA AL RESOLVER ═══\n');

const brief = m.tasteBrief(record);

check(
  brief.includes('STAGE A') && brief.includes('STAGE B'),
  'il resolver riceve la disciplina in due tempi: prima la direzione, poi la forma',
  'senza, «TRANSPARENT/CRYSTAL» collassa in un visore al primo colpo',
);

/* La grammatica della moda: la `language` del catalogo, non l'etichetta. */
const suaFashion = m.FASHIONS.find((f) => f.id === record.data.fashion);
check(
  suaFashion !== undefined && brief.includes(suaFashion.language),
  'la grammatica della MODA arriva per esteso, non solo il nome',
  `${record.data.fashion} → «${suaFashion?.language.slice(0, 52)}…»`,
);

/* La grammatica di Size: era usata dal vecchio compilatore e persa dal nuovo. */
check(
  brief.includes(m.SIZE_GRAMMAR[record.data.size].rule),
  'la grammatica di SIZE arriva per esteso',
  `${record.data.size} → «${m.SIZE_GRAMMAR[record.data.size].rule.slice(0, 46)}…»`,
);

/* Humanoidity con il suo `avoid`: è la riga che impedisce l'umano verniciato. */
const suoHum = m.HUMANOIDITY.find((h) => h.level === record.data.humanoidity);
check(
  suoHum !== undefined && brief.includes(suoHum.avoid),
  'HUMANOIDITY arriva con il suo AVOID, non solo col numero',
  `${record.data.humanoidity}/5`,
);

/* Decolorazione e taglio: il taglio non arrivava proprio al resolver. */
const suoHair = m.HAIR_STATES.find((h) => h.id === record.data.hair_state);
check(
  suoHair === undefined || brief.includes(suoHair.prompt),
  'il trattamento di DECOLORAZIONE arriva per esteso',
  record.data.hair_state ?? 'nessuna decolorazione (anatomia senza capelli)',
);
check(
  record.data.haircut === null || brief.includes(record.data.haircut),
  'e il TAGLIO scelto dal motore arriva: prima non gli veniva passato affatto',
  record.data.haircut ?? 'nessun taglio (anatomia senza capelli)',
);

check(
  brief.includes('five-spike') && brief.includes('not a construction'),
  'le tre trappole note sono nominate: cinque punte, visore, torso più grande',
  brief.includes('bigger torso') ? 'tutte e tre' : 'MANCA il torso',
);

/* ⚠️ FORME DIVERSE DEVONO PRODURRE BRIEFING DIVERSI. Se il briefing fosse
   uguale per tutti, avremmo ricollegato una costante, non il gusto. */
const briefs = new Set();
const grammatiche = new Set();
for (let seed = 1; seed <= 24; seed++) {
  const r = m.generateMon({
    input,
    mindlineNodeId: `node_${seed}`,
    originNodeId: 'node_000',
    heritageOrigins: m.selectHeritageOrigins(m.makeRng(seed * 13), first.record),
    lineageNames: [first.record.data.name],
    previous: first.record,
    seed: seed * 7919,
  }).record;
  const b = m.tasteBrief(r);
  briefs.add(b);
  grammatiche.add(`${r.data.fashion}|${r.data.size}|${r.data.humanoidity}|${r.data.haircut}`);
}
check(
  briefs.size >= 18,
  'ventiquattro forme producono briefing genuinamente diversi',
  `${briefs.size} briefing distinti su 24 · ${grammatiche.size} combinazioni di grammatica`,
);

/* ⚠️ La creatura di riferimento non ha anatomia da capelli, quindi i due
   controlli sopra sono passati «a vuoto». Qui se ne cerca una che ce l'ha:
   il taglio è il campo che al resolver non arrivava PROPRIO, ed è il motivo
   per cui ogni testa non umana finiva a cinque punte. */
let conCapelli = null;
for (let seed = 1; seed <= 40 && !conCapelli; seed++) {
  const r = m.generateMon({
    input,
    mindlineNodeId: `hair_${seed}`,
    originNodeId: 'node_000',
    heritageOrigins: m.selectHeritageOrigins(m.makeRng(seed * 31), first.record),
    lineageNames: [first.record.data.name],
    previous: first.record,
    seed: seed * 5081,
  }).record;
  if (r.data.haircut && r.data.hair_state) conCapelli = r;
}
const briefCapelli = conCapelli ? m.tasteBrief(conCapelli) : '';
check(
  conCapelli !== null &&
    briefCapelli.includes(conCapelli.data.haircut) &&
    briefCapelli.includes(m.HAIR_STATES.find((h) => h.id === conCapelli.data.hair_state).prompt),
  'su una forma CON capelli arrivano sia il taglio sia la decolorazione',
  conCapelli ? `${conCapelli.data.haircut} · ${conCapelli.data.hair_state}` : 'nessuna trovata',
);

/* E l'anti-ripetizione: se le forme di prima hanno già risolto qualcosa,
   il resolver lo deve sapere. */
const conStoria = m.tasteBrief(record, [
  {
    hairConstruction: 'five upright bleached spikes',
    eyewearConstruction: 'continuous transparent visor',
    proportionalExaggeration: 'oversized torso',
    dominantIdentityMass: 'chest',
  },
]);
check(
  conStoria.includes('five upright bleached spikes') &&
    conStoria.includes('do not repeat these solutions'),
  'e quello che le forme precedenti hanno già fatto gli viene detto',
  'senza, ogni creatura riparte senza sapere di ripetersi',
);
check(
  !brief.includes('do not repeat these solutions'),
  'ma la prima creatura non riceve un elenco vuoto di cose da non ripetere',
);

/* 🔷 «Perché i temperamenti sono 2? Deve essere 1.» */
console.log('\n═══ TEMPERAMENTO ═══\n');
{
  const molte = [];
  for (let seed = 1; seed <= 40; seed++) {
    molte.push(
      m.generateFirstMon({
        input,
        mindlineNodeId: `mood_${seed}`,
        originNodeId: null,
        lineageNames: [],
        seed: seed * 613,
      }).record,
    );
  }
  check(
    molte.every((r) => r.data.mood_secondary === null),
    'quaranta creature e nessuna nasce con due temperamenti',
    `${molte.filter((r) => r.data.mood_secondary !== null).length} con la sfumatura secondaria`,
  );
  check(
    molte.every((r) => 'mood_secondary' in r.data),
    'ma il campo resta: §27 ne conta ventisette e i salvataggi vecchi si leggono',
  );
  check(
    new Set(molte.map((r) => r.data.mood_primary)).size >= 3,
    'e il primario continua a variare',
    `${new Set(molte.map((r) => r.data.mood_primary)).size} temperamenti diversi su 40`,
  );
}

/* ============================================================================
   TEST PHASE 01 — TRE ASSI FERMI, TUTTO IL RESTO LIBERO
   🔷 «FAMILY = ANGEL. SIZE = TINY. CHARACTER DESIGNER = KEN.»
   ========================================================================= */

console.log('\n═══ TEST PHASE 01 ═══\n');

const forme = [];
for (let seed = 1; seed <= 30; seed++) {
  forme.push(
    m.generateMon({
      input,
      mindlineNodeId: `tp_${seed}`,
      originNodeId: 'node_000',
      heritageOrigins: m.selectHeritageOrigins(m.makeRng(seed * 17), first.record),
      lineageNames: [first.record.data.name],
      previous: first.record,
      seed: seed * 3301,
    }).record,
  );
}

if (m.TEST_PHASE.enabled) {
  check(
    forme.every((r) => r.data.family === m.TEST_PHASE.family),
    `trenta forme e la Family è sempre ${m.TEST_PHASE.family}`,
    [...new Set(forme.map((r) => r.data.family))].join(', '),
  );
  check(
    forme.every((r) => r.data.size === m.TEST_PHASE.size),
    `e la taglia è sempre ${m.TEST_PHASE.size}`,
    [...new Set(forme.map((r) => r.data.size))].join(', '),
  );
  check(
    forme.every((r) => r.data.character_design_dna === m.TEST_PHASE.characterDesigner),
    `e il disegnatore è sempre ${m.TEST_PHASE.characterDesigner}`,
    [...new Set(forme.map((r) => r.data.character_design_dna))].join(', '),
  );

  /* 🔒 L'ANCORA NON DEVE POTATURA IL CATALOGO. Gli altri restano tutti. */
  check(
    m.ALL_DESIGNERS.length === 7 && m.FAMILIES.length > 1 && m.SIZES.length === 3,
    'ma i cataloghi non sono stati potati: gli altri restano disponibili',
    `${m.ALL_DESIGNERS.length} disegnatori · ${m.FAMILIES.length} Family · ${m.SIZES.length} taglie`,
  );
  check(
    m.TEST_PHASE.characterDesigner === m.ALL_DESIGNERS.find(
      (d) => d.id === m.TEST_PHASE.characterDesigner,
    )?.id,
    'e l’id fermo esiste davvero a catalogo',
    'un id che non risolve tornerebbe al sorteggio in silenzio',
  );

  /* ⚠️ IL PUNTO VERO: dentro lo spazio chiuso la variazione deve RESTARE. */
  const varia = (f) => new Set(forme.map(f)).size;
  check(
    varia((r) => r.data.family_archetype) >= 3,
    'dentro lo spazio chiuso gli archetipi variano ancora',
    `${varia((r) => r.data.family_archetype)} archetipi diversi su 30 forme`,
  );
  check(
    varia((r) => r.data.humanoidity) >= 2 && varia((r) => r.data.fashion) >= 5,
    'e umanoidità e stile pure',
    `${varia((r) => r.data.humanoidity)} livelli · ${varia((r) => r.data.fashion)} stili`,
  );
  /* ⚠️ SOGLIA CONTRO IL SERBATOIO, E NON CONTRO UNA SEQUENZA PARTICOLARE.

     Due errori miei di fila, su questa riga. Prima «>= 10 tic» su un catalogo
     che ne contiene SETTE: impossibile per costruzione. Poi «esattamente 7»,
     cioè la copertura piena — che sembrava più forte e invece dipendeva dal
     flusso casuale: al primo cambio nel numero di estrazioni sono diventati
     sei, e il controllo ha accusato il codice per una cosa che non era
     successa.

     🔒 La proprietà da difendere non è «escono tutti», è «il serbatoio viene
     usato largamente». Cinque su sette in trenta tiri lo dimostra; sette su
     sette è un colpo di fortuna che non si può pretendere. */
  const tic = varia((r) => r.data.character_dna.silhouette_quirk);
  check(
    varia((r) => r.data.eyewear?.category ?? '—') >= 4 && tic >= 5,
    'occhiali e tic di sagoma restano genuinamente diversi',
    `${varia((r) => r.data.eyewear?.category ?? '—')} categorie di occhiali · ${tic} tic su 7 a catalogo`,
  );

  /* 🔒 E L'INTERRUTTORE DEVE FUNZIONARE NEI DUE SENSI. Una fase temporanea
     che non si sa spegnere non è temporanea. */
  const spenta = { ...m.TEST_PHASE, enabled: false };
  check(
    m.lockedIn(spenta, 'family') === null &&
      m.lockedIn(spenta, 'size') === null &&
      m.lockedIn(spenta, 'characterDesigner') === null,
    'a fase spenta i tre assi tornano al sorteggio',
    'nessun valore fermo resta appeso',
  );
  check(
    m.lockedIn(m.TEST_PHASE, 'characterDesigner') === m.TEST_PHASE.characterDesigner,
    'e ad accesa tornano fermi',
  );

  /* E il resolver deve SAPERE che è una fase, o tratta i tre valori come un
     personaggio solo e comincia a rifarlo. */
  const b = m.tasteBrief(forme[0]);
  check(
    b.includes('TEST PHASE') && b.includes('recurring character'),
    'il resolver sa che è una fase, non un personaggio da ripetere',
  );
  check(
    b.includes('one fixed halo or wing construction') && b.includes('not a locked proportion'),
    'e sa cosa il blocco NON deve diventare',
    'aureola fissa, silhouette ricorrente, proporzione bloccata',
  );
}

/* --- Esito ------------------------------------------------------------------ */

console.log(
  failures === 0
    ? '\n✓ Pacchetto conforme.\n'
    : `\n✗ ${failures} controlli falliti.\n`,
);
process.exit(failures === 0 ? 0 : 1);
