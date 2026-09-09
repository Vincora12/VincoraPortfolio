import { Icon } from '../system/Icon';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { syncBalance, syncRewardProgress, readEvolutionWish, saveEvolutionWish, clearEvolutionWish } from '../engine/syncRewards';
import { displayName } from '../engine/types';
import { AssetSlot } from '../system/AssetSlot';
import './journey-actions.css';

type Choice = 'evolution' | 'mega-evolution' | 'breed' | 'wish';
const labels = {evolution:'TUNE','mega-evolution':'RISE',breed:'BREED',wish:'MAKE A WISH'};
const costs = {evolution:2,'mega-evolution':7,breed:15,wish:30};
export function NewBranchScreen() {
  const open=useApp(s=>s.evolutionDialogOpen || s.phase==='form-evolution');
  const close=useApp(s=>s.closeEvolutionDialog);
  const pendingChoice=useApp(s=>s.pendingEvolutionChoice);
  const begin=useApp(s=>s.beginFormEvolution), startBreed=useApp(s=>s.startBreed), revealBreed=useApp(s=>s.revealBreed);
  const mons=useApp(s=>s.mons), nodes=useApp(s=>s.nodes), activeName=useApp(s=>s.activeMonName);
  const job=useApp(s=>s.breedJob), running=useApp(s=>s.evolutionJob?.status==='running'), skipBreedWait=useApp(s=>s.dev.skipBreedWait);
  useApp(s=>s.syncWallet);
  const [choice,setChoice]=useState<Choice>('evolution'), [wish,setWish]=useState(''), [wishKind,setWishKind]=useState<'evolution'|'mega-evolution'>('evolution');
  const [parents,setParents]=useState<string[]>([]), [error,setError]=useState('');
  const [animation,setAnimation]=useState<Choice|null>(null), [now,setNow]=useState(Date.now());
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open){const old=readEvolutionWish();setChoice(pendingChoice??(old?'wish':'evolution'));setWish(old?.text??'');setWishKind(old?.kind??'evolution');setError('');dialog.current?.showModal();}else dialog.current?.close();},[open,pendingChoice]);
  useEffect(()=>{if(!job)return;const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[job]);
  useEffect(()=>{if(!animation)return;const id=setTimeout(()=>setAnimation(null),2600);return()=>clearTimeout(id);},[animation]);
  const candidates=Object.values(mons).filter(m=>nodes.some(n=>n.monName===m.data.name));
  const ready=syncRewardProgress(choice).ready;
  const confirm=()=>{
    if(!ready || running)return;
    if(choice==='breed') {
      if(parents.length!==2)return;
      const problem=startBreed(parents[0]!,parents[1]!);if(problem){setError(problem);return;}
      setAnimation('breed');close();return;
    }
    if(choice==='wish'){if(!wish.trim())return;saveEvolutionWish({text:wish.trim(),kind:wishKind});} else clearEvolutionWish();
    const kind=choice==='wish'?wishKind:choice;
    if(kind==='evolution'||kind==='mega-evolution'){setAnimation(kind);begin(kind);}
  };
  const remaining=job?(skipBreedWait?0:Math.max(0,job.readyAt-now)):0;
  return <>

    <dialog className="sync-wish journey-dialog" ref={dialog} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===dialog.current)close();}}>
      <div className="sync-wish__panel journey-dialog__body">
        <button className="sync-wish__close" onClick={close} aria-label="Chiudi"><Icon name="close" /></button>
        <h2>Il prossimo passaggio</h2><p className="journey-dialog__balance">{syncBalance()} SYNC disponibili</p>
        <div className="sync-wish__kind journey-actions">{(Object.keys(labels) as Choice[]).map(k=><button key={k} aria-pressed={choice===k} onClick={()=>{setChoice(k);setError('');}}>{labels[k]}<small>{costs[k]} SYNC</small></button>)}</div>
        <h3>{labels[choice]} · {costs[choice]} SYNC</h3>
        <p>{choice==='evolution'?'Cresci nello stesso World: BABY diventa ROOKIE, ROOKIE resta ROOKIE. Da BASIC prosegui negli stadi successivi. La forma precedente resta come backup.':choice==='mega-evolution'?'Attraversi la soglia verso un nuovo World e riparti da BASIC. La forma precedente resta come backup.':choice==='breed'?'Due backup della stessa coscienza danno origine a un BABY in NUL dopo 24 ore. Entrambi restano intatti.':'Dichiara un desiderio sul Mon, sul viaggio o sul luogo. Guiderà una TUNE o una RISE: il costo totale è 30 SYNC.'}</p>
        {choice==='breed' && <fieldset><legend>Due backup dalla MindMap</legend><div className="breed-parents">{candidates.map(m=><label key={m.data.name}><input type="checkbox" checked={parents.includes(m.data.name)} disabled={!parents.includes(m.data.name)&&parents.length===2} onChange={()=>setParents(p=>p.includes(m.data.name)?p.filter(n=>n!==m.data.name):[...p,m.data.name])}/><AssetSlot monName={m.data.name} type="character_toy" fallbackTypes={['character_master']} alt={displayName(m.data.name)} fit="cover" compactPlaceholder className="breed-parents__portrait" />{displayName(m.data.name)} · {m.data.evolution_state?.label??'FORMA'}</label>)}</div></fieldset>}
        {choice==='wish' && <><label>Il tuo desiderio<textarea value={wish} onChange={e=>setWish(e.target.value)} maxLength={1000} placeholder="Vorrei esplorare un luogo dove…"/></label><fieldset><legend>Come vuoi realizzarlo?</legend><label><input type="radio" checked={wishKind==='evolution'} onChange={()=>setWishKind('evolution')}/>TUNE · stesso World</label><label><input type="radio" checked={wishKind==='mega-evolution'} onChange={()=>setWishKind('mega-evolution')}/>RISE · nuovo World</label></fieldset></>}
        {job && <p role="status">{remaining>0?`BREED in corso. Il BABY sarà pronto il ${new Date(job.readyAt).toLocaleString('it-IT')}. Puoi chiudere l’app.`:'Il nuovo BABY è pronto a nascere in NUL.'}</p>}
        {job && remaining===0 && <button disabled={running} onClick={()=>{revealBreed();close();}}>INCONTRA IL BABY</button>}
        {error&&<p role="alert">{error}</p>}
        <button className="sync-wish__submit" disabled={!ready||running||(choice==='breed'&&(parents.length!==2||Boolean(job)))||(choice==='wish'&&!wish.trim())} onClick={confirm}>CONFERMA {labels[choice]} · {costs[choice]} SYNC</button>
        <small>Il costo viene addebitato solo alla conferma. La memoria resta condivisa.</small>
      </div>
    </dialog>
    {animation && <div className={`journey-animation journey-animation--${animation}`} role="status" aria-label={labels[animation]}>
      {animation==='breed'?<><div className="breed-pair">{parents.map(n=><AssetSlot key={n} monName={n} type="character_master" alt={displayName(n)}/>)}</div><div className="breed-censor">!? ♥ ▦</div></>:animation==='evolution'?<svg className="tune-waves" width="280" height="140" viewBox="0 0 280 140" aria-hidden="true"><path d="M10 70 Q35 10 60 70 T110 70 T160 70 T210 70 T260 70"/><path d="M10 70 Q35 10 60 70 T110 70 T160 70 T210 70 T260 70"/></svg>:<div className="rise-shape">{activeName&&<AssetSlot monName={activeName} type="character_master" alt="La forma attraversa la soglia"/>}</div>}
      <strong>{labels[animation]}</strong>
    </div>}
  </>;
}
