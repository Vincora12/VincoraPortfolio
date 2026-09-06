import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { savedToken } from '../brain/stream';
import type { CalendarCategory, CalendarEvent, CalendarEventInput } from '../engine/calendarEvents';
import { calendarDateKey } from './MeCalendar';

type Row = { event: CalendarEvent; version: string };
const LABELS: Record<CalendarCategory, string> = { meal: 'PASTO PIANIFICATO', workout: 'ALLENAMENTO PIANIFICATO', appointment: 'APPUNTAMENTO', task: 'ATTIVITÀ', personal: 'PERSONALE' };
const localInput = (date: Date) => `${calendarDateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export function PersonalCalendarEvents({ date }: { date: Date }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [category, setCategory] = useState<CalendarCategory>('personal');
  const [notes, setNotes] = useState('');
  const draftId = useRef('');
  const load = async () => {
    setState('loading'); setError('');
    try {
      const response = await fetch('/api/calendar', { headers: { authorization: `Bearer ${savedToken()}` }, cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Accesso richiesto. Controlla il token in LAB.' : 'Calendario non disponibile.');
      const data = await response.json() as { events: Row[] };
      setRows(data.events); setState('ready');
    } catch (cause) { setState('error'); setError(cause instanceof Error ? cause.message : 'Calendario non disponibile.'); }
  };
  useEffect(() => { void load(); }, []);
  const open = (row: Row | 'new') => {
    if (row === 'new') draftId.current = crypto.randomUUID();
    setEditing(row); setTitle(row === 'new' ? '' : row.event.title);
    setStart(localInput(row === 'new' ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9) : new Date(row.event.start)));
    setCategory(row === 'new' ? 'personal' : row.event.category); setNotes(row === 'new' ? '' : row.event.notes); setError('');
  };
  const write = async (row: Row | 'new', event: CalendarEventInput) => {
    setState('saving'); setError('');
    try {
      const response = await fetch('/api/calendar', { method: row === 'new' ? 'POST' : 'PUT',
        headers: { authorization: `Bearer ${savedToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id: row === 'new' ? draftId.current : row.event.id, version: row === 'new' ? undefined : row.version, event }) });
      const data = await response.json() as Row & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Salvataggio non riuscito.');
      setRows((current) => [...current.filter((item) => item.event.id !== data.event.id), data]);
      setEditing(null); setState('ready');
    } catch (cause) { setState('error'); setError(cause instanceof Error ? cause.message : 'Salvataggio non riuscito.'); }
  };
  const selected = rows.filter(({ event }) => calendarDateKey(new Date(event.start)) === calendarDateKey(date));
  return <section className="me-health__section me-personal-calendar" aria-label="Eventi personali">
    <header><h2>PROGRAMMA · {date.toLocaleDateString('it-IT')}</h2><button type="button" disabled={state === 'loading' || state === 'saving'} onClick={() => open('new')}>+ EVENTO</button></header>
    <p className="me-health__empty">I programmi non contano come pasti consumati o allenamenti svolti.</p>
    {state === 'loading' && <p role="status">Caricamento calendario…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>RICARICA</button></p>}
    {state === 'ready' && !selected.length && <p className="me-health__empty">Nessun evento programmato.</p>}
    {selected.map((row) => <article className="me-personal-calendar__event" key={row.event.id}>
      <button type="button" disabled={state === 'saving'} onClick={() => open(row)}><small>{new Date(row.event.start).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · {LABELS[row.event.category]} · {row.event.status === 'cancelled' ? 'ANNULLATO' : row.event.status === 'completed' ? 'COMPLETATO' : 'PIANIFICATO'}</small><strong>{row.event.title}</strong>{row.event.notes && <span>{row.event.notes}</span>}</button>
      {row.event.status === 'planned' && <button type="button" disabled={state === 'saving'} aria-label={`Annulla ${row.event.title}`} onClick={() => { if (window.confirm('Annullare questo evento?')) void write(row, { ...row.event, status: 'cancelled' }); }}>×</button>}
    </article>)}
    {editing && createPortal(<div className="sync-entry me-calendar-editor" role="dialog" aria-modal="true" aria-labelledby="calendar-edit-title">
      <button type="button" className="sync-entry__backdrop" disabled={state === 'saving'} onClick={() => setEditing(null)} aria-label="Chiudi evento" />
      <form onSubmit={(event) => { event.preventDefault(); void write(editing, { title, start: new Date(start).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, category, notes, status: editing === 'new' ? 'planned' : editing.event.status, ...(editing !== 'new' && editing.event.end ? { end: editing.event.end } : {}) }); }}>
        <header><h2 id="calendar-edit-title">{editing === 'new' ? 'NUOVO EVENTO' : 'MODIFICA EVENTO'}</h2><button type="button" disabled={state === 'saving'} onClick={() => setEditing(null)}>CHIUDI</button></header>
        <label>TITOLO<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>QUANDO<input required type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></label>
        <label>CATEGORIA<select value={category} onChange={(event) => setCategory(event.target.value as CalendarCategory)}>{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>NOTE<textarea maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="sync-entry__submit" disabled={state === 'saving' || !title.trim()}>{state === 'saving' ? 'SALVATAGGIO…' : 'SALVA EVENTO'}</button>
        <small>Calendario VINZ.MON · salvato sul server. Nessun invio a calendari esterni.</small>
      </form>
    </div>, document.body)}
  </section>;
}
