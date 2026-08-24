/* ============================================================================
   VINZ.LAB — INGRESSO E ISOLAMENTO

   Il pacchetto di Codex chiede, testualmente, cinque prove prima di dire
   fatto. Questo copione le fa, tutte, contro un browser vero:

     1. `/` apre VINZ.MON e non è cambiata
     2. `/#/lab` apre il laboratorio, con le sue quattro porte
     3. `/#/lab/design` apre DESIGN.LAB e monta l'iframe della schermata vera
     4. `?design-preview=…` monta UNA schermata sola, senza `App` intorno
     5. da VINZ.MON non parte NESSUN link al laboratorio

   E ne aggiunge una che il pacchetto chiede a parole ma non sa provare:

     6. la preview NON SCRIVE. Si conta `localStorage` prima e dopo, e si
        intercetta ogni richiesta di rete che non sia una lettura.

   ⚠️ La sesta è quella che conta. Le altre cinque dicono che il laboratorio
   si apre; questa dice che aprirlo non costa niente alla creatura vera. Una
   preview che salva è peggio di una preview che non c'è.

   Uso:  node scripts/lab-check.mjs
         VERIFY_BASE=https://… node scripts/lab-check.mjs
   ========================================================================= */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 5201;
const REMOTE = process.env.VERIFY_BASE?.replace(/\/$/, '');
const BASE = REMOTE ?? `http://localhost:${PORT}`;

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
  let ready = false;
  server.stdout.on('data', (d) => {
    const s = d.toString();
    if (s.includes('ready in') || s.includes('Local:')) ready = true;
  });
  for (let i = 0; i < 100 && !ready; i++) await sleep(100);
  await sleep(600);
}

const PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE);
const LAUNCH_ARGS = IS_LOCAL ? ['--no-proxy-server'] : [];
const LAUNCH_PROXY = IS_LOCAL || !PROXY ? undefined : { server: PROXY };

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
    return chromium.launch({ executablePath: candidates[0], args: LAUNCH_ARGS, proxy: LAUNCH_PROXY });
  }
}

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 460, height: 920 } });
const page = await context.newPage();

const results = [];
let failures = 0;
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  if (!ok) failures++;
}

/* Ogni scrittura tentata verso la rete finisce qui. */
const writes = [];
await context.route('**/*', (route) => {
  const req = route.request();
  if (!['GET', 'HEAD'].includes(req.method())) writes.push(`${req.method()} ${req.url()}`);
  return route.continue();
});

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

/* ⚠️ `about:blank` PRIMA DI OGNI GIRO, e non è pignoleria da copione.
   `readEntrypoint` legge l'indirizzo UNA VOLTA, all'avvio: è un interruttore
   all'ingresso, non un router. Da `/` a `/#/lab` il browser NON ricarica —
   cambia solo il frammento — quindi senza questa riga il copione crederebbe
   di aver aperto il laboratorio mentre sta ancora guardando l'app. È lo stesso
   equivoco che avrebbe avuto un utente: si entra nel laboratorio aprendolo,
   non navigandoci dentro. */
const open = async (path) => {
  await page.goto('about:blank');
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await sleep(900);
};

