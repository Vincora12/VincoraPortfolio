import { useEffect, useState } from 'react';
import type { EvolutionJob } from '../state/store';
import './generation-activity.css';
export function GenerationActivity({job}:{job:EvolutionJob}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{if(job.status!=='running')return;const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[job.status]);
  const events=job.events??[];
  const last=events.at(-1);
  const age=last ? Math.max(0,Math.floor((now-Date.parse(last.at))/1000)) : null;
  const stale=job.lastCheckedAt&&now-Date.parse(job.lastCheckedAt)>15000;
  return <details className="generation-activity">
    <summary>Attività in diretta{job.status==='running'&&age!==null?` · ${age}s`:''}</summary>
    <p>{job.label} · {job.done}/{job.total}</p>
    {stale&&job.status==='running'&&<p>Il controllo del server non si aggiorna da più di 15 secondi.</p>}
    {!events.length&&<p>Il server non ha ancora fornito eventi dettagliati per questo lavoro.</p>}
    <ol aria-label="Eventi della generazione">{events.slice(-12).map((event,i)=><li key={`${event.at}:${i}`}><time>{new Date(event.at).toLocaleTimeString('it-IT')}</time><span>{event.text}</span></li>)}</ol>
    {job.status==='running'&&last&&<p role="status">Ultimo evento {age}s fa. {age!==null&&age>90?'Attesa prolungata; non è ancora arrivata una risposta conclusiva.':''}</p>}
    {job.error&&<p role="alert">{job.error}</p>}
  </details>;
}
