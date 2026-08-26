import { useEffect, useState } from 'react';
import { readHealthJournal, HEALTH_JOURNAL_EVENT, type HealthJournal, type MealLog } from '../engine/healthJournal';
import { EXPRESSION_SPEC } from '../engine/assets';
import { useApp } from '../state/store';
import { useAssetUrl } from '../system/AssetSlot';
import { Icon } from '../system/Icon';

const MEALS: Array<{ slot: Exclude<MealLog['slot'], 'extra'>; label: string }> = [
  { slot: 'colazione', label: 'COLAZIONE' },
  { slot: 'spuntino', label: 'SPUNTINO' },
  { slot: 'pranzo', label: 'PRANZO' },
  { slot: 'merenda', label: 'MERENDA' },
  { slot: 'cena', label: 'CENA' },
];

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const previousDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);

function completedOn(journal: HealthJournal, date: Date) {
  const key = dayKey(date);
  const slots = new Set(journal.meals.filter((item) => dayKey(new Date(item.at)) === key).map((item) => item.slot));
  const trained = journal.workouts.some((item) => dayKey(new Date(item.at)) === key);
  return MEALS.every(({ slot }) => slots.has(slot)) && trained;
}

function streakOf(journal: HealthJournal) {
  let cursor = new Date();
  if (!completedOn(journal, cursor)) cursor = previousDay(cursor);
  let streak = 0;
  while (streak < 3650 && completedOn(journal, cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}

export function TodayChecklistScreen() {
  const [journal, setJournal] = useState(readHealthJournal);
  const monName = useApp((state) => state.activeMonName ?? '');
  const reactionSheet = useAssetUrl(monName, 'reaction_pack');

  useEffect(() => {
    const update = () => setJournal(readHealthJournal());
    window.addEventListener(HEALTH_JOURNAL_EVENT, update);
    return () => window.removeEventListener(HEALTH_JOURNAL_EVENT, update);
  }, []);

  const today = dayKey(new Date());
  const todayMeals = journal.meals.filter((item) => dayKey(new Date(item.at)) === today);
  const slots = new Set(todayMeals.map((item) => item.slot));
  const trained = journal.workouts.some((item) => dayKey(new Date(item.at)) === today);
  const done = MEALS.filter(({ slot }) => slots.has(slot)).length + Number(trained);
  const complete = done === 6;
  const expression = done >= 4 ? 1 : 5;
  const col = expression % EXPRESSION_SPEC.columns;
  const row = Math.floor(expression / EXPRESSION_SPEC.columns);
  const streak = streakOf(journal);

  return <main className="today-check" aria-label="Riepilogo di oggi">
    <header className="today-check__hero">
      {reactionSheet ? <span className="today-check__sticker" role="img" aria-label={`${monName} ${complete ? 'felice' : 'ti incoraggia'}`} style={{ backgroundImage: `url(${reactionSheet})`, backgroundSize: `${EXPRESSION_SPEC.columns * 100}% ${EXPRESSION_SPEC.rows * 100}%`, backgroundPosition: `${(col * 100) / (EXPRESSION_SPEC.columns - 1)}% ${(row * 100) / (EXPRESSION_SPEC.rows - 1)}%` }} /> : <Icon name="mon" />}
      <div><strong>{done}<span>/6</span></strong><p>{complete ? 'GIORNATA COMPLETA' : done >= 3 ? 'CI SEI QUASI' : 'INIZIAMO DA QUI'}</p></div>
    </header>

    <section className="today-check__streak" aria-label={`${streak} giorni consecutivi completi`}>
      <strong>{streak}</strong>
      <div><b>{streak === 1 ? 'GIORNO DI FILA' : 'GIORNI DI FILA'}</b><span>Tutto completato, senza saltare un giorno.</span></div>
    </section>

    <section className="today-check__tasks" aria-label="Obiettivi della giornata">
      <h1>OGGI</h1>
      {MEALS.map(({ slot, label }) => {
        const entry = todayMeals.find((item) => item.slot === slot);
        return <article key={slot} data-done={Boolean(entry)}><span aria-hidden="true" /><div><strong>{label}</strong><small>{entry?.description ?? 'DA REGISTRARE'}</small></div>{entry && <Icon name="save" />}</article>;
      })}
      <article data-done={trained}><span aria-hidden="true" /><div><strong>ALLENAMENTO</strong><small>{trained ? journal.workouts.filter((item) => dayKey(new Date(item.at)) === today).at(-1)?.title : 'DA REGISTRARE'}</small></div>{trained && <Icon name="save" />}</article>
    </section>
  </main>;
}
