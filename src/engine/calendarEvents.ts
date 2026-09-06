/** Planned personal events are not completed HealthJournal records. */
export type CalendarCategory = 'meal' | 'workout' | 'appointment' | 'task' | 'personal';
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  timezone: string;
  category: CalendarCategory;
  source: 'vinzmon';
  status: 'planned' | 'completed' | 'cancelled';
  notes: string;
  updatedAt: string;
  /** One-time reminder on this canonical calendar event, not another task store. */
  reminderAt?: string;
  /** Server-owned. Accepted means Web Push accepted, not confirmed user delivery. */
  reminderDelivery?: { attemptedAt: string; status: 'attempting' | 'accepted' | 'not-sent'; acceptedSubscriptions?: number };
}
export type CalendarEventInput = Pick<CalendarEvent, 'title' | 'start' | 'end' | 'timezone' | 'category' | 'status' | 'notes'> & { reminderAt?: string | null };
export function validCalendarEventInput(value: unknown): value is CalendarEventInput {
  if (!value || typeof value !== 'object') return false;
  const item = value as CalendarEventInput;
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160
    || typeof item.notes !== 'string' || item.notes.length > 2000
    || typeof item.start !== 'string' || !Number.isFinite(Date.parse(item.start))
    || typeof item.timezone !== 'string' || item.timezone.length > 80
    || !['meal', 'workout', 'appointment', 'task', 'personal'].includes(item.category)
    || !['planned', 'completed', 'cancelled'].includes(item.status)) return false;
  if (item.end !== undefined && (typeof item.end !== 'string' || !Number.isFinite(Date.parse(item.end)) || Date.parse(item.end) < Date.parse(item.start))) return false;
  if (item.reminderAt !== undefined && item.reminderAt !== null && (typeof item.reminderAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(item.reminderAt) || !Number.isFinite(Date.parse(item.reminderAt)))) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: item.timezone }); } catch { return false; }
  return true;
}
