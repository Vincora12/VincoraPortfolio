import assert from 'node:assert/strict';
import { build } from 'esbuild';
globalThis.__coreTest = { save: null, calls: [], failStore: false };
const compiled = await build({
  stdin: { contents: `
    export {default as chat} from './netlify/functions/v1-chat-completions';
    export {default as responses} from './netlify/functions/v1-responses';
    export {default as models} from './netlify/functions/v1-models';
    export {default as context} from './netlify/functions/core-context';
    export {mapMessagesToRequest} from './netlify/functions/_shared/openaiIngress';
    export {generateFirstMon} from './src/engine/characterGenerator';
    export {initialHealthState} from './src/engine/health';
    export {neutralPersonality,EMPTY_NOVELTY} from './src/engine/signals';
  `, resolveDir:process.cwd(), loader:'ts' },
  bundle:true, write:false, platform:'node', format:'esm', logLevel:'silent',
  plugins:[{name:'fake-io',setup(b){
    b.onResolve({filter:/^@netlify\/blobs$|\/localStore$|^\.\/_shared\/localStore$/},()=>({path:'blobs',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export function getStore(){return {async get(key){if(globalThis.__coreTest.failStore)throw Error('offline');return key==='save'?globalThis.__coreTest.save:null;}}}`}));
    b.onLoad({filter:/_shared\/providers\.ts$/},()=>({contents:`export async function callProvider(provider,input){globalThis.__coreTest.calls.push({provider,...input});return {ok:true,text:'contract response',model:'fixture',toolUses:[],usage:{inputTokens:11,outputTokens:3}};}`}));
    b.onLoad({filter:/_shared\/spend\.ts$/},()=>({contents:`export const INTERNAL_CAP_EXCEEDED='cap',PROVIDER_QUOTA_EXCEEDED='quota';export const looksLikeProviderQuota=()=>false;export async function checkCap(){return {blocked:false,ledger:{usd:0},capUsd:35}};export async function recordSpend(){}`}));
    b.onLoad({filter:/_shared\/runtimeLog\.ts$/},()=>({contents:`export async function appendRuntimeEvent(){}`}));
    b.onLoad({filter:/_shared\/core\/memory\.ts$/},()=>({contents:`export async function searchPersonalMemory(){return [{text:'Bounded fixture memory'}];} export const shouldCapturePersonalMemory=()=>false; export async function writePersonalMemory(){throw Error('No fixture capture expected');}`}));
  }}],
});
const m=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
process.env.VINZMON_TOKEN='fixture-core-token-at-least-24';
const headers={authorization:'Bearer '+process.env.VINZMON_TOKEN,'content-type':'application/json'};
const req=(path,body,auth=headers)=>new Request('https://test.invalid'+path,{method:body?'POST':'GET',headers:auth,...(body?{body:JSON.stringify(body)}:{})});
const mon=m.generateFirstMon({input:{day:1,health:m.initialHealthState(),personality:m.neutralPersonality(),moodHistory:[],cultural:{},novelty:m.EMPTY_NOVELTY,mindlineDepth:0,bond:50,dataConfidence:50,activeDays:1,branchCount:0},mindlineNodeId:'fixture-node',originNodeId:null,lineageNames:[],seed:1001}).record;
globalThis.__coreTest.save={day:1,savedAt:new Date().toISOString(),state:{activeMonName:mon.data.name,mons:{[mon.data.name]:mon},world:{id:'fixture-world'}}};
const input={model:'vinzmon-core',messages:[{role:'user',content:'fixture'}]};
assert.equal((await m.chat(req('/v1/chat/completions',input,{}))).status,401);
assert.equal((await m.models(req('/v1/models'))).status,200);
const response=await m.chat(req('/v1/chat/completions',input));
assert.equal(response.status,200);
assert.equal((await response.json()).choices[0].message.content,'contract response');
const call=globalThis.__coreTest.calls.at(-1);
assert.ok(call.system.at(-1).text.includes(mon.data.name.replace(/\.mon$/,'')));
assert.ok(call.system.at(-1).text.includes('Bounded fixture memory'));
const web=await (await m.context(req('/api/core-context',{query:'fixture'}))).json();
assert.equal(web.context.monName,mon.data.name);assert.equal(web.context.worldId,'fixture-world');
assert.ok((await (await m.chat(req('/v1/chat/completions',{...input,stream:true}))).text()).endsWith('data: [DONE]\n\n'));
assert.equal((await m.responses(req('/v1/responses',{input:'fixture',stream:true}))).status,200);
const mapped=m.mapMessagesToRequest([{role:'user',content:'read'},{role:'assistant',content:null,tool_calls:[{id:'call1',type:'function',function:{name:'read',arguments:'{}'}}]},{role:'tool',tool_call_id:'call1',content:'confirmed result'}]);
assert.equal(mapped.turns[1].content[0].type,'tool_use');
assert.equal(mapped.turns[2].content[0].tool_use_id,'call1');
globalThis.__coreTest.failStore=true;
const count=globalThis.__coreTest.calls.length;
assert.equal((await m.chat(req('/v1/chat/completions',input))).status,503);
assert.equal(globalThis.__coreTest.calls.length,count);
console.log('PASS existing ingress: auth, canonical Mon/memory parity, buffered SSE, tool association, unavailable state fails closed. Provider/storage fixtures; external client not exercised.');
