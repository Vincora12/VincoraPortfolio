import { authorize, denied, json } from './_shared/auth';
import { searchPersonalMemory } from './_shared/core/memory';
import { getStore } from './_shared/localStore';
import { MACHINE_STORE, MACHINE_STATE_KEY } from './_shared/machineConversationContext';
export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method !== 'POST') return json({error:'metodo non supportato'},405);
  let query: string;
  try { const body=await request.json(); query=typeof body.query==='string'?body.query.trim().slice(0,1000):''; } catch { return json({error:'body non valido'},400); }
  if (!query) return json({material:[]});
  const [memories, machines] = await Promise.all([
    searchPersonalMemory(query,4).catch(()=>[]),
    getStore(MACHINE_STORE).get(MACHINE_STATE_KEY,{type:'json'}).catch(()=>null),
  ]);
  const state=machines as {memon?:{observations?:Array<{statement?:string;timestamp?:string;sourceIds?:string[]}>};me?:{meSummary?:{summary?:string}};reflection?:{observations?:Array<{statement?:string;timestamp?:string;sourceIds?:string[]}>}}|null;
  const terms=query.toLowerCase().match(/[\p{L}]{5,}/gu)??[];
  const relevant=(text:string)=>terms.some(t=>text.toLowerCase().includes(t));
  const reflection=state?.reflection?.observations?.filter(o=>o.statement&&o.sourceIds?.length&&relevant(o.statement)).at(-1);
  const self=state?.memon?.observations?.filter(o=>o.statement&&o.sourceIds?.length&&relevant(o.statement)).at(-1);
  const material=[...(self?[{id:`memon:${self.timestamp}`,text:self.statement!.slice(0,650),epistemic:'AI_CONNECTION',source:'ME.MON autoriflessione'}]:[]),...memories.slice(0,4).map((m,i)=>({id:m.id??`mem:${i}`,text:m.text.slice(0,650),epistemic:'FACT',source:'Mem0'})),
    ...(state?.me?.meSummary?.summary?[{id:'me:current',text:state.me.meSummary.summary.slice(0,650),epistemic:'AI_CONNECTION',source:'ME sintesi derivata'}]:[]),
    ...(reflection?[{id:`reflection:${reflection.timestamp}`,text:reflection.statement!.slice(0,650),epistemic:'AI_CONNECTION',source:'Reflection'}]:[]),
  ];
  return json({material});
}
export const config={path:'/api/narrative-material'};
