import { getStore } from '@netlify/blobs';
import type { CalendarEvent } from '../../../src/engine/calendarEvents';
import { sendPushNotification } from './pushDelivery';

/** Reuses the calendar record and canonical push transport. No AI, no new ledger. */
export async function processCalendarReminders(now = new Date()): Promise<{ due: number; accepted: number; notSent: number }> {
  const store = getStore({ name: 'vinzmon-calendar', consistency: 'strong' });
  const { blobs } = await store.list({ prefix: 'event:' });
  if (blobs.length > 500) throw new Error('CALENDAR_BOUND_EXCEEDED');
  const snapshot = await Promise.all(blobs.map(async ({ key }) => {
    const row = await store.getWithMetadata(key, { type: 'json' });
    return row ? { key, event: row.data as CalendarEvent, etag: row.etag } : null;
  }));
  const due = snapshot.filter((row) => row && row.event.status === 'planned' && row.event.reminderAt && Date.parse(row.event.reminderAt) <= now.getTime() && !row.event.reminderDelivery).slice(0, 20);
  const claimed = [];
  for (const row of due) {
    if (!row) continue;
    const event: CalendarEvent = { ...row.event, reminderDelivery: { status: 'attempting', attemptedAt: now.toISOString() } };
    const result = await store.setJSON(row.key, event, { onlyIfMatch: row.etag });
    if (result.modified) claimed.push({ key: row.key, event, etag: result.etag });
  }
  if (!claimed.length) return { due: 0, accepted: 0, notSent: 0 };
  // Recheck cancellation/edits after claiming; do not replace a user's newer state.
  const active = [];
  for (const claim of claimed) {
    const current = await store.getWithMetadata(claim.key, { type: 'json' });
    if (current && current.etag === claim.etag && (current.data as CalendarEvent).status === 'planned') active.push(claim);
  }
  if (!active.length) return { due: 0, accepted: 0, notSent: 0 };
  let sent = 0;
  try {
    const result = await sendPushNotification({ title: 'VINZ.MON', body: 'Hai un promemoria da consultare.', url: '/#reminders', tag: 'vinzmon-reminders' });
    sent = result.sent;
  } catch { /* Due records stay visible in the app even when push is unavailable. */ }
  for (const claim of active) {
    const event: CalendarEvent = { ...claim.event, reminderDelivery: { attemptedAt: now.toISOString(), status: sent > 0 ? 'accepted' : 'not-sent', acceptedSubscriptions: sent } };
    await store.setJSON(claim.key, event, { onlyIfMatch: claim.etag });
  }
  // No automatic push retry: an interrupted attempt is explicitly unconfirmed.
  return { due: active.length, accepted: sent > 0 ? active.length : 0, notSent: sent > 0 ? 0 : active.length };
}
