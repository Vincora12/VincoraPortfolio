// Local fixture-only UI check. No user account, personal records or external writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.HEALTH_TEST_BASE ?? 'http://127.0.0.1:5181';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const rows = new Map();
await page.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  let body = {};
  if (path === '/api/user-data') body = { value: null };
  if (path === '/api/me-memory') body = { memories: [{ id: 'test-memory', text: 'Fixture prefers cycling', metadata: { source: 'chat' } }] };
  if (path === '/api/calendar') {
    if (request.method() === 'GET') body = { events: [...rows.values()] };
    else { const input = request.postDataJSON(); const row = { event: { ...input.event, id: input.id, source: 'vinzmon', updatedAt: new Date().toISOString() }, version: String(Date.now()) }; rows.set(input.id, row); body = row; }
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
try {
  await page.goto(base);
  assert.equal(new URL(page.url()).origin, new URL(base).origin);
  assert.ok(await page.title(), 'page title present');
  await page.evaluate(async () => {
    await import('/src/appStyles.ts');
    const { useApp } = await import('/src/state/store.ts');
    const date = new Date();
    useApp.setState({ day: 1, startedAt: date.toISOString() });
    const { addMeal, addWorkout } = await import('/src/engine/healthJournal.ts');
    addMeal({ slot: 'pranzo', description: 'UI fixture meal', kcal: 900, protein: 40, carbs: 100, fat: 20 }, 'manual', date);
    addWorkout({ title: 'UI fixture workout', details: '', minutes: 45, burnedKcal: 300 }, 'manual', date);
    // Render the real ME component in isolation; main-chat lifecycle is tested separately.
    const { default: { createElement } } = await import('/node_modules/.vite/deps/react.js');
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { MeOverviewScreen } = await import('/src/screens/MeOverview.tsx');
    document.querySelector('#root').style.display = 'none';
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;background:black;color:white;';
    document.body.append(host); createRoot(host).render(createElement(MeOverviewScreen, { onGo() {} }));
  });
  await page.getByRole('button', { name: 'OGGI', exact: true }).click();
  await page.getByText('RECORDED NET', { exact: true }).waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.match(await page.locator('.me-daily-energy').innerText(), /600/);
  await page.screenshot({ path: '/tmp/vinz-health-today-mobile.png' });
  await page.getByRole('button', { name: 'CALENDARIO', exact: true }).click();
  console.log('Calendar computed colors:', await page.evaluate(() => ({
    chevron: getComputedStyle(document.querySelector('.rdp-chevron')).fill,
    selected: getComputedStyle(document.querySelector('.me-calendar__selected .rdp-day_button')).color,
    selectedBorder: getComputedStyle(document.querySelector('.me-calendar__selected .rdp-day_button')).borderColor,
  })));
  await page.getByRole('button', { name: '+ EVENTO', exact: true }).click();
  await page.getByLabel('TITOLO', { exact: true }).fill('UI fixture appointment');
  await page.getByRole('button', { name: 'SALVA EVENTO', exact: true }).click();
  await page.getByText('UI fixture appointment', { exact: true }).waitFor();
  await page.getByText('UI fixture appointment', { exact: true }).click();
  await page.getByLabel('TITOLO', { exact: true }).fill('UI fixture updated');
  await page.getByRole('button', { name: 'SALVA EVENTO', exact: true }).click();
  await page.getByText('UI fixture updated', { exact: true }).waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Annulla UI fixture updated', exact: true }).click();
  await page.getByText(/ANNULLATO/).waitFor();
  assert.equal(rows.size, 1, 'one canonical event updated, not duplicate');
  assert.equal([...rows.values()][0].event.status, 'cancelled');
  assert.match(await page.locator('.me-daily-energy').innerText(), /600/, 'planned event must not alter completed journal');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no mobile horizontal overflow');
  await page.screenshot({ path: '/tmp/vinz-health-calendar-mobile.png' });
  await page.getByRole('button', { name: 'MEMORY', exact: true }).click();
  await page.getByRole('searchbox').fill('cycling');
  await page.getByText('Fixture prefers cycling', { exact: true }).first().waitFor();
  await page.getByRole('searchbox').fill('no-match');
  await page.getByText('Nessun risultato per questa ricerca.', { exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'OGGI', exact: true }).click();
  await page.screenshot({ path: '/tmp/vinz-health-today-desktop.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: mobile/desktop energy, planned create/edit/cancel, no health mutation, one event, memory search, no page errors/overflow. Screenshots /tmp/vinz-health-*.png.');
} finally { await browser.close(); }
