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
  const lifeSystemPrompts = [];
  const chatSystemPrompts = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/ai') {
      const body = request.postDataJSON();
      aiCalls.push({ capability: body.capability, voiceModel: body.voiceModel });
      const system = (body.system ?? []).map(block => block.text ?? '').join('\n');
      lifeSystemPrompts.push(system);
      if (system.includes('{"before":"...","after":"..."}')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: JSON.stringify({ before: 'Il riflesso vibra fra le pietre.', after: 'Il Mon resta immobile accanto al bagliore.' }), model: 'qwen2.5:14b', provider: 'ollama' }) });
      }
      const user = body.user ?? '';
      const eventId = user.match(/EVENTO APERTO:.*\[(life_[^\]]+)\]/)?.[1] ?? '';
      const text = user.includes('MESSAGGIO UTENTE:')
        ? JSON.stringify({ intent: 'narrative_action', eventId, worldId: user.match(/WORLD: .+ \[([^\]]+)\]/)?.[1] ?? '', playerActionQuote: 'mi avvicino', observedConsequence: 'Il riflesso si ferma sulla pietra.', signal: 'initiative' })
        : JSON.stringify({ worldId: user.match(/WORLD ID: ([^\n.]+)/)?.[1] ?? '', eventType: 'osservazione', observedFact: 'Un riflesso appare fra due pietre.', openingLine: 'Hai visto il riflesso?', worldRelevance: 'fra le pietre della spiaggia', openThreadRefs: [], memoryRefsUsed: [], possibleMonReaction: 'si ferma a guardare', scale: 'small', novelty: 'non ancora osservato', continuityNotes: 'nessuna contraddizione' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text, model: 'qwen2.5:14b', provider: 'ollama' }) });
      return;
    }
    if (path === '/api/narrative-material') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ material: [] }) });
    if (path === '/api/ai-chat-background') {
      const body = request.postDataJSON();
      chatSystemPrompts.push((body.system ?? []).map(block => block.text ?? '').join('\n'));
      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (path === '/api/ai-chat-job') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'done', text: 'Guardiamole insieme.', model: 'qwen2.5:14b' }) });
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
  await page.waitForSelector('.vinz-composer', { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vinz-select-project', { detail: { id: 'vinzmon-world', title: 'Vinz.World' } })));
  await page.getByText('Hai visto il riflesso?', { exact: true }).waitFor({ timeout: 15000 });
  const opened = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    const state = useApp.getState();
    return { event: state.ledger.lifeEvent, canon: state.world?.canon };
  });
  if (opened.event?.status !== 'open' || opened.canon?.at(-1)?.kind !== 'life-event') throw new Error('Generated event not canonically opened');
  if (!lifeSystemPrompts.some(prompt => prompt.includes('CAUSALITÀ DI SCENA') && prompt.includes('PRESSIONE DRAMMATICA'))) throw new Error('Scene craft rules missing from Life Event generation');
  const beforeRequest = aiCalls.length;
  const ordinary = await page.evaluate(async () => (await import('/src/assistant-original/life-cycle-runtime.ts')).processLifeTurn('message-time', 'che ore sono?', 'vinzmon-world', false));
  if (ordinary !== null || aiCalls.length !== beforeRequest) throw new Error('Ordinary assistant request invoked Life Cycle classification');
  await page.fill('.vinz-composer-input', 'E cosa sono?');
  await page.press('.vinz-composer-input', 'Enter');
  await page.getByText('Guardiamole insieme.', { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText('Il riflesso vibra fra le pietre.', { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText('Il Mon resta immobile accanto al bagliore.', { exact: true }).waitFor({ timeout: 10000 });
  if (await page.getByText(/Narratore\s*[—–-]/).count()) throw new Error('Visible narrator label was not removed');
  if (!chatSystemPrompts.at(-1)?.includes('Un riflesso appare fra due pietre.')) throw new Error('Open Life Cycle event missing from World reply context');
  if (!chatSystemPrompts.at(-1)?.includes('REGIA DI SCENA IN VINZ.WORLD')) throw new Error('World scene direction missing from Mon reply context');
  const afterQuestion = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    return { status: useApp.getState().ledger.lifeEvent?.status, canonCount: useApp.getState().world?.canon.length };
  });
  if (afterQuestion.status !== 'open' || afterQuestion.canonCount !== opened.canon.length) throw new Error('Narrative question advanced the Life Cycle');
  const afterQuestionCalls = aiCalls.length;
  const general = await page.evaluate(async () => (await import('/src/assistant-original/life-cycle-runtime.ts')).processLifeTurn('message-general', 'mi avvicino', undefined, false));
  if (general !== null || aiCalls.length !== afterQuestionCalls) throw new Error('General chat invoked Life Cycle classification');
  const reacted = await page.evaluate(async () => (await import('/src/assistant-original/life-cycle-runtime.ts')).processLifeTurn('message-action', 'mi avvicino', 'vinzmon-world', false));
  if (reacted?.intent !== 'narrative_action') throw new Error('Narrative action did not resolve');
  if (!lifeSystemPrompts.some(prompt => prompt.includes('FAIL-FORWARD') && prompt.includes('Nessuna punizione arbitraria'))) throw new Error('Fail-forward rules missing from consequence generation');
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
  const timeout = await page.evaluate(async () => {
    const { runStep } = await import('/src/state/store.ts');
    const models = [];
    const answer = await runStep('narrator', async model => {
      models.push(model);
      if (model === 'local-cheap-round') await new Promise(resolve => setTimeout(resolve, 60));
      return model;
    }, () => ({ ok: true }), { localTimeoutMs: 5 });
    return { models, answer };
  });
  if (timeout.models[0] !== 'local-cheap-round' || timeout.models.length !== 2 || timeout.answer !== timeout.models[1]) throw new Error('Controlled local timeout did not use existing fallback');
  await context.close();

  const failedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const failedPage = await failedContext.newPage();
  const failedCalls = [];
  await failedPage.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/ai') {
      failedCalls.push(request.postDataJSON().voiceModel);
      return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'synthetic failure' }) });
    }
    if (path === '/api/narrative-material') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ material: [] }) });
    if (path === '/api/state') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ day: 0, state: null, savedAt: null, revision: null }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await failedPage.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' });
  await failedPage.waitForSelector('.proto-sheet', { timeout: 10000 });
  await failedPage.evaluate(async () => {
    const { testMon } = await import('/src/lab/rooms/testMon.ts');
    const { useApp } = await import('/src/state/store.ts');
    const { seedWorld, emptyLedger } = await import('/src/engine/world.ts');
    const base = await testMon();
    const world = seedWorld(base, 1);
    const record = { ...base, worldId: world.id, transition: { kind: 'BABY', parentNodeIds: [] }, firstEncounter: { status: 'completato', choice: 'esplorare_nul', day: 1 } };
    useApp.setState({ phase: 'live', token: 'synthetic-life-token', mons: { [record.data.name]: record }, activeMonName: record.data.name,
      world, ledger: emptyLedger(), eggs: [], firstSync: null });
  });
  await failedPage.waitForSelector('.vinz-composer', { timeout: 10000 });
  await failedPage.evaluate(() => window.dispatchEvent(new CustomEvent('vinz-select-project', { detail: { id: 'vinzmon-world', title: 'Vinz.World' } })));
  await failedPage.getByText('Life Cycle in attesa · backend-error').waitFor({ timeout: 15000 });
  const failedState = await failedPage.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    return { event: useApp.getState().ledger.lifeEvent, canonCount: useApp.getState().world?.canon.length };
  });
  if (failedState.event || failedCalls.length !== 2) throw new Error('Failed generation changed canon or retried beyond one local/cloud round');
  await failedContext.close();
  console.log('Life Cycle isolated runtime: PASS (generation, chat, action, consequence, reload, mobile failure feedback, bounded fallback, timeout)');
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}
