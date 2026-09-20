import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 5210;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let ready = false;
server.stdout.on('data', chunk => { if (/ready in|Local:/.test(chunk.toString())) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
if (!ready) throw new Error('Isolated Vite server did not start');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const aiCalls = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/ai') {
      const body = request.postDataJSON();
      aiCalls.push({ capability: body.capability, voiceModel: body.voiceModel });
      const user = body.user ?? '';
      const eventId = user.match(/EVENTO APERTO:.*\[(life_[^\]]+)\]/)?.[1] ?? '';
      const text = user.includes('MESSAGGIO UTENTE:')
        ? JSON.stringify({ intent: 'narrative_action', eventId, worldId: user.match(/WORLD: .+ \[([^\]]+)\]/)?.[1] ?? '', playerActionQuote: 'mi avvicino', observedConsequence: 'Il riflesso si ferma sulla pietra.', signal: 'initiative' })
        : JSON.stringify({ worldId: user.match(/WORLD ID: ([^\n.]+)/)?.[1] ?? '', eventType: 'osservazione', observedFact: 'Un riflesso appare fra due pietre.', openingLine: 'Hai visto il riflesso?', worldRelevance: 'fra le pietre della spiaggia', openThreadRefs: [], memoryRefsUsed: [], possibleMonReaction: 'si ferma a guardare', scale: 'small', novelty: 'non ancora osservato', continuityNotes: 'nessuna contraddizione' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text, model: 'qwen2.5:14b', provider: 'ollama' }) });
      return;
    }
    if (path === '/api/narrative-material') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ material: [] }) });
    if (path === '/api/state') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(request.method() === 'GET' ? { day: 0, state: null, savedAt: null, revision: null } : { ok: true, revision: 'synthetic' }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.proto-sheet', { timeout: 10000 });
  await page.evaluate(async () => {
    const { testMon } = await import('/src/lab/rooms/testMon.ts');
    const { useApp } = await import('/src/state/store.ts');
    const { seedWorld, emptyLedger } = await import('/src/engine/world.ts');
    const base = await testMon();
    const world = seedWorld(base, 1);
    const record = { ...base, worldId: world.id, transition: { kind: 'BABY', parentNodeIds: [] }, firstEncounter: { status: 'completato', choice: 'esplorare_nul', day: 1 } };
    useApp.setState({ phase: 'live', token: 'synthetic-life-token', mons: { [record.data.name]: record }, activeMonName: record.data.name,
      world, ledger: emptyLedger(), eggs: [], firstSync: null });
  });
  await page.getByText('Hai visto il riflesso?', { exact: true }).waitFor({ timeout: 15000 });
  const opened = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    const state = useApp.getState();
    return { event: state.ledger.lifeEvent, canon: state.world?.canon };
  });
  if (opened.event?.status !== 'open' || opened.canon?.at(-1)?.kind !== 'life-event') throw new Error('Generated event not canonically opened');
  const beforeRequest = aiCalls.length;
  const ordinary = await page.evaluate(async () => (await import('/src/assistant-original/life-cycle-runtime.ts')).processLifeTurn('message-time', 'che ore sono?', undefined, false));
  if (ordinary !== null || aiCalls.length !== beforeRequest) throw new Error('Ordinary assistant request invoked Life Cycle classification');
  const reacted = await page.evaluate(async () => (await import('/src/assistant-original/life-cycle-runtime.ts')).processLifeTurn('message-action', 'mi avvicino', undefined, false));
  if (reacted?.intent !== 'narrative_action') throw new Error('Narrative action did not resolve');
  const resolved = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    const state = useApp.getState();
    return { event: state.ledger.lifeEvent, signal: state.ledger.lifeSignals?.at(-1), canon: state.world?.canon };
  });
  if (resolved.event?.status !== 'resolved' || resolved.signal?.eventId !== resolved.event.id || resolved.canon?.at(-1)?.kind !== 'life-consequence') throw new Error('Consequence or life signal missing');
  if (!aiCalls.every(call => call.capability === 'text-cheap' && call.voiceModel === 'local-cheap-round')) throw new Error('Life Cycle did not use local first routing');
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  const afterReload = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    const state = useApp.getState();
    return { event: state.ledger.lifeEvent, count: state.world?.canon.filter(c => c.kind === 'life-event' || c.kind === 'life-consequence').length };
  });
  if (afterReload.event?.status !== 'resolved' || afterReload.count !== 2) throw new Error('Reload lost or duplicated Life Cycle state');
  await context.close();
  console.log('Life Cycle isolated runtime: PASS (generation, chat, action, consequence, signal, reload, local route)');
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}
