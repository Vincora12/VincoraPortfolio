import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.__userDataTest = { records: new Map(), sequence: 0 };
const server = await build({ stdin: { contents: "export { default as handler } from './netlify/functions/user-data';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'atomic-blob-fixture', setup(b) {
  b.onResolve({filter:/^@netlify\/blobs$/},()=>({path:'blobs',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export function getStore(){return {
    async getWithMetadata(key){return structuredClone(globalThis.__userDataTest.records.get(key)??null);},
    async getMetadata(key){const r=globalThis.__userDataTest.records.get(key);return r?{etag:r.etag,metadata:r.metadata}:null;},
    async set(key,data,options={}){await Promise.resolve();const t=globalThis.__userDataTest;const old=t.records.get(key);if((options.onlyIfNew&&old)||(options.onlyIfMatch&&old?.etag!==options.onlyIfMatch))return {modified:false};const etag='r'+(++t.sequence);t.records.set(key,{data,etag,metadata:options.metadata??{}});return {modified:true,etag};}
  };}` }));
} }] });
const {handler}=await import(`data:text/javascript;base64,${Buffer.from(server.outputFiles[0].text).toString('base64')}`);
process.env.VINZMON_TOKEN='user-data-fixture-token-not-real';
const headers={authorization:`Bearer ${process.env.VINZMON_TOKEN}`};
globalThis.fetch=(url,options={})=>handler(new Request(new URL(url,'https://fixture.test'),options));
class Storage {
  map=new Map(); quota=false;
  get length(){return this.map.size;}
  key(i){return [...this.map.keys()][i]??null;}
  getItem(k){return this.map.get(k)??null;}
  setItem(k,v){if(this.quota)throw new DOMException('full','QuotaExceededError');this.map.set(k,v);}
  removeItem(k){this.map.delete(k);}
}
globalThis.__clientStores=new Map();
async function client(id,storage=new Storage()) {
  globalThis.__clientStores.set(id,storage);
  const compiled=await build({stdin:{contents:"export * from './src/system/serverStorage';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',define:{localStorage:'__storage'},banner:{js:`const __storage=globalThis.__clientStores.get(${JSON.stringify(id)});`},plugins:[{name:'quiet-diagnostics',setup(b){b.onLoad({filter:/localStorageDiagnostics\.ts$/},()=>({contents:'export function setLocalStorageItem(source,key,value){localStorage.setItem(key,value);}'}));}}]});
  const module=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  module.configureStorageTokenReader(()=>process.env.VINZMON_TOKEN);
  return {...module,storage};
}
const key='assistant-ui-official-chatgpt:threads';
let response=await fetch(`/api/user-data?key=${key}`,{method:'PUT',headers:{...headers,'if-match':'vinzmon-new'},body:'["initial"]'});
assert.equal(response.status,200);
const initialRevision=(await response.json()).revision;
const a=await client('a');const b=await client('b');
assert.equal(await a.serverBackedStorage.getItem(key),'["initial"]');
assert.equal(await b.serverBackedStorage.getItem(key),'["initial"]');
await a.serverBackedStorage.setItem(key,'["initial","a"]');
await b.serverBackedStorage.setItem(key,'["initial","b"]');
assert.deepEqual(b.storageSyncConflicts(),[key]);
assert.equal(await b.serverBackedStorage.getItem(key),'["initial","b"]','pending timeline retained');
assert.equal((await (await fetch(`/api/user-data?key=${key}`,{headers})).json()).value,'["initial","a"]','stale client did not overwrite server');
await b.retryStorageSync();
assert.equal(b.storageSyncFailures(),1,'retry does not silently resolve conflict');
const reloadedB=await client('b-reload',b.storage);
assert.equal(await reloadedB.serverBackedStorage.getItem(key),'["initial","b"]','dirty local cache survives reload');
assert.deepEqual(reloadedB.storageSyncConflicts(),[key]);
assert.equal((await reloadedB.resolveStorageSyncConflict(key,'use-server')).reloadRequired,true);
assert.equal(reloadedB.storage.getItem(key),'["initial","a"]');
assert.equal(reloadedB.storageSyncFailures(),0);
// Browser cache quota does not prevent a canonical write with the active token.
a.storage.quota=true;
await a.serverBackedStorage.setItem('new-messages','["user","assistant"]');
assert.equal(a.storageSyncFailures(),0);
assert.equal((await (await fetch('/api/user-data?key=new-messages',{headers})).json()).value,'["user","assistant"]');
a.storage.quota=false;
// DELETE is conditional too, and a clean remote tombstone cannot resurrect cached history.
await reloadedB.serverBackedStorage.removeItem(key);
assert.equal((await (await fetch(`/api/user-data?key=${key}`,{headers})).json()).value,null);
assert.equal(await a.serverBackedStorage.getItem(key),null);
assert.equal((await fetch(`/api/user-data?key=${key}`,{method:'PUT',headers:{...headers,'if-match':initialRevision},body:'stale'})).status,409);
assert.equal((await fetch(`/api/user-data?key=${key}`,{method:'PUT',headers,body:'old-client'})).status,409);
assert.equal((await fetch(`/api/user-data?key=${key}`,{})).status,401);
console.log('PASS: user-data CAS, cross-client conflict/no silent overwrite, pending local timeline/reload protection, explicit conflict recovery, delete tombstone, active-token quota resilience. Fixtures only; no production data written.');
