import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export * from './netlify/functions/_shared/v2/hermesAdapter';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
});
const adapter = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

assert.equal(adapter.hermesConfig({ VINZMON_ORCHESTRATOR: 'legacy' }), null);
assert.throws(() => adapter.hermesConfig({ VINZMON_ORCHESTRATOR: 'hermes' }), /HERMES_CONFIG_INCOMPLETE/);
assert.throws(() => adapter.hermesConfig({
  VINZMON_ORCHESTRATOR: 'hermes', VINZMON_HERMES_API_URL: 'https://example.com', VINZMON_HERMES_API_KEY: 'key',
  VINZMON_HERMES_WORKSPACE_ROOT: '/tmp/ffuoco-fixture', VINZMON_HERMES_MODEL: 'fixture-model', VINZMON_HERMES_SANDBOXED: '1',
}), /loopback/);
const config = {
  baseUrl: 'http://127.0.0.1:8642',
  apiKey: 'fixture-key',
  workspaceRoot: '/tmp/ffuoco-fixture',
  model: 'fixture-model',
};
assert.equal(adapter.hermesSessionId('project-ff', 'thread-1', 'request-1'), adapter.hermesSessionId('project-ff', 'thread-1', 'request-1'));
assert.notEqual(adapter.hermesSessionId('project-ff', 'thread-1', 'request-1'), adapter.hermesSessionId('project-ff', 'thread-1', 'request-2'));
assert.throws(() => adapter.assertHermesWorkspace(config, '/tmp/other-project'), /HERMES_WORKSPACE_MISMATCH/);

/* ── Native gateway transport (ws://127.0.0.1:9119/api/ws) ──────────────────
   Below this point the adapter no longer speaks REST/SSE, so the fixture
   fakes the WebSocket the adapter opens instead of `fetch`: same idea as the
   old mock, one layer lower, at the exact same seam (globalThis.WebSocket)
   the adapter's own connect() call resolves at runtime. */

class FakeHermesGatewayWs {
  constructor(url) {
    this.url = url;
    this._listeners = { open: [], message: [], close: [], error: [] };
    queueMicrotask(() => this._emit('open', {}));
  }
  addEventListener(type, cb) { (this._listeners[type] ??= []).push(cb); }
  removeEventListener(type, cb) {
    const list = this._listeners[type];
    if (!list) return;
    const i = list.indexOf(cb);
    if (i >= 0) list.splice(i, 1);
  }
  send(data) { handleSend(this, JSON.parse(data)); }
  close() { this._emit('close', {}); }
  _emit(type, evt) { for (const cb of [...(this._listeners[type] || [])]) cb(evt); }
  _message(obj) { this._emit('message', { data: JSON.stringify(obj) }); }
}

let sessionCounter = 0;
let failNextResume = false;
let resumeAsRunning = false;
const createCalls = [];
const resumeCalls = [];
const promptCalls = [];
const approvalRespondCalls = [];
const interruptCalls = [];

function scriptedTurnFrames(sid, text) {
  return [
    { type: 'reasoning.delta', payload: { text: 'private reasoning must not cross the adapter' } },
    { type: 'tool.start', payload: { tool_id: 'call-1', name: 'terminal', context: 'searching' } },
    { type: 'tool.complete', payload: { tool_id: 'call-1', name: 'terminal', duration_s: 0.012, result: { isError: false } } },
    { type: 'approval.request', payload: { request_id: 'approval-1', reason: 'unsafe command' } },
    { type: 'message.delta', payload: { text } },
    { type: 'message.complete', payload: { text, status: 'complete', usage: { input_tokens: 10, output_tokens: 2 } } },
    // Hermes emits this right after a turn settles — real field names from
    // agent/context_breakdown.py `context_usage_fields`.
    { type: 'session.info', payload: { usage: { context_used: 4200, context_max: 128000, context_percent: 3, context_estimated: false } } },
  ];
}

