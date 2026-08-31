/* ============================================================================
   VERIFICA DEL BACKEND (MASTER SPEC v1.13 §19)

   Il backend è la parte che non si può provare guardando lo schermo: i suoi
   difetti non fanno sbagliare un pixel, fanno arrivare una fattura. Tre
   famiglie di controlli, tutte su codice puro — niente rete, niente chiavi.

   • che la tabella di instradamento non chieda a un fornitore una cosa che
     non sa fare (il modo tipico di rompersi qui è SILENZIOSO: sposti la voce
     su chi non ha la cache, tutto continua a funzionare, il conto decuplica);
   • che i tuoi dati non finiscano su un piano gratuito;
   • che il calcolo del costo non sottostimi mai — «gratis» è la bugia
     peggiore che un contatore possa dire.

   Uso:  node scripts/backend-check.mjs
   ========================================================================= */

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-be-'));
const entry = join(dir, 'entry.ts');
/* Il bundle esce DENTRO il progetto, non in /tmp: `@netlify/blobs` resta
   esterno (non serve ai controlli e non gira fuori da Netlify), e Node lo
   risolve solo se il file che lo importa sta dove c'e' node_modules. */
const out = join(cwd, 'node_modules', '.vinz-backend-check.mjs');

writeFileSync(
  entry,
  `
export { ROUTING, PERSONAL, VOICE_CHOICES, COMPILER_CHOICES, IMAGE_CHOICES, routingProblems, personalDataOnFreeTier, voiceChoiceProblems, compilerChoiceProblems, imageChoiceProblems, resolveRoute } from '${cwd}/netlify/functions/_shared/routing.ts';
export { costOf, currentMonth, MONTHLY_CAP_USD, WARN_AT, COST_PER_WEB_SEARCH } from '${cwd}/netlify/functions/_shared/spend.ts';
export { merge as mergeLessons } from '${cwd}/netlify/functions/lessons.ts';
export { AI_STEPS, AI_STEP_ORDER, choicesFor, modelForStep, stepProblems } from '${cwd}/netlify/functions/_shared/routing.ts';
export { migratedStepModels } from '${cwd}/src/state/migrateSteps.ts';
export { realDayAt, realDayCatchUpCount, normalizeDayBoundaryTime } from '${cwd}/src/engine/progression.ts';
export { callProvider } from '${cwd}/netlify/functions/_shared/providers.ts';
`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
  // @netlify/blobs non serve ai controlli e non gira fuori da Netlify.
  external: ['@netlify/blobs'],
});

const m = await import(`file://${out}`);

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

/* --- Instradamento ---------------------------------------------------------- */

console.log('\n═══ §19.1 — CHI SERVE COSA ═══\n');

for (const [capability, route] of Object.entries(m.ROUTING)) {
  console.log(`  ${capability.padEnd(16)} → ${route.provider} / ${route.model}`);
}
console.log('');

const problems = m.routingProblems();
check(
  problems.length === 0,
  'nessuna capacita e affidata a chi non sa servirla',
  problems.join('; '),
);

/* 🔒 Il controllo che conta di piu di tutti quelli di questo file.

   La riflessione settimanale e' «un lavoro piccolo» e la tentazione di
   metterla sul gratuito e' fortissima — l'avevo fatto io mentre scrivevo
   questo stesso file. Ma e' l'unica cosa piccola che legge MESI della tua
   storia in un colpo solo, e il gratuito quasi sempre si paga in dati. */
const leaks = m.personalDataOnFreeTier();
check(
  leaks.length === 0,
  'niente che parli di te finisce su un piano gratuito',
  leaks.length ? `perde: ${leaks.join(', ')}` : 'voce e riflessione su fornitore a pagamento',
);

check(
  m.PERSONAL.includes('character-voice') && m.PERSONAL.includes('text-cheap'),
  'la voce e la riflessione sono marcate come dati personali',
);

