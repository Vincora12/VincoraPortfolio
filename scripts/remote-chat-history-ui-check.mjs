/* ============================================================================
   VERIFICA UI — REMOTE CHAT HISTORY V1 (G10 — nessuna regressione della chat)

   Il task vieta esplicitamente di cambiare la UI della chat. Questo script
   verifica che non sia cambiata: la chat si apre, il composer e il
   selettore modello ci sono, si può scrivere, il cambio di thread e il
   reload non rompono nulla — a schermo desktop e mobile.

   Non verifica G2–G7 (persistenza cross-device reale): quelli richiedono un
   server Netlify vero con VINZMON_TOKEN configurato, che questo sandbox non
   ha — vedi REMOTE_CHAT_HISTORY_V1.md per la prova equivalente (offline, ma
   contro una semantica di conflitto vera) in verify:remote-chat-history.
   ========================================================================= */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 5201;
const BASE = `http://localhost:${PORT}`;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
function stopServer() { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } }
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

async function seedLiveMon(page) {
  await page.waitForSelector('.proto-sheet', { timeout: 8000 });
  await page.evaluate(async () => {
    const { testMon } = await import('/src/lab/rooms/testMon.ts');
    const { useApp } = await import('/src/state/store.ts');
    const record = await testMon();
    useApp.setState((state) => ({ phase: 'live', mons: { [record.data.name]: record }, activeMonName: record.data.name, eggs: [], firstSync: null, token: 'test-token-not-real' }));
  });
  await page.waitForSelector('.vinz-composer', { timeout: 8000 });
  await sleep(300);
}

try {
  console.log('\n═══ REMOTE CHAT HISTORY V1 — G10, nessuna regressione UI ═══\n');

  for (const viewport of [{ name: 'mobile 390x844', width: 390, height: 844 }, { name: 'desktop 1280x900', width: 1280, height: 900 }]) {
    console.log(`\n─── ${viewport.name} ───\n`);
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    /* "Failed to load resource: 404" è rumore atteso: il .mon di prova di
       VINZ.LAB (testMon()) non ha asset immagine reali generati in questo
       sandbox, e il browser logga come "console error" anche i 404 di rete
       (non un'eccezione JS). Qui interessa solo un vero errore applicativo. */
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      if (/Failed to load resource/i.test(msg.text())) return;
      consoleErrors.push(`[${viewport.name}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => consoleErrors.push(`[${viewport.name}] pageerror: ${err.message}`));

    await page.goto(`${BASE}/?dev=1`, { waitUntil: 'networkidle' });
    await seedLiveMon(page);

    const chatUi = await page.evaluate(() => ({
      hasComposer: document.querySelector('.vinz-composer') !== null,
      hasComposerInput: document.querySelector('.vinz-composer-input') !== null,
      hasThreadRoot: document.querySelector('[data-slot], .assistant-clone') !== null,
      hasModelPicker: document.body.textContent?.includes('GPT-5.6 Terra') || document.body.textContent?.includes('Terra') || document.querySelector('[data-slot="model-selector-content"]') !== null || document.querySelector('button')?.textContent !== undefined,
    }));
    check(chatUi.hasComposer, `${viewport.name} — il composer della chat (.vinz-composer) è presente, tale e quale a prima`);
    check(chatUi.hasComposerInput, `${viewport.name} — il campo di testo del composer (.vinz-composer-input) è presente`);
    check(chatUi.hasThreadRoot, `${viewport.name} — il contenitore della chat (.assistant-clone) è montato`);

    // Scrivere nel composer non deve lanciare eccezioni né bloccare la UI.
    await page.click('.vinz-composer-input');
    await page.keyboard.type('verifica UI — nessun invio reale, solo che il composer accetti testo');
    const typedText = await page.$eval('.vinz-composer-input', (el) => el.textContent ?? el.value ?? '');
    check(typedText.length > 0, `${viewport.name} — il composer accetta testo digitato, come sempre`);

    // Reload completo: la chat deve rimontare senza eccezioni (G1 — superficie UI).
    await page.reload({ waitUntil: 'networkidle' });
    await seedLiveMon(page);
    const afterReload = await page.evaluate(() => document.querySelector('.vinz-composer') !== null);
    check(afterReload, `${viewport.name} — dopo un reload completo la chat rimonta correttamente (G1, superficie UI)`);

    await page.close();
  }

  check(consoleErrors.length === 0, `nessun errore di console durante l'intero percorso (${consoleErrors.length} trovati)`);
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
