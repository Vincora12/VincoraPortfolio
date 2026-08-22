import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Overlay } from '../App';
import { useApp } from '../state/store';
import { Icon } from '../system/Icon';
import { STAT_KEYS, isKnown, type HealthState } from '../engine/types';
import { HEALTH_JOURNAL_EVENT, readHealthJournal, removeHealthEntry, type HealthJournal } from '../engine/healthJournal';

type View = 'today' | 'diet' | 'sport';
const visibleView = (view: HealthJournal['display']['focus']): View => view === 'progress' ? 'today' : view;
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = () => localDay(new Date());
const isToday = (at: string) => localDay(new Date(at)) === today();
const time = (at: string) => new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(at));

export function MeOverviewScreen({ onGo: _onGo }: { onGo: (o: Overlay) => void }) {
  const health = useApp((s) => s.health);
  const [journal, setJournal] = useState(readHealthJournal);
  const [view, setView] = useState<View>(() => visibleView(readHealthJournal().display.focus));
  const configuredFocus = useRef(journal.display.focus);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const update = () => { const next = readHealthJournal(); setJournal(next); if (next.display.focus !== configuredFocus.current) { configuredFocus.current = next.display.focus; setView(visibleView(next.display.focus)); } }; window.addEventListener(HEALTH_JOURNAL_EVENT, update); return () => window.removeEventListener(HEALTH_JOURNAL_EVENT, update); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [view]);
  const meals = journal.meals.filter((x) => isToday(x.at));
  const workouts = journal.workouts.filter((x) => isToday(x.at));
  const total = meals.reduce((s, x) => ({ kcal: s.kcal + x.kcal, protein: s.protein + x.protein, carbs: s.carbs + x.carbs, fat: s.fat + x.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const askAi = (prompt: string) => window.dispatchEvent(new CustomEvent('vinzmon-open-chat', { detail: { prompt } }));
  const remove = (kind: 'meal' | 'workout' | 'weight', id: string) => {
    if (window.confirm('Eliminare questa registrazione?')) removeHealthEntry(kind, id);
  };
  return <div className="screen me-health">
    <header className="me-health__header"><p>{new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p><button type="button" aria-label="Aggiungi con AI" onClick={() => askAi('Voglio aggiornare la mia salute: ')}><Icon name="plus" /></button></header>
    <nav className="me-health__tabs">{([['today', 'OGGI'], ['diet', 'DIETA'], ['sport', 'SPORT']] as const).map(([id, label]) => <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>)}</nav>
    <div className="me-health__scroll" ref={scrollRef}>
      {view === 'today' && <TodayRecap journal={journal} meals={meals} workouts={workouts} total={total} health={health} askAi={askAi} />}
      {view === 'diet' && <><Section title="PIANO ALIMENTARE">{journal.dietPlan ? <article className="me-health__plan"><h2>{journal.dietPlan.title}</h2><p>{journal.dietPlan.text}</p><small>Aggiornato {new Date(journal.dietPlan.updatedAt).toLocaleDateString('it-IT')}</small></article> : <Empty text="Allega la dieta in chat: VINZ.MON la leggerà e la salverà qui." />}</Section><Section title="STORICO PASTI">{journal.meals.length ? [...journal.meals].reverse().map(x => <Row key={x.id} title={x.slot} text={x.description} meta={`${x.kcal} kcal`} when={new Date(x.at).toLocaleDateString('it-IT')} chat={x.source === 'chat'} remove={() => remove('meal', x.id)} />) : <Empty text="Lo storico si riempirà dalla chat o dal log manuale." />}</Section></>}
      {view === 'sport' && <Section title="ALLENAMENTI" action="AGGIUNGI CON AI" click={() => askAi('Registra questo allenamento: ')}>{journal.workouts.length ? [...journal.workouts].reverse().map(x => <Row key={x.id} title={x.title} text={x.details} meta={`${x.minutes} minuti`} when={new Date(x.at).toLocaleDateString('it-IT')} chat={x.source === 'chat'} remove={() => remove('workout', x.id)} />) : <Empty text="Racconta un allenamento in chat oppure allega una foto." />}</Section>}
    </div>
  </div>;
}

function TodayRecap({ journal, meals, workouts, total, health, askAi }: { journal: HealthJournal; meals: HealthJournal['meals']; workouts: HealthJournal['workouts']; total: HealthJournal['targets']; health: HealthState; askAi: (prompt: string) => void }) {
  const latest = [...journal.meals, ...journal.workouts, ...journal.weights].map(x => new Date(x.at)).sort((a, b) => b.getTime() - a.getTime())[0];
  const workout = workouts.at(-1);
  const weight = journal.weights.at(-1)?.kg;
  const fixedMeals = new Set(meals.filter(x => x.slot !== 'extra').map(x => x.slot)).size;
  const extras = meals.filter(x => x.slot === 'extra').length;
  return <>
    <ProgressChart journal={journal} onClick={() => askAi('Analizza i miei progressi e dimmi come sto andando: ')} />
    <Nutrition total={total} targets={journal.targets} />
    <section className="me-health__today">
      <h2>OGGI</h2>
      <div>
        <article><Icon name="tell" /><strong>{fixedMeals}<small> / 5</small></strong><span>{extras ? `PASTI · ${extras} EXTRA` : 'PASTI'}</span></article>
        <article><Icon name="workout" /><strong>{workout?.title ?? 'RIPOSO'}</strong><span>{workout ? `${workout.minutes} MIN` : 'NESSUN LOG'}</span></article>
        <article><Icon name="measure" /><strong>{weight ? weight.toFixed(1) : '—'}<small>{weight ? ' KG' : ''}</small></strong><span>ULTIMO PESO</span></article>
      </div>
    </section>
    <Game health={health} />
    <section className="me-health__sync"><span>AGGIORNATO DALLA CHAT · {latest ? time(latest.toISOString()) : '—'}</span><strong>SINCRONIZZATO <Icon name="save" /></strong></section>
    <div className="me-health__actions">
      <button type="button" onClick={() => askAi('Aggiorna il mio riepilogo salute: ')}><Icon name="sparkle" />AGGIUNGI CON AI</button>
      <button type="button" onClick={() => askAi('')}><Icon name="tell" />APRI CHAT</button>
    </div>
  </>;
}

function ProgressChart({ journal, onClick }: { journal: HealthJournal; onClick: () => void }) {
  const values = journal.weights.slice(-8).map(x => x.kg);
  const target = Number(journal.display.goal?.match(/\d+(?:[.,]\d+)?(?=\s*kg)/i)?.[0]?.replace(',', '.')) || undefined;
  const series = values.length > 1 ? values : values.length === 1 && target ? [values[0], target] : values;
  const min = series.length ? Math.min(...series) : 0;
  const max = series.length ? Math.max(...series) : 1;
  const range = Math.max(1, max - min);
  const points = series.map((value, index) => `${series.length === 1 ? 140 : 8 + index * (264 / (series.length - 1))},${62 - ((value - min) / range) * 46}`).join(' ');
  const change = values.length > 1 ? values.at(-1)! - values[0] : undefined;
  return <button type="button" className="me-health__progress" onClick={onClick}>
    <header><span>ANDAMENTO</span><strong>{change === undefined ? 'IN ATTESA DI DATI' : `${change > 0 ? '+' : ''}${change.toFixed(1)} KG`}</strong></header>
    {series.length ? <svg viewBox="0 0 280 70" role="img" aria-label="Grafico dell’andamento del peso"><path d="M8 62H272" /><polyline points={points} />{series.map((value, index) => <circle key={`${value}-${index}`} cx={series.length === 1 ? 140 : 8 + index * (264 / (series.length - 1))} cy={62 - ((value - min) / range) * 46} r="3" />)}</svg> : <p>Registra il peso in chat per vedere qui i tuoi progressi.</p>}
    <footer><span>{values.at(-1) ? `${values.at(-1)!.toFixed(1)} KG ORA` : 'NESSUN PESO'}</span><span>{target ? `${target.toFixed(1)} KG TARGET` : 'TARGET DA DEFINIRE'}</span></footer>
  </button>;
}

function Nutrition({ total, targets }: { total: HealthJournal['targets']; targets: HealthJournal['targets'] }) { const pct = Math.min(100, Math.round(total.kcal / targets.kcal * 100)); return <section className="me-health__nutrition"><div className="me-health__calories"><div><small>ENERGIA</small><strong>{total.kcal.toLocaleString('it-IT')}</strong><span>/ {targets.kcal.toLocaleString('it-IT')} KCAL</span><Segments value={pct} count={14} /></div></div><div className="me-health__macros">{(['protein', 'carbs', 'fat'] as const).map(k => { const value = Math.min(100, total[k] / targets[k] * 100); return <div key={k}><span>{k === 'protein' ? 'PRO' : k === 'carbs' ? 'CARB' : 'FAT'}</span><strong>{total[k]}<small>g</small></strong><Segments value={value} count={8} /></div>; })}</div></section>; }
function Section({ title, action, click, children }: { title: string; action?: string; click?: () => void; children: ReactNode }) { return <section className="me-health__section"><header><h2>{title}</h2>{action && <button type="button" onClick={click}><Icon name="plus" />{action}</button>}</header>{children}</section>; }
function Row({ title, text, meta, when, chat, remove }: { title: string; text: string; meta: string; when: string; chat?: boolean; remove: () => void }) { return <article className="me-health__row"><div><strong>{title}</strong><p>{text}</p><small>{meta}{chat ? ' · DALLA CHAT' : ''}</small></div><time>{when}</time><button type="button" aria-label={`Elimina ${title}`} onClick={remove}><Icon name="close" /></button></article>; }
function Empty({ text }: { text: string }) { return <p className="me-health__empty">{text}</p>; }
function Game({ health }: { health: HealthState }) { const labels: Record<string, string> = { ATK: 'FORZA', SPD: 'VELOCITÀ', DEF: 'RESISTENZA', DISC: 'DISCIPLINA' }; const values = [...STAT_KEYS.filter(k => ['ATK', 'SPD', 'DEF'].includes(k)).map(k => [k, health.stats[k].value] as const), ['DISC', health.disc] as const]; return <section className="me-health__game"><h2>STAT VINZ.MON</h2><div>{values.map(([k, v]) => <article key={k}><span>{labels[k]}</span><Segments value={isKnown(v) ? v : 0} count={8} /><strong>{isKnown(v) ? Math.round(v) : '—'}</strong></article>)}</div></section>; }
function Segments({ value, count }: { value: number; count: number }) { const filled = Math.round(value / 100 * count); return <i className="me-health__segments" aria-label={`${Math.round(value)}%`}>{Array.from({ length: count }, (_, i) => <b key={i} className={i < filled ? 'is-filled' : ''} />)}</i>; }
