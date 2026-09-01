import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Overlay } from '../App';
import { useApp } from '../state/store';
import { Icon } from '../system/Icon';
import { HEALTH_JOURNAL_EVENT, addWorkout, readHealthJournal, removeHealthEntry, type HealthJournal } from '../engine/healthJournal';
import { dateForDay } from '../engine/progression';
import { MeCalendar, calendarDateKey } from './MeCalendar';
import { MEALS, TodayChecklistScreen, workoutIcon } from './TodayChecklist';
import { savedToken } from '../brain/stream';

type View = 'today' | 'diet' | 'sport' | 'memory';
const visibleView = (view: HealthJournal['display']['focus']): View => view === 'progress' ? 'today' : view;
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function MeOverviewScreen({ onGo: _onGo }: { onGo: (o: Overlay) => void }) {
  const day = useApp((s) => s.day);
  const startedAt = useApp((s) => s.startedAt);
  const [journal, setJournal] = useState(readHealthJournal);
  const [view, setView] = useState<View>(() => visibleView(readHealthJournal().display.focus));
  const [selectedDate, setSelectedDate] = useState(() => dateForDay(day, startedAt));
  const [timerOpen, setTimerOpen] = useState(false);
  const [memory, setMemory] = useState<any>(null);
  const [memoryError, setMemoryError] = useState(false);
  const loadMemory = () => { setMemoryError(false); fetch('/api/me-memory', { headers: { authorization: `Bearer ${savedToken()}` }, cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setMemory).catch(() => setMemoryError(true)); };
  useEffect(() => { if (view === 'memory' && !memory) loadMemory(); }, [view]);
  const configuredFocus = useRef(journal.display.focus);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const update = () => { const next = readHealthJournal(); setJournal(next); if (next.display.focus !== configuredFocus.current) { configuredFocus.current = next.display.focus; setView(visibleView(next.display.focus)); } }; window.addEventListener(HEALTH_JOURNAL_EVENT, update); return () => window.removeEventListener(HEALTH_JOURNAL_EVENT, update); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [view]);
  // Chat e SYNC scrivono i log sulla data del giorno di gioco. ME deve usare
  // la stessa chiave, altrimenti un giorno simulato/recuperato appare vuoto
  // pur avendo i pasti correttamente persistiti nel journal.
  const gameDay = localDay(dateForDay(day, startedAt));
  const selectedDay = calendarDateKey(selectedDate);
  const selectedMeals = journal.meals.filter((x) => localDay(new Date(x.at)) === selectedDay);
  const selectedWorkouts = journal.workouts.filter((x) => localDay(new Date(x.at)) === selectedDay);
  const meals = journal.meals.filter((x) => localDay(new Date(x.at)) === gameDay);
  const total = meals.reduce((s, x) => ({ kcal: s.kcal + x.kcal, protein: s.protein + x.protein, carbs: s.carbs + x.carbs, fat: s.fat + x.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const askAi = (prompt: string) => window.dispatchEvent(new CustomEvent('vinzmon-open-chat', { detail: { prompt } }));
  const remove = (kind: 'meal' | 'workout' | 'weight', id: string) => {
    if (window.confirm('Eliminare questa registrazione?')) removeHealthEntry(kind, id);
  };
  return <div className="screen me-health">
    <nav className="me-health__tabs">{([['today', 'OGGI'], ['diet', 'DIETA'], ['sport', 'SPORT'], ['memory', 'MEMORY']] as const).map(([id, label]) => <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>)}</nav>
    <div className="me-health__scroll" ref={scrollRef}>
      {view === 'today' && <TodayRecap journal={journal} total={total} />}
      {view === 'diet' && <><MeCalendar journal={journal} mode="diet" selectedDate={selectedDate} onSelect={setSelectedDate} /><Section title="PIANO ALIMENTARE">{journal.dietPlan ? <article className="me-health__plan"><h2>{journal.dietPlan.title}</h2><p>{journal.dietPlan.text}</p><small>Aggiornato {new Date(journal.dietPlan.updatedAt).toLocaleDateString('it-IT')}</small></article> : <Empty text="Allega la dieta in chat: VINZ.MON la leggerà e la salverà qui." />}</Section><Section title="STORICO PASTI">{selectedMeals.length ? <div className="me-health__history-tasks">{[...selectedMeals].reverse().map(x => <HistoryRow key={x.id} done title={MEALS.find((meal) => meal.slot === x.slot)?.label ?? x.slot.toUpperCase()} text={x.description} meta={`${x.kcal} kcal${x.source === 'chat' ? ' · DALLA CHAT' : ''}`} remove={() => remove('meal', x.id)} />)}</div> : <Empty text="Nessun pasto registrato in questo giorno." />}</Section></>}
      {view === 'sport' && <><button type="button" className="me-health__start-timer" onClick={() => setTimerOpen(true)}><Icon name="workout" /><span><strong>ALLENAMENTO GUIDATO</strong><small>Timer esercizio, recupero e serie</small></span><b>AVVIA</b></button><MeCalendar journal={journal} mode="sport" selectedDate={selectedDate} onSelect={setSelectedDate} /><Section title="PIANO ALLENAMENTO" action={journal.workoutPlan ? 'MODIFICA CON AI' : 'SCRIVI CON AI'} click={() => askAi(journal.workoutPlan ? 'Modifica il mio piano di allenamento attuale: ' : 'Creami un nuovo piano di allenamento. Prima fammi le domande necessarie: ')}>{journal.workoutPlan ? <article className="me-health__plan"><h2>{journal.workoutPlan.title}</h2><p>{journal.workoutPlan.text}</p><small>Aggiornato {new Date(journal.workoutPlan.updatedAt).toLocaleDateString('it-IT')}</small></article> : <Empty text="Crea il tuo piano con la chat: giorni, esercizi, serie, recuperi e progressione resteranno qui." />}</Section><Section title="ALLENAMENTI SVOLTI" action="REGISTRA CON AI" click={() => askAi('Registra questo allenamento svolto: ')}>{selectedWorkouts.length ? <div className="me-health__history-tasks">{[...selectedWorkouts].reverse().map(x => <HistoryRow key={x.id} done icon={workoutIcon(x)} title={x.title} text={x.details} meta={`${x.minutes} minuti${x.source === 'chat' ? ' · DALLA CHAT' : ''}`} remove={() => remove('workout', x.id)} />)}</div> : <Empty text="Nessun allenamento registrato in questo giorno." />}</Section></>}
      {view === 'memory' && <MemoryView memory={memory} error={memoryError} retry={loadMemory} />}
    </div>
    {timerOpen && <WorkoutTimer onClose={() => setTimerOpen(false)} />}
  </div>;
}

function displayMemoryText(text: string): string { const clean = text.replace(/^On \d{4}-\d{2}-\d{2} the User (?:expressed|said|stated) that /i, '').replace(/^The User /i, '').trim(); return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean; }
function MemoryView({ memory, error, retry }: { memory: any; error: boolean; retry: () => void }) { if (error) return <section className="me-health__section"><h2>MEMORY</h2><Empty text="Memoria non disponibile." /><button type="button" onClick={retry}>RIPROVA</button></section>; if (!memory) return <section className="me-health__section"><h2>MEMORY</h2><Empty text="Caricamento…" /></section>; if (Array.isArray(memory.memories)) { if (!memory.memories.length) return <section className="me-health__section"><h2>MEMORY</h2><Empty text="La memoria è ancora vuota. VINZ.MON inizierà a costruirla mentre parlate." /></section>; return <div className="me-memory"><header><h2>MEMORY</h2><p>{memory.memories.length} {memory.memories.length === 1 ? 'memoria' : 'memorie'}</p></header><Section title="CONOSCENZE">{memory.memories.map((item: any, i: number) => <details className="me-memory__relation" key={item.id ?? i}><summary><strong>{displayMemoryText(String(item.text ?? ''))}</strong></summary><p>{String(item.text ?? '')}</p>{item.createdAt && <small>{new Date(item.createdAt).toLocaleDateString('it-IT')}</small>}</details>)}</Section></div>; } if (!memory.counts.knowledge && !memory.counts.entities && !memory.counts.episodes) return <section className="me-health__section"><h2>MEMORY</h2><Empty text="La memoria è ancora vuota. VINZ.MON inizierà a costruirla mentre parlate." /></section>; return <div className="me-memory"><header><h2>MEMORY</h2><p>{memory.counts.knowledge} conoscenze · {memory.counts.entities} entità · {memory.counts.episodes} episodi</p></header><Section title={memory.user}>{memory.relations.map((r: any, i: number) => <article className="me-memory__relation" key={i}><strong>{r.object || r.value}</strong><small>{r.predicateLabel}</small></article>)}</Section></div>; }

type TimerPreset = { label: string; work: number; rest: number; rounds: number };
const TIMER_PRESETS: TimerPreset[] = [
  { label: 'RAPIDO', work: 30, rest: 15, rounds: 8 },
  { label: 'STANDARD', work: 45, rest: 15, rounds: 10 },
  { label: 'FORZA', work: 60, rest: 30, rounds: 8 },
];

function WorkoutTimer({ onClose }: { onClose: () => void }) {
  const [preset, setPreset] = useState(TIMER_PRESETS[1]!);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'work' | 'rest'>('work');
  const [round, setRound] = useState(1);
  const [left, setLeft] = useState(preset.work);
  const [done, setDone] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running || done) return;
    const tick = window.setInterval(() => setLeft((value) => {
      if (value > 1) return value - 1;
      navigator.vibrate?.([80, 50, 80]);
      if (phase === 'work') { setPhase('rest'); return preset.rest; }
      if (round >= preset.rounds) { setRunning(false); setDone(true); return 0; }
      setRound((value) => value + 1); setPhase('work'); return preset.work;
    }), 1000);
    return () => window.clearInterval(tick);
  }, [done, phase, preset, round, running]);

  const select = (next: TimerPreset) => { setPreset(next); setPhase('work'); setRound(1); setLeft(next.work); setRunning(false); setDone(false); startedAt.current = null; };
  const toggle = () => { if (!startedAt.current) startedAt.current = Date.now(); setRunning((value) => !value); };
  const finish = () => {
    const elapsed = startedAt.current ? Math.max(1, Math.round((Date.now() - startedAt.current) / 60000)) : Math.max(1, Math.round((preset.work * preset.rounds + preset.rest * Math.max(0, preset.rounds - 1)) / 60));
    addWorkout({ title: 'Allenamento a casa', details: `${preset.label} · ${round}/${preset.rounds} serie · ${preset.work}s lavoro / ${preset.rest}s recupero`, minutes: elapsed }, 'manual');
    navigator.vibrate?.([120, 80, 120, 80, 240]);
    onClose();
  };
  const total = phase === 'work' ? preset.work : preset.rest;
  const progress = total ? Math.max(0, Math.min(100, ((total - left) / total) * 100)) : 100;

  return <section className="workout-timer" role="dialog" aria-modal="true" aria-label="Timer allenamento">
    <header><button type="button" onClick={onClose} aria-label="Chiudi timer"><Icon name="close" /></button><span>SERIE {round} / {preset.rounds}</span><button type="button" onClick={() => { setRunning(false); setPhase('work'); setRound(1); setLeft(preset.work); }} disabled={!startedAt.current}>RESET</button></header>
    <div className="workout-timer__presets" aria-label="Scegli circuito">{TIMER_PRESETS.map((item) => <button type="button" key={item.label} aria-pressed={preset.label === item.label} onClick={() => select(item)} disabled={running}>{item.label}</button>)}</div>
    <main>
      <p>{done ? 'COMPLETATO' : phase === 'work' ? 'LAVORA' : 'RECUPERA'}</p>
      <strong>{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</strong>
      <div className="workout-timer__track" aria-label={`${Math.round(progress)}%`}><i style={{ transform: `scaleX(${progress / 100})` }} /></div>
      <span>{preset.work}s lavoro · {preset.rest}s recupero</span>
    </main>
    <footer>
      {!done && <button type="button" className="workout-timer__primary" onClick={toggle}>{running ? 'PAUSA' : startedAt.current ? 'RIPRENDI' : 'INIZIA'}</button>}
      {(done || startedAt.current) && <button type="button" className="workout-timer__finish" onClick={finish}>{done ? 'SALVA ALLENAMENTO' : 'TERMINA E SALVA'}</button>}
    </footer>
  </section>;
}

function TodayRecap({ journal, total }: { journal: HealthJournal; total: HealthJournal['targets'] }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  return <section className="me-health__today-recap" data-expanded={detailsOpen}>
    <Nutrition total={total} targets={journal.targets} />
    <TodayChecklistScreen embedded defaultDetailsOpen={false} onDetailsChange={setDetailsOpen} />
  </section>;
}

function Nutrition({ total, targets }: { total: HealthJournal['targets']; targets: HealthJournal['targets'] }) { const pct = Math.min(100, Math.round(total.kcal / targets.kcal * 100)); return <section className="me-health__nutrition"><div className="me-health__calories"><div><small>ENERGIA</small><strong>{total.kcal.toLocaleString('it-IT')}</strong><span>/ {targets.kcal.toLocaleString('it-IT')} KCAL</span><Segments value={pct} count={14} /></div></div><div className="me-health__macros">{(['protein', 'carbs', 'fat'] as const).map(k => { const value = Math.min(100, total[k] / targets[k] * 100); return <div key={k}><span>{k === 'protein' ? 'PRO' : k === 'carbs' ? 'CARB' : 'FAT'}</span><strong>{total[k]}<small>g</small></strong><Segments value={value} count={8} /></div>; })}</div></section>; }
function Section({ title, action, click, children }: { title: string; action?: string; click?: () => void; children: ReactNode }) { return <section className="me-health__section"><header><h2>{title}</h2>{action && <button type="button" onClick={click}><Icon name="plus" />{action}</button>}</header>{children}</section>; }
function HistoryRow({ done, icon, title, text, meta, remove }: { done: boolean; icon?: import('../system/Icon').IconName; title: string; text: string; meta: string; remove: () => void }) { return <article className="me-health__history-row" data-done={done}><span aria-hidden="true">{icon && <Icon name={icon} />}</span><div><strong>{title}</strong><small>{text}</small><em>{meta}</em></div><button type="button" className="sync-check__remove" aria-label={`Elimina ${title}`} onClick={remove}><Icon name="close" /></button></article>; }
function Empty({ text }: { text: string }) { return <p className="me-health__empty">{text}</p>; }
function Segments({ value, count }: { value: number; count: number }) { const filled = Math.round(value / 100 * count); return <i className="me-health__segments" aria-label={`${Math.round(value)}%`}>{Array.from({ length: count }, (_, i) => <b key={i} className={i < filled ? 'is-filled' : ''} />)}</i>; }