/* --- §10 — IL COMPILATORE DI PROMPT ----------------------------------------
   «Forse il problema e' anche che il prompt non e' generato da un'AI?»
   -------------------------------------------------------------------------- */

check(
  'prompt-compile' in m.ROUTING,
  'esiste una capacita che scrive i prompt',
  `${m.ROUTING['prompt-compile']?.provider} / ${m.ROUTING['prompt-compile']?.model}`,
);
/* 🔒 NON e' marcata personale, e va verificato che resti cosi': la richiesta
   porta la descrizione di una creatura e niente di te. Se un giorno ci
   finisse dentro la tua storia, questa riga diventerebbe falsa in silenzio. */
check(
  !m.PERSONAL.includes('prompt-compile'),
  'e scrivere un prompt non e un dato personale: porta una creatura, non te',
);
check(
  m.routingProblems({ ...m.ROUTING }).length === 0,
  'e chi la serve sa fare quello che le serve',
);

/* 🔷 «Sì, sarà ChatGPT» — e io l'avevo mandato su Anthropic senza dirlo. Il
   predefinito e' quello che ha chiesto lui, ed e' anche il piu' economico. */
check(
  m.ROUTING['prompt-compile'].provider === 'openai',
  'il compilatore predefinito e quello che ha chiesto lui, non quello di casa mia',
  `${m.ROUTING['prompt-compile'].model}`,
);
check(
  m.compilerChoiceProblems().length === 0,
  'ogni scelta di compilatore e servibile da chi la serve',
  m.compilerChoiceProblems().join('; '),
);
check(
  m.COMPILER_CHOICES.length >= 2,
  'e ce ne sono almeno due, o non e una scelta',
  m.COMPILER_CHOICES.map((c) => `${c.label} $${c.price.input}/$${c.price.output}`).join(' · '),
);
/* 🔒 La preferenza dal browser vale per la capacita giusta e non per le altre:
   ogni capacita risolve dentro il PROPRIO catalogo.

   🔶 L'ago era su `gpt-5.6-terra` come «modello che non e una voce». Da quando
   la voce si puo dare anche a OpenAI quel modello sta in tutti e due i
   cataloghi, e l'ago diceva OK per il motivo sbagliato. Ora usa `kimi-k3`, che
   e una voce e non un compilatore: se un giorno lo diventasse, questo controllo
   va riscritto invece di essere tolto. */
check(
  m.VOICE_CHOICES.some((c) => c.model === 'kimi-k3') &&
    !m.COMPILER_CHOICES.some((c) => c.model === 'kimi-k3'),
  'esiste un modello che sta in un catalogo solo, altrimenti la prova non prova niente',
);
check(
  m.resolveRoute('prompt-compile', 'kimi-k3').model === m.ROUTING['prompt-compile'].model,
  'una voce non diventa chi scrive i prompt',
);
check(
  m.resolveRoute('character-voice', 'kimi-k3').model === 'kimi-k3',
  'ma sulla capacita giusta la stessa scelta vale',
);
check(
  m.VOICE_CHOICES.some((choice) => choice.provider === 'xai' && choice.model === 'grok-4.6') &&
    m.resolveRoute('character-voice', 'grok-4.6').provider === 'xai',
  'Grok compare nel catalogo voce e risolve sul provider xAI',
);
check(
  m.modelForStep('voice', undefined) === 'claude-opus-5' &&
    m.ROUTING['character-voice'].model === 'gpt-5.6-terra',
  'aggiungere Grok non cambia la voce predefinita',
);

