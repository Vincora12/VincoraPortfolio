import { useEffect, useState } from 'react';
import { readHealthJournal, HEALTH_JOURNAL_EVENT, type MealLog } from '../engine/healthJournal';
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

export function TodayChecklistScreen() {
  const [journal, setJournal] = useState(readHealthJournal);
  const [wishOpen, setWishOpen] = useState(false);
  const [wishText, setWishText] = useState('');
  const [wishKind, setWishKind] = useState<EvolutionWish['kind']>('evolution');
  const [wishWarning, setWishWarning] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const openFormEvolution = useApp((state) => state.openFormEvolution);
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
    return () => window.removeEventListener(HEALTH_JOURNAL_EVENT, update);
  }, []);

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

  return <main className="today-check sync-check" aria-label="SYNC di oggi">
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
        return <article key={slot} data-done={Boolean(entry)}><span aria-hidden="true" /><div><strong>{label}</strong><small>{entry?.description ?? 'DA REGISTRARE'}</small></div>{entry && <Icon name="save" />}</article>;
      })}
      {todayMeals.filter((meal) => meal.slot === 'extra').map((meal, index) => <article key={meal.id} data-done="true"><span aria-hidden="true" /><div><strong>EXTRA {index + 1}</strong><small>{meal.description}</small></div><Icon name="save" /></article>)}
      {todayWorkouts.length === 0 ? <article data-done="false"><span aria-hidden="true" /><div><strong>ALLENAMENTO</strong><small>DA REGISTRARE</small></div></article> : todayWorkouts.map((workout, index) => <article key={workout.id} data-done="true" className="sync-check__workout-row"><span aria-hidden="true" /><div><strong>ALLENAMENTO {todayWorkouts.length > 1 ? index + 1 : ''}</strong><small>{workout.title}</small></div><Icon name="save" /></article>)}
    </section>}

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