try {
  /* --- 1. L'app normale ---------------------------------------------------- */
  await open('/');
  check(
    'su «/» monta VINZ.MON',
    (await page.locator('.proto-frame').count()) > 0,
    'la cornice del prototipo è quella e non un guscio del laboratorio',
  );
  check('su «/» il titolo resta VINZ.MON', (await page.title()) === 'VINZ.MON');
  check(
    'su «/» il manifest resta quello dell\'app',
    (await page.locator('link[rel="manifest"]').getAttribute('href')) === '/manifest.webmanifest',
  );

  /* --- 5. Nessun link al laboratorio --------------------------------------- */
  const labLinks = await page.evaluate(() => {
    const testo = document.body.innerText.toUpperCase();
    const href = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '');
    return {
      testo: testo.includes('VINZ.LAB') || /\bLAB\b/.test(testo),
      href: href.filter((h) => h.includes('/lab')),
    };
  });
  check(
    'da VINZ.MON non si arriva al laboratorio',
    !labLinks.testo && labLinks.href.length === 0,
    labLinks.href.join(' ') || (labLinks.testo ? 'la parola LAB compare a schermo' : ''),
  );

  /* --- 2. L'atrio ---------------------------------------------------------- */
  await open('/#/lab');
  const doors = await page.locator('.labapp__doors button').count();
  check('su «/#/lab» monta VINZ.LAB', (await page.locator('.labapp').count()) > 0);
  check('e le porte sono quattro', doors === 4, `trovate ${doors}`);
  check('col titolo suo', (await page.title()) === 'VINZ.LAB');
  check(
    'e il manifest suo, così l\'icona sulla Home è un\'altra',
    (await page.locator('link[rel="manifest"]').getAttribute('href')) === '/lab-manifest.webmanifest',
  );
  check(
    'su «/#/lab» VINZ.MON non è montata',
    (await page.locator('.proto-frame').count()) === 0,
    'due app montate insieme vorrebbe dire due store vivi',
  );

  /* --- 3. DESIGN.LAB ------------------------------------------------------- */
  await open('/#/lab/design');
  check('su «/#/lab/design» si apre DESIGN.LAB', (await page.locator('.designlab').count()) > 0);
  const frame = page.locator('iframe.designlab__preview');
  check('con dentro l\'iframe della schermata vera', (await frame.count()) === 1);
  const src = ((await frame.count()) === 1 ? await frame.getAttribute('src') : null) ?? '';
  check(
    'e l\'iframe punta alla preview, non a una copia',
    src.startsWith('/?design-preview='),
    src,
  );

  /* --- 4. La preview ------------------------------------------------------- */

  /* ⚠️ CONFRONTARE UNO `localStorage` VUOTO CON UNO `localStorage` VUOTO non
     prova niente: passerebbe anche senza guardiani. Quindi prima si semina —
     con la chiave VERA dello store persistito, quella che `persist` riscrive
     a ogni cambiamento — e poi si guarda se il seme è ancora lì. */
  await open('/');
  /* ⚠️ `version: 3` NON È UN NUMERO A CASO: è la versione dichiarata da
     `persist` in `src/state/store.ts`. Con un numero diverso zustand prova a
     migrare, non trova una funzione di migrazione e scrive un errore in
     console — cioè il seme di prova farebbe fallire il controllo degli errori
     invece dei guardiani. Un test che rompe la cosa che sta misurando non sta
     misurando niente. */
  await page.evaluate(() => {
    localStorage.setItem(
      'vinzmon.prototype.v4',
      JSON.stringify({ state: { __seme_lab__: true }, version: 3 }),
    );
    localStorage.setItem('__seme_lab__', 'intatto');
  });
  const before = await page.evaluate(() => JSON.stringify(localStorage));
  check(
    'il seme di prova è stato piantato',
    before.includes('__seme_lab__'),
    'senza seme il confronto dopo non proverebbe niente',
  );

  await open('/?design-preview=mind-map');
  check(
    'la preview monta la cornice VERA',
    (await page.locator('.proto-frame').count()) === 1,
  );
  check(
    'MIND.MAP in preview sta sul campo nero come in produzione',
    (await page.locator('.proto-frame[data-field="ink"]').count()) === 1,
    'una preview che sbaglia il colore di fondo è peggio di nessuna preview',
  );
  check(
    'e la barra in fondo è quella vera, non ridisegnata',
    (await page.locator('.tabbar').count()) === 1,
  );

  /* --- 6. E non scrive ----------------------------------------------------- */
  const after = await page.evaluate(() => JSON.stringify(localStorage));
  check(
    'la preview non tocca la memoria di produzione',
    before === after,
    'localStorage cambiato guardando una schermata',
  );
  check(
    'e non manda nessuna richiesta che scriva',
    writes.length === 0,
    writes.join(' · '),
  );
  const blocked = await page.evaluate(() => {
    try {
      localStorage.setItem('__lab_probe__', '1');
      return localStorage.getItem('__lab_probe__') === null;
    } catch {
      return true;
    }
  });
  check(
    'i guardiani sono davvero installati',
    blocked,
    'una scrittura di prova è passata: `installPreviewGuards` non ha preso',
  );

  /* --- Un indirizzo inventato non apre niente ------------------------------ */
  await open('/?design-preview=non-esiste');
  check(
    'una schermata inventata nell\'indirizzo non monta niente di strano',
    (await page.locator('.proto-frame').count()) > 0 && (await page.title()) === 'VINZ.MON',
    'il catalogo è chiuso: fuori dalla lista si torna all\'app',
  );

  check('nessun errore di console lungo il giro', errors.length === 0, errors.slice(0, 3).join(' · '));
} finally {
  await browser.close();
  stopServer();
}

for (const r of results) {
  console.log(`  ${r.ok ? 'OK  ' : 'FAIL'}  ${r.label}${r.detail ? `  — ${r.detail}` : ''}`);
}
console.log(
  failures === 0
    ? `\n✓ VINZ.LAB: ${results.length} prove passate.\n`
    : `\n✗ VINZ.LAB: ${failures} prove su ${results.length} fallite.\n`,
);
process.exit(failures === 0 ? 0 : 1);
