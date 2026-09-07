/* ============================================================================
   ACT — quello che VINZ continua a fare nel tempo

   🔒 NIENTE DI INVENTATO. La sola attività programmata che esiste davvero in
   VINZ.MON è il promemoria del calendario: un'azione a data fissa, consegnata
   dallo scheduler del Local Core ogni cinque minuti. Non c'è (ancora) un motore
   di ricorrenze, quindi qui non compaiono «Daily», «Next run» o cadenze: sono
   informazioni che il backend non ha, e scriverle sarebbe finzione.

   Gli ACT si creano parlando in CHAT — lo strumento `programma_promemoria`
   esiste già ed è reale. Questa è la vista, non un secondo scheduler.
   ========================================================================= */

import { useCallback, useEffect, useState } from 'react';

import type { CalendarEvent } from '@/engine/calendarEvents';

import './daily.css';

type Row = { event: CalendarEvent; version: string };

/** Lo stesso stato che il pannello promemoria già racconta, in una riga sola. */
function stateOf(event: CalendarEvent): string {
  if (event.status === 'cancelled') return 'Annullato';
  if (event.status === 'completed') return 'Completato';
  const delivery = event.reminderDelivery?.status;
  if (delivery === 'accepted') return 'Notifica inviata';
  if (delivery === 'attempting') return 'Invio in corso';
  if (delivery === 'not-sent') return 'Notifica non inviata';
  return Date.parse(event.reminderAt!) <= Date.now() ? 'In attesa' : 'Attivo';
}

function when(event: CalendarEvent): string {
  return new Date(event.reminderAt!).toLocaleString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ActPanel({ token }: { token: string | null }) {
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
    try {
      const response = await fetch('/api/calendar', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = (await response.json()) as { events?: Row[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Attività non disponibili.');
      setRows(data.events ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Attività non disponibili.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deactivate(row: Row) {
    if (!token) return;
    if (!window.confirm('Disattivare questa attività? L’evento resta nel calendario.')) return;
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

  const acts = rows
    .filter((row) => row.event.reminderAt)
    .sort((a, b) => a.event.reminderAt!.localeCompare(b.event.reminderAt!));

  return (
    <section className="daily-panel" aria-label="ACT">
      {error && (
        <p className="daily-panel__error" role="alert">
          {error}
        </p>
      )}

      {!error && !busy && acts.length === 0 && (
        <p className="daily-panel__empty">
          Niente di programmato. Chiedimelo in chat — «ricordami di controllare il preventivo domani alle 10».
        </p>
      )}

      <ul className="daily-list">
        {acts.map((row) => (
          <li key={row.event.id} className="daily-row">
            <div className="daily-row__main">
              <p className="daily-row__title">{row.event.title}</p>
              <p className="daily-row__meta">
                {when(row.event)} · {stateOf(row.event)}
              </p>
            </div>
            <button
              type="button"
              className="daily-row__action"
              disabled={busy || row.event.status !== 'planned'}
              onClick={() => void deactivate(row)}
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
