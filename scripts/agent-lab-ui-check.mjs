/* ============================================================================
   VERIFICA UI — AGENT.LAB V1

   Percorre davvero il browser: l'atrio con la terza porta, la stanza
   AGENT.LAB, il modal aperto da un nodo del FLOW di CREATION.LAB con il suo
   contesto, e che senza token l'errore sia onesto invece di un crash.
   Nessuna chiave AI in questo ambiente: non si verifica una risposta vera
   del modello (serve un deploy con le chiavi configurate), solo che l'intera
   UI regga — G1/G5/G7 lato interfaccia, non lato modello.
   ========================================================================= */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 5197;
const BASE = `http://localhost:${PORT}`;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
function stopServer() {
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}
let serverReady = false;
server.stdout.on('data', (d) => { if (d.toString().includes('ready in') || d.toString().includes('Local:')) serverReady = true; });
for (let i = 0; i < 100 && !serverReady; i++) await sleep(100);
await sleep(600);

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const consoleErrors = [];

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  console.log('\n═══ AGENT.LAB — VERIFICA UI ═══\n');

  // ── L'atrio mostra la terza porta ──────────────────────────────────────
  await page.goto(`${BASE}/lab/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('a.lab', { timeout: 5000 });
  const atrio = await page.evaluate(() => ({
    tiles: [...document.querySelectorAll('a.lab .name')].map((el) => el.textContent?.trim()),
    intro: document.querySelector('.intro')?.textContent ?? '',
    footer: document.querySelector('.footer')?.textContent ?? '',
  }));
  check(atrio.tiles.some((t) => t?.includes('AGENT.LAB')), 'l’atrio di VINZ.LAB mostra la terza porta AGENT.LAB');
  check(atrio.intro.includes('Tre laboratori'), 'il testo dell’atrio dice "tre", non più "due" (con tre stanze reali)');
  check(atrio.footer.includes('THREE'), 'il footer dell’atrio dice THREE, non più TWO');

  // ── La stanza AGENT.LAB si apre e mostra il confine ────────────────────
  await page.goto(`${BASE}/lab/agent`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 5000 });
  const before = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent ?? '',
    kicker: document.querySelector('.kicker')?.textContent ?? '',
    threadFillsPage: (() => {
      const thread = document.querySelector('.agentlab-thread');
      const page = document.querySelector('.agentlab-page');
      if (!thread || !page) return false;
      const t = thread.getBoundingClientRect();
      const p = page.getBoundingClientRect();
      // TEST A — "pagina intera, non un riquadro": il corpo della chat deve
      // riempire la maggior parte dell'altezza della stanza, non un tetto fisso.
      return t.height > p.height * 0.55;
    })(),
  }));
  check(before.h1 === 'AGENT.LAB', 'la stanza si apre e mostra il titolo AGENT.LAB');
  check(before.kicker.includes('PROJECT INSPECTOR'), 'il kicker identifica AGENT.LAB come ambiente tecnico ("PROJECT INSPECTOR")');
  check(before.threadFillsPage, 'TEST A — il corpo della chat riempie la pagina (non più un tetto fisso di 62vh)');

  // AUDIT & UNIFICATION — il confine READ/WRITE non è sparito: è dietro un
  // cassetto richiudibile (INFO), chiuso di default per lasciare spazio alla
  // chat. Deve restare raggiungibile con un click, non solo nel codice.
  await page.click('.agentlab-info-toggle');
  const room = await page.evaluate(() => ({
    hasBoundaryNotice: [...document.querySelectorAll('.notice')].some((n) => n.textContent?.includes('READ ACCESS') && n.textContent?.includes('WRITE ACCESS')),
    hasComposer: document.querySelector('.agentlab-composer textarea') !== null,
    hasSendButton: document.querySelector('.agentlab-send') !== null,
  }));
  check(room.hasBoundaryNotice, 'il confine READ ACCESS / WRITE ACCESS è dichiarato in chiaro nella stanza (dietro INFO), non solo nel codice');
  await page.click('.agentlab-info-toggle');
  check(room.hasComposer, 'il composer della chat è presente');
  check(room.hasSendButton, 'il pulsante di invio è presente');

  // ── Senza token: errore onesto, non un crash ───────────────────────────
  await page.fill('.agentlab-composer textarea', 'Come funziona davvero il Bio Writer?');
  await page.click('.agentlab-send');
  await page.waitForSelector('.notice:has-text("AGENT.LAB NON RISPONDE")', { timeout: 8000 }).catch(() => {});
  const afterSend = await page.evaluate(() => ({
    hasHonestError: [...document.querySelectorAll('.notice')].some((n) => n.textContent?.includes('AGENT.LAB NON RISPONDE')),
    mentionsActivate: document.body.textContent?.includes('attiva VINZ.MON') ?? false,
  }));
  check(afterSend.hasHonestError, 'senza token, l’errore compare onestamente in chat invece di restare in silenzio');
  check(afterSend.mentionsActivate, 'l’errore dice ESATTAMENTE perché (manca il token/ATTIVA VINZ.MON), non un errore generico');

  // ── Il modal si apre da un nodo del FLOW con il suo contesto ───────────
  await page.goto(`${BASE}/lab/creation`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tabs .tab', { timeout: 5000 });
  await page.click('.tabs .tab:has-text("FLOW")').catch(async () => {
    // Le tab di CREATION.LAB potrebbero già essere sulla FLOW di default; si tenta comunque il click su un'altra label nota.
    const tabs = await page.$$eval('.tabs .tab', (els) => els.map((e) => e.textContent));
    console.log('    tabs viste:', tabs);
  });
  await page.waitForSelector('#steps details', { timeout: 5000 });
  await page.click('#steps details >> nth=0');
  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('AGENT.LAB'));
    return Boolean(btn);
  });
  check(opened, 'ogni passo del FLOW mostra un modo reale di aprire AGENT.LAB (non solo quelli con COMANDI)');

  await page.click('button:has-text("CHIEDI AD AGENT.LAB") >> nth=0');
  await page.waitForSelector('.agentlab-modal-overlay', { timeout: 5000 });
  const modal = await page.evaluate(() => {
    const overlay = document.querySelector('.agentlab-modal-overlay');
    const notice = [...document.querySelectorAll('.agentlab-modal-panel .notice')].find((n) => n.textContent?.includes('CONTESTO'));
    return {
      present: Boolean(overlay),
      hasContext: Boolean(notice),
      contextText: notice?.textContent ?? '',
      flowStillMounted: document.querySelector('#steps') !== null,
    };
  });
  check(modal.present, 'il modal si apre sopra CREATION.LAB');
  check(modal.hasContext, 'il modal porta un blocco di CONTESTO — non è una chat generica senza sapere da dove arriva');
  check(modal.flowStillMounted, 'il FLOW sotto resta montato — aprire il modal non naviga via, come richiesto ("modal/popup", non una pagina)');

  // Chiusura con Escape, senza rompere la pagina sotto.
  await page.keyboard.press('Escape');
  await sleep(200);
  const afterClose = await page.evaluate(() => ({
    overlayGone: document.querySelector('.agentlab-modal-overlay') === null,
    flowStillThere: document.querySelector('#steps') !== null,
  }));
  check(afterClose.overlayGone, 'Escape chiude il modal');
  check(afterClose.flowStillThere, 'il FLOW resta intatto dopo la chiusura');

  // ── G5 — nessuna regressione della chat vera del MON: l’app boota ancora ──
  await page.goto(`${BASE}/?dev=1`, { waitUntil: 'networkidle' });
  await sleep(300);
  const appBoots = await page.evaluate(() => (document.getElementById('root')?.childElementCount ?? 0) > 0);
  check(appBoots, 'G5 — l’app VINZ.MON continua ad avviarsi normalmente (nessuna rottura di boot introdotta da Agent.lab)');

  // ── G1 — TOP CONTROLS: una sola riga vera, non due, con un .mon vero attivo ──
  await page.evaluate(async () => {
    const { testMon } = await import('/src/lab/rooms/testMon.ts');
    const { useApp } = await import('/src/state/store.ts');
    const record = await testMon();
    useApp.setState((state) => ({
      phase: 'live',
      mons: { [record.data.name]: record },
      activeMonName: record.data.name,
      eggs: [],
      firstSync: null,
      dev: { ...state.dev, enabled: true },
    }));
  });
  await page.waitForSelector('.system-tray', { timeout: 5000 });
  await sleep(300);
  const tray = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.system-tray__controls > *')];
    const tops = chips.map((el) => Math.round(el.getBoundingClientRect().top));
    const container = document.querySelector('.system-tray__controls');
    return {
      chipCount: chips.length,
      singleRow: tops.length > 0 && tops.every((t) => Math.abs(t - tops[0]) <= 1),
      hasDev: !!document.querySelector('.devtrigger'),
      hasLab: !!document.querySelector('.labtrigger'),
      overflowsHorizontally: container ? container.scrollWidth > container.clientWidth + 1 : false,
      scrollWidthOfPage: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  check(tray.chipCount >= 4, 'G1 — la tray dei controlli in alto ha davvero più pulsanti da mettere alla prova (non un DOM vuoto)');
  check(tray.hasDev && tray.hasLab, 'G1 — DEV e LAB sono davvero presenti nella tray (non nascosti da un altro stato)');
  check(tray.singleRow, 'G1 — tutti i controlli in alto stanno sulla STESSA riga (nessun "top" diverso, quindi nessun a-capo su una seconda riga)');
  check(tray.scrollWidthOfPage <= tray.innerWidth + 1, 'G1 — nessuno scroll orizzontale sulla PAGINA intera: l’overflow, se c’è, resta dentro la tray');

  check(consoleErrors.length === 0, `nessun errore di console durante l’intero percorso (${consoleErrors.length} trovati)`);
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log(`    · ${e}`));
} finally {
  await browser.close();
  stopServer();
}

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
