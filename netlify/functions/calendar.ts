import { getStore } from '@netlify/blobs';
import { authorize, denied, json } from './_shared/auth';
import { validCalendarEventInput, type CalendarEvent } from '../../src/engine/calendarEvents';

/** Per-event conditional writes: concurrent tabs cannot silently replace each other. */
export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  const store = getStore({ name: 'vinzmon-calendar', consistency: 'strong' });
  try {
    if (request.method === 'GET') {
      const { blobs } = await store.list({ prefix: 'event:' });
      if (blobs.length > 500) return json({ error: 'Calendario troppo grande: limita la ricerca prima di continuare.' }, 413);
      const rows = await Promise.all(blobs.map(async ({ key }) => {
        const row = await store.getWithMetadata(key, { type: 'json' });
        return row ? { event: row.data as CalendarEvent, version: row.etag } : null;
      }));
      return json({ events: rows.filter((row) => row !== null).sort((a, b) => a.event.start.localeCompare(b.event.start)) });
    }
    if (request.method !== 'POST' && request.method !== 'PUT') return json({ error: 'Metodo non consentito.' }, 405);
    const raw = await request.text();
    if (raw.length > 6000) return json({ error: 'Evento troppo grande.' }, 413);
    let body: { id?: string; version?: string; event?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ error: 'Evento non valido.' }, 400); }
    if (!body || typeof body !== 'object' || !body.id || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.id) || !validCalendarEventInput(body.event)) return json({ error: 'Controlla titolo, data, categoria e fuso orario.' }, 400);
    if (request.method === 'PUT' && (!body.version || body.version.length > 200)) return json({ error: 'Versione richiesta.' }, 400);
    const input = body.event;
    const current = request.method === 'PUT' ? await store.getWithMetadata(`event:${body.id}`, { type: 'json' }) : null;
    if (request.method === 'PUT' && (!current || current.etag !== body.version)) return json({ error: 'Evento modificato altrove. Ricarica e riprova.' }, 409);
    const previous = current?.data as CalendarEvent | undefined;
    // Existing calendar editors need not know reminder fields; omission preserves them.
    // Explicit null disables the reminder, changing its date starts a new one-time attempt.
    const reminderAt = input.reminderAt === undefined ? previous?.reminderAt : input.reminderAt === null ? undefined : new Date(input.reminderAt).toISOString();
    const event: CalendarEvent = { id: body.id, title: input.title.trim(), start: new Date(input.start).toISOString(),
      ...(input.end ? { end: new Date(input.end).toISOString() } : {}), timezone: input.timezone, category: input.category,
      source: 'vinzmon', status: input.status, notes: input.notes.trim(), updatedAt: new Date().toISOString(),
      ...(reminderAt ? { reminderAt } : {}),
      ...(reminderAt && reminderAt === previous?.reminderAt && previous.reminderDelivery ? { reminderDelivery: previous.reminderDelivery } : {}) };
    const result = await store.setJSON(`event:${event.id}`, event, request.method === 'POST' ? { onlyIfNew: true } : { onlyIfMatch: body.version! });
    if (!result.modified) return json({ error: 'Evento modificato altrove. Ricarica e riprova.' }, 409);
    return json({ event, version: result.etag });
  } catch {
    return json({ error: 'Calendario non disponibile. Nessuna modifica confermata.' }, 503);
  }
}
export const config = { path: '/api/calendar' };
