/* Prova dal vivo: la bolla si riempie a poco a poco o compare tutta insieme? */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const server = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3500));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-proxy-server'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://localhost:5199/?dev=1');
await page.waitForTimeout(600);

// DEV → TEMPO → avanti fino alla schiusa
await page.getByRole('button', { name: /TEMPO/i }).first().click().catch(() => {});
for (let i = 0; i < 5; i++) {
  await page.getByRole('button', { name: '+7 GIORNI' }).click().catch(() => {});
  await page.waitForTimeout(120);
}
await page.getByRole('button', { name: /Chiudi il pannello/i }).click().catch(() => {});
await page.waitForTimeout(400);

// HATCH: e' un hold button
const hatch = page.getByRole('button', { name: /HATCH|SCHIUDI/i }).first();
if (await hatch.count()) {
  const box = await hatch.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2200);
  await page.mouse.up();
}
await page.waitForTimeout(1200);

// Entra in chat
await page.getByRole('button', { name: /chat|parla|scrivi/i }).first().click().catch(() => {});
await page.waitForTimeout(500);

const input = page.locator('input[type="text"], textarea').last();
await input.fill('oggi pesi e sono carico');
await page.keyboard.press('Enter');

// Campiona la lunghezza dell'ultima bolla del mon nel tempo
const samples = [];
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(120);
  const state = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.bubblerow--mon .bubble')];
    const last = rows[rows.length - 1];
    return {
      len: last ? (last.querySelector('.bubble__text')?.textContent ?? '').length : -1,
      dots: !!document.querySelector('.bubble__typing'),
      bubbles: rows.length,
    };
  });
  samples.push({ t: i * 120, ...state });
}

const lens = samples.map((s) => s.len);
const distinct = new Set(lens.filter((l) => l > 0)).size;
const sawDots = samples.some((s) => s.dots);
const maxBubbles = Math.max(...samples.map((s) => s.bubbles));
const final = lens[lens.length - 1];

console.log(`\n  puntini visti:        ${sawDots ? 'SI' : 'NO'}`);
console.log(`  lunghezze distinte:   ${distinct}  (1 = comparsa tutta insieme)`);
console.log(`  bolle del mon:        ${maxBubbles}`);
console.log(`  testo finale:         ${final} caratteri`);
console.log(`  errori di console:    ${errors.length}${errors.length ? ' → ' + errors[0] : ''}`);
console.log('\n  traccia:', lens.filter((v, i, a) => v !== a[i - 1]).join(' → '), '\n');

await browser.close();
server.kill();
process.exit(sawDots && distinct > 3 && final > 0 && errors.length === 0 ? 0 : 1);
