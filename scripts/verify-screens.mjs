/* ============================================================================
   VERIFICA DELLE SCHERMATE

   Percorre il prototipo end-to-end con un browser headless, cattura uno
   screenshot per schermata e FALLISCE se una qualsiasi pagina produce un
   errore di console.

   Il percorso ricalca la prova end-to-end del piano:
   incubazione → hatch → home → conversazione → giorni simulati → ME →
   shift → evolve → shift → branch → new encounter → tutte le schermate di
   consultazione → pannello DEV.

   Uso:  npm run verify        (avvia da solo il server di sviluppo)
   ========================================================================= */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const OUT = 'screenshots';
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/* --- Server di sviluppo ----------------------------------------------------- */

// `detached` mette il server in un suo gruppo di processi: alla fine si
// abbatte l'intero gruppo, altrimenti vite sopravvive a npx e lo script non
// termina mai.
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});

function stopServer() {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
}

let serverReady = false;
server.stdout.on('data', (d) => {
  if (d.toString().includes('ready in') || d.toString().includes('Local:')) serverReady = true;
});

for (let i = 0; i < 100 && !serverReady; i++) await sleep(100);
await sleep(600);

/* --- Browser ---------------------------------------------------------------- */

// L'ambiente instrada le uscite HTTPS attraverso un proxy: senza questo il
// browser proverebbe a raggiungere anche localhost passando di lì.
const LAUNCH_ARGS = ['--no-proxy-server'];

// Chromium è preinstallato nell'ambiente: non va mai scaricato.
// La revisione nel nome della cartella cambia fra le versioni di Playwright,
// quindi si prova prima la risoluzione standard e poi il binario esplicito.
const browser = await launchChromium();

async function launchChromium() {
  try {
    return await chromium.launch({ args: LAUNCH_ARGS });
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
    return chromium.launch({ executablePath: candidates[0], args: LAUNCH_ARGS });
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

try {
  console.log('\n═══ VERIFICA DELLE SCHERMATE ═══\n');

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

  /* 07 — UNIVERSAL INPUT */
  await click('.home__side .btn-icon:nth-child(3)', 'input universale');
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
  await click('.home__side .btn-icon:nth-child(1)', 'bio');
  await shot('16-bio');
  await click('.bio__head .btn-icon', 'indietro');

  /* 19 — MEMORIES */
  await click('.home__side .btn-icon:nth-child(2)', 'memorie');
  await shot('19-memorie');
  await click('.specimen__head .btn-icon', 'indietro');

  /* 09 — ME */
  await click('.tabbar__item:nth-child(2)', 'tab ME');
  await shot('09-me-overview');

  /* 17 — MINDLINE */
  await click('.tabbar__item:nth-child(3)', 'tab MINDLINE');
  await shot('17-mindline');

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

  await click(byText('ASSET'), 'tab asset dev');
  await shot('dev-import-asset');

  await click(byText('ECONOMIA'), 'tab economia');
  await shot('dev-economia');

  /* 11 — MINDLINE SHIFT */
  await click(byText('MINDLINE'), 'tab mindline dev');
  await click(byText('APRI MINDLINE SHIFT'), 'apri shift');
  await shot('11-mindline-shift');

  /* 12 — EVOLUTION */
  await click(byText('EVOLVE'), 'evolve');
  await shot('12-evolution');
  await click(byText('CONTINUA'), 'continua');

  /* 13 — NEW BRANCH */
  await click('.devtrigger', 'apri DEV');
  await click(byText('MINDLINE'), 'tab mindline dev');
  await page.locator('.dev__check input').nth(1).check();
  await click(byText('APRI MINDLINE SHIFT'), 'apri shift');
  await click(byText('NUOVO SEGNALE'), 'branch');
  await shot('13-new-branch');

  /* 14 — NEW ENCOUNTER */
  await click(byText('SEGUI LA DEVIAZIONE'), 'conferma branch');
  await shot('14-new-encounter');
  await click(byText('BENVENUTO A CASA'), 'entra');

  /* 18 — HERITAGE DNA */
  await click('.tabbar__item:nth-child(3)', 'tab MINDLINE');
  await shot('17-mindline-ramificata');
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
