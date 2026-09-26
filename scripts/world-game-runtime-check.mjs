import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 5211;
const server = spawn('npx', ['vite', '--configLoader', 'runner', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let ready = false;
let serverError = '';
server.stdout.on('data', chunk => { if (/ready in|Local:/.test(chunk.toString())) ready = true; });
server.stderr.on('data', chunk => { serverError += chunk.toString(); });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
if (!ready) throw new Error(`Vite did not start: ${serverError}`);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let aiCalls = 0;
  let emptyVoiceJob = false;
  const chatData = new Map();
  const chatRevisions = new Map();
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname === '/api/user-data') {
      const key = url.searchParams.get('key');
      if (request.method() === 'PUT') {
        chatData.set(key, request.postData());
        chatRevisions.set(key, crypto.randomUUID());
      } else if (request.method() === 'DELETE') {
        chatData.delete(key);
        chatRevisions.set(key, crypto.randomUUID());
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: chatData.get(key) ?? null, etag: chatRevisions.get(key) ?? null }) });
    }
    if (pathname === '/api/core-context') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ context: { monName: 'VYOKAZ' }, systemPrompt: 'Synthetic Vinz.World context.' }) });
    if (pathname === '/api/ingest') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ days: [] }) });
    if (pathname === '/api/projects') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) });
    if (pathname === '/api/ai') {
      aiCalls += 1;
      const body = request.postDataJSON();
      const user = String(body.user ?? '').toLowerCase();
      const action = user.includes('osservo') ? 'observe' : user.includes('parlo') ? 'talk' : user.includes('attacco') ? 'attack' : 'none';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: JSON.stringify({ action }), model: 'fixture' }) });
    }
    if (pathname === '/api/ai-chat-background') return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    if (pathname === '/api/ai-chat-job') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyVoiceJob
      ? { status: 'error', error: 'completamento vuoto (finish_reason: stop)', model: 'fixture' }
      : { status: 'done', text: 'Sono qui con te.', model: 'fixture' }) });
    if (pathname === '/api/state') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(request.method() === 'GET' ? { day: 0, state: null, savedAt: null, revision: null } : { ok: true, revision: 'fixture' }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.proto-sheet');
  await page.evaluate(async () => {
    const { testMon } = await import('/src/lab/rooms/testMon.ts');
    const { useApp } = await import('/src/state/store.ts');
    const { seedWorld, emptyLedger } = await import('/src/engine/world.ts');
    const { startWorldQuest } = await import('/src/engine/worldGame.ts');
    const mon = await testMon();
    const world = seedWorld(mon, 1);
    const record = { ...mon, worldId: world.id, firstEncounter: { status: 'completato', day: 1 } };
    const health = useApp.getState().health;
    useApp.setState({ phase: 'live', token: 'fixture', day: 1, world, ledger: { ...emptyLedger(), quest: startWorldQuest('TUNE', world, record, health, 1), lifeEvent: { id: 'old-event', worldId: world.id, monNodeId: record.data.mindline_node, day: 1, status: 'open', eventType: 'trace', observedFact: 'VECCHIO EVENTO DA NON MOSTRARE', openingLine: 'Una scena precedente.', possibleMonReaction: '', openThreadRefs: [], memoryRefsUsed: [] } },
      mons: { [record.data.name]: record }, activeMonName: record.data.name, eggs: [], firstSync: null });
  });
  await page.waitForSelector('.vinz-composer');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vinz-select-project', { detail: { id: 'vinzmon-world', title: 'Vinz.World' } })));
  await page.getByText(/Veilborn della soglia/).first().waitFor({ timeout: 15000 });
  const eventBar = page.locator('.vinz-world-event-bar');
  await eventBar.getByText('TUNE · INDAGINE').waitFor();
  if (!(await eventBar.innerText()).includes('INDIZI 0/2 · OSSERVA / PARLA / SPOSTATI') || await page.locator('.vinz-context-bar').count()) throw new Error('World event bar did not show the action hint');
  await page.screenshot({ path: '/tmp/vinzmon-quest-intro-mobile.png' });
  await sleep(1500);
  if (await page.getByText(/Sulla spiaggia di NUL, un abitante/).count() !== 1) throw new Error('Quest opening appeared more than once');
  if (await page.getByText('VECCHIO EVENTO DA NON MOSTRARE').count()) throw new Error('Old daily event overlapped the quest opening');
  const eventGate = await page.evaluate(async () => (await import('/src/assistant-original/life-cycle-runtime.ts')).startLifeEventIfDue());
  if (eventGate.status !== 'ineligible' || eventGate.code !== 'quest-active') throw new Error('Daily event could open during a quest');
  const turn = (id, text, project = 'vinzmon-world') => page.evaluate(async ({ id, text, project }) => {
    const { processLifeTurn } = await import('/src/assistant-original/life-cycle-runtime.ts');
    const { useApp } = await import('/src/state/store.ts');
    const response = await processLifeTurn(id, text, project, false);
    const quest = useApp.getState().ledger.quest;
    return { response, status: quest.status, clues: quest.clues.length, turn: quest.turn, hp: quest.monHp, foeHp: quest.foe.hp, eventStatus: useApp.getState().ledger.lifeEvent?.status };
  }, { id, text, project });
  const general = await turn('general', 'attacco il Veilborn', null);
  if (general.response !== null || general.turn !== 0) throw new Error('General advanced World quest');
  const first = await turn('observe', 'Osservo i contorni del Veilborn');
  if (first.status !== 'investigate' || first.clues !== 1 || first.eventStatus !== 'abandoned' || aiCalls !== 0) throw new Error('Explicit observation did not advance immediately or suspend the old event');
  await eventBar.getByText('INDIZI 1/2').waitFor();
  const second = await turn('talk', 'Parlo con l’abitante e ascolto cosa è successo');
  if (second.status !== 'combat' || second.clues !== 2) throw new Error('Dialogue did not open combat');
  await eventBar.getByText('TUNE · SCONTRO').waitFor();
  await page.locator('.vinz-combat-moves').getByRole('button', { name: /Colpo potente/ }).waitFor();
  const combatBar = await eventBar.innerText();
  if (!combatBar.includes('8/8 HP') || !combatBar.includes('6/6 HP')) throw new Error('Combat bar did not show both HP pools');
  await page.screenshot({ path: '/tmp/vinzmon-eventbar-mobile.png' });
  const duplicate = await turn('talk', 'Parlo con l’abitante e ascolto cosa è successo');
  if (duplicate.turn !== second.turn) throw new Error('Duplicate message advanced quest');
  const attack = await turn('attack', 'Attacco il Veilborn');
  if (attack.turn !== second.turn + 1 || !attack.response?.questFrame?.before || aiCalls !== 0) throw new Error('Combat did not resolve locally through the game engine');
  if (!(await eventBar.innerText()).includes(`${attack.foeHp}/6 HP`)) throw new Error('Combat bar did not refresh enemy HP');
  if (!attack.response.questFrame.after || /Scrivi prima una breve frase del narratore/.test(attack.response.prompt)) throw new Error('Quest prompt still requested duplicate narration');
  const sameAttack = await turn('attack', 'Attacco il Veilborn');
  if (sameAttack.turn !== attack.turn || sameAttack.response?.questFrame?.before !== attack.response.questFrame.before) throw new Error('Retry of the same chat message lost the resolved combat outcome');
  emptyVoiceJob = true;
  const emptyVoice = await page.evaluate(async () => {
    const { createNetlifyChatModel } = await import('/src/assistant-original/netlify-runtime.ts');
    const { useApp } = await import('/src/state/store.ts');
    const turnBefore = useApp.getState().ledger.quest.turn;
    const model = createNetlifyChatModel();
    let final;
    for await (const snapshot of model.run({
      messages: [{ id: 'attack', role: 'user', createdAt: new Date(), content: [{ type: 'text', text: 'Attacco il Veilborn' }], metadata: { custom: {} } }],
      abortSignal: new AbortController().signal,
      context: { config: { modelName: 'fixture' } },
      runConfig: { custom: { projectId: 'vinzmon-world' } },
    })) final = snapshot;
    return { text: final?.content?.filter(part => part.type === 'text').map(part => part.text).join(''), turnBefore, turnAfter: useApp.getState().ledger.quest.turn };
  });
  emptyVoiceJob = false;
  if (!emptyVoice.text.includes(attack.response.questFrame.before) || !emptyVoice.text.includes('Sono pronto alla prossima mossa')
    || !emptyVoice.text.includes(attack.response.questFrame.after) || emptyVoice.turnAfter !== emptyVoice.turnBefore) throw new Error('Empty AI completion hid the resolved scene or rerolled combat');
  const moves = page.locator('.vinz-combat-moves button');
  if (await moves.count() !== 4 || !(await page.locator('.vinz-combat-moves').innerText()).includes('IL MON')) throw new Error('Four Mon combat suggestions missing');
  await page.screenshot({ path: '/tmp/vinzmon-combat-moves-mobile.png' });
  const input = page.locator('.vinz-composer-input');
  await input.fill('Mi sposto dietro le rocce');
  if (!(await moves.first().isDisabled()) || await input.inputValue() !== 'Mi sposto dietro le rocce') throw new Error('Free-form move draft was not preserved');
  await input.fill('');
  const findSavedUser = fragment => {
    for (const [key, value] of chatData) {
      if (!key.includes(':messages:')) continue;
      const messages = JSON.parse(value).messages;
      const message = messages.map(item => item.message).find(item => item.role === 'user' && item.content?.[0]?.text?.includes(fragment));
      if (message) return { id: message.id, text: message.content[0].text };
    }
    return null;
  };
  const waitForSavedUser = async fragment => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const message = findSavedUser(fragment);
      if (message) return message;
      await sleep(100);
    }
    throw new Error(`Chat did not persist the chosen move: ${fragment}`);
  };
  await page.locator('.vinz-combat-moves').getByRole('button', { name: /Attacca/ }).click();
  const suggested = await waitForSavedUser('Attacco il Veilborn');
  const clicked = await turn(suggested.id, suggested.text);
  if (clicked.turn !== attack.turn + 1 || clicked.foeHp > attack.foeHp) throw new Error('Suggested attack did not reach the existing game action');
  await page.waitForFunction(() => !document.querySelector('.vinz-composer-input')?.disabled, { timeout: 20000 });
  const customText = 'Mi sposto dietro le rocce per aggirare il Veilborn.';
  await input.fill(customText);
  await page.locator('.vinz-clone-composer__send').click();
  const custom = await waitForSavedUser(customText);
  const invented = await turn(custom.id, custom.text);
  if (invented.turn !== clicked.turn + 1) throw new Error('Free-form move did not reach the existing game action');
  await page.reload({ waitUntil: 'networkidle' });
  const persisted = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    return useApp.getState().ledger.quest;
  });
  if (persisted?.turn !== invented.turn || persisted.foe.hp !== invented.foeHp) throw new Error('Quest state was lost on reload');
  const failed = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    const quest = useApp.getState().ledger.quest;
    useApp.setState(state => ({
      syncWallet: { earnedDates: ['2026-09-20', '2026-09-21'], spent: 0 },
      ledger: { ...state.ledger, quest: { ...quest, status: 'failed', monHp: 0 } },
    }));
    return { id: quest.id, attempt: quest.attempt };
  });
  await eventBar.getByText('TUNE · TENTATIVO FALLITO').waitFor();
  await page.screenshot({ path: '/tmp/vinzmon-retry-mobile.png' });
  const retryButton = eventBar.getByRole('button', { name: 'RIPROVA TUNE · 2 SYNC' });
  await retryButton.click();
  const confirmRetry = page.locator('.sync-wish__submit');
  await confirmRetry.waitFor({ state: 'visible' });
  if (!(await confirmRetry.innerText()).includes('RIPROVA TUNE · 2 SYNC')) throw new Error('Retry did not open the existing cost confirmation');
  await confirmRetry.click();
  const retried = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    const { syncBalance } = await import('/src/engine/syncRewards.ts');
    return { quest: useApp.getState().ledger.quest, balance: syncBalance() };
  });
  if (retried.quest.id !== failed.id || retried.quest.attempt !== failed.attempt + 1 || retried.quest.status !== 'investigate'
    || retried.quest.monHp !== retried.quest.maxMonHp || retried.quest.foe.hp !== retried.quest.foe.maxHp || retried.balance !== 0) throw new Error('Retry did not reset the quest and charge exactly 2 SYNC');
  await eventBar.getByText('TUNE · INDAGINE').waitFor();
  const tuneSetup = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    const state = useApp.getState();
    const previous = state.mons[state.activeMonName];
    const candidateName = 'AUTO_TUNE';
    const candidate = { ...previous, data: { ...previous.data, name: candidateName, mindline_node: 'node_auto_tune' } };
    useApp.setState({
      mons: { ...state.mons, [candidateName]: candidate },
      ledger: { ...state.ledger, quest: { ...state.ledger.quest, status: 'complete', foe: { ...state.ledger.quest.foe, hp: 0 },
        lastMessageId: 'winning-message', lastOutcome: '*Il Veilborn non blocca più la strada.*', completionReplyPending: true } },
      evolutionJob: { kind: 'evolution', status: 'ready', previousName: state.activeMonName, candidateName,
        done: 1, total: 1, label: 'NUOVO MON PRONTO', error: null, serverJobId: 'fixture-ready' },
    });
    return { forms: state.formsDiscovered };
  });
  await sleep(200);
  const beforeReply = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    return { phase: useApp.getState().phase, pending: useApp.getState().ledger.quest.completionReplyPending };
  });
  if (beforeReply.phase !== 'live' || !beforeReply.pending) throw new Error('Evolution opened before the winning reply was delivered');
  await page.evaluate(async () => {
    const { createNetlifyChatModel } = await import('/src/assistant-original/netlify-runtime.ts');
    const model = createNetlifyChatModel();
    for await (const _snapshot of model.run({
      messages: [{ id: 'winning-message', role: 'user', createdAt: new Date(), content: [{ type: 'text', text: 'Attacco il Veilborn' }], metadata: { custom: {} } }],
      abortSignal: new AbortController().signal, context: { config: { modelName: 'fixture' } },
      runConfig: { custom: { projectId: 'vinzmon-world' } },
    })) { /* consume the winning reply */ }
  });
  await page.waitForFunction(async () => (await import('/src/state/store.ts')).useApp.getState().phase === 'new-encounter', { timeout: 10000 });
  const tuneRevealed = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    const { syncBalance } = await import('/src/engine/syncRewards.ts');
    const state = useApp.getState();
    return { name: state.activeMonName, forms: state.formsDiscovered, quest: state.ledger.quest, balance: syncBalance() };
  });
  if (tuneRevealed.name !== 'AUTO_TUNE' || tuneRevealed.forms !== tuneSetup.forms + 1
    || tuneRevealed.quest.status !== 'complete' || tuneRevealed.balance !== 0) throw new Error('TUNE did not reveal the prepared form once without another SYNC charge');

  const riseSetup = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    const { startWorldQuest } = await import('/src/engine/worldGame.ts');
    const { riseWorld } = await import('/src/engine/world.ts');
    useApp.getState().enterLive();
    const state = useApp.getState();
    const previous = state.mons[state.activeMonName];
    const candidateName = 'AUTO_RISE';
    const candidate = { ...previous, data: { ...previous.data, name: candidateName, mindline_node: 'node_auto_rise' } };
    const quest = startWorldQuest('RISE', state.world, previous, state.health, state.day);
    useApp.setState({
      mons: { ...state.mons, [candidateName]: candidate },
      ledger: { ...state.ledger, quest: { ...quest, status: 'complete', foe: { ...quest.foe, hp: 0 }, lastMessageId: 'old-winning-message',
        lastOutcome: '*Il Nucleo del Velo cede.*' } },
      evolutionJob: { kind: 'mega-evolution', status: 'ready', previousName: state.activeMonName, candidateName,
        done: 1, total: 1, label: 'NUOVO MON PRONTO', error: null, serverJobId: 'fixture-rise',
        pendingWorld: riseWorld(state.world, candidate, state.day) },
    });
    return { previousWorldId: state.world.id, history: state.worldHistory.length, forms: state.formsDiscovered };
  });
  await page.waitForFunction(async () => (await import('/src/state/store.ts')).useApp.getState().phase === 'new-encounter', { timeout: 10000 });
  const riseRevealed = await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    const state = useApp.getState();
    return { name: state.activeMonName, worldId: state.world.id, history: state.worldHistory.length, forms: state.formsDiscovered };
  });
  if (riseRevealed.name !== 'AUTO_RISE' || riseRevealed.worldId === riseSetup.previousWorldId
    || riseRevealed.history !== riseSetup.history + 1 || riseRevealed.forms !== riseSetup.forms + 1) throw new Error('RISE did not reveal the mega-evolution and open the next World');
  await page.close();
  console.log('World game browser runtime: PASS (event status and HP, suggested combat moves, retry with SYNC, event isolation, fast turn, combat, reload)');
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
}
