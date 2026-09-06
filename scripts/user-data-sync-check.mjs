import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.__userDataTest = { records: new Map(), sequence: 0 };
const server = await build({ stdin: { contents: "export { default as handler } from './netlify/functions/user-data';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'atomic-blob-fixture', setup(b) {
  b.onResolve({filter:/^@netlify\/blobs$|\/localStore$|^\.\/_shared\/localStore$/},()=>({path:'blobs',namespace:'fixture'}));
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
  const compiled=await build({stdin:{contents:"export * from './src/system/serverStorage';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',define:{localStorage:'__storage'},banner:{js:`const __storage=globalThis.__clientStores.get(${JSON.stringify(id)});`},plugins:[{name:'quiet-diagnostics',setup(b){b.onLoad({filter:/runtimeLog\\.ts$/},()=>({contents:'export function postRuntimeEvent(){}'}));b.onLoad({filter:/localStorageDiagnostics\.ts$/},()=>({contents:'export function setLocalStorageItem(source,key,value){localStorage.setItem(key,value);} export function setLocalStorageItemBestEffort(source,key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}}'}));}}]});
  const module=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  module.configureStorageTokenReader(()=>process.env.VINZMON_TOKEN);
  return {...module,storage};
}
// Cross-device merge/CAS is covered by remote-chat-history-check.mjs.
// This suite covers the added cache failure and retry boundary.
const a=await client('a');
a.storage.quota=true;
await a.serverBackedStorage.setItem('cache-quota-fixture','technical-value');
assert.equal(a.storageSyncFailures(),0);
assert.equal((await (await fetch('/api/user-data?key=cache-quota-fixture',{headers})).json()).value,'technical-value');
assert.equal(await a.serverBackedStorage.getItem('cache-quota-fixture'),'technical-value','quota cache cannot hide server data');
const online=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('offline fixture');};
await a.serverBackedStorage.setItem('offline-fixture','pending-value');
assert.equal(a.storageSyncFailures(),1,'unconfirmed save visible');
assert.equal(await a.serverBackedStorage.getItem('offline-fixture'),'pending-value','in-memory pending value survives full cache');
globalThis.fetch=online;
await a.retryStorageSync();
assert.equal(a.storageSyncFailures(),0);
assert.equal((await (await fetch('/api/user-data?key=offline-fixture',{headers})).json()).value,'pending-value');
console.log('PASS cache quota isolation, active token auth, offline in-memory retention, visible failure/retry, canonical read. Synthetic I/O only.');