function handleSend(ws, frame) {
  if (frame.method === 'session.create') {
    sessionCounter += 1;
    const runtimeId = `sess_runtime_${sessionCounter}`;
    const storedId = `sess_stored_${sessionCounter}`;
    createCalls.push(frame.params);
    setTimeout(() => ws._message({ jsonrpc: '2.0', id: frame.id, result: { session_id: runtimeId, stored_session_id: storedId, message_count: 0, messages: [], info: {} } }), 0);
  } else if (frame.method === 'session.resume') {
    resumeCalls.push(frame.params);
    if (failNextResume) {
      failNextResume = false;
      setTimeout(() => ws._message({ jsonrpc: '2.0', id: frame.id, error: { code: 4007, message: 'session not found' } }), 0);
      return;
    }
    sessionCounter += 1;
    const runtimeId = `sess_runtime_${sessionCounter}`;
    const running = resumeAsRunning;
    setTimeout(() => {
      ws._message({ jsonrpc: '2.0', id: frame.id, result: { session_id: runtimeId, session_key: frame.params.session_id, resumed: frame.params.session_id, message_count: 0, messages: [], running } });
      if (running) {
        // The turn is already in flight server-side — Hermes streams these
        // regardless of whether this client ever calls prompt.submit again.
        scriptedTurnFrames(runtimeId, 'Reconnected').forEach((event, index) => {
          setTimeout(() => ws._message({ jsonrpc: '2.0', method: 'event', params: { type: event.type, session_id: runtimeId, payload: event.payload } }), (index + 1) * 5);
        });
      }
    }, 0);
  } else if (frame.method === 'prompt.submit') {
    promptCalls.push(frame.params);
    const sid = frame.params.session_id;
    setTimeout(() => {
      ws._message({ jsonrpc: '2.0', id: frame.id, result: { status: 'streaming' } });
      // Scripted turn, staggered so the adapter's `for await` loop is
      // already listening (mirrors how a real turn streams over time).
      scriptedTurnFrames(sid, 'Done').forEach((event, index) => {
        setTimeout(() => ws._message({ jsonrpc: '2.0', method: 'event', params: { type: event.type, session_id: sid, payload: event.payload } }), (index + 1) * 5);
      });
    }, 0);
  } else if (frame.method === 'approval.respond') {
    approvalRespondCalls.push(frame.params);
    setTimeout(() => ws._message({ jsonrpc: '2.0', id: frame.id, result: { resolved: true } }), 0);
  } else if (frame.method === 'session.interrupt') {
    interruptCalls.push(frame.params);
    setTimeout(() => ws._message({ jsonrpc: '2.0', id: frame.id, result: { status: 'interrupted' } }), 0);
  } else {
    setTimeout(() => ws._message({ jsonrpc: '2.0', id: frame.id, error: { code: -32601, message: `unexpected method: ${frame.method}` } }), 0);
  }
}

const originalWebSocket = globalThis.WebSocket;
globalThis.WebSocket = FakeHermesGatewayWs;
const dataDir = mkdtempSync(join(tmpdir(), 'vinzmon-hermes-adapter-check-'));

async function run(overrides) {
  const events = [];
  for await (const event of adapter.streamHermesProjectRun(config, {
    requestId: 'vinz-request-1', projectId: 'project-ff', projectName: 'FFuoco Fixture',
    workspaceRoot: '/tmp/ffuoco-fixture', conversationId: 'thread-1', input: 'Change CTA X to Y',
    systemPrompt: 'VINZ context fixture', turns: [{ role: 'user', content: 'Earlier turn' }],
    model: 'gpt-5.6-terra', provider: 'openai-api', effort: 'low',
    ...overrides,
  })) events.push(event);
  return events;
}

