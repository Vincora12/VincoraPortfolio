import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 5209;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let ready = false;
server.stdout.on('data', chunk => { if (/ready in|Local:/.test(chunk.toString())) ready = true; });
server.stderr.on('data', () => {});
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
if (!ready) throw new Error('Isolated Vite server did not start');
const browser = await chromium.launch();
const failures = [];
const check = (condition, label) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); if (!condition) failures.push(label); };

try {
  for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.proto-sheet', { timeout: 10000 });
    await page.evaluate(async () => {
      const { testMon } = await import('/src/lab/rooms/testMon.ts');
      const { useApp } = await import('/src/state/store.ts');
      const { seedWorld, withCanon, emptyLedger } = await import('/src/engine/world.ts');
      const base = await testMon();
      const world = seedWorld(base, 1);
      const record = { ...base, worldId: world.id, transition: { kind: 'BABY', parentNodeIds: [] }, firstEncounter: { status: 'completato', choice: 'esplorare_nul', day: 1 } };
      const id = `life_${world.id}_${world.canon.length}`;
      const fact = 'Un riflesso appare fra due pietre.';
      useApp.setState({ phase: 'live', token: null, mons: { [record.data.name]: record }, activeMonName: record.data.name,
        world: withCanon(world, { id, day: 1, kind: 'life-event', epistemic: 'WORLD_CANON', text: fact, monName: record.data.name }),
        ledger: { ...emptyLedger(), lifeEvent: { id, worldId: world.id, monNodeId: record.data.mindline_node, day: 1, status: 'open', eventType: 'osservazione', observedFact: fact, openingLine: 'Hai visto il riflesso?', possibleMonReaction: 'si ferma', openThreadRefs: [], memoryRefsUsed: [] } },
        eggs: [], firstSync: null });
    });
    await page.waitForSelector('.vinz-composer', { timeout: 10000 });
    await sleep(1500);
    check(await page.getByText('Hai visto il riflesso?', { exact: true }).count() === 0, `${viewport.name}: Generale does not show the Life Cycle event`);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vinz-select-project', { detail: { id: 'vinzmon-world', title: 'Vinz.World' } })));
    await page.getByText('Hai visto il riflesso?', { exact: true }).waitFor({ timeout: 10000 });
    const geometry = await page.evaluate(() => {
      const composer = document.querySelector('.vinz-composer')?.getBoundingClientRect();
      const event = [...document.querySelectorAll('*')].find(el => el.textContent?.trim() === 'Hai visto il riflesso?' && el.children.length === 0)?.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        composerVisible: !!composer && composer.left >= -1 && composer.right <= window.innerWidth + 1 && composer.bottom <= window.innerHeight + 1,
        eventVisible: !!event && event.left >= -1 && event.right <= window.innerWidth + 1 };
    });
    check(!geometry.overflow && geometry.composerVisible && geometry.eventVisible, `${viewport.name}: event and composer fit viewport`);
    await page.screenshot({ path: `/private/tmp/vinz-life-${viewport.name}.png`, fullPage: true });
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vinz-select-project', { detail: { id: 'vinzmon-world', title: 'Vinz.World' } })));
    await page.getByText('Hai visto il riflesso?', { exact: true }).waitFor({ timeout: 10000 });
    await sleep(1800);
    check(await page.getByText('Hai visto il riflesso?', { exact: true }).count() === 1, `${viewport.name}: open event survives reload without duplicate`);
    check(errors.length === 0, `${viewport.name}: no page errors`);
    await context.close();
  }
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}
if (failures.length) throw new Error(`${failures.length} Life Cycle UI checks failed: ${failures.join(', ')}`);
console.log('Life Cycle UI checks: PASS');
