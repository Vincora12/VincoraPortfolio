/* ============================================================================
   MAIN CHAT — ENTER (2026-09-06)

   `submitMode="none"` (aggiunto in "fix: stabilize mobile chat sending",
   72ab0a2) disattivava l'invio da tastiera OVUNQUE, non solo su mobile — la
   causa vera di quel fix era solo che su iOS il nav rimontava fra
   pointer-down e click sulla freccia, non che Invio dovesse smettere di
   inviare su desktop. Corretto con `submitMode="enter"` (il default della
   libreria assistant-ui: Invio invia, Shift+Invio va a capo, IME/disabled
   già gestiti dal primitivo) + `unstable_insertNewlineOnTouchEnter` (Invio
   va a capo SOLO sui dispositivi touch-primari — lo stesso caso mobile).

   Questo script verifica il comportamento VERO nel browser, non solo la
   configurazione statica (quella la verifica già `verify:assistant`).
   ========================================================================= */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 5202;
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

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const consoleErrors = [];

try {
  console.log('\n═══ MAIN CHAT — ENTER ═══\n');
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  /* "Failed to load resource: 404" è rumore atteso (stesso filtro di
     remote-chat-history-ui-check.mjs): niente Netlify Functions dietro il
     semplice `vite` di questo script, e testMon() non ha asset reali — sono
     404 di rete, non eccezioni applicative. */
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource/i.test(msg.text())) return;
    consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await seedLiveMon(page);

  const userBubbleCount = () => page.locator('.vinz-user-message').count();
  const composerValue = () => page.$eval('.vinz-composer-input', (el) => el.value ?? '');

  // ── Enter = invia ─────────────────────────────────────────────────────
  const before = await userBubbleCount();
  await page.click('.vinz-composer-input');
  await page.keyboard.type('test enter invio');
  await page.keyboard.press('Enter');
  await sleep(400);
  const afterEnter = await userBubbleCount();
  check(afterEnter === before + 1, 'Invio (senza Shift) con testo invia un nuovo messaggio');
  check((await composerValue()) === '', 'il composer si svuota dopo l\'invio con Invio');
  const lastBubbleText = await page.locator('.vinz-user-message').last().innerText().catch(() => '');
  check(lastBubbleText.includes('test enter invio'), 'il messaggio inviato con Invio porta davvero il testo scritto');

  // ── Shift+Enter = a capo, non invia ──────────────────────────────────
  const beforeShift = await userBubbleCount();
  await page.click('.vinz-composer-input');
  await page.keyboard.type('riga1');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.keyboard.type('riga2');
  await sleep(300);
  const afterShift = await userBubbleCount();
  check(afterShift === beforeShift, 'Shift+Invio NON invia (nessun nuovo messaggio)');
  const shiftValue = await composerValue();
  check(shiftValue.includes('riga1') && shiftValue.includes('riga2') && shiftValue.includes('\n'), 'Shift+Invio inserisce davvero un a-capo nel composer, non lo svuota');
  // Pulizia per i controlli successivi — `fill('')` passa dal setter nativo
  // che React osserva davvero (assegnare `.value` a mano su un campo
  // controllato lascia lo stato interno del composer disallineato dal DOM).
  await page.fill('.vinz-composer-input', '');
  await sleep(150);

  // ── Composer vuoto + Enter = non invia ───────────────────────────────
  const beforeEmpty = await userBubbleCount();
  await page.click('.vinz-composer-input');
  await page.keyboard.press('Enter');
  await sleep(300);
  const afterEmpty = await userBubbleCount();
  check(afterEmpty === beforeEmpty, 'Invio su composer vuoto non invia nulla');

  // ── IME/composition: Invio durante la composizione non invia ─────────
  const beforeIme = await userBubbleCount();
  await page.click('.vinz-composer-input');
  await page.keyboard.type('ime test');
  await page.$eval('.vinz-composer-input', (el) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }));
  });
  await sleep(300);
  const afterIme = await userBubbleCount();
  check(afterIme === beforeIme, 'Invio durante una composizione IME (isComposing=true) non invia prematuramente');
  // Pulizia: chiude la composizione e svuota per non sporcare i controlli successivi.
  await page.$eval('.vinz-composer-input', (el) => {
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  await page.fill('.vinz-composer-input', '');

  // ── Il pulsante di invio resta quello di sempre — appare quando il
  // composer non è vuoto (`!isRunning && !composer.isEmpty`), quindi si
  // digita qualcosa apposta prima di cercarlo. ─────────────────────────
  await page.click('.vinz-composer-input');
  await page.keyboard.type('x');
  await sleep(150);
  check(await page.locator('.vinz-clone-composer__send').count() > 0, 'il pulsante di invio (.vinz-clone-composer__send) è ancora presente, invariato');
  await page.fill('.vinz-composer-input', '');

  check(consoleErrors.length === 0, `nessun errore di console durante l'intero percorso (${consoleErrors.length} trovati)`);
  if (consoleErrors.length) consoleErrors.forEach((e) => console.log(`    · ${e}`));

  await page.close();
} finally {
  await browser.close();
  stopServer();
}

if (failures) {
  console.error(`\n${failures} controllo/i falliti.`);
  process.exit(1);
}
console.log('\nTutto coerente.\n');
