import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Real replyWithLocalTools orchestration; only provider, store and trace I/O replaced.
globalThis.__toolLoopState = { token:'synthetic-token-not-a-secret',activeMonName:null,mons:{},voiceNotes:[] };
const {outputFiles}=await build({entryPoints:['src/brain/stream.ts'],bundle:true,format:'esm',platform:'node',write:false,plugins:[{name:'loop-fixtures',setup(builder){
 builder.onResolve({filter:/state\/store$/},()=>({path:'store',namespace:'fixture'}));
 builder.onResolve({filter:/ai\/chatTrace$/},()=>({path:'trace',namespace:'fixture'}));
 builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',contents:path==='store'
  ?'export const useApp={getState:()=>globalThis.__toolLoopState};'
  :'export const traceClock=()=>({mark(){},elapsed:()=>0,steps:()=>[]});export const systemPromptComposition=()=>[];export const recordChatTrace=()=>{};export const persistChatTrace=async()=>null;'}));
}}]});
const {replyWithLocalTools}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const originalFetch=globalThis.fetch;
try{
 let requests=[];let replies=[];let chunks=[];let executed=[];
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/ai');const body=JSON.parse(options.body);requests.push(body);assert(body.tools.length<=12);return new Response(JSON.stringify(replies.shift()),{status:200,headers:{'Content-Type':'application/json'}});};
 const run=async(use)=>{executed.push(use.name);return {id:use.id,content:use.name==='leggi_progetto'?'Synthetic scoped fact 漢🍄'.repeat(6000):'Artifact saved and read back: #/artifact/synthetic/report'};};
 replies=[{toolUses:[{id:'read-1',name:'leggi_progetto',input:{}}]},{toolUses:[{id:'write-1',name:'scrivi_artifact_progetto',input:{titolo:'Report',markdown:'text'}}]},{toolUses:[{id:'write-1',name:'scrivi_artifact_progetto',input:{titolo:'Report',markdown:'text'}}]},{text:'Documento pronto al link verificato.',model:'synthetic',costUsd:0}];
 await replyWithLocalTools([],'Nel progetto dieta, leggi i dati e prepara un report.',new AbortController().signal,text=>chunks.push(text),run,null,[],undefined,undefined,[],{systemPrompt:'Synthetic project scope',requestId:'synthetic-request',projectId:'synthetic-project'});
 assert.deepEqual(executed,['leggi_progetto','scrivi_artifact_progetto']);assert.equal(requests.length,4);assert(chunks.join('').includes('Documento pronto'));
 assert(requests[0].tools.some(tool=>tool.name==='leggi_progetto'));assert(requests[0].tools.some(tool=>tool.name==='scrivi_artifact_progetto'));
 assert(new TextEncoder().encode(JSON.stringify(requests[1].userBlocks)).length<=10000);
 assert(requests[1].userBlocks[0].content.includes('[TRUNCATED'));
 assert(requests[2].turns.some(turn=>Array.isArray(turn.content)&&turn.content.some(block=>block.type==='tool_result'&&block.tool_use_id==='read-1')));
 assert.equal(requests[3].tools.length,0);
 requests=[];executed=[];chunks=[];
 replies=[{toolUses:[{id:'remind',name:'programma_promemoria',input:{azione:'list'}}]},{text:'Ecco i promemoria.'}];
 await replyWithLocalTools([],'Ricordami domani di controllare il peso.',new AbortController().signal,text=>chunks.push(text),run,null,[],undefined,undefined,[],{systemPrompt:'Synthetic scope',requestId:'reminder-request'});
 assert(requests[0].tools.some(tool=>tool.name==='programma_promemoria'));assert(!requests[0].tools.some(tool=>tool.name==='scrivi_artifact_progetto'));assert.deepEqual(executed,['programma_promemoria']);
 requests=[];executed=[];
 replies=[{toolUses:[{id:'unavailable',name:'send_email',input:{}}]},{text:'Non posso inviare email con gli strumenti disponibili.'}];
 await replyWithLocalTools([],'Invia una email.',new AbortController().signal,()=>{},run,null,[],undefined,undefined,[],{systemPrompt:'Synthetic scope',requestId:'unavailable-request'});
 assert.equal(executed.length,0);assert.equal(requests[1].userBlocks[0].is_error,true);
 requests=[];
 replies=[{toolUses:[{id:'failure',name:'crea_file_testo',input:{titolo:'Test',testo:'Synthetic'}}]},{text:'La creazione non è stata confermata.'}];
 await replyWithLocalTools([],'Prepara un file txt.',new AbortController().signal,()=>{},async()=>{throw new Error('synthetic failure');},null,[],undefined,undefined,[],{systemPrompt:'Synthetic scope',requestId:'error-request'});
 assert.equal(requests[1].userBlocks[0].is_error,true);assert(requests[1].userBlocks[0].content.includes('not confirmed'));
 console.log('PASS real tool loop: 4-round project read/write, duplicate call ID executes once, UTF8 aggregate budget, history retains previous outputs, final tool-free round, reminder offered inside health intent, project tools withheld without scope, unauthorized tool blocked, executor failure propagated truthfully. Synthetic provider/store/trace.');
}finally{globalThis.fetch=originalFetch;delete globalThis.__toolLoopState;}
