/* ============================================================================
   ACT — quello che VINZ continua a fare nel tempo

   Due cose diverse, e la differenza conta:

   AUTOMAZIONI  girano da sole alla cadenza che hai concordato — tutti i giorni,
                certi giorni della settimana, o ogni N minuti — FANNO il lavoro
                (cercano sul web con la voce di VINZ) e il risultato arriva in
                chat. Ricorrenti.
   PROMEMORIA   scadono una volta sola e ti danno una gomitata. Non eseguono
                niente: è il calendario, non un agente.

   🔒 La cadenza, «Ultima» e «Prossima» compaiono SOLO sulle automazioni,
   perché solo lì sono dati veri: il record li tiene davvero. Sui promemoria non
   esistono e non vengono inventati.
   ========================================================================= */

import { useCallback, useEffect, useState } from 'react';

import type { CalendarEvent } from '@/engine/calendarEvents';

import './daily.css';

type Row = { event: CalendarEvent; version: string };

type Schedule =
  | { kind: 'daily'; hour: number; minute: number; timezone: string }
  | { kind: 'weekly'; days: number[]; hour: number; minute: number; timezone: string }
  | { kind: 'interval'; everyMinutes: number; timezone: string; fromHour?: number; toHour?: number };

interface Automation {
  id: string;
  title: string;
  prompt: string;
  schedule: Schedule;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
}

const two = (value: number) => String(value).padStart(2, '0');

const DAY_NAMES = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

/* La cadenza si legge in italiano, non in campi. Chi apre ACT deve capire
   quando succede senza ricostruirlo da `everyMinutes`. */
function cadenceLabel(schedule: Schedule): string {
  if (schedule.kind === 'interval') {
    const hours = schedule.everyMinutes / 60;
    const every = schedule.everyMinutes % 60 === 0
      ? hours === 1 ? 'Ogni ora' : `Ogni ${hours} ore`
      : `Ogni ${schedule.everyMinutes} minuti`;
    return schedule.fromHour !== undefined && schedule.toHour !== undefined
      ? `${every} · dalle ${two(schedule.fromHour)} alle ${two(schedule.toHour)}`
      : every;
  }
  const at = `alle ${two(schedule.hour)}:${two(schedule.minute)}`;
  if (schedule.kind === 'daily') return `Ogni giorno ${at}`;
  if (schedule.days.length === 7) return `Ogni giorno ${at}`;
  return `Ogni ${schedule.days.map((day) => DAY_NAMES[day]).join(', ')} ${at}`;
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function reminderState(event: CalendarEvent): string {
  if (event.status === 'cancelled') return 'Annullato';
  if (event.status === 'completed') return 'Completato';
  const delivery = event.reminderDelivery?.status;
  if (delivery === 'accepted') return 'Notifica inviata';
  if (delivery === 'attempting') return 'Invio in corso';
  if (delivery === 'not-sent') return 'Notifica non inviata';
  return Date.parse(event.reminderAt!) <= Date.now() ? 'In attesa' : 'Attivo';
}

export function ActPanel({ token }: { token: string | null }) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) {
      setError('VINZ.MON non è attivo su questo dispositivo.');
      setBusy(false);
      return;
    }
    setBusy(true);
    setError('');
    const headers = { authorization: `Bearer ${token}` };
    try {
      const [autoResponse, calendarResponse] = await Promise.all([
        fetch('/api/automations', { headers, cache: 'no-store' }),
        fetch('/api/calendar', { headers, cache: 'no-store' }),
      ]);
      const autoBody = (await autoResponse.json()) as { automations?: Automation[]; error?: string };
      const calendarBody = (await calendarResponse.json()) as { events?: Row[]; error?: string };
      if (!autoResponse.ok) throw new Error(autoBody.error ?? 'Automazioni non disponibili.');
      if (!calendarResponse.ok) throw new Error(calendarBody.error ?? 'Promemoria non disponibili.');
      setAutomations(autoBody.automations ?? []);
      setRows(calendarBody.events ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ACT non disponibile.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>, confirmText?: string) {
    if (!token) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Operazione non riuscita.');
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operazione non riuscita.');
      setBusy(false);
    }
  }

  async function deactivateReminder(row: Row) {
    if (!token) return;
    if (!window.confirm('Disattivare questo promemoria? L’evento resta nel calendario.')) return;
    setBusy(true);
    try {
      const response = await fetch('/api/calendar', {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.event.id, version: row.version, event: { ...row.event, reminderAt: null } }),
      });
      if (!response.ok) throw new Error('Disattivazione non riuscita.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Disattivazione non riuscita.');
      setBusy(false);
    }
  }

  const reminders = rows
    .filter((row) => row.event.reminderAt)
    .sort((a, b) => a.event.reminderAt!.localeCompare(b.event.reminderAt!));

  return (
    <section className="daily-panel" aria-label="ACT">
      {error && (
        <p className="daily-panel__error" role="alert">
          {error}
        </p>
      )}

      {!error && !busy && !automations.length && !reminders.length && (
        <p className="daily-panel__empty">
          Niente in corso. Chiedimelo in chat — «ogni mattina alle 7 mandami le notizie più importanti».
        </p>
      )}

      {!!automations.length && <p className="daily-group">AUTOMAZIONI</p>}
      <ul className="daily-list">
        {automations.map((automation) => (
          <li key={automation.id} className="daily-row">
            <div className="daily-row__main">
              <p className="daily-row__title">{automation.title}</p>
              <p className="daily-row__meta">
                {cadenceLabel(automation.schedule)} · {automation.enabled ? 'Attiva' : 'In pausa'}
              </p>
              <p className="daily-row__meta">
                {automation.lastRunAt ? `Ultima · ${whenLabel(automation.lastRunAt)}` : 'Mai eseguita'}
                {automation.enabled ? ` · Prossima · ${whenLabel(automation.nextRunAt)}` : ''}
              </p>
              {automation.lastStatus === 'error' && automation.lastError && (
                <p className="daily-row__meta daily-row__meta--bad">Ultimo errore: {automation.lastError}</p>
              )}
            </div>
            <div className="daily-row__stack">
              <button
                type="button"
                className="daily-row__action"
                disabled={busy}
                onClick={() => void act({ action: 'toggle', id: automation.id, enabled: !automation.enabled })}
              >
                {automation.enabled ? 'Pausa' : 'Riprendi'}
              </button>
              <button
                type="button"
                className="daily-row__action"
                disabled={busy}
                onClick={() => void act({ action: 'delete', id: automation.id }, `Eliminare «${automation.title}»?`)}
              >
                Elimina
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!!reminders.length && <p className="daily-group">PROMEMORIA</p>}
      <ul className="daily-list">
        {reminders.map((row) => (
          <li key={row.event.id} className="daily-row">
            <div className="daily-row__main">
              <p className="daily-row__title">{row.event.title}</p>
              <p className="daily-row__meta">
                {whenLabel(row.event.reminderAt!)} · {reminderState(row.event)}
              </p>
            </div>
            <button
              type="button"
              className="daily-row__action"
              disabled={busy || row.event.status !== 'planned'}
              onClick={() => void deactivateReminder(row)}
            >
              Disattiva
            </button>
          </li>
        ))}
      </ul>

      {busy && <p className="daily-panel__meta">Aggiorno…</p>}
      {!busy && (
        <button type="button" className="daily-panel__ghost" onClick={() => void load()}>
          Aggiorna
        </button>
      )}
    </section>
  );
}
