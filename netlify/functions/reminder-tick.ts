import { processCalendarReminders } from './_shared/calendarReminders';

/** Netlify scheduled invocation only; this is not a public reminder-write endpoint. */
export default async function handler(): Promise<Response> {
  try {
    const result = await processCalendarReminders();
    console.info('[calendar-reminders]', result);
    return new Response(null, { status: 204 });
  } catch {
    console.warn('[calendar-reminders] scheduler operation unavailable');
    return new Response(null, { status: 503 });
  }
}
export const config = { schedule: '*/5 * * * *' };
