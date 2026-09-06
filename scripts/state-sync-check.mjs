import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.__syncTest = { records: new Map(), sequence: 0, writeFailure: false };
const compiled = await build({
  stdin: { contents: `export { default as handler } from './netlify/functions/state'; export * from './src/system/stateSync';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  plugins: [{ name: 'fake-atomic-blob', setup(b) {
    b.onResolve({ filter: /^@netlify\/blobs$|\/localStore$|^\.\/_shared\/localStore$/ }, () => ({ path: 'blobs', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export function getStore(){return {
        async getWithMetadata(key){const r=globalThis.__syncTest.records.get(key);return r?structuredClone(r):null;},
        async get(key){return globalThis.__syncTest.records.get(key)?.data??null;},
        async setJSON(key,data,options={}){
          await Promise.resolve();
          const t=globalThis.__syncTest; const old=t.records.get(key);
          if((options.onlyIfNew&&old)||(options.onlyIfMatch&&old?.etag!==options.onlyIfMatch))return {modified:false};
          if(t.writeFailure)return {modified:true,etag:''};
          const etag='etag-'+(++t.sequence);t.records.set(key,{data:structuredClone(data),etag});return {modified:true,etag};
        }
      };}
    ` }));
  } }],
});
const m = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
process.env.VINZMON_TOKEN = 'state-sync-test-not-a-real-secret';
const headers = { authorization: `Bearer ${process.env.VINZMON_TOKEN}`, 'content-type': 'application/json' };
const request = (body) => new Request('https://example.test/api/state', { method: body ? 'PUT' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
assert.equal((await m.handler(new Request('https://example.test/api/state'))).status, 401);
const first = await m.handler(request({ day: 12, state: { day: 12, marker: 'original' }, baseRevision: null }));
assert.equal(first.status, 200);
const original = await first.json();
const outcomes = await Promise.all([
  m.handler(request({ day: 12, state: { day: 12, marker: 'client-a' }, baseRevision: original.revision })),
  m.handler(request({ day: 12, state: { day: 12, marker: 'client-b' }, baseRevision: original.revision })),
]);
assert.deepEqual(outcomes.map((r) => r.status).sort(), [200,409]);
const current = await (await m.handler(request())).json();
assert.ok(current.revision !== original.revision);
assert.ok(['client-a','client-b'].includes(current.state.marker));
assert.equal((await m.handler(request({ day: 12, state: {}, baseRevision: original.revision }))).status, 409);
assert.equal((await m.handler(request({ day: 12, state: {} }))).status, 409, 'legacy writer cannot silently overwrite');
assert.equal((await m.handler(request({ day: 5, state: { day: 5 }, baseRevision: current.revision }))).status, 409, 'DEV future day protected');
globalThis.__syncTest.writeFailure = true;
assert.equal((await m.handler(request({ day: 12, state: {}, baseRevision: current.revision }))).status, 503, 'unconfirmed SDK modified is not success');
globalThis.__syncTest.writeFailure = false;
assert.equal((await m.handler(request({ day: 1, reset: true, state: { day: 1, resetAt: '2099-01-01T00:00:00Z' }, baseRevision: current.revision }))).status, 200, 'explicit known-baseline reset still works');
assert.ok(globalThis.__syncTest.records.has('day-12'), 'old daily backup retained');

const baseline = { localHash: 'old', remoteHash: 'new', receipt: { revision: 'r1', hash: 'old' }, localDay: 12, remoteDay: 12, remoteRevision: 'r2' };
assert.equal(m.syncDecision(baseline), 'download', 'same-day clean cache hydrates');
assert.equal(m.syncDecision({ ...baseline, localHash: 'offline-edits' }), 'conflict', 'offline edits preserved');
assert.equal(m.syncDecision({ ...baseline, remoteRevision: 'r1', localHash: 'offline-edits' }), 'upload', 'known baseline can save local changes');
assert.equal(m.syncDecision({ ...baseline, receipt: null }), 'conflict', 'legacy divergence not guessed');
assert.equal(m.syncDecision({ ...baseline, receipt: null, emptyLocal: true }), 'download', 'new browser hydrates existing server');
assert.equal(m.syncDecision({ ...baseline, localDay: 20 }), 'conflict', 'future DEV never rolled back');
assert.equal(m.syncDecision({ ...baseline, explicitReset: true }), 'conflict', 'reset not undone by remote');
assert.equal(await m.snapshotHash({ mons: { a: { data: { a: 1 }, compiledPrompts: 'large' } }, typingVisible: true }), await m.snapshotHash({ mons: { a: { data: { a: 1 } } }, typingVisible: false }), 'ephemeral/cache differences do not invalidate acknowledgement');
const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } } });
assert.doesNotThrow(() => m.rememberSyncReceipt({ hash: 'test-hash', revision: 'r3' }));
assert.equal(m.readSyncReceipt().revision, 'r3', 'receipt usable in-memory after quota failure');
if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
console.log('PASS: atomic two-client conflict, same-day freshness, no dirty overwrite/day rollback, explicit reset, legacy safety, readback acknowledgement, receipt quota isolation. No production state accessed.');
