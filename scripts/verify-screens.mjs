/* ============================================================================
   VERIFICA DELLE SCHERMATE

   Percorre il prototipo end-to-end con un browser headless, cattura uno
   screenshot per schermata e FALLISCE se una qualsiasi pagina produce un
   errore di console.

   Il percorso ricalca la prova end-to-end del piano:
   incubazione → hatch → home → conversazione → giorni simulati → ME →
   shift → evolve → shift → branch → new encounter → tutte le schermate di
   consultazione → pannello DEV.

   Uso:  npm run verify                          (avvia da solo il server di sviluppo)
         VERIFY_BASE=https://… npm run verify    (percorre un sito già pubblicato)

   La seconda forma serve a non verificare un deploy «a occhio»: gira la stessa
   camminata contro la produzione, dove il bundle è minificato e i percorsi
   degli asset sono altri — cioè dove una build può rompersi senza che il
   server di sviluppo se ne accorga.
   ========================================================================= */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const OUT = 'screenshots';
const PORT = 5199;

// Con VERIFY_BASE si percorre un sito già pubblicato e non si avvia niente.
const REMOTE = process.env.VERIFY_BASE?.replace(/\/$/, '');
const BASE = REMOTE ?? `http://localhost:${PORT}`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/* --- Server di sviluppo ----------------------------------------------------- */

// `detached` mette il server in un suo gruppo di processi: alla fine si
// abbatte l'intero gruppo, altrimenti vite sopravvive a npx e lo script non
// termina mai.
const server = REMOTE
  ? null
  : spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

function stopServer() {
  if (!server) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
}

if (server) {
  let serverReady = false;
  server.stdout.on('data', (d) => {
    if (d.toString().includes('ready in') || d.toString().includes('Local:')) serverReady = true;
  });

  for (let i = 0; i < 100 && !serverReady; i++) await sleep(100);
  await sleep(600);
}

/* --- Browser ---------------------------------------------------------------- */

// Verso localhost il proxy va escluso: l'ambiente instrada le uscite HTTPS
// attraverso un proxy e senza questo il browser proverebbe a passare di lì
// anche per il server locale. Verso un host esterno serve il contrario.
const PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE);
const LAUNCH_ARGS = IS_LOCAL ? ['--no-proxy-server'] : [];
const LAUNCH_PROXY = IS_LOCAL || !PROXY ? undefined : { server: PROXY };

// Chromium è preinstallato nell'ambiente: non va mai scaricato.
// La revisione nel nome della cartella cambia fra le versioni di Playwright,
// quindi si prova prima la risoluzione standard e poi il binario esplicito.
const browser = await launchChromium();

