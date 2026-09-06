import { useMemo, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { it } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import type { HealthJournal } from '../engine/healthJournal';

type Mode = 'diet' | 'sport' | 'all';
export const calendarDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateFromKey = (key: string) => { const [year, month, day] = key.split('-').map(Number); return new Date(year!, month! - 1, day); };

export function MeCalendar({ journal, mode, selectedDate, onSelect }: { journal: HealthJournal; mode: Mode; selectedDate: Date; onSelect: (date: Date) => void }) {
  const foodDays = useMemo(() => new Set(journal.meals.map((item) => calendarDateKey(new Date(item.at)))), [journal.meals]);
  const workoutDays = useMemo(() => new Set(journal.workouts.map((item) => calendarDateKey(new Date(item.at)))), [journal.workouts]);
  const [month, setMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  return <section className="me-health__calendar" aria-label={mode === 'all' ? 'Calendario personale' : mode === 'diet' ? 'Calendario alimentare' : 'Calendario allenamenti'}>
    <DayPicker
      mode="single" month={month} selected={selectedDate}
      onSelect={(date) => { if (date) { onSelect(date); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); } }}
      onMonthChange={setMonth}
      showOutsideDays fixedWeeks weekStartsOn={1} locale={it}
      modifiers={{ hasFood: [...foodDays].map(dateFromKey), hasWorkout: [...workoutDays].map(dateFromKey) }}
      modifiersClassNames={{ today: 'me-calendar__today', selected: 'me-calendar__selected', outside: 'me-calendar__outside', hasFood: 'me-calendar__has-food', hasWorkout: 'me-calendar__has-workout' }}
    />
  </section>;
}
