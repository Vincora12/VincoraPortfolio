import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

// Actual assistant-ui runtime + ownership barrier + conversation hook. Only
// network/storage boundaries are synthetic; no AI calls or production records.
const entry = `
import React,{useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {AssistantRuntimeProvider,useRemoteThreadListRuntime,useLocalRuntime,useAui,useAuiState} from '@assistant-ui/react';
import {createLocalStorageAdapter,createSimpleTitleAdapter} from '@assistant-ui/core/react';
import {withLocalUnsavedSession,isLocalUnsavedSession} from './src/assistant-original/conversation-lifecycle-adapter';
import {useConversationOptions} from './src/assistant-original/conversation-options';
import '@fontsource-variable/archivo';
import '@fontsource/ibm-plex-mono/400.css';
const adapter=withLocalUnsavedSession(createLocalStorageAdapter({storage:{getItem:async k=>localStorage.getItem(k),setItem:async(k,v)=>localStorage.setItem(k,v),removeItem:async k=>localStorage.removeItem(k)},prefix:'synthetic:',titleGenerator:createSimpleTitleAdapter()}),async()=>{});
const model={async *run(){throw new Error('AI must not run before user sends');}};
function Surface(){const aui=useAui();const options=useConversationOptions();const id=useAuiState(s=>s.threads.mainThreadId);const text=useAuiState(s=>s.thread.composer.text);useEffect(()=>{window.testAui=aui;window.isLocal=isLocalUnsavedSession;},[aui]);return <><div data-testid="scope">{options.scope.projectId??'GLOBAL'}</div><output data-testid="composer">{text}</output><div data-testid="thread">{id}</div>{options.controls}</>;}
function App(){const runtime=useRemoteThreadListRuntime({adapter,runtimeHook:()=>useLocalRuntime(model)});return <AssistantRuntimeProvider runtime={runtime}><React.Suspense fallback="Loading test runtime"><Surface/></React.Suspense></AssistantRuntimeProvider>}
window.addEventListener('vinz-workspace-close',()=>{document.body.dataset.closed='true'});
window.testLoaded=true;createRoot(document.getElementById('root')).render(<React.Suspense fallback="Loading root"><App/></React.Suspense>);`;
const stubs = {
  '../state/store': 'export const useApp=f=>f({token:"synthetic"}); export const syncWithServer=()=>{};export const resolveStateSyncConflict=()=>{};',
  '../projects/ProjectWorkspace': 'export const ProjectWorkspace=()=>null;',
  './components/assistant-ui/thread-list': 'export const ThreadListNew=()=>null;',
  '../ai/backend':'export const ask=()=>{throw new Error("AI disabled in test")};',
  '@/system/runtimeLog':'export const postRuntimeEvent=()=>{};',
  '@/system/chatLiveDebug':'export const markNextHistoryReadAsGated=()=>{};',
  './chat-room-presence':'export const requestManualRoomEntry=()=>{};',
};
const result=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'/tmp/vinz-workspace-test',jsx:'automatic',platform:'browser',alias:{'@':`${process.cwd()}/src`},define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl'},plugins:[{name:'synthetic-boundaries',setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path]}));}}]});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=result.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html');res.end(req.url==='/bundle.js'?js:req.url==='/style.css'?css:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>VINZ.MON test</title><link rel="stylesheet" href="/style.css"><style>body{margin:0;padding:16px;background:#090909;--font-mono:"IBM Plex Mono",monospace;--font-display:"Archivo Variable",sans-serif;--char-accent-on-dark:#19e4df;--char-on-accent-dark:#090909}#root{max-width:720px;margin:auto}[data-testid]{display:none}</style><div id="root"></div><script src="/bundle.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
try {
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)});
  page.on('console',msg=>{if(msg.type()==='error')console.error(msg.text())});
  const global={id:'vinzmon-global',title:'GLOBAL',revision:1,context:'',instructions:'',files:[],artifacts:[]};
  const group={...global,id:'project-test-1234',title:'VINCORA'};
  await page.route('**/api/**',async route=>{const u=new URL(route.request().url()); const id=u.searchParams.get('projectId');await route.fulfill({json:u.pathname==='/api/projects'?(id?{project:id===global.id?global:group}:{projects:u.searchParams.get('trash')==='true'?[]:[{...group,fileCount:0,artifactCount:0}]}):{events:[]}});});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Cambia progetto'}).waitFor({timeout:5000}).catch(async e=>{console.log('Errors',JSON.stringify(errors),await page.locator('body').innerHTML(),await page.evaluate(()=>({loaded:window.testLoaded,aui:!!window.testAui})));throw e;});
  await page.waitForFunction(()=>window.testAui&&document.querySelector('[aria-busy="false"]'));
  // Reproduce the actual pending optimistic initialize, not a mocked callback.
  await page.evaluate(()=>{window.testAui.threads.item('main').initialize();});
  await page.waitForFunction(()=>window.isLocal(window.testAui.threads.item('main').getState().id));
  await page.screenshot({path:`/tmp/vinz-workspace-home-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:/^Automazioni/}).click();
  await page.screenshot({path:`/tmp/vinz-workspace-automations-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Crea con l’AI',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="composer"]').textContent.includes('promemoria')&&document.body.dataset.closed==='true',null,{timeout:5000});
  assert.equal(await page.getByTestId('scope').textContent(),'GLOBAL');
  await page.getByRole('button',{name:'Spazio di lavoro',exact:true}).click();
  await page.getByRole('button',{name:'Cambia progetto'}).click();
  await page.getByRole('button',{name:/VINCORA/}).click();
  await page.getByRole('button',{name:/^Artefatti/}).click();
  await page.getByRole('button',{name:'Crea con l’AI',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="composer"]').textContent.includes('artefatto')&&document.querySelector('[data-testid="scope"]').textContent==='project-test-1234',null,{timeout:5000});
  assert.deepEqual(errors,[]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS',width,'actual pending initialize → automation composer; selected project → artifact composer; no overflow/errors');
  await page.close();
 }
} finally {await browser.close();server.close();}
