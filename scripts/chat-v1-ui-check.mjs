// Real assistant-ui runtime, synthetic network/records only. No production writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.CHAT_TEST_BASE ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const data = new Map(), revisions = new Map(), calls = [], errors = [];
const projects = [
  { id: 'project_A', title: 'Project A', revision: 1, updatedAt: '2026-09-06T00:00:00.000Z', artifactCount: 0, createdAt: '2026-09-06T00:00:00.000Z', instructions: '', context: '', artifacts: [] },
  { id: 'project_B', title: 'Project B', revision: 1, updatedAt: '2026-09-06T00:00:00.000Z', artifactCount: 0, createdAt: '2026-09-06T00:00:00.000Z', instructions: '', context: '', artifacts: [] },
];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.route(base + '/', (route) => route.fulfill({contentType: 'text/html', body: '<!doctype html><html><head><script type="module" src="/@vite/client"></script><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div></body></html>'}));
await page.route('**/api/**', async (route) => {
  const request = route.request(), url = new URL(request.url());
  let body = {};
  if (url.pathname === '/api/user-data') {
    const key = url.searchParams.get('key');
    if (['PUT', 'DELETE'].includes(request.method())) {
      const h = request.headers();
      if ((h['if-match'] && h['if-match'] !== revisions.get(key)) || (h['x-only-if-new'] && data.has(key))) { await route.fulfill({status:409, contentType:'application/json', body:JSON.stringify({value:data.get(key) ?? null, etag:revisions.get(key) ?? null})}); return; }
      if (request.method() === 'PUT') data.set(key, request.postData()); else data.delete(key);
      revisions.set(key, crypto.randomUUID());
    }
    body = { value: data.get(key) ?? null, etag: revisions.get(key) ?? null };
  }
  if (url.pathname === '/api/state') body = { day: 0, savedAt: null, state: null, revision: null };
  if (url.pathname === '/api/ingest') body = { days: [] };
  if (url.pathname === '/api/core-context') body = { context: { monName: null }, systemPrompt: 'Synthetic same VINZ.MON context.' };
  if (url.pathname === '/api/projects') {
    const project = projects.find((item) => item.id === url.searchParams.get('projectId'));
    body = project ? { project } : { projects: projects.map(({ createdAt, instructions, context, artifacts, ...summary }) => summary) };
  }
  if (url.pathname === '/api/ai') { const input = request.postDataJSON(); calls.push(input); body = { text: `Fixture response ${calls.length}`, model: 'fixture-model', costUsd: 0 }; }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
async function mount() {
  await page.goto(base);
  await page.evaluate(async () => {
    const { useApp } = await import('/src/state/store.ts');
    await import('/src/appStyles.ts');
    useApp.setState({ token: 'synthetic-test-token-at-least-24', activeMonName: null });
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { IntegratedChat } = await import('/src/assistant-original/IntegratedChat.tsx');
    document.querySelector('#root').style.display = 'none';
    const host = document.createElement('div'); host.id = 'chat-fixture'; host.style.cssText = 'position:fixed;inset:0;background:black;color:white;'; document.body.append(host);
    createRoot(host).render(React.createElement(React.StrictMode, null, React.createElement(IntegratedChat, { runTool: (use) => ({ id: use.id, content: 'fixture local tool' }) })));
  });
  await page.locator('#chat-fixture textarea').waitFor();
}
const threads = () => JSON.parse(data.get('assistant-ui-official-chatgpt:threads') ?? '[]');
try {
  await mount();
  const chatTabTypography = await page.locator('.vinz-conversation-tabs > button:not(.vinz-conversation-new)').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
    };
  });
  const meTabTypography = await page.evaluate(() => {
    const nav = document.createElement('nav');
    nav.className = 'me-health__tabs';
    const button = document.createElement('button');
    button.textContent = 'OGGI';
    nav.append(button);
    document.body.append(nav);
    const style = getComputedStyle(button);
    const result = {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
    };
    nav.remove();
    return result;
  });
  assert.deepEqual(chatTabTypography, meTabTypography, 'Chat tabs use the exact computed typography of ME tabs');
  assert.equal(threads().length, 0, 'cold load has no empty persisted thread');
  const cdp = await page.context().newCDPSession(page);
  const touch = async (from, to) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x, y: to.y }] });
  };
  const touchEnd = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch({ x: 180, y: 20 }, { x: 260, y: 22 });
  await touchEnd();
  assert.equal(await page.locator('.vinz-thread-drawer').count(), 0, 'horizontal tab swipe never opens the drawer');
  await touch({ x: 20, y: 300 }, { x: 100, y: 302 });
  await page.locator('.vinz-thread-drawer').waitFor({ timeout: 2000 });
  assert.match(await page.locator('.vinz-thread-drawer').getAttribute('style') ?? '', /80px/, 'drawer follows the drag distance');
  await touchEnd();
  await page.locator('.vinz-thread-drawer').waitFor({ state: 'detached' });
  await touch({ x: 20, y: 300 }, { x: 210, y: 302 });
  await touchEnd();
  await page.locator('.vinz-thread-drawer').waitFor();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.vinz-chat-gesture-surface').getAttribute('data-drawer-open'), 'true', 'release past threshold keeps drawer open');
  await page.locator('[data-slot="sheet-close"]').click({ timeout: 2000 });
  const input = page.locator('#chat-fixture textarea');
  await input.fill('IME fixture');
  await input.dispatchEvent('keydown', {key:'Enter', code:'Enter', isComposing:true, bubbles:true});
  assert.equal(calls.length, 0, 'IME composition Enter must not send');
  await input.fill('First fixture');
  await input.press('Shift+Enter');
  assert.equal(calls.length, 0, 'Shift Enter is newline');
  await input.press('Enter');
  await page.getByText('Fixture response 1', { exact: true }).waitFor({ timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.vinz-clone-composer__cancel'));
  assert.equal(await page.locator('.vinz-user-message').filter({ hasText: 'First fixture' }).count(), 1);
  assert.equal(await page.getByText(/Costo risposta|Personalità:/i).count(), 0, 'cost and personality stay out of the normal message footer');
  assert.equal(await page.getByLabel('Apri progetti').count(), 0, 'no visible or hidden hamburger trigger remains');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'chat does not create page-level horizontal overflow');
  await page.getByLabel('More').click();
  assert.equal(await page.getByText(/^Costo chat /).count(), 1, 'cumulative cost is available only in the message menu');
  await page.getByText('NERD TERMINAL', { exact: true }).click();
  await page.getByRole('dialog', { name: 'Nerd Terminal' }).waitFor();
  assert.equal(await page.getByRole('dialog', { name: 'Nerd Terminal' }).getByText('Costo risposta', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('dialog', { name: 'Nerd Terminal' }).getByText('Personalità', { exact: true }).count(), 1);
  await page.getByLabel('Chiudi Nerd Terminal').click();
  await page.waitForTimeout(400);
  assert.equal(threads().length, 1);
  const id = threads()[0].remoteId;
  const repo = JSON.parse(data.get(`assistant-ui-official-chatgpt:messages:${id}`));
  assert.deepEqual(repo.messages.map((item) => item.message.role), ['user', 'assistant']);
  assert.equal(calls.length, 1, 'first submit invokes model once');
  await page.screenshot({ path: '/tmp/vinz-chat-v1-mobile.png' });
  await page.evaluate(() => { document.querySelector('#chat-fixture').style.visibility = 'hidden'; });
  await page.evaluate(() => { document.querySelector('#chat-fixture').style.visibility = 'visible'; });
  assert.equal(await page.locator('.vinz-user-message').count(), 1, 'hidden navigation preserves mounted runtime');
  await page.locator('.vinz-conversation-new').click();
  await page.waitForTimeout(200);
  assert.equal(threads().length, 1, 'New Chat does not persist empty');
  // Every browser chat-cache write fails, but canonical persistence still works.
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('assistant-ui-official-chatgpt:')) throw new DOMException('Fixture quota', 'QuotaExceededError'); return original.call(this, key, value); }; });
  await page.locator('#chat-fixture textarea').fill('Second fixture');
  await page.locator('.vinz-clone-composer__send').click();
  await page.getByText('Fixture response 2', { exact: true }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  assert.equal(threads().length, 2);
  assert.equal(await page.locator('.vinz-user-message').filter({ hasText: 'Second fixture' }).count(), 1);
  await mount();
  assert.equal(threads().length, 2, 'reload retains history and starts ephemeral');
  assert.equal(await page.locator('.vinz-user-message').count(), 0);
  await page.getByRole('button', { name: 'First fixture', exact: true }).click();
  await page.getByText('Fixture response 1', { exact: true }).waitFor();
  assert.equal(await page.locator('.vinz-user-message').filter({ hasText: 'First fixture' }).count(), 1);
  assert.equal(calls.length, 2, 'history load must not create a new run');

  await page.setViewportSize({ width: 390, height: 844 });
  const chooseScope = async (label) => {
    await touch({ x: 20, y: 300 }, { x: 210, y: 302 });
    await touchEnd();
    await page.locator('.vinz-thread-drawer').waitFor();
    await page.locator('.vinz-project-sidebar__row').filter({ hasText: label }).click();
    await page.waitForTimeout(250);
    await page.locator('[data-slot="sheet-close"]').click();
  };
  const send = async (text, responseNumber) => {
    await page.locator('#chat-fixture textarea').fill(text);
    await page.locator('.vinz-clone-composer__send').click();
    await page.getByText(`Fixture response ${responseNumber}`, { exact: true }).waitFor({ timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('.vinz-clone-composer__cancel'));
    for (let index = 0; index < 30 && !threads().some((item) => item.title === text); index++) await page.waitForTimeout(100);
    assert(threads().some((item) => item.title === text), `title and metadata persisted for ${text}`);
  };

  await page.locator('.vinz-conversation-new').click();
  await chooseScope('Project A');
  assert.equal(await page.locator('.vinz-chat-gesture-surface').getAttribute('data-project-scope'), 'project_A');
  await send('Alpha scope note', 3);
  assert.equal(await page.locator('.vinz-conversation-tabs > button:not(.vinz-conversation-new)').count(), 1, 'Project A excludes global chats');
  await page.locator('.vinz-conversation-new').click();
  assert.equal(await page.locator('.vinz-chat-gesture-surface').getAttribute('data-project-scope'), 'project_A', 'new chat inherits Project A');
  await send('Alpha second note', 4);
  const alphaTabs = await page.locator('.vinz-conversation-tabs > button:not(.vinz-conversation-new)').allTextContents();
  assert.equal(alphaTabs.length, 2);
  assert(!alphaTabs.some((title) => /First fixture|Second fixture|Beta/.test(title)), 'Project A tabs contain only Project A chats');

  await page.locator('.vinz-conversation-new').click();
  await chooseScope('Project B');
  assert.equal(await page.locator('.vinz-chat-gesture-surface').getAttribute('data-project-scope'), 'project_B');
  await send('Beta scope note', 5);
  assert.equal(await page.locator('.vinz-conversation-tabs > button:not(.vinz-conversation-new)').count(), 1, 'Project B excludes Project A and global chats');

  await page.locator('.vinz-conversation-new').click();
  await chooseScope('GLOBAL');
  assert.equal(await page.locator('.vinz-chat-gesture-surface').getAttribute('data-project-scope'), 'global');
  await send('Global scope note', 6);
  const globalTabs = await page.locator('.vinz-conversation-tabs > button:not(.vinz-conversation-new)').allTextContents();
  assert(globalTabs.includes('First fixture') && !globalTabs.some((title) => /Alpha|Beta/.test(title)), 'global scope excludes all Project chats');
  const persistedScopes = threads().filter((item) => /Alpha|Beta/.test(item.title)).map((item) => item.custom?.projectId).sort();
  assert.deepEqual(persistedScopes, ['project_A', 'project_A', 'project_B'], 'Project ownership persists independently per chat');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '/tmp/vinz-chat-v1-desktop.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: actual assistant-ui first send, one run, complete repository, New Chat, reload/history, navigation visibility, quota fallback, desktop/mobile.');
} catch (error) {
  console.log('Fixture diagnostics', JSON.stringify({ calls: calls.length, errors, keys: [...data.keys()], threads: threads() }));
  console.log(await page.locator('#chat-fixture').innerText());
  throw error;
} finally { await browser.close(); }
