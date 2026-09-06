// Real assistant-ui runtime, synthetic network/records only. No production writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.CHAT_TEST_BASE ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const data = new Map(), revisions = new Map(), calls = [], errors = [];
page.on('pageerror', (e) => errors.push(e.message));
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
  assert.equal(threads().length, 0, 'cold load has no empty persisted thread');
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
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '/tmp/vinz-chat-v1-desktop.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: actual assistant-ui first send, one run, complete repository, New Chat, reload/history, navigation visibility, quota fallback, desktop/mobile.');
} catch (error) {
  console.log('Fixture diagnostics', JSON.stringify({ calls: calls.length, errors, keys: [...data.keys()] }));
  console.log(await page.locator('#chat-fixture').innerText());
  throw error;
} finally { await browser.close(); }
