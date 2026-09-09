/* ============================================================================
   IL QUADRANTE SYNC — condiviso fra la pagina vera e DEV

   🔷 «Solo nel DEV in alto mi fai vedere la barra.» Prima esisteva solo dentro
   `TodayChecklistScreen`: per guardarla mentre si prova da DEV bisognava
   uscire, cambiare tab, e tornare indietro per premere di nuovo «+1 GIORNO».

   🔒 STESSO COMPONENTE, NON UNA COPIA. Se domani cambia come si calcola lo
   streak o come appare un traguardo raggiunto, cambia in un posto solo — la
   pagina vera e DEV non possono disallinearsi perché non c'è una seconda
   versione da dimenticare di aggiornare.

   In DEV i tre traguardi sono SOLO mostrati (nessun `onClick`): premerli per
   davvero resta un gesto della pagina vera, non un tasto rapido nascosto in
   un pannello di sviluppo.

   🔷 «La notifica di "MON IN CREAZIONE" mi piaceva» — quella è `GenerationDial`
   (system/GenerationDial.tsx): dodici trattini che si accendono uno alla
   volta, non una linea che cresce. Il quadrante SYNC adesso usa lo stesso
   principio, portato a 30 — un trattino per ogni giorno dei 30 che contano
   per il desiderio — invece del conic-gradient a fetta che aveva prima.
   Stessa idea del progetto, non un'invenzione nuova.

   🔷 «Se uso il due, il sette o il trenta, il SYNC deve fare meno due, meno
   sette, meno trenta.» Il numero che questo quadrante mostra ADESSO non è
   più lo streak grezzo — è `syncBalance()` (engine/syncRewards.ts): lo
   streak meno quanto già speso in premi. Chi lo chiama decide cosa passare;
   il quadrante si limita a disegnare il numero che riceve.
   ========================================================================= */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon, type IconName } from './Icon';
export function SyncDial({balance,evolutionReady,megaReady,wishReady,breedReady=false,onEvolve,onMega,onWish,onBreed}: {
  balance:number; evolutionReady:boolean; megaReady:boolean; wishReady:boolean; breedReady?:boolean;
  onEvolve?:()=>void; onMega?:()=>void; onWish?:()=>void; onBreed?:()=>void;
}) {
  return <div className="sync-check__dial">
    <div className="sync-check__ticks" aria-hidden="true">{Array.from({length:30},(_,i)=><i key={i} className={i<Math.min(balance,30)?'is-done':''} style={{'--dial-index':i} as CSSProperties}/>)}</div>
    <strong>{balance}</strong>
    <SyncCheckpoint value="2" icon="dna" ready={evolutionReady} className="sync-checkpoint--2" label="TUNE" onClick={onEvolve}/>
    <SyncCheckpoint value="7" icon="globe" ready={megaReady} className="sync-checkpoint--7" label="RISE" onClick={onMega}/>
    <SyncCheckpoint value="15" icon="branch" ready={breedReady} className="sync-checkpoint--15" label="BREED" onClick={onBreed}/>
    <SyncCheckpoint value="30" icon="sparkle" ready={wishReady} className="sync-checkpoint--30" label="WISH" onClick={onWish} tap/>
  </div>;
}
function SyncCheckpoint({value,icon,ready,className,label,onClick,tap=false}:{value:string;icon:IconName;ready:boolean;className:string;label:string;onClick?:()=>void;tap?:boolean}) {
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [holding,setHolding]=useState(false);
  const latest=useRef(onClick);latest.current=onClick;
  const cancel=()=>{if(timer.current!==null)clearTimeout(timer.current);timer.current=null;setHolding(false);};
  useEffect(()=>{if(!ready)cancel();return cancel;},[ready]);
  const start=()=>{if(!ready||tap||timer.current!==null)return;setHolding(true);timer.current=setTimeout(()=>{timer.current=null;setHolding(false);latest.current?.();},900);};
  const description=`${label} · ${value} SYNC${tap?'':' · tieni premuto'}`;
  if(!onClick)return <span className={`sync-checkpoint ${className}`} data-ready={ready} aria-label={description}><Icon name={icon}/></span>;
  return <button type="button" className={`sync-checkpoint ${className}`} data-ready={ready} data-holding={holding} disabled={!ready} aria-label={description} title={description}
    onPointerDown={e=>{if(e.button===0)start();}} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} onBlur={cancel}
    onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!tap){e.preventDefault();if(!e.repeat)start();}}}
    onKeyUp={e=>{if(!tap&&(e.key===' '||e.key==='Enter')){e.preventDefault();cancel();}}}
    onClick={e=>{if(tap)onClick();else if(e.detail===0&&!holding&&timer.current===null)onClick();}}
    onContextMenu={e=>e.preventDefault()}><Icon name={icon}/><svg className="sync-hold" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22"/></svg></button>;
}
