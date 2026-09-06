import assert from 'node:assert/strict';
import { build } from 'esbuild';
const entries = new Map();
let version = 0;
globalThis.__calendarStoreFixture = {
  list: async () => ({ blobs: [...entries.keys()].map((key) => ({ key })) }),
  getWithMetadata: async (key) => entries.get(key) ?? null,
  setJSON: async (key, data, options) => {
    const existing = entries.get(key);
    if (options.onlyIfNew && existing || options.onlyIfMatch && options.onlyIfMatch !== existing?.etag) return { modified: false };
    const etag = String(++version); entries.set(key, { data, etag }); return { modified: true, etag };
  },
};
const { outputFiles } = await build({ entryPoints: ['netlify/functions/calendar.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'fixture-storage', setup(build) {
    build.onResolve({ filter: /^@netlify\/blobs$|\/localStore$|^\.\/_shared\/localStore$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const getStore = () => globalThis.__calendarStoreFixture;', loader: 'js' }));
  } }] });
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
process.env.VINZMON_TOKEN = 'calendar-test-token-not-a-real-secret';
const req = (method, body, token = process.env.VINZMON_TOKEN) => new Request('http://test/api/calendar', { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
assert.equal((await handler(req('GET', undefined, 'wrong'))).status, 401);
assert.equal((await handler(req('POST', {}, 'wrong'))).status, 401);
assert.equal((await handler(req('POST', null))).status, 400);
assert.equal((await handler(req('GET'))).status, 200);
const event = { title: 'Fixture only', start: '2026-09-06T09:00:00Z', timezone: 'Europe/Rome', category: 'meal', status: 'planned', notes: '' };
const create = await handler(req('POST', { id: 'fixture-event-1', event }));
assert.equal(create.status, 200);
const saved = await create.json();
assert.equal((await handler(req('POST', { id: 'fixture-event-1', event }))).status, 409);
assert.equal((await handler(req('PUT', { id: 'fixture-event-1', version: 'stale', event }))).status, 409);
const update = await handler(req('PUT', { id: 'fixture-event-1', version: saved.version, event: { ...event, status: 'cancelled' } }));
assert.equal(update.status, 200);
const result = await (await handler(req('GET'))).json();
assert.equal(result.events.length, 1);
assert.equal(result.events[0].event.status, 'cancelled');
assert.equal((await handler(req('POST', { id: 'fixture-event-2', event: { ...event, start: 'invalid' } }))).status, 400);
globalThis.__calendarStoreFixture.list = async () => { throw new Error('fixture unavailable'); };
assert.equal((await handler(req('GET'))).status, 503);
console.log('PASS: calendar auth, create/read/update/cancel, optimistic concurrency, duplicate prevention, validation, storage failure. Fixture Blob only; production verification separate.');
