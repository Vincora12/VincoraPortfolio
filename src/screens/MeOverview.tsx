import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Overlay } from '../App';
import { useApp } from '../state/store';
import { Icon } from '../system/Icon';
import { STAT_KEYS, isKnown, type HealthState } from '../engine/types';
import { HEALTH_JOURNAL_EVENT, readHealthJournal, removeHealthEntry, type HealthJournal } from '../engine/healthJournal';

type View = 'today' | 'diet' | 'sport' | 'progress';
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = () => localDay(new Date());
const isToday = (at: string) => localDay(new Date(at)) === today();
const time = (at: string) => new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(at));

export function MeOverviewScreen({ onGo: _onGo }: { onGo: (o: Overlay) => void }) {
  const health = useApp((s) => s.health);
  const [journal, setJournal] = useState(readHealthJournal);
  const [view, setView] = useState<View>(() => readHealthJournal().display.focus);
  const configuredFocus = useRef(journal.display.focus);
  useEffect(() => { const update = () => { const next = readHealthJournal(); setJournal(next); if (next.display.focus !== configuredFocus.current) { configuredFocus.current = next.display.focus; setView(next.display.focus); } }; window.addEventListener(HEALTH_JOURNAL_EVENT, update); return () => window.removeEventListener(HEALTH_JOURNAL_EVENT, update); }, []);
  const meals = journal.meals.filter((x) => isToday(x.at));
  const workouts = journal.workouts.filter((x) => isToday(x.at));
  const total = meals.reduce((s, x) => ({ kcal: s.kcal + x.kcal, protein: s.protein + x.protein, carbs: s.carbs + x.carbs, fat: s.fat + x.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const askAi = (prompt: string) => window.dispatchEvent(new CustomEvent('vinzmon-open-chat', { detail: { prompt } }));
  const remove = (kind: 'meal' | 'workout' | 'weight', id: string) => {
    if (window.confirm('Eliminare questa registrazione?')) removeHealthEntry(kind, id);
  };
  return <div className="screen me-health">
    <header className="me-health__header"><div><h1>ME</h1><p>{new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p></div><button type="button" aria-label="Aggiungi con AI" onClick={() => askAi('Voglio aggiornare la mia salute: ')}><Icon name="plus" /></button></header>
    <nav className="me-health__tabs">{([['today', 'OGGI'], ['diet', 'DIETA'], ['sport', 'SPORT'], ['progress', 'PROGRESSI']] as const).map(([id, label]) => <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>)}</nav>
    {journal.display.goal && <button type="button" className="me-health__goal" onClick={() => askAi(`Parliamo del mio obiettivo: ${journal.display.goal}`)}><i><Icon name="scan" /></i><span>OBIETTIVO DEL PERIODO</span><strong>{journal.display.goal}</strong></button>}
    <div className="me-health__scroll">
      {view === 'today' && <><Nutrition total={total} targets={journal.targets} /><Section title="PASTI DI OGGI" action="AGGIUNGI CON AI" click={() => askAi('Registra questo pasto: ')}>{meals.length ? meals.map(x => <Row key={x.id} title={x.slot} text={x.description} meta={`${x.kcal} kcal · P ${x.protein}g · C ${x.carbs}g · G ${x.fat}g`} when={time(x.at)} chat={x.source === 'chat'} remove={() => remove('meal', x.id)} />) : <Empty text="Scrivi cosa hai mangiato in chat oppure allega una foto." />}</Section><Section title="ALLENAMENTO DI OGGI" action="AGGIUNGI CON AI" click={() => askAi('Registra questo allenamento: ')}>{workouts.length ? workouts.map(x => <Row key={x.id} title={x.title} text={x.details} meta={`${x.minutes} minuti`} when={time(x.at)} chat={x.source === 'chat'} remove={() => remove('workout', x.id)} />) : <Empty text="Racconta l’allenamento in chat: l’AI compilerà questa sezione." />}</Section><Weight weight={journal.weights.at(-1)?.kg} click={() => askAi('Registra il mio peso: ')} /><Game health={health} /></>}
      {view === 'diet' && <><Section title="PIANO ALIMENTARE">{journal.dietPlan ? <article className="me-health__plan"><h2>{journal.dietPlan.title}</h2><p>{journal.dietPlan.text}</p><small>Aggiornato {new Date(journal.dietPlan.updatedAt).toLocaleDateString('it-IT')}</small></article> : <Empty text="Allega la dieta in chat: VINZ.MON la leggerà e la salverà qui." />}</Section><Section title="STORICO PASTI">{journal.meals.length ? [...journal.meals].reverse().map(x => <Row key={x.id} title={x.slot} text={x.description} meta={`${x.kcal} kcal`} when={new Date(x.at).toLocaleDateString('it-IT')} chat={x.source === 'chat'} remove={() => remove('meal', x.id)} />) : <Empty text="Lo storico si riempirà dalla chat o dal log manuale." />}</Section></>}
      {view === 'sport' && <Section title="ALLENAMENTI" action="AGGIUNGI CON AI" click={() => askAi('Registra questo allenamento: ')}>{journal.workouts.length ? [...journal.workouts].reverse().map(x => <Row key={x.id} title={x.title} text={x.details} meta={`${x.minutes} minuti`} when={new Date(x.at).toLocaleDateString('it-IT')} chat={x.source === 'chat'} remove={() => remove('workout', x.id)} />) : <Empty text="Racconta un allenamento in chat oppure allega una foto." />}</Section>}
      {view === 'progress' && <><Section title="PESO" action="AGGIUNGI CON AI" click={() => askAi('Registra il mio peso: ')}>{journal.weights.length ? [...journal.weights].reverse().map(x => <Row key={x.id} title={`${x.kg.toFixed(1)} kg`} text="Peso corporeo" meta={x.source === 'chat' ? 'Registrato dalla chat' : 'Inserimento manuale'} when={new Date(x.at).toLocaleDateString('it-IT')} remove={() => remove('weight', x.id)} />) : <Empty text="Comunica il peso alla chat per iniziare lo storico." />}</Section><Game health={health} /></>}
    </div>
  </div>;
}

function Nutrition({ total, targets }: { total: HealthJournal['targets']; targets: HealthJournal['targets'] }) { const pct = Math.min(100, Math.round(total.kcal / targets.kcal * 100)); return <section className="me-health__nutrition"><div className="me-health__calories"><div><strong>{total.kcal.toLocaleString('it-IT')}</strong><span>/ {targets.kcal.toLocaleString('it-IT')} KCAL</span><Segments value={pct} count={14} /></div><CalorieRing value={pct} /></div><div className="me-health__macros">{(['protein', 'carbs', 'fat'] as const).map(k => { const value = Math.min(100, total[k] / targets[k] * 100); return <div key={k}><span>{k === 'protein' ? 'PROTEINE' : k === 'carbs' ? 'CARBOIDRATI' : 'GRASSI'}</span><strong>{total[k]} <small>/ {targets[k]} g</small></strong><Segments value={value} count={8} /></div>; })}</div></section>; }
function Section({ title, action, click, children }: { title: string; action?: string; click?: () => void; children: ReactNode }) { return <section className="me-health__section"><header><h2>{title}</h2>{action && <button type="button" onClick={click}><Icon name="plus" />{action}</button>}</header>{children}</section>; }
function Row({ title, text, meta, when, chat, remove }: { title: string; text: string; meta: string; when: string; chat?: boolean; remove: () => void }) { return <article className="me-health__row"><div><strong>{title}</strong><p>{text}</p><small>{meta}{chat ? ' · DALLA CHAT' : ''}</small></div><time>{when}</time><button type="button" aria-label={`Elimina ${title}`} onClick={remove}><Icon name="close" /></button></article>; }
function Empty({ text }: { text: string }) { return <p className="me-health__empty">{text}</p>; }
function Weight({ weight, click }: { weight?: number; click: () => void }) { return <section className="me-health__weight"><div><span>PESO CORPOREO</span><strong>{weight ? `${weight.toFixed(1)} kg` : '—'}</strong></div><button type="button" onClick={click}>AGGIORNA</button></section>; }
function Game({ health }: { health: HealthState }) { const labels: Record<string, string> = { ATK: 'FORZA', SPD: 'VELOCITÀ', DEF: 'RESISTENZA', DISC: 'DISCIPLINA' }; const values = [...STAT_KEYS.filter(k => ['ATK', 'SPD', 'DEF'].includes(k)).map(k => [k, health.stats[k].value] as const), ['DISC', health.disc] as const]; return <section className="me-health__game"><h2>STAT VINZ.MON</h2><div>{values.map(([k, v]) => <article key={k}><span>{labels[k]}</span><Segments value={isKnown(v) ? v : 0} count={8} /><strong>{isKnown(v) ? Math.round(v) : '—'}</strong></article>)}</div></section>; }
function Segments({ value, count }: { value: number; count: number }) { const filled = Math.round(value / 100 * count); return <i className="me-health__segments" aria-label={`${Math.round(value)}%`}>{Array.from({ length: count }, (_, i) => <b key={i} className={i < filled ? 'is-filled' : ''} />)}</i>; }
function CalorieRing({ value }: { value: number }) { const radius = 27; const dash = 2 * Math.PI * radius; return <div className="me-health__ring"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r={radius} /><circle cx="32" cy="32" r={radius} style={{ strokeDasharray: dash, strokeDashoffset: dash * (1 - value / 100) }} /></svg><strong>{value}%</strong><small>DEL TARGET</small></div>; }