const previousFetch = globalThis.fetch;
const previousXaiKey = process.env.XAI_API_KEY;
let xaiRequest = null;
process.env.XAI_API_KEY = 'test-xai-key-not-a-real-secret';
globalThis.fetch = async (url, init) => {
  xaiRequest = { url: String(url), init };
  return new Response(JSON.stringify({
    model: 'grok-4.6',
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 2 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const xaiResult = await m.callProvider('xai', {
  model: 'grok-4.6', system: [{ text: 'system' }], turns: [], user: 'ciao',
  maxTokens: 32, effort: 'low',
});
globalThis.fetch = previousFetch;
if (previousXaiKey === undefined) delete process.env.XAI_API_KEY;
else process.env.XAI_API_KEY = previousXaiKey;
check(
  xaiResult.ok && xaiRequest?.url === 'https://api.x.ai/v1/chat/completions' &&
    xaiRequest?.init?.headers?.authorization === 'Bearer test-xai-key-not-a-real-secret',
  'la scelta Grok raggiunge davvero l\'endpoint xAI con la chiave server-side',
);

const start = new Date(2026, 7, 31, 18, 0, 0);
check(
  m.realDayAt(start.toISOString(), '02:00', new Date(2026, 8, 1, 1, 59, 0)) === 1 &&
    m.realDayAt(start.toISOString(), '02:00', new Date(2026, 8, 1, 2, 0, 0)) === 2,
  'il giorno VINZ.MON cambia esattamente al confine scelto',
);
check(
  m.normalizeDayBoundaryTime('04:30') === '04:30' &&
    m.normalizeDayBoundaryTime('29:90') === '00:00',
  'il confine giornaliero viene validato e normalizzato',
);
check(
  m.realDayCatchUpCount(12, start.toISOString(), '02:00', new Date(2026, 8, 5, 2, 0, 0)) === 0 &&
    m.realDayCatchUpCount(1, start.toISOString(), '02:00', new Date(2026, 8, 2, 2, 0, 0)) === 2,
  'il tempo reale recupera solo in avanti e non annulla i giorni simulati dal DEV',
);
check(
  m.resolveRoute('prompt-compile', 'claude-sonnet-5').provider === 'anthropic',
  'ma la scelta del compilatore viene rispettata',
);
check(
  m.resolveRoute('prompt-compile', 'modello-inventato').model === m.ROUTING['prompt-compile'].model,
  'e un modello che non conosciamo torna al predefinito',
);

/* 🔷 «Mettimi la possibilita di cambiare tra le varie intelligenze di OpenAI,
   quindi Sol, Luna, Terra e altri, cosi li provo e decido quale tenere.» */
for (const tier of ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']) {
  check(
    m.VOICE_CHOICES.some((c) => c.model === tier) &&
      m.COMPILER_CHOICES.some((c) => c.model === tier),
    `${tier} si puo scegliere sia per la voce sia per i prompt`,
  );
}
/* 🔒 Un prezzo mancante o a zero renderebbe cieco il tetto proprio sulla scelta
   che serve a spendere meno. */
check(
  [...m.VOICE_CHOICES, ...m.COMPILER_CHOICES].every(
    (c) => c.price.input > 0 && c.price.output > 0,
  ),
  'ogni scelta ha un prezzo dichiarato, e nessuno e zero',
);
/* 🔒 E il prezzo del catalogo deve essere quello con cui il tetto conta: due
   listini diversi vorrebbero dire una schermata che promette una cifra e un
   contatore che ne addebita un'altra. */
const disallineati = [...m.VOICE_CHOICES, ...m.COMPILER_CHOICES].filter((c) => {
  const uno = m.costOf(c.model, { outputTokens: 1e6 });
  return Math.abs(uno - c.price.output) > 0.001;
});
check(
  disallineati.length === 0,
  'il prezzo mostrato e lo stesso con cui il tetto conta',
  disallineati.map((c) => c.label).join(', '),
);

/* --- §22.4 — CHI DISEGNA ----------------------------------------------------
   «Ma io non ho potuto scegliere che AI immagini usare, vorrei la piu recente
   lato immagine.» Era vero: la voce e il compilatore erano due menu, il
   disegnatore una riga inchiodata.
   -------------------------------------------------------------------------- */

console.log('\n═══ §22.4 — CHI DISEGNA ═══\n');

for (const c of m.IMAGE_CHOICES) {
  console.log(`  ${c.label.padEnd(16)} $${c.perImage.toFixed(2)} a immagine`);
}
console.log('');

const imageProblems = m.imageChoiceProblems();
check(
  imageProblems.length === 0,
  'ogni scelta di disegnatore e servibile, e ha un prezzo',
  imageProblems.join('; '),
);
check(
  m.IMAGE_CHOICES.length >= 2,
  'le scelte sono almeno due, o non e una scelta',
  `${m.IMAGE_CHOICES.length} scelte`,
);
/* 🔒 Il predefinito e' il piu' recente, che e' esattamente quello che ha
   chiesto: «vorrei la piu recente lato immagine». */
check(
  m.ROUTING.image.model === 'gpt-image-2',
  'il disegnatore predefinito e il piu recente',
  m.ROUTING.image.model,
);
check(
  m.resolveRoute('image', 'gpt-image-1').model === 'gpt-image-1',
  'ma si puo scegliere il precedente',
);
check(
  m.resolveRoute('image', 'claude-opus-5').model === m.ROUTING.image.model,
  'e una voce non diventa un disegnatore',
);
/* 🔒 Un modello di immagini senza prezzo renderebbe cieco il tetto proprio
   sulla voce di spesa piu' grossa. */
check(
  m.IMAGE_CHOICES.every((c) => m.costOf(c.model, { images: 1 }) > 0),
  'ogni disegnatore ha un costo che il tetto sa contare',
  m.IMAGE_CHOICES.map((c) => `${c.label} $${m.costOf(c.model, { images: 1 })}`).join(' · '),
);

/* --- §19.2 — CAMBIARE CHI DA' LA VOCE --------------------------------------
   «Vorrei poter cambiare fornitore senza perdere quello che e' l'AI.»
   -------------------------------------------------------------------------- */

console.log('\n═══ §19.2 — CHI DA LA VOCE ═══\n');

for (const c of m.VOICE_CHOICES) {
  console.log(`  ${c.label.padEnd(16)} $${c.price.input}/$${c.price.output} · web ${c.webSearch ? 'si' : 'no'}`);
}
console.log('');

const voiceProblems = m.voiceChoiceProblems();
check(
  voiceProblems.length === 0,
  'ogni scelta di voce e servibile da chi la serve, e dice dove finiscono i dati',
  voiceProblems.join('; '),
);

check(
  m.VOICE_CHOICES.length >= 2,
  'le scelte sono almeno due, o non e una scelta',
  `${m.VOICE_CHOICES.length} scelte`,
);

/* 🔒 Il filtro sulla preferenza dal browser. Un modello inventato NON deve
   arrivare al fornitore: il tetto di spesa non saprebbe prezzarlo, e un
   contatore che non sa cosa conta e' peggio di nessun contatore. */
const base = m.ROUTING['character-voice'];
check(
  m.resolveRoute('character-voice', 'gpt-4-turbo-scontato').model === base.model,
  'un modello che non conosciamo non viene chiamato: si torna al predefinito',
);
check(
  m.resolveRoute('character-voice', null).model === base.model,
  'senza preferenza si usa la tabella',
);
const kimi = m.VOICE_CHOICES.find((c) => c.model === 'kimi-k3');
check(
  !kimi || m.resolveRoute('character-voice', 'kimi-k3').provider === kimi.provider,
  'una scelta vera invece viene rispettata',
  kimi ? `kimi-k3 → ${m.resolveRoute('character-voice', 'kimi-k3').provider}` : '',
);
/* 🔒 E la preferenza vale SOLO per la voce: `text-cheap` legge mesi della tua
   storia, e non deve poter essere spostata da una scelta fatta per la chat. */
check(
  m.resolveRoute('text-cheap', 'kimi-k3').model === m.ROUTING['text-cheap'].model,
  'la scelta della voce non sposta la riflessione settimanale',
);

/* --- Costi ------------------------------------------------------------------ */

console.log('\n═══ §19.2 — IL CONTO ═══\n');

const opus = m.costOf('claude-opus-5', { inputTokens: 1_000_000, outputTokens: 0 });
check(Math.abs(opus - 5) < 0.001, 'un milione di token in ingresso su Opus costa 5 $', `${opus}`);

const cached = m.costOf('claude-opus-5', { cacheReadTokens: 1_000_000 });
check(Math.abs(cached - 0.5) < 0.001, 'letti dalla cache costano un decimo', `${cached}`);

const written = m.costOf('claude-opus-5', { cacheWriteTokens: 1_000_000 });
check(Math.abs(written - 6.25) < 0.001, 'scritti in cache costano un quarto in piu', `${written}`);

/* Un modello che non conosciamo non costa zero. Sembra pessimismo ed e'
   l'unica scelta sicura: un modello nuovo che stimiamo gratis sfonda il tetto
   senza far scattare niente. */
const unknown = m.costOf('modello-che-non-esiste-ancora', { inputTokens: 1_000_000 });
check(unknown > 0, 'un modello sconosciuto NON costa zero', `${unknown} $`);
check(
  unknown >= m.costOf('claude-haiku-4-5', { inputTokens: 1_000_000 }),
  'e non costa meno del piu economico che conosciamo',
);

const img = m.costOf('gpt-image-1', { images: 7 });
check(img > 0 && img < 1, 'sette immagini, cioe una creatura intera, sotto il dollaro', `${img.toFixed(2)} $`);

/* --- Il tetto ---------------------------------------------------------------- */

console.log('\n═══ §19.2 — IL TETTO ═══\n');

check(
  m.MONTHLY_CAP_USD > 30 && m.MONTHLY_CAP_USD < 40,
  'il tetto e i 30 € decisi insieme, in dollari',
  `${m.MONTHLY_CAP_USD} $`,
);
check(m.WARN_AT > 0.5 && m.WARN_AT < 1, 'si avvisa prima di arrivare al muro', `al ${m.WARN_AT * 100}%`);

// Una stima dell'uso quotidiano deve stare comodamente sotto il tetto: se non
// ci stesse, il tetto non sarebbe una rete di sicurezza ma un limite d'uso.
const perMessage =
  m.costOf('claude-opus-5', {
    cacheReadTokens: 1750,
    inputTokens: 330,
    outputTokens: 80,
  });
const monthly = perMessage * 40 * 30;
check(
  monthly < m.MONTHLY_CAP_USD * 0.6,
  'quaranta messaggi al giorno stanno larghi sotto il tetto',
  `${monthly.toFixed(2)} $ su ${m.MONTHLY_CAP_USD} $`,
);

const month = m.currentMonth(new Date('2026-03-09T00:00:00Z'));
check(month === '2026-03', 'il registro cambia chiave ogni mese da solo', month);

/* ============================================================================
   §21 — LA RICERCA SUL WEB

   ⚠️ NON PASSA DAL CONTEGGIO DEI TOKEN. È un costo a parte, dieci dollari
   ogni mille ricerche, e un tetto che guardasse solo i token la lascerebbe
   passare tutta — proprio sullo strumento che un modello ha più voglia di
   usare. Questi controlli sorvegliano quel buco.
   ========================================================================= */

console.log('\n═══ §21 — LA RICERCA SUL WEB ═══\n');

const oneSearch = m.costOf('claude-opus-5', { webSearches: 1 });
check(
  Math.abs(oneSearch - m.COST_PER_WEB_SEARCH) < 0.0001,
  'una ricerca costa e viene contata',
  `${oneSearch} $`,
);

const hundred = m.costOf('claude-opus-5', { webSearches: 100 });
check(
  Math.abs(hundred - 1) < 0.001,
  'cento ricerche fanno un dollaro',
  `${hundred} $ — su un tetto di ${m.MONTHLY_CAP_USD} $`,
);

const mixed = m.costOf('claude-opus-5', { inputTokens: 1_000_000, webSearches: 10 });
check(
  Math.abs(mixed - 5.1) < 0.001,
  'token e ricerche si sommano nello stesso conto',
  `${mixed} $`,
);

/* Quante ricerche servirebbero per finire il mese da sole: serve a sapere se
   il tetto protegge davvero anche da un ciclo impazzito. */
const searchesToCap = Math.round(m.MONTHLY_CAP_USD / m.COST_PER_WEB_SEARCH);
check(
  searchesToCap > 1000,
  'per sfondare il tetto con le sole ricerche ne servirebbero migliaia',
  `${searchesToCap.toLocaleString('it-IT')} ricerche`,
);

/* 🔒 La ricerca si accende solo dove la conversazione è già di quel
   fornitore: accenderla altrove manderebbe la domanda — che contiene quello
   che hai appena scritto — da qualcun altro. */
const aiSource = readFileSync(`${cwd}/netlify/functions/ai.ts`, 'utf8');
check(
  aiSource.includes("route.provider === 'anthropic'") && aiSource.includes("route.provider === 'openai'"),
  'la ricerca non si accende su un fornitore diverso da quello della voce',
);
check(
  aiSource.includes('LIMITS.tools') && aiSource.includes('toolChars'),
  'gli strumenti hanno un tetto come tutto il resto della richiesta',
);

const providersSource = readFileSync(`${cwd}/netlify/functions/_shared/providers.ts`, 'utf8');
check(
  providersSource.includes('web_search_20260209'),
  'la ricerca usa la versione che filtra i risultati prima del contesto',
);
check(
    providersSource.includes("https://api.openai.com/v1/responses") &&
    providersSource.includes("{ type: 'web_search' }") &&
    providersSource.includes("type: 'input_image'") &&
    providersSource.includes('req.images?.length'),
  'OpenAI usa lo stesso modello per ricerca web e lettura delle foto',
);
check(
  providersSource.includes('text.length > 0 || toolUses.length > 0'),
  '⚠️ una risposta senza testo ma con strumenti NON conta come guasto',
  'era il modo silenzioso in cui ogni giro di strumenti sarebbe fallito',
);

/* ============================================================================
   LA FUSIONE DELLE LEZIONI

   🔷 «No, devono sopravvivere sempre.»

   ⚠️ È LA FUNZIONE CHE PUÒ FAR SPARIRE MESI DI LAVORO, quindi si prova qui e
   non a occhio. Tre proprietà, e ognuna corrisponde a un modo concreto di
   perdere tutto.
   ========================================================================= */

console.log('\n═══ LEZIONI — LA FUSIONE ═══\n');

const L = (id, at) => ({ id, at, said: `detto ${id}`, text: `regola ${id}` });
const libro = (lessons, forgotten = []) => ({ lessons, forgotten, savedAt: null });

/* Il telefono rimasto indietro manda due lezioni; il server ne ha tre. */
const vecchio = libro([L('a', '1'), L('b', '2')]);
const server = libro([L('a', '1'), L('b', '2'), L('c', '3')]);

check(
  m.mergeLessons(server, vecchio).lessons.length === 3,
  'un telefono rimasto indietro non cancella quello che ha imparato l’altro',
  'due contro tre → tre',
);

/* Dimenticata su un telefono, ancora presente sull'altro. */
const chiDimentica = libro([L('a', '1'), L('c', '3')], ['b']);
const fuso = m.mergeLessons(server, chiDimentica);
check(
  fuso.lessons.every((l) => l.id !== 'b') && fuso.forgotten.includes('b'),
  'una lezione dimenticata resta dimenticata, anche se l’altro ce l’ha ancora',
  'senza pietra tombale «DIMENTICALA» sarebbe un pulsante che non funziona',
);

/* L'ordine in cui i telefoni parlano non deve cambiare il risultato. */
const ab = JSON.stringify(m.mergeLessons(server, chiDimentica).lessons.map((l) => l.id));
const ba = JSON.stringify(m.mergeLessons(chiDimentica, server).lessons.map((l) => l.id));
check(
  ab === ba,
  'e il risultato non dipende da chi parla per primo',
  `${ab} in tutti e due i sensi`,
);

check(
  m.mergeLessons(libro([L('a', '1')]), libro([{ ...L('a', '1'), text: 'corretta' }]))
    .lessons[0].text === 'corretta',
  'a parità di id vince la copia in arrivo: è l’unica dove il testo può essere stato corretto',
);

/* Il documento non si fonde: fra due vince il più recente. Unire due versioni
   di un testo non dà un testo, dà un pasticcio. */
const conDoc = (memory, memoryAt) => ({ lessons: [], forgotten: [], memory, memoryAt, savedAt: null });

check(
  m.mergeLessons(conDoc('vecchio', '2026-01-01'), conDoc('nuovo', '2026-08-01')).memory === 'nuovo',
  'fra due documenti vince il più recente, in tutti e due i sensi',
  m.mergeLessons(conDoc('nuovo', '2026-08-01'), conDoc('vecchio', '2026-01-01')).memory === 'nuovo'
    ? 'anche invertendo'
    : 'MA NON INVERTENDO',
);
check(
  m.mergeLessons(conDoc('mio', '2026-08-01'), conDoc(null, null)).memory === 'mio',
  'e un telefono che non ne ha uno non cancella quello dell’altro',
);

/* ============================================================================
   UN MODELLO PER OGNI LAVORO (§19.3)

   🔷 «Non voglio che scegliere SOL per il Character Master obblighi
      automaticamente SOL per Bio, Teach o altri lavori.»
   ========================================================================= */

console.log('\n═══ AI — UN MODELLO PER STEP ═══\n');

check(
  m.stepProblems().length === 0,
  'ogni step ha un predefinito che esiste nel catalogo della sua capacità',
  m.stepProblems().join(' · ') || `${m.AI_STEP_ORDER.length} step`,
);

/* 1 · indipendenza — la proprietà per cui esiste tutto questo lavoro. */
const soloBio = { bio: 'gpt-5.6-luna' };
check(
  m.modelForStep('characterMaster', soloBio.characterMaster) === 'gpt-5.6-sol',
  'mettere Bio su Luna NON sposta il Character Master',
  m.modelForStep('characterMaster', soloBio.characterMaster),
);
const soloTeach = { teach: 'gpt-5.6-luna' };
check(
  m.modelForStep('characterMaster', soloTeach.characterMaster) === 'gpt-5.6-sol',
  'mettere Insegna su Luna NON sposta il Character Master',
);
check(
  m.modelForStep('bio', soloBio.bio) === 'gpt-5.6-luna' &&
    m.modelForStep('teach', undefined) === 'gpt-5.6-luna',
  'e ogni step legge la propria scelta, non quella di un altro',
);

/* 2 · i predefiniti chiesti. */
check(
  m.AI_STEPS.characterMaster.fallback === 'gpt-5.6-sol',
  'CHARACTER MASTER: il predefinito è Sol',
  m.AI_STEPS.characterMaster.fallback,
);
check(
  m.AI_STEPS.teach.fallback === 'gpt-5.6-luna' &&
    m.AI_STEPS.bio.fallback === 'gpt-5.6-luna' &&
    m.AI_STEPS.imagePrompt.fallback === 'gpt-5.6-luna',
  'INSEGNA, BIO e PROMPT IMMAGINI: il predefinito è Luna',
);
check(
  m.AI_STEPS.image.fallback === 'gpt-image-2' && m.AI_STEPS.vision.fallback === 'gemini-2.5-flash',
  'IMMAGINI e VISIONE restano sui modelli loro, non su un modello di testo',
);

/* 3 · un nome inventato dal browser non passa. */
check(
  m.modelForStep('characterMaster', 'gpt-inventato-9') === 'gpt-5.6-sol' &&
    m.modelForStep('bio', 'claude-opus-5') === 'gpt-5.6-luna',
  'un modello fuori catalogo torna al predefinito dello step, non viene chiamato',
  'anche un modello VERO ma di un’altra capacità',
);

/* 4 · il profilo: chi aspetta e chi no. */
check(
  m.AI_STEPS.characterMaster.background === true &&
    m.AI_STEP_ORDER.filter((id) => m.AI_STEPS[id].background).length === 1,
  'solo il Character Master parte in background',
  'gli altri sono brevi: un giro di rete in più li rallenterebbe e basta',
);
check(
  m.AI_STEPS.characterMaster.effort === 'medium' &&
    m.AI_STEPS.teach.effort === 'none' &&
    m.AI_STEPS.bio.effort === 'low',
  'e il ragionamento è per step: medium, none, low',
);
check(
  m.AI_STEPS.characterMaster.maxTokens >= 8000,
  'il Character Master ha spazio per ragionare senza troncare il JSON',
  `${m.AI_STEPS.characterMaster.maxTokens} token`,
);

/* 5 · il preset economico non tocca la qualità. */
const economico = {};
for (const id of m.AI_STEP_ORDER) {
  if (m.AI_STEPS[id].qualityCritical) continue;
  const luna = m.choicesFor(m.AI_STEPS[id].capability).find((c) => c.model === 'gpt-5.6-luna');
  if (luna) economico[id] = luna.model;
}
check(
  m.modelForStep('characterMaster', economico.characterMaster) === 'gpt-5.6-sol',
  '⚠️ il preset ECONOMICO non sposta il Character Master da Sol',
  'è la riga per cui il preset può esistere senza peggiorare i character',
);
check(
  economico.bio === 'gpt-5.6-luna' && economico.teach === 'gpt-5.6-luna',
  'ma mette su Luna tutto quello che si può',
  Object.keys(economico).join(', '),
);
check(
  economico.image === undefined && economico.voice === undefined,
  'e non tocca né le immagini né la voce',
  'un modello di testo non sostituisce un modello di disegno',
);

/* ⚠️ LA MIGRAZIONE È IL PUNTO PIÙ RISCHIOSO DI TUTTO IL LAVORO: l'app è già
   in uso, e una vecchia installazione deve caricarsi senza perdere niente. */

const vecchia = {
  voiceModel: 'kimi-k3',
  compilerModel: 'gpt-5.6-terra',
  imageModel: 'gpt-image-1',
};
const migrata = m.migratedStepModels(vecchia);

check(
  migrata.voice === 'kimi-k3' && migrata.image === 'gpt-image-1',
  'una vecchia installazione conserva la voce e il disegnatore che aveva scelto',
  JSON.stringify(migrata),
);
check(
  m.modelForStep('characterMaster', migrata.characterMaster) === 'gpt-5.6-sol',
  '…e riceve i predefiniti nuovi dove prima c’era il menu condiviso',
  '`compilerModel` valeva per quattro step insieme: non può diventare la scelta di uno',
);
check(
  Object.keys(m.migratedStepModels({})).length === 0,
  'un’installazione nuova parte senza scelte, cioè su tutti i predefiniti',
);
check(
  m.migratedStepModels({ voiceModel: 'kimi-k3', stepModels: { bio: 'gpt-5.6-luna' } }).voice ===
    undefined,
  'e una già migrata non viene ripassata sopra',
  'rifarlo cancellerebbe le scelte fatte dopo la migrazione',
);

console.log(
  failures === 0 ? '\n✓ Backend conforme.\n' : `\n✗ ${failures} controlli falliti.\n`,
);
process.exit(failures === 0 ? 0 : 1);
