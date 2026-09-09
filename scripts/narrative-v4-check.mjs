import assert from 'node:assert/strict';import {build} from 'esbuild';
const root=process.cwd();globalThis.fixtureNarrative={calls:[],answer:''};
const result=await build({stdin:{contents:`export {default as material} from './netlify/functions/narrative-material';export * from './src/ai/narratorPrompt';export {bioFactsOf,writeBioWithAi} from './src/ai/bioWriter';export {generateFirstMon} from './src/engine/characterGenerator';export {initialHealthState} from './src/engine/health';export {neutralPersonality,EMPTY_NOVELTY} from './src/engine/signals';export {buildNarrativeContext} from './src/engine/narrativeContext';export {seedWorld} from './src/engine/world';`,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'synthetic-io',setup(b){
b.onLoad({filter:/src\/ai\/backend\.ts$/},()=>({contents:`export const askLong=async()=>{throw new Error("unexpected resolver")}; export const askImage=async()=>{throw new Error("unexpected image")}; export const ask=async(token,input)=>{globalThis.fixtureNarrative.calls.push(input);return {data:{text:globalThis.fixtureNarrative.answer},failure:null,detail:null};};`}));
b.onLoad({filter:/_shared\/auth\.ts$/},()=>({contents:`export const authorize=r=>({ok:r.headers.get('authorization')==='Bearer fixture'});export const denied=()=>Response.json({error:'unauthorized'},{status:401});export const json=(v,status=200)=>Response.json(v,{status});`}));
b.onLoad({filter:/_shared\/localStore\.ts$/},()=>({contents:`export const getStore=()=>({get:async()=>({memon:{observations:[{statement:'Il ponte mi fa ripensare al mio gusto precedente.',timestamp:'self-now',sourceIds:['GUSTI ATTUALI','GUSTI PRECEDENTI']}]},me:{meSummary:{summary:'Sintesi corrente'}},reflection:{observations:[{statement:'Il ponte potrebbe essere un passaggio importante.',timestamp:'now',sourceIds:['m1']},{statement:'Forse cerca una pizza.',sourceIds:['m2']}]}})});`}));
b.onLoad({filter:/_shared\/core\/memory\.ts$/},()=>({contents:`export const searchPersonalMemory=async(query,limit)=>[{id:'m1',text:'Ha parlato del ponte.'}].slice(0,limit);`}));
}}]});const m=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
assert.equal((await m.material(new Request('http://fixture',{method:'POST'}))).status,401);
const material=await (await m.material(new Request('http://fixture',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify({query:'ponte'})}))).json();
assert.equal(material.material.length,4);assert.equal(material.material.find(x=>x.source==='Mem0').epistemic,'FACT');assert.ok(material.material.some(x=>x.source==='Reflection'&&x.epistemic==='AI_CONNECTION'));assert.ok(!material.material.some(x=>x.text.includes('pizza')));
const input={day:1,health:m.initialHealthState(),personality:m.neutralPersonality(),moodHistory:[],cultural:{},novelty:m.EMPTY_NOVELTY,mindlineDepth:0,bond:10,dataConfidence:0,activeDays:1,branchCount:0};const record=m.generateFirstMon({input,mindlineNodeId:'origin',originNodeId:null,lineageNames:[],seed:17}).record;const world=m.seedWorld(record,1);const ctx=m.buildNarrativeContext({currentMon:record,world,material:material.material});
const name=record.data.name.replace(/\.mon$/,'').toUpperCase();
globalThis.fixtureNarrative.answer=JSON.stringify({lines:[name+' nasce a NUL.','Sabbia, mare e cielo.','Il primo incontro comincia qui.']});let out=await m.writeNarratorWithAi('fixture',record,null,ctx);assert.ok(out.line);assert.ok(globalThis.fixtureNarrative.calls.at(-1).user.includes('Reflection'));assert.ok(globalThis.fixtureNarrative.calls.at(-1).user.includes('AI_CONNECTION'));
const bio=m.bioFactsOf(record,{memories:[],narrative:ctx});assert.ok(bio.includes('Reflection'));assert.ok(bio.includes('Evento: BABY'));
globalThis.fixtureNarrative.answer=JSON.stringify({lines:[name,'SEGNALE RILEVATO','TRACCIA APERTA']});out=await m.writeNarratorWithAi('fixture',record,null,ctx);assert.equal(out.line,null);
globalThis.fixtureNarrative.answer='{}';assert.equal((await m.writeNarratorWithAi('fixture',record,null,ctx)).line,null);
console.log('PASS narrative material auth, bounded sourced retrieval, relevant Reflection only, shared Bio/Narrator context, prose response, malformed and terminal-style rejection. Synthetic IO, no real AI.');

const scene=m.narratorFallbackLine(record,ctx);
assert.match(scene,/NUL/);assert.match(scene,/incontri/);assert.match(scene,/si avvicina/);assert.doesNotMatch(scene,/senza un passato inventato|salvataggio|backup|generazione/);
assert.match(m.NARRATOR_RULES,/voce saggia/);assert.match(m.NARRATOR_RULES,/non inventare decisioni/i);
assert.match(m.NARRATOR_RULES,/MESSA IN SCENA/);
console.log('PASS wise visual narrator: encounter staging, player agency, separation from real biography, no implementation language in BABY fallback.');

globalThis.fixtureNarrative.answer=JSON.stringify({lines:[name+' si avvicina sulla sabbia di NUL. Il mare si ritira.']});assert.ok((await m.writeNarratorWithAi('fixture',record,null,ctx)).line);
globalThis.fixtureNarrative.answer=JSON.stringify({lines:[name+' '+Array(81).fill('mare').join(' ')]});assert.equal((await m.writeNarratorWithAi('fixture',record,null,ctx)).line,null);
assert.ok(scene.split(/\s+/).length<=80);

const portrait=[{subject:'Opera di prova A',stance:'love',reason:'Mi attira la sua ostinazione.',tension:'Non condivido ogni sua scelta.'},{subject:'Opera di prova B',stance:'hate',reason:'Mi irrita la sua certezza.',tension:'Ne apprezzo però la precisione.'},{subject:'Opera di prova C',stance:'curious',reason:'Mette in dubbio ciò che cerco.',tension:'Non ho ancora una posizione.'}];
const reply={story:'Dal giorno 1 provo a capire cosa merita la mia attenzione. Non tutto ciò che ammiro mi somiglia.',annotations:['Ci penso ancora.'],rememberedDetails:[],culturalPortrait:portrait};
globalThis.fixtureNarrative.answer=JSON.stringify(reply);
const written=await m.writeBioWithAi('fixture',record,null,{memories:[],narrative:ctx});assert.deepEqual(written.bio.culturalPortrait,portrait);
const nextCtx={...ctx,previousMon:{...record,writtenBio:written.bio}};assert.ok(m.bioFactsOf(record,{memories:[],narrative:nextCtx}).includes('Opera di prova A'));
globalThis.fixtureNarrative.answer=JSON.stringify({...reply,culturalPortrait:[{subject:'broken'}]});assert.equal((await m.writeBioWithAi('fixture',record)).bio,null);
console.log('PASS cultural portrait retained separately from short bio, inherited by next writer, malformed profile rejected. Synthetic works only.');

assert.ok(material.material.some(x=>x.source==='ME.MON autoriflessione'&&x.epistemic==='AI_CONNECTION'));
