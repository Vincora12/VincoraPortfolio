import { processCalendarReminders } from './_shared/calendarReminders';
import { processDueMachines } from './_shared/machines';

/** Netlify scheduled invocation only; this is not a public reminder-write endpoint. */
export default async function handler(): Promise<Response> {
  const [calendar, machines] = await Promise.allSettled([
    processCalendarReminders(),
    processDueMachines(),
  ]);
  if (calendar.status === 'fulfilled') console.info('[calendar-reminders]', calendar.value);
  else console.warn('[calendar-reminders] scheduler operation unavailable');
  if (machines.status === 'fulfilled') console.info('[identity-machines]', machines.value);
  else console.warn('[identity-machines] scheduler operation unavailable');
  return new Response(null, { status: calendar.status === 'rejected' || machines.status === 'rejected' ? 503 : 204 });
}
export const config = { schedule: '*/5 * * * *' };
