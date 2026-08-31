import { useEffect, useRef, useState, type ReactNode } from 'react';
import { estimateHealthEntry, type MealEstimate, type WorkoutEstimate } from '../ai/healthEstimate';
import { optimizedImageDataUrl } from '../assistant-original/image-attachment';
import { addMeal, addWorkout, alignTodayLogsToGameDay, readHealthJournal, HEALTH_JOURNAL_EVENT, updateMealById, updateWorkoutById, type MealLog, type WorkoutLog } from '../engine/healthJournal';
import { completeDayStreak, saveEvolutionWish, syncBalance, syncRewardProgress, wishNeedsMega, type EvolutionWish } from '../engine/syncRewards';
import { dateForDay } from '../engine/progression';
import { useApp } from '../state/store';
import { Icon } from '../system/Icon';
import { SyncDial } from '../system/SyncDial';

const MEALS: Array<{ slot: Exclude<MealLog['slot'], 'extra'>; label: string }> = [
  { slot: 'colazione', label: 'COLAZIONE' }, { slot: 'spuntino', label: 'SPUNTINO' },
  { slot: 'pranzo', label: 'PRANZO' }, { slot: 'merenda', label: 'MERENDA' }, { slot: 'cena', label: 'CENA' },
];
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
type EditTarget =
  | { kind: 'meal'; label: string; slot: MealLog['slot']; entry?: MealLog }
  | { kind: 'workout'; label: string; entry?: WorkoutLog };

