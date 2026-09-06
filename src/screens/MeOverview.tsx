import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Overlay } from '../App';
import { useApp } from '../state/store';
import { Icon } from '../system/Icon';
import { HEALTH_JOURNAL_EVENT, addWorkout, readHealthJournal, type HealthJournal } from '../engine/healthJournal';
import { dateForDay } from '../engine/progression';
import { MeCalendar } from './MeCalendar';
import { TodayChecklistScreen } from './TodayChecklist';
import { savedToken } from '../brain/stream';
import { calculateDailyEnergy } from '../engine/dailyEnergy';
import { PersonalCalendarEvents } from './PersonalCalendarEvents';
import { MemoryInspector, type PersonalMemoryProjection } from './MemoryInspector';
import './me-energy.css';

type View = 'today' | 'calendar' | 'memory';
const visibleView = (view: HealthJournal['display']['focus']): View => view === 'diet' || view === 'sport' ? 'calendar' : 'today';
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function MeOverviewScreen({ onGo: _onGo }: { onGo: (o: Overlay) => void }) {
  const day = useApp((s) => s.day);
  const startedAt = useApp((s) => s.startedAt);
  const [journal, setJournal] = useState(readHealthJournal);
  const [view, setView] = useState<View>(() => visibleView(readHealthJournal().display.focus));
  const [selectedDate, setSelectedDate] = useState(() => dateForDay(day, startedAt));
  const [timerOpen, setTimerOpen] = useState(false);
  const [memory, setMemory] = useState<PersonalMemoryProjection | null>(null);
  const [memoryError, setMemoryError] = useState('');
  const loadMemory = () => { setMemoryError(''); fetch('/api/me-memory', { headers: { authorization: `Bearer ${savedToken()}` }, cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status === 401 ? 'Accesso richiesto. Controlla il token in LAB.' : 'Memoria non disponibile.'); return r.json(); }).then(setMemory).catch((error) => setMemoryError(error instanceof Error ? error.message : 'Memoria non disponibile.')); };
  useEffect(() => { if (view === 'memory' && !memory) loadMemory(); }, [view]);
  const configuredFocus = useRef(journal.display.focus);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const update = () => { const next = readHealthJournal(); setJournal(next); if (next.display.focus !== configuredFocus.current) { configuredFocus.current = next.display.focus; setView(visibleView(next.display.focus)); } }; window.addEventListener(HEALTH_JOURNAL_EVENT, update); return () => window.removeEventListener(HEALTH_JOURNAL_EVENT, update); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [view]);
  // Chat e SYNC scrivono i log sulla data del giorno di gioco. ME deve usare
  // la stessa chiave, altrimenti un giorno simulato/recuperato appare vuoto
  // pur avendo i pasti correttamente persistiti nel journal.
  const gameDay = localDay(dateForDay(day, startedAt));
  const meals = journal.meals.filter((x) => localDay(new Date(x.at)) === gameDay);
  const total = meals.reduce((s, x) => ({ kcal: s.kcal + x.kcal, protein: s.protein + x.protein, carbs: s.carbs + x.carbs, fat: s.fat + x.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  /* CORE HEALTH INTERPRETATION + DAILY ENERGY — mostra SOLO ciò che è già
     calcolabile onestamente: la somma delle stime di calorie bruciate negli
     allenamenti di oggi. Non un TOTALE DISPENDIO GIORNALIERO e non un
     BILANCIO: mancano altezza, età, sesso e un'attività di base per
     calcolare BMR/TDEE (vedi docs/HEALTH_ENERGY_AUDIT_2026-09-04.md). Somma
     due numeri senza una base di calcolo comune sarebbe inventare
     precisione, non offrirla. */
  const askAi = (prompt: string) => window.dispatchEvent(new CustomEvent('vinzmon-open-chat', { detail: { prompt } }));
  return <div className="screen me-health">
    <nav className="me-health__tabs">{([['today', 'OGGI'], ['calendar', 'CALENDARIO'], ['memory', 'MEMORY']] as const).map(([id, label]) => <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>)}</nav>
    <div className="me-health__scroll" ref={scrollRef}>
      {view === 'today' && <TodayRecap journal={journal} total={total} date={dateForDay(day, startedAt)} />}
      {view === 'calendar' && <>
        <MeCalendar journal={journal} mode="all" selectedDate={selectedDate} onSelect={setSelectedDate} />
        <PersonalCalendarEvents date={selectedDate} />
        <Section title={`REGISTRAZIONI · ${selectedDate.toLocaleDateString('it-IT')}`}>
          <DailyEnergy journal={journal} date={selectedDate} />
          <TodayChecklistScreen key={localDay(selectedDate)} embedded selectedDate={selectedDate} defaultDetailsOpen />
        </Section>
        <details className="me-health__plans"><summary>PIANI ALIMENTARI E ALLENAMENTO</summary>
          <Section title="PIANO ALIMENTARE">{journal.dietPlan ? <article className="me-health__plan"><h2>{journal.dietPlan.title}</h2><p>{journal.dietPlan.text}</p></article> : <Empty text="Allega la dieta in chat: VINZ.MON la leggerà e la salverà qui." />}</Section>
          <Section title="PIANO ALLENAMENTO" action={journal.workoutPlan ? 'MODIFICA CON AI' : 'SCRIVI CON AI'} click={() => askAi(journal.workoutPlan ? 'Modifica il mio piano di allenamento attuale: ' : 'Creami un nuovo piano di allenamento. Prima fammi le domande necessarie: ')}>{journal.workoutPlan ? <article className="me-health__plan"><h2>{journal.workoutPlan.title}</h2><p>{journal.workoutPlan.text}</p></article> : <Empty text="Crea il tuo piano con la chat: giorni, esercizi, serie, recuperi e progressione resteranno qui." />}</Section>
        </details>
        <button type="button" className="me-health__start-timer" onClick={() => setTimerOpen(true)}><Icon name="workout" /><span><strong>ALLENAMENTO GUIDATO</strong><small>Registra oggi, non nella data selezionata</small></span><b>AVVIA</b></button>
      </>}
      {view === 'memory' && <MemoryInspector memory={memory} error={memoryError} retry={loadMemory} />}
    </div>
    {timerOpen && <WorkoutTimer onClose={() => setTimerOpen(false)} />}
  </div>;
}

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

function TodayRecap({ journal, total, date }: { journal: HealthJournal; total: HealthJournal['targets']; date: Date }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  return <section className="me-health__today-recap" data-expanded={detailsOpen}>
    <Nutrition total={total} targets={journal.targets} workoutBurnedKcal={journal.workouts.filter(w => localDay(new Date(w.at)) === localDay(date)).reduce((sum, w) => sum + (w.burnedKcal ?? 0), 0)} />
    <DailyEnergy journal={journal} date={date} />
    <TodayChecklistScreen embedded defaultDetailsOpen={false} onDetailsChange={setDetailsOpen} />
  </section>;
}

function Nutrition({ total, targets, workoutBurnedKcal }: { total: HealthJournal['targets']; targets: HealthJournal['targets']; workoutBurnedKcal: number }) {
  const pct = Math.min(100, Math.round(total.kcal / targets.kcal * 100));
  /* Riga separata e non sommata a ENERGIA: quella è INTAKE vs obiettivo, questa
     è una stima di allenamento — combinarle in un unico numero servirebbe un
     dispendio energetico totale che qui non è calcolabile onestamente (manca
     BMR/TDEE, vedi docs/HEALTH_ENERGY_AUDIT_2026-09-04.md). */
  return <section className="me-health__nutrition">
    <div className="me-health__calories"><div><small>ENERGIA</small><strong>{total.kcal.toLocaleString('it-IT')}</strong><span>/ {targets.kcal.toLocaleString('it-IT')} KCAL</span><Segments value={pct} count={14} /></div></div>
    <div className="me-health__macros">{(['protein', 'carbs', 'fat'] as const).map(k => { const value = Math.min(100, total[k] / targets[k] * 100); return <div key={k}><span>{k === 'protein' ? 'PRO' : k === 'carbs' ? 'CARB' : 'FAT'}</span><strong>{total[k]}<small>g</small></strong><Segments value={value} count={8} /></div>; })}</div>
    {workoutBurnedKcal > 0 && <p className="me-health__workout-burn"><span>ALLENAMENTO · STIMA, NON MISURA</span><strong>{workoutBurnedKcal.toLocaleString('it-IT')} KCAL</strong></p>}
  </section>;
}
function Section({ title, action, click, children }: { title: string; action?: string; click?: () => void; children: ReactNode }) { return <section className="me-health__section"><header><h2>{title}</h2>{action && <button type="button" onClick={click}><Icon name="plus" />{action}</button>}</header>{children}</section>; }
function DailyEnergy({ journal, date }: { journal: HealthJournal; date: Date }) {
  const energy = calculateDailyEnergy(journal, date);
  return <section className="me-daily-energy" aria-label="Energia registrata">
    <dl><div><dt>FOOD KCAL</dt><dd>{energy.foodKcal}</dd></div><div><dt>WORKOUT KCAL</dt><dd>{energy.workoutKcal}</dd><small>{energy.workoutCount ? energy.workoutReliability === 'MEASURED' ? 'MEASURED' : 'ESTIMATE' : 'NESSUN DATO'}</small></div><div><dt>RECORDED NET</dt><dd>{energy.recordedNetKcal}</dd></div></dl>
    <p>Cibo − allenamenti registrati. Non è il deficit calorico.{energy.unknownWorkoutCount > 0 && ` ${energy.unknownWorkoutCount} attività senza calorie registrate.`}</p>
  </section>;
}
function Empty({ text }: { text: string }) { return <p className="me-health__empty">{text}</p>; }
function Segments({ value, count }: { value: number; count: number }) { const filled = Math.round(value / 100 * count); return <i className="me-health__segments" aria-label={`${Math.round(value)}%`}>{Array.from({ length: count }, (_, i) => <b key={i} className={i < filled ? 'is-filled' : ''} />)}</i>; }