async function launchChromium() {
  try {
    return await chromium.launch({ args: LAUNCH_ARGS, proxy: LAUNCH_PROXY });
  } catch {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
    const candidates = readdirSync(root)
      .filter((d) => d.startsWith('chromium'))
      .flatMap((d) => [
        join(root, d, 'chrome-linux', 'chrome'),
        join(root, d, 'chrome-linux', 'headless_shell'),
      ])
      .filter((p) => existsSync(p));

    if (candidates.length === 0) throw new Error(`Nessun Chromium trovato in ${root}`);
    return chromium.launch({
      executablePath: candidates[0],
      args: LAUNCH_ARGS,
      proxy: LAUNCH_PROXY,
    });
  }
}
const page = await browser.newPage({ viewport: { width: 460, height: 920 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

let step = 0;
const shot = async (name) => {
  await sleep(220);
  step += 1;
  const file = `${OUT}/${String(step).padStart(2, '0')}-${name}.png`;
  await page.locator('.proto-frame').screenshot({ path: file });
  console.log(`  ✓ ${file}`);
};

/** Clicca il primo elemento che corrisponde, fallendo con un messaggio utile. */
const click = async (selector, label) => {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) throw new Error(`Elemento non trovato: ${label} (${selector})`);
  await el.click();
  await sleep(180);
};

const byText = (text) => `text="${text}"`;

/** Le azioni della home vivono nel «+» del composer, non più attorno alla creatura. */
const openAction = async (label) => {
  await click('.composer .btn-icon:first-child', 'apri le azioni');
  await click(byText(label), label);
};

/** I bottoni che cambiano percorso si tengono premuti; da tastiera basta Invio. */
const hold = async (label) => {
  const el = page.locator(`.hold__btn:has-text("${label}")`).first();
  if ((await el.count()) === 0) throw new Error(`Hold button non trovato: ${label}`);
  await el.press('Enter');
  await sleep(400);
};

try {
  console.log(`\n═══ VERIFICA DELLE SCHERMATE — ${BASE} ═══\n`);

  await page.goto(`${BASE}/?dev=1`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(400);

  /* 04 — INCUBAZIONE */
  await shot('04-incubazione');

  // Quattro settimane di simulazione: è il criterio 1 di §26.
  for (let i = 0; i < 4; i++) await click('.incubation__skip', '+7 giorni');
  await shot('04-incubazione-pronta');

  /* 05 — FIRST ENCOUNTER */
  await click(byText('HATCH'), 'HATCH');
  await shot('05-first-encounter');

  /* 06 — COMPANION HOME */
  await click(byText('BENVENUTO A CASA'), 'entra');
  await shot('06-companion-home');

  // Conversazione
  await page.locator('.composer input').fill('Come stai oggi?');
  await click('.composer .btn-icon:last-child', 'invia');
  await shot('06-conversazione');

  /* Le azioni della home, condensate nel «+» */
  await click('.composer .btn-icon:first-child', 'apri le azioni');
  await shot('06-azioni');
  await click('.home__scrim', 'chiudi le azioni');

  /* 08 — DAILY SCAN, la schermata degli umori di §11 */
  await openAction('UMORE DI OGGI');
  await shot('08-daily-scan');
  await click(byText('Cazzaro'), 'mood cazzaro');
  await click(byText('Sicuro'), 'mood sicuro');
  await shot('08-daily-scan-selezionato');
  await click(byText('REGISTRA'), 'registra mood');

  /* 07 — UNIVERSAL INPUT */
  await openAction('REGISTRA UN DATO');
  await shot('07-universal-input');
  await click(byText('WORKOUT'), 'workout');
  await shot('07-input-selezionato');
  await click(byText('REGISTRA'), 'registra');

  /* 15 — SPECIMEN PROFILE + rotazione */
  await click('.home__head .btn-icon', 'profilo');
  await shot('15-specimen-stats');
  await click(byText('IDENTITÀ'), 'tab identità');
  await shot('15-specimen-identita');
  await click(byText('LINEAGE'), 'tab lineage');
  await shot('15-specimen-lineage');
  await click(byText('ASSET'), 'tab asset');
  await shot('15-specimen-asset');
  await click('.specimen__head .btn-icon', 'indietro');

  /* 16 — BIO */
  await openAction('BIO');
  await shot('16-bio');
  await click('.bio__head .btn-icon', 'indietro');

  /* 19 — MEMORIES */
  await openAction('MEMORIE');
  await shot('19-memorie');
  await click('.specimen__head .btn-icon', 'indietro');

  /* 09 — ME */
  await click('.tabbar__item:nth-child(2)', 'tab ME');
  await shot('09-me-overview');

  /* 17 — MINDLINE: senza selezione si vede solo la topologia */
  await click('.tabbar__item:nth-child(3)', 'tab MINDLINE');
  await shot('17-mindline');

  // Il dettaglio del nodo esiste solo dopo averlo toccato.
  await click('.mindline__node--active', 'nodo attivo');
  await shot('17-mindline-nodo');

  /* 20 — HISTORY */
  await click(byText('EVOLUTION TIMELINE'), 'timeline');
  await shot('20-history');
  await click('.specimen__head .btn-icon', 'indietro');

  /* DEV */
  await click('.devtrigger', 'apri DEV');
  await shot('dev-tempo');
  await click(byText('SEGNALI'), 'tab segnali');
  await shot('dev-segnali');

  // Forza l'eleggibilità per raggiungere entrambe le strade (criterio 2 di §26).
  await click(byText('MINDLINE'), 'tab mindline dev');
  await page.locator('.dev__check input').nth(0).check();
  await page.locator('.dev__check input').nth(1).check();
  await shot('dev-mindline');

  await click(byText('GENERA'), 'tab genera');
  await click(byText('GENERATE 50'), 'batch 50');
  await shot('dev-batch');

  await click(byText('VOCE'), 'tab voce');
  await shot('dev-voce');

  await click(byText('PROMPT'), 'tab prompt dev');
  await shot('dev-prompt-compilato');
  await click(byText('PROVENIENZA'), 'provenienza frammenti');
  await shot('dev-prompt-provenienza');

  await click(byText('ASSET'), 'tab asset dev');
  await shot('dev-import-asset');

  await click(byText('ECONOMIA'), 'tab economia');
  await shot('dev-economia');

  // L'annuncio dello shift esiste solo a EVOLUTION SYNC pieno: si forza da DEV
  // perché altrimenti non comparirebbe mai in una camminata automatica.
  await click(byText('SEGNALI'), 'tab segnali');
  const sync = page.locator('.dev__control input[type="range"]').last();
  await sync.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(el, '1');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('.dev__head .btn-icon', 'chiudi DEV');
  await click('.tabbar__item:nth-child(1)', 'tab MON');
  await shot('06-shift-disponibile');
  await click('.devtrigger', 'riapri DEV');

  /* 11 — MINDLINE SHIFT */
  await click(byText('MINDLINE'), 'tab mindline dev');
  await click(byText('APRI MINDLINE SHIFT'), 'apri shift');
  await shot('11-mindline-shift');

  /* 12 — EVOLUTION */
  await hold('EVOLVE');
  await shot('12-evolution-rivelazione');
  await sleep(1600); // la rivelazione si toglie da sola
  await shot('12-evolution');
  await click(byText('CONTINUA'), 'continua');

  /* 13 — NEW BRANCH */
  await click('.devtrigger', 'apri DEV');
  await click(byText('MINDLINE'), 'tab mindline dev');
  await page.locator('.dev__check input').nth(1).check();
  await click(byText('APRI MINDLINE SHIFT'), 'apri shift');
  await hold('NUOVO SEGNALE');
  await shot('13-new-branch');

  /* 14 — NEW ENCOUNTER */
  await click(byText('SEGUI LA DEVIAZIONE'), 'conferma branch');
  await shot('14-new-encounter');
  await click(byText('BENVENUTO A CASA'), 'entra');

  /* 18 — HERITAGE DNA */
  await click('.tabbar__item:nth-child(3)', 'tab MINDLINE');
  await shot('17-mindline-ramificata');
  await click('.mindline__node--active', 'nodo attivo');
  await click(byText('HERITAGE DNA'), 'heritage');
  await shot('18-heritage-dna');

  console.log(`\n${step} schermate catturate in ${OUT}/`);
} finally {
  await browser.close();
  stopServer();
}

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} errori di console:\n`);
  for (const e of [...new Set(errors)]) console.error(`   ${e}`);
  process.exit(1);
}

console.log('\n✓ Nessun errore di console.\n');
process.exit(0);
