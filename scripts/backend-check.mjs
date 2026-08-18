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
export { ROUTING, PERSONAL, VOICE_CHOICES, routingProblems, personalDataOnFreeTier, voiceChoiceProblems, resolveRoute } from '${cwd}/netlify/functions/_shared/routing.ts';
export { costOf, currentMonth, MONTHLY_CAP_USD, WARN_AT, COST_PER_WEB_SEARCH } from '${cwd}/netlify/functions/_shared/spend.ts';
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
  aiSource.includes("route.provider === 'anthropic'"),
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
  providersSource.includes('text.length > 0 || toolUses.length > 0'),
  '⚠️ una risposta senza testo ma con strumenti NON conta come guasto',
  'era il modo silenzioso in cui ogni giro di strumenti sarebbe fallito',
);

console.log(
  failures === 0 ? '\n✓ Backend conforme.\n' : `\n✗ ${failures} controlli falliti.\n`,
);
process.exit(failures === 0 ? 0 : 1);