try {
  // Not the Local Core (VINZMON_LOCAL_CORE unset): the gate must refuse
  // before ever touching the network, cloud-safe by construction.
  delete process.env.VINZMON_LOCAL_CORE;
  await assert.rejects(async () => {
    for await (const _ of adapter.streamHermesProjectRun(config, {
      requestId: 'r', projectId: 'p', projectName: 'P', workspaceRoot: '/tmp/ffuoco-fixture', conversationId: 'c', input: 'x', systemPrompt: 's', turns: [],
    })) { /* no-op */ }
  }, /HERMES_LOCAL_ONLY/);
  assert.equal(await adapter.stopHermesRun(config, 'sess_fixture'), false, 'stopHermesRun must refuse off the Local Core');
  assert.equal(createCalls.length, 0, 'the gate must reject before any RPC is sent');

  // Local Core, but the real Hermes env var is not set: fail loud, never
  // invent a token.
  process.env.VINZMON_LOCAL_CORE = '1';
  delete process.env.HERMES_DASHBOARD_SESSION_TOKEN;
  await assert.rejects(async () => {
    for await (const _ of adapter.streamHermesProjectRun(config, {
      requestId: 'r', projectId: 'p', projectName: 'P', workspaceRoot: '/tmp/ffuoco-fixture', conversationId: 'c', input: 'x', systemPrompt: 's', turns: [],
    })) { /* no-op */ }
  }, /HERMES_CONFIG_INCOMPLETE/);
  assert.equal(createCalls.length, 0);

  // Local Core, token present, isolated data dir for the conversation->session
  // mapping this fixture is about to exercise.
  process.env.HERMES_DASHBOARD_SESSION_TOKEN = 'fixture-dashboard-token';
  process.env.VINZMON_DATA_DIR = dataDir;

  // Turn 1 of a brand-new conversation: nothing stored yet -> session.create.
  const first = await run({});
  assert.deepEqual(first.map((event) => event.type), ['status', 'progress', 'tool_started', 'tool_completed', 'approval_required', 'text_delta', 'status', 'final', 'context']);
  const firstContext = first.find((event) => event.type === 'context');
  assert.deepEqual(firstContext.hermes, { usedTokens: 4200, maxTokens: 128000, percent: 3, estimated: false });
  assert.equal(first.find((event) => event.type === 'progress').message, 'Ho scelto il prossimo passaggio.');
  assert.equal(JSON.stringify(first).includes('private reasoning'), false);
  assert.equal(first.find((event) => event.type === 'tool_completed').durationMs, 12);
  assert.equal(first.find((event) => event.type === 'tool_completed').error, undefined);
  assert.equal(first.find((event) => event.type === 'final').text, 'Done');
  assert.equal(first.every((event) => event.runId === 'sess_runtime_1'), true);
  assert.equal(createCalls.length, 1);
  assert.equal(resumeCalls.length, 0);
  assert.equal(createCalls[0].cwd, '/tmp/ffuoco-fixture');
  assert.equal(createCalls[0].title, adapter.hermesSessionId('project-ff', 'thread-1', 'vinz-request-1'));
  assert.equal(createCalls[0].close_on_disconnect, undefined, 'a conversation session must outlive its creating connection');
  assert.equal(createCalls[0].model, 'gpt-5.6-terra');
  assert.equal(createCalls[0].provider, 'openai-api');
  assert.equal(createCalls[0].reasoning_effort, 'low');
  assert.equal(createCalls[0].messages[0].content, 'Earlier turn');
  assert.equal(promptCalls[0].session_id, 'sess_runtime_1');
  assert.match(promptCalls[0].text, /ACTIVE PROJECT ID: project-ff/);
  assert.match(promptCalls[0].text, /AUTHORIZED WORKSPACE: \/tmp\/ffuoco-fixture/);
  assert.match(promptCalls[0].text, /every user-visible message in Italian/);
  assert.match(promptCalls[0].text, /Never repeat the same failed search/);
  assert.match(promptCalls[0].text, /Change CTA X to Y$/);
  assert.equal(approvalRespondCalls.length, 1);
  assert.equal(approvalRespondCalls[0].choice, 'deny');
  assert.equal(approvalRespondCalls[0].request_id, 'approval-1');

  // Turn 2, SAME conversation and SAME model/provider: must resume the
  // durable session from turn 1 instead of creating a new one.
  const second = await run({});
  assert.equal(createCalls.length, 1, 'turn 2 must not create a second session');
  assert.equal(resumeCalls.length, 1);
  assert.equal(resumeCalls[0].session_id, 'sess_stored_1');
  assert.equal(second.every((event) => event.runId === 'sess_runtime_2'), true, 'resume mints a fresh runtime id for the new connection');
  // A resumed turn must not resend the static boundary/rules text — Hermes
  // already read it at session.create — only VINZ.MON's fresh per-turn
  // context and the (always-fresh) action policy.
  assert.equal(promptCalls[1].session_id, 'sess_runtime_2');
  assert.doesNotMatch(promptCalls[1].text, /ACTIVE PROJECT ID:/, 'resume must not repeat the static create-time boundary text');
  assert.doesNotMatch(promptCalls[1].text, /every user-visible message in Italian/, 'resume must not repeat the static language rule');
  assert.match(promptCalls[1].text, /VINZ context fixture/, 'resume must still carry the fresh per-turn VINZ.MON context');
  assert.match(promptCalls[1].text, /Change CTA X to Y$/);

  // Turn 3, same conversation but a DIFFERENT model: Hermes has no
  // model-override-on-resume, so this must start a fresh session on purpose.
  const third = await run({ model: 'other-model' });
  assert.equal(createCalls.length, 2, 'a model change must create a new session, not silently ignore the choice');
  assert.equal(resumeCalls.length, 1, 'no resume attempt when the stored model does not match');
  assert.equal(third.every((event) => event.runId === 'sess_runtime_3'), true);

  // Turn 4, back to the (now stored) other-model: resumes the LATEST
  // conversation session, not the original one from turn 1.
  await run({ model: 'other-model' });
  assert.equal(createCalls.length, 2);
  assert.equal(resumeCalls.length, 2);
  assert.notEqual(resumeCalls[1].session_id, resumeCalls[0].session_id, 'must resume the other-model session from turn 3, not the gpt-5.6-terra one from turn 1');

  // Turn 5: the stored session is gone on Hermes' side (e.g. restarted) —
  // resume fails, and the adapter must fall back to a fresh create rather
  // than failing the whole turn.
  failNextResume = true;
  const fifth = await run({ model: 'other-model' });
  assert.equal(resumeCalls.length, 3, 'a fallback still attempts resume first');
  assert.equal(createCalls.length, 3, 'a failed resume falls back to session.create');
  assert.equal(fifth.some((event) => event.type === 'final'), true, 'the turn itself still completes despite the fallback');

  // Turn 6: reconnect (app backgrounded / dropped connection) while Hermes
  // is STILL running the previous turn — the adapter must reattach and
  // relay the in-flight turn's events instead of calling prompt.submit
  // again, which Hermes would reject ("session busy") and strand the retry.
  resumeAsRunning = true;
  const promptCallsBefore = promptCalls.length;
  const sixth = await run({ model: 'other-model' });
  resumeAsRunning = false;
  assert.equal(promptCalls.length, promptCallsBefore, 'reconnecting to a running turn must not submit a duplicate prompt');
  assert.equal(sixth.some((event) => event.type === 'final' && event.text === 'Reconnected'), true, 'the client still sees the in-flight turn complete');

  assert.equal(await adapter.stopHermesRun(config, 'sess_runtime_1'), true);
  assert.equal(interruptCalls.some((params) => params.session_id === 'sess_runtime_1'), true);
} finally {
  globalThis.WebSocket = originalWebSocket;
  delete process.env.VINZMON_LOCAL_CORE;
  delete process.env.HERMES_DASHBOARD_SESSION_TOKEN;
  delete process.env.VINZMON_DATA_DIR;
  rmSync(dataDir, { recursive: true, force: true });
}

console.log('PASS Hermes adapter: native WS/JSON-RPC gateway, session.create/prompt.submit mapping, local-core + token gates, approval denial, persistent per-conversation session (resume/create/model-change/fallback).');
