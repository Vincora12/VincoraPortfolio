import { useEffect, useMemo, useState } from 'react';
import { ScheduleXCalendar, useCalendarApp } from '@schedule-x/react';
import { createViewMonthAgenda, createViewWeekAgenda, type CalendarEventExternal } from '@schedule-x/calendar';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import { Temporal } from 'temporal-polyfill';
import '@schedule-x/theme-default/dist/index.css';
import type { HealthJournal } from '../engine/healthJournal';

type Mode = 'diet' | 'sport';
const days: Record<string, number> = { lunedi: 1, lune: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5, sabato: 6, domenica: 7 };
const clean = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const asPlainDateTime = (at: string) => Temporal.PlainDateTime.from(at.slice(0, 16));

function dateForWeekday(day: number) {
  const now = new Date(); const current = now.getDay() || 7;
  return dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - current + day));
}

function eventFromLine(line: string, index: number, prefix: string): CalendarEventExternal | null {
  const normalized = clean(line);
  const dayEntry = Object.entries(days).find(([name]) => new RegExp(`\\b${name}\\b`).test(normalized));
  if (!dayEntry) return null;
  const times = [...line.matchAll(/\b([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\b/g)].map((match) => `${match[1]!.padStart(2, '0')}:${match[2] ?? '00'}`);
  const startTime = times[0] ?? '12:00';
  const endTime = times[1] ?? `${String(Math.min(23, Number(startTime.slice(0, 2)) + 1)).padStart(2, '0')}:${startTime.slice(3)}`;
  const date = dateForWeekday(dayEntry[1]);
  return { id: `${prefix}-${index}`, title: line.replace(/^[-•\s]+/, '').slice(0, 80), start: Temporal.PlainDateTime.from(`${date}T${startTime}`), end: Temporal.PlainDateTime.from(`${date}T${endTime}`), description: line };
}

function calendarEvents(journal: HealthJournal, mode: Mode): CalendarEventExternal[] {
  const lines: string[] = [];
  const plan = mode === 'diet' ? journal.dietPlan?.text : journal.workoutPlan?.text;
  if (plan) lines.push(...plan.split(/\n+/).filter(Boolean));
  journal.blocks.filter((item) => item.type === 'calendar' && (item.section === mode || item.section === 'today')).forEach((block) => lines.push(...block.items));
  const planned = lines.map((line, index) => eventFromLine(line, index, mode)).filter((event): event is CalendarEventExternal => Boolean(event));
  const logs: CalendarEventExternal[] = mode === 'diet'
    ? journal.meals.map((meal) => ({ id: `meal-${meal.id}`, title: `${meal.slot}: ${meal.description}`, start: asPlainDateTime(meal.at), end: asPlainDateTime(meal.at).add({ minutes: 30 }), description: `${meal.kcal} kcal` }))
    : journal.workouts.map((workout) => ({ id: `workout-${workout.id}`, title: workout.title, start: asPlainDateTime(workout.at), end: asPlainDateTime(workout.at).add({ minutes: Math.max(1, workout.minutes) }), description: workout.details }));
  return [...planned, ...logs];
}

export function MeCalendar({ journal, mode }: { journal: HealthJournal; mode: Mode }) {
  const [detail, setDetail] = useState<{ title: string; text: string } | null>(null);
  const [eventsService] = useState(() => createEventsServicePlugin());
  const events = useMemo(() => calendarEvents(journal, mode), [journal, mode]);
  const week = useMemo(() => createViewWeekAgenda(), []); const month = useMemo(() => createViewMonthAgenda(), []);
  const calendar = useCalendarApp({ views: [week, month], defaultView: week.name, locale: 'it-IT', selectedDate: Temporal.Now.plainDateISO(), events, isDark: true, isResponsive: true, callbacks: { onEventClick: (event) => setDetail({ title: String(event.title ?? 'Dettaglio'), text: String(event.description ?? '') }) } }, [eventsService]);
  useEffect(() => { eventsService.set(events); }, [events, eventsService]);
  return <section className="me-health__calendar" aria-label={mode === 'diet' ? 'Calendario alimentare' : 'Calendario allenamenti'}>
    <ScheduleXCalendar calendarApp={calendar} />
    {detail && <button className="me-health__calendar-detail" type="button" onClick={() => setDetail(null)}><strong>{detail.title}</strong>{detail.text && <span>{detail.text}</span>}<small>TOCCA PER CHIUDERE</small></button>}
  </section>;
}
