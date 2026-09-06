import { useEffect, useRef, useState } from 'react';
import type { CalendarEvent, CalendarEventInput } from '../engine/calendarEvents';
import './projects.css';

type Row = { event: CalendarEvent; version: string };
const localDateInput = (iso: string) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
async function calendarRequest(token: string | null, body?: { id: string; version?: string; event: CalendarEventInput }): Promise<{ events?: Row[] } & Partial<Row>> {
  if (!token) throw new Error('Accesso richiesto: configura il token VINZ.MON.');
  const response = await fetch('/api/calendar', { method: body ? body.version ? 'PUT' : 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json() as { events?: Row[]; error?: string } & Partial<Row>;
  if (!response.ok) throw new Error(response.status === 401 ? 'Non autorizzato. Verifica il token.' : data.error ?? 'Calendario non disponibile.');
  return data;
}
function deliveryLabel(event: CalendarEvent): string {
  if (event.status === 'cancelled') return 'EVENTO ANNULLATO';
  if (event.status === 'completed') return 'EVENTO COMPLETATO';
  if (event.reminderDelivery?.status === 'accepted') return 'PUSH ACCETTATA DAL SERVIZIO · CONSEGNA NON CONFERMATA';
  if (event.reminderDelivery?.status === 'not-sent') return 'PUSH NON INVIATA · DISPONIBILE QUI';
  if (event.reminderDelivery?.status === 'attempting') return 'TENTATIVO PUSH · ESITO NON CONFERMATO';
  return Date.parse(event.reminderAt!) <= Date.now() ? 'DA CONSULTARE · PUSH IN ATTESA' : 'PROGRAMMATO';
}

/** Same CalendarEvent owner/API as ME Calendar. This view is not a second scheduler. */
export function ReminderPanel({ token, onClose }: { token: string | null; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const draftId = useRef<string | null>(null);
  async function refresh() { const data = await calendarRequest(token); setRows(data.events ?? []); }
  useEffect(() => {
    let live = true;
    setBusy(true);
    void calendarRequest(token).then((data) => { if (live) setRows(data.events ?? []); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Caricamento non riuscito.'); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [token]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Operazione non riuscita.'); } finally { setBusy(false); }
  }
  const reminders = rows.filter(({event}) => !!event.reminderAt).sort((a,b) => a.event.reminderAt!.localeCompare(b.event.reminderAt!));
  return <section className="project-workspace project-workspace--reader" aria-label="Promemoria">
    <header className="project-workspace__head"><h1>PROMEMORIA</h1><button onClick={onClose}>CHIUDI ×</button></header>
    <p className="project-workspace__muted">Una sola volta, sul calendario server VINZ.MON. Il controllo avviene circa ogni 5 minuti, anche ad app chiusa. La push richiede notifiche già abilitate; la consegna non è garantita.</p>
    <p className="project-workspace__muted">I vecchi promemoria basati sui giorni di gioco non sono timer reali e non vengono convertiti automaticamente.</p>
    <button disabled={busy} onClick={() => void run(refresh)}>AGGIORNA</button>
    {error && <p role="alert">{error}</p>}
    <p role="status">{busy ? 'Operazione in corso…' : notice}</p>
    {!busy && !error && !reminders.length && <p>Nessun promemoria con data reale.</p>}
    {reminders.map((row) => <article key={row.event.id} className="project-workspace__artifact-row">
      <div><strong>{row.event.title}</strong><p>{new Date(row.event.reminderAt!).toLocaleString('it-IT')} · {row.event.timezone}</p><small>{deliveryLabel(row.event)}</small></div>
      <div className="project-workspace__actions">
        <button disabled={busy || row.event.status !== 'planned'} onClick={() => { setEditing(row); setTitle(row.event.title); setWhen(localDateInput(row.event.reminderAt!)); }}>MODIFICA</button>
        <button disabled={busy} onClick={() => {
          if (!window.confirm('Disattivare questo promemoria? L’evento del calendario resta conservato.')) return;
          void run(async () => { await calendarRequest(token, { id: row.event.id, version: row.version, event: { ...row.event, reminderAt: null } }); await refresh(); if (editing?.event.id === row.event.id) { setEditing(null); setTitle(''); setWhen(''); } setNotice('Promemoria disattivato. Evento conservato nel calendario.'); });
        }}>DISATTIVA</button>
      </div>
    </article>)}
    <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const reminderAt = new Date(when).toISOString();
      if (Date.parse(reminderAt) <= Date.now()) throw new Error('Scegli una data futura.');
      const input: CalendarEventInput = editing ? { ...editing.event, title, reminderAt } : { title, start: reminderAt, reminderAt, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, category: 'task', notes: '', status: 'planned' };
      if (!editing && !draftId.current) draftId.current = crypto.randomUUID();
      await calendarRequest(token, { id: editing?.event.id ?? draftId.current!, ...(editing ? { version: editing.version } : {}), event: input });
      draftId.current = null;
      setEditing(null); setTitle(''); setWhen(''); await refresh(); setNotice('Promemoria confermato sul server.');
    }); }}>
      <h2>{editing ? 'MODIFICA PROMEMORIA' : 'NUOVO PROMEMORIA'}</h2>
      <fieldset disabled={busy}><label>COSA RICORDARE<input required value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>DATA E ORA LOCALE<input required type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
      <p className="project-workspace__muted">Il salvataggio conferma questa richiesta. Nessuna AI, nessun invio a calendari esterni, nessuna ripetizione automatica.</p>
      <button disabled={!title.trim() || !when} type="submit">CONFERMA PROMEMORIA</button>{editing && <button type="button" onClick={() => {setEditing(null);setTitle('');setWhen('');}}>ANNULLA MODIFICA</button>}
      </fieldset>
    </form>
  </section>;
}
