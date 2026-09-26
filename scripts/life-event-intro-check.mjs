import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 5211;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let ready = false;
server.stdout.on('data', chunk => { if (/ready in|Local:/.test(chunk.toString())) ready = true; });
server.stderr.on('data', () => {});
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
if (!ready) throw new Error('Isolated Vite server did not start');

const browser = await chromium.launch();
try {
  for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }]) {
    const context = await browser.newContext({ viewport });
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
      const record = { ...base, worldId: world.id, firstEncounter: { status: 'completato', choice: 'esplorare_nul', day: 1 } };
      const id = `life_${world.id}_${world.canon.length}`;
      useApp.setState({ phase: 'live', token: null, mons: { [record.data.name]: record }, activeMonName: record.data.name,
        world: withCanon(world, { id, day: 1, kind: 'life-event', epistemic: 'WORLD_CANON', text: 'Una porta compare fra le rocce.', monName: record.data.name }),
        ledger: { ...emptyLedger(), lifeEvent: { id, worldId: world.id, monNodeId: record.data.mindline_node, day: 1, status: 'open',
          eventType: 'scoperta', observedFact: 'Una porta compare fra le rocce.', openingLine: 'La apriamo insieme?',
          possibleMonReaction: 'si avvicina', openThreadRefs: [], memoryRefsUsed: [] } },
        eggs: [], firstSync: null });
    });

    await page.waitForSelector('.vinz-composer', { timeout: 10000 });

    const dialog = page.locator('.machine-insight-balloon[aria-labelledby="life-event-intro-title"]');
    await dialog.waitFor({ timeout: 10000 });
    if (await dialog.getByText('Una porta compare fra le rocce.').count() !== 1) throw new Error(`${viewport.name}: narrator fact missing`);
    if (await dialog.locator('.machine-insight-balloon__world').count() !== 1 || await dialog.locator('.machine-insight-balloon__mon').count()) throw new Error(`${viewport.name}: wrong first visual`);
    await page.screenshot({ path: `/private/tmp/vinz-world-intro-narrator-${viewport.name}.png` });
    await dialog.getByRole('button', { name: 'AVANTI' }).click();
    if (await dialog.getByText('La apriamo insieme?').count() !== 1) throw new Error(`${viewport.name}: Mon line missing`);
    if (await dialog.locator('.machine-insight-balloon__mon').count() !== 1 || await dialog.locator('.machine-insight-balloon__world').count()) throw new Error(`${viewport.name}: wrong second visual`);
    await page.screenshot({ path: `/private/tmp/vinz-world-intro-mon-${viewport.name}.png` });
    await dialog.getByRole('button', { name: 'ENTRA IN VINZ.WORLD' }).click();
    await page.getByRole('button', { name: 'Progetto attuale: Vinz.World' }).waitFor({ timeout: 10000 });
    await page.getByText('La apriamo insieme?', { exact: true }).last().waitFor({ timeout: 10000 });
    if (await dialog.count()) throw new Error(`${viewport.name}: intro remained open`);
    await page.goto(`http://localhost:${port}/?lifeEvent=life_world_NUL_1`, { waitUntil: 'networkidle' });
    await dialog.waitFor({ timeout: 10000 });
    if (await dialog.getByText('Una porta compare fra le rocce.').count() !== 1) throw new Error(`${viewport.name}: notification link did not reopen event intro`);
    if (errors.length) throw new Error(`${viewport.name}: ${errors.join('; ')}`);
    console.log(`PASS ${viewport.name}: narrator -> Mon -> Vinz.World chat, notification link, no page errors`);
    await context.close();
  }
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}
