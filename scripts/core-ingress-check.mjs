import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Fake I/O only. Real projection, persona compiler, auth and protocol handlers.
globalThis.__coreTest = { save: null, calls: [], reads: [], failStore: false };
const result = await build({
  stdin: { contents: `
    export { default as handler } from './netlify/functions/vinz-core';
    export { default as contextHandler } from './netlify/functions/core-context';
    export { parseCoreRequest, coreSse, coreResponse } from './netlify/functions/_shared/openaiContract';
    export { generateFirstMon } from './src/engine/characterGenerator';
    export { initialHealthState } from './src/engine/health';
    export { neutralPersonality, EMPTY_NOVELTY } from './src/engine/signals';
  `, resolveDir: process.cwd(), loader: 'ts' },
  write: false, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  plugins: [{ name: 'bounded-io-fixtures', setup(b) {
    b.onResolve({ filter: /^@netlify\/blobs$/ }, () => ({ path: 'blobs', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export function getStore(options) { return { async get(key) { const t=globalThis.__coreTest; t.reads.push([options,key]); if(t.failStore)throw Error('offline'); return key==='save'?t.save:null; } }; }` }));
    b.onLoad({ filter: /netlify\/functions\/ai\.ts$/ }, () => ({ contents: `export default async function(req) { globalThis.__coreTest.calls.push(await req.json()); return new Response(JSON.stringify({text:'contract response',usage:{inputTokens:11,outputTokens:3}}),{headers:{'content-type':'application/json'}}); }` }));
    b.onLoad({ filter: /netlify\/functions\/me-chat-capture\.ts$/ }, () => ({ contents: `export default async function(){ return new Response('{}'); }` }));
  } }],
});
const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
process.env.VINZMON_TOKEN = 'contract-test-token-not-a-real-secret';
delete process.env.VINZMON_MEMORY_WRITER_MODE;
const auth = { authorization: `Bearer ${process.env.VINZMON_TOKEN}`, 'content-type': 'application/json' };
const req = (path, body, headers = auth) => new Request(`https://example.test${path}`, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const mon = m.generateFirstMon({ input: { day: 1, health: m.initialHealthState(), personality: m.neutralPersonality(), moodHistory: [], cultural: {}, novelty: m.EMPTY_NOVELTY, mindlineDepth: 0, bond: 50, dataConfidence: 50, activeDays: 1, branchCount: 0 }, mindlineNodeId: 'test-node', originNodeId: null, lineageNames: [], seed: 1001 }).record;
assert.ok(mon?.data.name);
globalThis.__coreTest.save = { day: 1, savedAt: '2026-09-06T10:00:00Z', state: { activeMonName: mon.data.name, mons: { [mon.data.name]: mon }, world: { id: 'test-world' } } };
assert.equal((await m.handler(req('/v1/models', undefined, {}))).status, 401);
assert.equal((await (await m.handler(req('/v1/models'))).json()).data[0].id, 'vinzmon-core');
const chat = { model: 'vinzmon-core', messages: [{ role: 'user', content: 'test request' }] };
const response = await m.handler(req('/v1/chat/completions', chat));
assert.equal(response.status, 200);
const out = await response.json();
assert.equal(out.choices[0].message.content, 'contract response');
assert.equal(out.usage.total_tokens, 14);
const call = globalThis.__coreTest.calls.at(-1);
assert.equal(call.capability, 'character-voice');
assert.equal(call.voiceModel, undefined, 'routing default not overridden');
assert.equal(call.tools, undefined, 'no fictitious external tools');
assert.ok(call.system.at(-1).text.includes('WHO YOU ARE'));
assert.ok(call.system.at(-1).text.includes(mon.data.name.replace(/\.mon$/, '')));
const web = await (await m.contextHandler(req('/api/core-context', { query: 'test request' }))).json();
assert.equal(web.context.monName, mon.data.name);
assert.equal(web.context.worldId, 'test-world');
assert.equal(web.context.source, 'server');
assert.ok(globalThis.__coreTest.reads.some(([o,k]) => o.name === 'vinzmon-state' && k === 'save'));
assert.equal((await m.handler(req('/v1/responses', { model: 'vinzmon-core', input: 'test request', stream: true }))).headers.get('x-vinz-stream-mode'), 'buffered');
const sse = await (await m.handler(req('/v1/chat/completions', { ...chat, stream: true }))).text();
assert.ok(sse.endsWith('data: [DONE]\n\n'));
const rsse = m.coreSse('responses', m.coreResponse('responses', 'text'));
for (const event of ['response.created', 'response.output_text.delta', 'response.output_text.done', 'response.completed']) assert.ok(rsse.includes(`event: ${event}`));
for (const patch of [{ model: 'provider-model' }, { tools: [{ type: 'function' }] }, { previous_response_id: 'old' }, { max_tokens: -1 }, { stream: 'yes' }, { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: 'not-read' }] }] }]) {
  assert.equal((await m.handler(req('/v1/chat/completions', { ...chat, ...patch }))).status, 400);
}
assert.equal((await m.handler(new Request('https://example.test/v1/responses', { method: 'POST', headers: auth, body: '{' }))).status, 400);
assert.equal((await m.handler(req('/v1/chat/completions', { ...chat, messages: Array.from({ length: 25 }, () => ({ role: 'user', content: 'x' })) }))).status, 400);
globalThis.__coreTest.failStore = true;
const callsBefore = globalThis.__coreTest.calls.length;
assert.equal((await m.handler(req('/v1/chat/completions', chat))).status, 503);
assert.equal(globalThis.__coreTest.calls.length, callsBefore, 'no generic provider fallback if canonical store fails');
console.log('PASS: canonical current-Mon parity, existing-gateway delegation, auth, bounded text contracts, honest tools, buffered SSE, failure isolation. Provider/network and OpenClicky NOT tested by this fixture.');