export function TodayChecklistScreen() {
  const [journal, setJournal] = useState(readHealthJournal);
  const [wishOpen, setWishOpen] = useState(false);
  const [wishText, setWishText] = useState('');
  const [wishKind, setWishKind] = useState<EvolutionWish['kind']>('evolution');
  const [wishWarning, setWishWarning] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editText, setEditText] = useState('');
  const [editPhoto, setEditPhoto] = useState<{ name: string; dataUrl: string } | null>(null);
  const [editStatus, setEditStatus] = useState<'idle' | 'loading' | 'saved' | 'error'>('idle');
  const [editError, setEditError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const openFormEvolution = useApp((state) => state.openFormEvolution);
  const token = useApp((state) => state.token);
  /* 🔷 «Mi dice zero giorni quando in realtà ne sto andando avanti nella
     parte web.» «Oggi», qui, non è la data del telefono: è la data del
     giorno di GIOCO — la stessa che il DEV fa avanzare. Per chi usa l'app
     normalmente le due cose coincidono da sole; guardare `new Date()`
     invece del giorno di gioco è la ragione per cui questa pagina restava
     ferma a zero mentre il gioco andava avanti altrove. */
  const day = useApp((state) => state.day);
  const startedAt = useApp((state) => state.startedAt);
  const gameToday = dateForDay(day, startedAt);

  useEffect(() => {
    const update = () => setJournal(readHealthJournal());
    window.addEventListener(HEALTH_JOURNAL_EVENT, update);
    setJournal(alignTodayLogsToGameDay(dateForDay(day, startedAt)));
    return () => window.removeEventListener(HEALTH_JOURNAL_EVENT, update);
  }, [day, startedAt]);

  const today = dayKey(gameToday);
  const todayMeals = journal.meals.filter((item) => dayKey(new Date(item.at)) === today);
  const slots = new Set(todayMeals.map((item) => item.slot));
  const todayWorkouts = journal.workouts.filter((item) => dayKey(new Date(item.at)) === today);
  const streak = completeDayStreak(journal, gameToday);
  const balance = syncBalance(streak);
  const evolution = syncRewardProgress('evolution', streak);
  const mega = syncRewardProgress('mega-evolution', streak);
  const month = syncRewardProgress('wish', streak);

  const chooseReward = (kind: 'evolution' | 'mega-evolution') => {
    if (syncRewardProgress(kind, streak).ready) openFormEvolution();
  };
  const submitWish = () => {
    const text = wishText.trim();
    if (!text || !month.ready) return;
    if (wishKind === 'evolution' && wishNeedsMega(text) && !wishWarning) { setWishWarning(true); return; }
    saveEvolutionWish({ text, kind: wishWarning ? 'mega-evolution' : wishKind });
    setWishOpen(false);
    openFormEvolution();
  };

  const openEditor = (target: EditTarget) => {
    setEditTarget(target);
    setEditText('');
    setEditPhoto(null);
    setEditStatus('idle');
    setEditError('');
  };
  const closeEditor = () => {
    if (editStatus === 'loading') return;
    setEditTarget(null);
  };
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setEditError('');
    try {
      setEditPhoto({ name: file.name, dataUrl: await optimizedImageDataUrl(file) });
    } catch {
      setEditError('La foto non è leggibile. Scegline un’altra.');
    }
  };
  const dateOnGameDay = () => {
    const at = new Date(gameToday);
    const now = new Date();
    at.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return at;
  };
  const saveEstimate = async () => {
    if (!editTarget || editStatus === 'loading') return;
    const hasCurrent = Boolean(editTarget.entry);
    if (!hasCurrent && !editText.trim() && !editPhoto) return;
    setEditStatus('loading');
    setEditError('');
    try {
      const current = editTarget.kind === 'meal' && editTarget.entry
        ? { description: editTarget.entry.description, kcal: editTarget.entry.kcal, protein: editTarget.entry.protein, carbs: editTarget.entry.carbs, fat: editTarget.entry.fat }
        : editTarget.kind === 'workout' && editTarget.entry
          ? { title: editTarget.entry.title, details: editTarget.entry.details, minutes: editTarget.entry.minutes, burnedKcal: editTarget.entry.burnedKcal ?? 0 }
          : undefined;
      const estimate = await estimateHealthEntry({
        token,
        kind: editTarget.kind,
        label: editTarget.label,
        text: editText,
        imageDataUrl: editPhoto?.dataUrl,
        current,
        latestWeightKg: journal.weights.at(-1)?.kg,
      });
      if (editTarget.kind === 'meal') {
        const meal = estimate as MealEstimate;
        if (editTarget.entry) updateMealById(editTarget.entry.id, meal);
        else addMeal({ slot: editTarget.slot, ...meal }, 'manual', dateOnGameDay());
      } else {
        const workout = estimate as WorkoutEstimate;
        if (editTarget.entry) updateWorkoutById(editTarget.entry.id, workout);
        else addWorkout(workout, 'manual', dateOnGameDay());
      }
      setEditStatus('saved');
      window.setTimeout(() => setEditTarget(null), 650);
    } catch (error) {
      setEditStatus('error');
      setEditError(error instanceof Error ? error.message : 'Stima AI non riuscita.');
    }
  };

  return <main className="today-check sync-check" aria-label="SYNC di oggi">
    <span className="sync-check__day">GIORNO {day}</span>
    <header className="sync-check__hero">
      <SyncDial
        balance={balance}
        evolutionReady={evolution.ready}
        megaReady={mega.ready}
        wishReady={month.ready}
        onEvolve={() => chooseReward('evolution')}
        onMega={() => chooseReward('mega-evolution')}
        onWish={() => month.ready && setWishOpen(true)}
      />
    </header>

    <section className="sync-check__signals" aria-label="Completamento di oggi">
      <div aria-label={`${MEALS.filter(({ slot }) => slots.has(slot)).length} pasti su 5 registrati`}>{MEALS.map(({ slot, label }) => <span key={slot} data-on={slots.has(slot)} title={label} />)}</div>
      <div className="sync-check__workouts" aria-label={`${todayWorkouts.length} allenamenti registrati`}>{Array.from({ length: Math.max(1, todayWorkouts.length) }, (_, index) => <span key={index} data-on={index < todayWorkouts.length} />)}</div>
    </section>

    <button type="button" className="sync-check__details-toggle" aria-expanded={detailsOpen} aria-controls="sync-today-details" onClick={() => setDetailsOpen((open) => !open)}>
      {detailsOpen ? 'CHIUDI' : 'VEDI OGGI'} <span aria-hidden="true">{detailsOpen ? '↑' : '↓'}</span>
    </button>

    {detailsOpen && <section id="sync-today-details" className="today-check__tasks sync-check__details" aria-label="Resoconto completo di oggi">
      {MEALS.map(({ slot, label }) => {
        const entry = todayMeals.find((item) => item.slot === slot);
        return <LongPressRow key={slot} done={Boolean(entry)} label={`${label}. Tieni premuto per ${entry ? 'completare o correggere' : 'registrare'}.`} onLongPress={() => openEditor({ kind: 'meal', slot, label, ...(entry ? { entry } : {}) })}><span aria-hidden="true" /><div><strong>{label}</strong><small>{entry?.description ?? 'DA REGISTRARE'}</small></div>{entry && <Icon name="save" />}</LongPressRow>;
      })}
      {todayMeals.filter((meal) => meal.slot === 'extra').map((meal, index) => <LongPressRow key={meal.id} done label={`Extra ${index + 1}. Tieni premuto per completare o correggere.`} onLongPress={() => openEditor({ kind: 'meal', slot: 'extra', label: `EXTRA ${index + 1}`, entry: meal })}><span aria-hidden="true" /><div><strong>EXTRA {index + 1}</strong><small>{meal.description}</small></div><Icon name="save" /></LongPressRow>)}
      {todayWorkouts.length === 0
        ? <LongPressRow done={false} label="Allenamento. Tieni premuto per registrare." onLongPress={() => openEditor({ kind: 'workout', label: 'ALLENAMENTO' })}><span aria-hidden="true" /><div><strong>ALLENAMENTO</strong><small>DA REGISTRARE</small></div></LongPressRow>
        : todayWorkouts.map((workout, index) => <LongPressRow key={workout.id} done className="sync-check__workout-row" label={`Allenamento ${index + 1}. Tieni premuto per completare o correggere.`} onLongPress={() => openEditor({ kind: 'workout', label: `ALLENAMENTO ${todayWorkouts.length > 1 ? index + 1 : ''}`.trim(), entry: workout })}><span aria-hidden="true" /><div><strong>ALLENAMENTO {todayWorkouts.length > 1 ? index + 1 : ''}</strong><small>{workout.title}</small></div><Icon name="save" /></LongPressRow>)}
    </section>}

    {editTarget && <div className="sync-entry" role="dialog" aria-modal="true" aria-labelledby="sync-entry-title">
      <button type="button" className="sync-entry__backdrop" onClick={closeEditor} aria-label="Chiudi modifica" />
      <form onSubmit={(event) => { event.preventDefault(); void saveEstimate(); }}>
        <header><div><span>STIMA AI</span><h2 id="sync-entry-title">{editTarget.label}</h2></div><button type="button" onClick={closeEditor} aria-label="Chiudi"><Icon name="close" /></button></header>
        {editTarget.entry && <p className="sync-entry__current">{editTarget.kind === 'meal' ? editTarget.entry.description : `${editTarget.entry.title} · ${editTarget.entry.minutes} min`}</p>}
        <label><span>AGGIUNGI DETTAGLI</span><textarea value={editText} onChange={(event) => setEditText(event.target.value)} placeholder={editTarget.kind === 'meal' ? 'Quantità, ingredienti o correzioni…' : 'Tipo, durata, intensità o correzioni…'} maxLength={1200} /></label>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => void pickPhoto(event.target.files?.[0])} />
        {editPhoto ? <div className="sync-entry__photo"><img src={editPhoto.dataUrl} alt="Foto da analizzare" /><span>{editPhoto.name}</span><button type="button" onClick={() => setEditPhoto(null)}>TOGLI</button></div> : <button type="button" className="sync-entry__camera" onClick={() => fileRef.current?.click()}><Icon name="camera" /> AGGIUNGI FOTO</button>}
        {editError && <p className="sync-entry__error" role="alert">{editError}</p>}
        <button type="submit" className="sync-entry__submit" disabled={editStatus === 'loading' || (!editTarget.entry && !editText.trim() && !editPhoto)}>{editStatus === 'loading' ? 'CALCOLO…' : editStatus === 'saved' ? 'SALVATO' : 'CALCOLA E SALVA'}</button>
        <small>Calorie e macro sono stime AI. Le calorie bruciate non sono una misura da wearable.</small>
      </form>
    </div>}

    {wishOpen && <div className="sync-wish" role="dialog" aria-modal="true" aria-labelledby="sync-wish-title">
      <button type="button" className="sync-wish__backdrop" onClick={() => setWishOpen(false)} aria-label="Chiudi desiderio" />
      <form onSubmit={(event) => { event.preventDefault(); submitWish(); }}>
        <button type="button" className="sync-wish__close" onClick={() => setWishOpen(false)} aria-label="Chiudi"><Icon name="close" /></button>
        <span>30 GIORNI COMPLETI</span><h2 id="sync-wish-title">ESPRIMI UN DESIDERIO</h2>
        <div className="sync-wish__kind"><button type="button" aria-pressed={wishKind === 'evolution'} onClick={() => { setWishKind('evolution'); setWishWarning(false); }}>EVOLUZIONE</button><button type="button" aria-pressed={wishKind === 'mega-evolution'} onClick={() => { setWishKind('mega-evolution'); setWishWarning(false); }}>MEGAEVOLUZIONE</button></div>
        <textarea value={wishText} onChange={(event) => { setWishText(event.target.value); setWishWarning(false); }} placeholder="Vorrei che la prossima forma fosse…" maxLength={280} autoFocus />
        {wishWarning && <p>CAMBIARE FAMIGLIA È UNA MEGAEVOLUZIONE. VUOI CONTINUARE COSÌ?</p>}
        <button type="submit" className="sync-wish__submit" disabled={!wishText.trim()}>{wishWarning ? 'SÌ, MEGAEVOLVI' : 'USA IL DESIDERIO'}</button>
      </form>
    </div>}
  </main>;
}

function LongPressRow({ done, label, className, onLongPress, children }: { done: boolean; label: string; className?: string; onLongPress: () => void; children: ReactNode }) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  return <article
    data-done={done}
    className={className}
    role="button"
    tabIndex={0}
    aria-label={label}
    aria-haspopup="dialog"
    onContextMenu={(event) => event.preventDefault()}
    onPointerDown={(event) => {
      if (!event.isPrimary) return;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => { navigator.vibrate?.(35); cancel(); onLongPress(); }, 560);
    }}
    onPointerMove={(event) => {
      if (!start.current) return;
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) cancel();
    }}
    onPointerUp={cancel}
    onPointerCancel={cancel}
    onKeyDown={(event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onLongPress();
    }}
  >{children}</article>;
}
