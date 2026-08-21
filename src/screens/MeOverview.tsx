import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import type { Overlay } from '../App';
import { useApp } from '../state/store';
import { STAT_KEYS, isKnown, type HealthState } from '../engine/types';
import { HEALTH_JOURNAL_EVENT, addMeal, addWeight, addWorkout, readHealthJournal, removeHealthEntry, type HealthJournal } from '../engine/healthJournal';

type View = 'today' | 'diet' | 'sport' | 'progress';
type Quick = 'meal' | 'workout' | 'weight' | null;
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = () => localDay(new Date());
const isToday = (at: string) => localDay(new Date(at)) === today();
const num = (v: FormDataEntryValue | null) => Math.max(0, Number(v) || 0);
const time = (at: string) => new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(at));

export function MeOverviewScreen({ onGo: _onGo }: { onGo: (o: Overlay) => void }) {
  const health = useApp((s) => s.health);
  const [journal, setJournal] = useState(readHealthJournal);
  const [view, setView] = useState<View>('today');
  const [quick, setQuick] = useState<Quick>(null);
  useEffect(() => { const update = () => setJournal(readHealthJournal()); window.addEventListener(HEALTH_JOURNAL_EVENT, update); return () => window.removeEventListener(HEALTH_JOURNAL_EVENT, update); }, []);
  const meals = journal.meals.filter((x) => isToday(x.at));
  const workouts = journal.workouts.filter((x) => isToday(x.at));
  const total = meals.reduce((s, x) => ({ kcal: s.kcal + x.kcal, protein: s.protein + x.protein, carbs: s.carbs + x.carbs, fat: s.fat + x.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const d = new FormData(e.currentTarget);
    if (quick === 'meal') addMeal({ slot: String(d.get('slot')) as 'colazione' | 'pranzo' | 'cena' | 'spuntino', description: String(d.get('description')), kcal: num(d.get('kcal')), protein: num(d.get('protein')), carbs: num(d.get('carbs')), fat: num(d.get('fat')) }, 'manual');
    if (quick === 'workout') addWorkout({ title: String(d.get('title')), details: String(d.get('details')), minutes: num(d.get('minutes')) }, 'manual');
    if (quick === 'weight') addWeight(num(d.get('kg')), 'manual');
    setQuick(null);
  };
  const remove = (kind: 'meal' | 'workout' | 'weight', id: string) => {
    if (window.confirm('Eliminare questa registrazione?')) removeHealthEntry(kind, id);
  };
  return <div className="screen me-health">
    <header className="me-health__header"><div><h1>ME</h1><p>{new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p></div><button type="button" aria-label="Aggiungi dato" onClick={() => setQuick(quick ? null : 'meal')}>＋</button></header>
    <nav className="me-health__tabs">{([['today', 'OGGI'], ['diet', 'DIETA'], ['sport', 'SPORT'], ['progress', 'PROGRESSI']] as const).map(([id, label]) => <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>)}</nav>
    {quick && <QuickForm kind={quick} setKind={setQuick} close={() => setQuick(null)} submit={submit} />}
    <div className="me-health__scroll">
      {view === 'today' && <><Nutrition total={total} targets={journal.targets} /><Section title="PASTI DI OGGI" action="AGGIUNGI PASTO" click={() => setQuick('meal')}>{meals.length ? meals.map(x => <Row key={x.id} title={x.slot} text={x.description} meta={`${x.kcal} kcal · P ${x.protein}g · C ${x.carbs}g · G ${x.fat}g`} when={time(x.at)} chat={x.source === 'chat'} remove={() => remove('meal', x.id)} />) : <Empty text="Nessun pasto registrato. Puoi scriverlo direttamente in chat." />}</Section><Section title="ALLENAMENTO DI OGGI" action="LOG RAPIDO" click={() => setQuick('workout')}>{workouts.length ? workouts.map(x => <Row key={x.id} title={x.title} text={x.details} meta={`${x.minutes} minuti`} when={time(x.at)} chat={x.source === 'chat'} remove={() => remove('workout', x.id)} />) : <Empty text="Nessun allenamento registrato oggi." />}</Section><Weight weight={journal.weights.at(-1)?.kg} click={() => setQuick('weight')} /><Game health={health} /></>}
      {view === 'diet' && <><Section title="PIANO ALIMENTARE">{journal.dietPlan ? <article className="me-health__plan"><h2>{journal.dietPlan.title}</h2><p>{journal.dietPlan.text}</p><small>Aggiornato {new Date(journal.dietPlan.updatedAt).toLocaleDateString('it-IT')}</small></article> : <Empty text="Allega la dieta in chat: VINZ.MON la leggerà e la salverà qui." />}</Section><Section title="STORICO PASTI">{journal.meals.length ? [...journal.meals].reverse().map(x => <Row key={x.id} title={x.slot} text={x.description} meta={`${x.kcal} kcal`} when={new Date(x.at).toLocaleDateString('it-IT')} chat={x.source === 'chat'} remove={() => remove('meal', x.id)} />) : <Empty text="Lo storico si riempirà dalla chat o dal log manuale." />}</Section></>}
      {view === 'sport' && <Section title="ALLENAMENTI" action="NUOVO" click={() => setQuick('workout')}>{journal.workouts.length ? [...journal.workouts].reverse().map(x => <Row key={x.id} title={x.title} text={x.details} meta={`${x.minutes} minuti`} when={new Date(x.at).toLocaleDateString('it-IT')} chat={x.source === 'chat'} remove={() => remove('workout', x.id)} />) : <Empty text="Racconta un allenamento in chat oppure aggiungilo qui." />}</Section>}
      {view === 'progress' && <><Section title="PESO" action="AGGIORNA" click={() => setQuick('weight')}>{journal.weights.length ? [...journal.weights].reverse().map(x => <Row key={x.id} title={`${x.kg.toFixed(1)} kg`} text="Peso corporeo" meta={x.source === 'chat' ? 'Registrato dalla chat' : 'Inserimento manuale'} when={new Date(x.at).toLocaleDateString('it-IT')} remove={() => remove('weight', x.id)} />) : <Empty text="Aggiungi la prima misurazione." />}</Section><Game health={health} /></>}
    </div>
  </div>;
}

function Nutrition({ total, targets }: { total: HealthJournal['targets']; targets: HealthJournal['targets'] }) { return <section className="me-health__nutrition"><div className="me-health__calories"><strong>{total.kcal.toLocaleString('it-IT')}</strong><span>/ {targets.kcal.toLocaleString('it-IT')} kcal</span><i style={{ '--progress': `${Math.min(100, total.kcal / targets.kcal * 100)}%` } as CSSProperties} /></div><div className="me-health__macros">{(['protein', 'carbs', 'fat'] as const).map(k => <div key={k}><span>{k === 'protein' ? 'PROTEINE' : k === 'carbs' ? 'CARBOIDRATI' : 'GRASSI'}</span><strong>{total[k]} g</strong><i><b style={{ width: `${Math.min(100, total[k] / targets[k] * 100)}%` }} /></i><small>{total[k]} / {targets[k]}</small></div>)}</div></section>; }
function Section({ title, action, click, children }: { title: string; action?: string; click?: () => void; children: ReactNode }) { return <section className="me-health__section"><header><h2>{title}</h2>{action && <button type="button" onClick={click}>＋ {action}</button>}</header>{children}</section>; }
function Row({ title, text, meta, when, chat, remove }: { title: string; text: string; meta: string; when: string; chat?: boolean; remove: () => void }) { return <article className="me-health__row"><div><strong>{title}</strong><p>{text}</p><small>{meta}{chat ? ' · DALLA CHAT' : ''}</small></div><time>{when}</time><button type="button" aria-label={`Elimina ${title}`} onClick={remove}>×</button></article>; }
function Empty({ text }: { text: string }) { return <p className="me-health__empty">{text}</p>; }
function Weight({ weight, click }: { weight?: number; click: () => void }) { return <section className="me-health__weight"><div><span>PESO CORPOREO</span><strong>{weight ? `${weight.toFixed(1)} kg` : '—'}</strong></div><button type="button" onClick={click}>AGGIORNA</button></section>; }
function Game({ health }: { health: HealthState }) { const labels: Record<string, string> = { ATK: 'FORZA', SPD: 'VELOCITÀ', DEF: 'RESISTENZA', DISC: 'DISCIPLINA' }; const values = [...STAT_KEYS.filter(k => ['ATK', 'SPD', 'DEF'].includes(k)).map(k => [k, health.stats[k].value] as const), ['DISC', health.disc] as const]; return <section className="me-health__game"><h2>STATISTICHE VINZ.MON</h2><div>{values.map(([k, v]) => <article key={k}><span>{labels[k]}</span><strong>{isKnown(v) ? Math.round(v) : '—'}</strong><i><b style={{ width: `${isKnown(v) ? v : 0}%` }} /></i></article>)}</div></section>; }
function QuickForm({ kind, setKind, close, submit }: { kind: Exclude<Quick, null>; setKind: (v: Quick) => void; close: () => void; submit: (e: FormEvent<HTMLFormElement>) => void }) { return <div className="me-health__quick"><nav>{([['meal', 'PASTO'], ['workout', 'SPORT'], ['weight', 'PESO']] as const).map(([id, label]) => <button type="button" key={id} aria-current={kind === id ? 'page' : undefined} onClick={() => setKind(id)}>{label}</button>)}</nav><form onSubmit={submit}>{kind === 'meal' && <><select name="slot"><option value="colazione">Colazione</option><option value="pranzo">Pranzo</option><option value="cena">Cena</option><option value="spuntino">Spuntino</option></select><input name="description" required placeholder="Cosa hai mangiato?" /><div><input name="kcal" inputMode="decimal" placeholder="kcal" /><input name="protein" inputMode="decimal" placeholder="proteine" /><input name="carbs" inputMode="decimal" placeholder="carboidrati" /><input name="fat" inputMode="decimal" placeholder="grassi" /></div></>}{kind === 'workout' && <><input name="title" required placeholder="Allenamento" /><input name="details" placeholder="Esercizi, serie, ripetizioni" /><input name="minutes" inputMode="decimal" placeholder="Minuti" /></>}{kind === 'weight' && <input name="kg" required inputMode="decimal" placeholder="Peso in kg" />}<footer><button type="button" onClick={close}>ANNULLA</button><button type="submit">SALVA</button></footer></form></div>; }
