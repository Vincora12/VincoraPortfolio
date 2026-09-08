/* ============================================================================
   MIND — quello che VINZ fa quando non lo guardi

   Due famiglie, e la differenza è vera, non cosmetica:

   THINK  si fa un'OPINIONE su di te. Legge la tua memoria e scrive tesi sulla
          tua vita — che possono sbagliarsi, e per questo portano l'evidenza da
          cui nascono, una confidenza e una chiave per non ripetersi.
   ACT    fa una COMMISSIONE e riferisce. Non afferma niente su di te: cerca,
          guarda, torna con quello che ha trovato.

   🔒 NON SI FONDONO. Un'automazione che potesse affermare cose sul tuo conto
   senza evidenza sarebbe un sistema che si inventa opinioni su di te mentre
   dormi. L'evidenza esiste per impedirlo, e vive solo di là.

   Due cose diverse, e la differenza conta:

   AUTOMAZIONI (ACT)  girano da sole alla cadenza che hai concordato — tutti i giorni,
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
import { EyeIcon, UserIcon } from 'lucide-react';

import { TopicIcon } from '@/system/topicIcon';

import './daily.css';

type Row = { event: CalendarEvent; version: string };

type Schedule =
  | { kind: 'daily'; hour: number; minute: number; timezone: string }
  | { kind: 'weekly'; days: number[]; hour: number; minute: number; timezone: string }
  | { kind: 'interval'; everyMinutes: number; timezone: string; fromHour?: number; toHour?: number };

interface MachineView {
  id: string;
  name: string;
  purpose: string;
  state: {
    status: string;
    lastRun: string | null;
    autoDaily?: { hour: number; timezone: string } | null;
    nextRunAt?: string | null;
  };
}

/* Un'ora sola, scelta per la macchina, invece di un modulo da compilare.
   REFLECTION la sera, quando la giornata è finita e c'è qualcosa da notare;
   ME di notte, perché non ti disturba (consegna `lab_only`). */
const DEFAULT_HOUR: Record<string, number> = { reflection: 21, me: 3 };

/* Le macchine sono due e hanno un nome: l'icona non serve a distinguerle, serve
   a non lasciare THINK spoglio accanto ad ACT, che le icone ce le ha. Una
   guarda (REFLECTION), l'altra tiene il ritratto di te (ME). */
const MACHINE_ICONS: Record<string, typeof EyeIcon> = { reflection: EyeIcon, me: UserIcon };

interface Automation {
  id: string;
  title: string;
  prompt: string;
  icon?: string;
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

export function MindPanel({ token }: { token: string | null }) {
  const [machines, setMachines] = useState<MachineView[]>([]);
  const [pendingInsights, setPendingInsights] = useState(0);
  const [runningMachine, setRunningMachine] = useState<string | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  /* 🔴 SENZA PUSH, ACT È UN POSTO DOVE VAI A GUARDARE. L'interruttore esisteva
     solo dentro il vano tecnico a scomparsa, chiamato «ATTIVA INSIGHT»: cioè la
     cosa da cui dipendono automazioni e promemoria era nascosta e aveva il nome
     di un'altra funzione. Qui è dove il suo valore si vede. */
  const [notifications, setNotifications] = useState<'unknown' | 'off' | 'on' | 'busy'>('unknown');
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
      const [autoResponse, calendarResponse, machinesResponse] = await Promise.all([
        fetch('/api/automations', { headers, cache: 'no-store' }),
        fetch('/api/calendar', { headers, cache: 'no-store' }),
        fetch('/api/machines', { headers, cache: 'no-store' }),
      ]);
      const autoBody = (await autoResponse.json()) as { automations?: Automation[]; error?: string };
      const calendarBody = (await calendarResponse.json()) as { events?: Row[]; error?: string };
      if (!autoResponse.ok) throw new Error(autoBody.error ?? 'Automazioni non disponibili.');
      if (!calendarResponse.ok) throw new Error(calendarBody.error ?? 'Promemoria non disponibili.');
      setAutomations(autoBody.automations ?? []);
      setRows(calendarBody.events ?? []);
      if (machinesResponse.ok) {
        const machinesBody = (await machinesResponse.json()) as {
          machines?: MachineView[];
          pendingInsights?: unknown[];
        };
        setMachines(machinesBody.machines ?? []);
        setPendingInsights((machinesBody.pendingInsights ?? []).length);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ACT non disponibile.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || typeof window === 'undefined' || !('Notification' in window)) return;
    void import('@/system/pushNotifications')
      .then(({ machineNotificationsEnabled }) => machineNotificationsEnabled())
      .then((enabled) => setNotifications(enabled ? 'on' : 'off'))
      .catch(() => setNotifications('off'));
  }, [token]);

  async function enableNotifications() {
    if (!token) return;
    setNotifications('busy');
    try {
      const { enableMachineNotifications } = await import('@/system/pushNotifications');
      setNotifications((await enableMachineNotifications(token)) ? 'on' : 'off');
    } catch {
      setNotifications('off');
    }
  }

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

  /* Far girare una macchina a mano resta possibile: era l'unico modo prima, e
     serve ancora quando vuoi vedere subito se ha qualcosa da dirti. */
  async function runMachine(id: string) {
    if (!token || runningMachine) return;
    setRunningMachine(id);
    try {
      const response = await fetch('/api/machines', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ machine: id }),
      });
      /* 🔴 IL PENSIERO NON USCIVA. Far girare la macchina da qui produceva
         l'insight e poi non lo mostrava a nessuno: il fumetto lo apriva solo la
         pastiglia dentro il vano tecnico. Chi la lancia sta guardando adesso, e
         adesso vuole sapere se ha trovato qualcosa. */
      const body = (await response.json().catch(() => null)) as
        | { state?: { pendingInsights?: { id: string; statement: string }[] } }
        | null;
      const fresh = body?.state?.pendingInsights?.[0];
      if (fresh) window.dispatchEvent(new CustomEvent('vinzmon-show-insight', { detail: fresh }));
      await load();
    } catch {
      setError('Esecuzione non riuscita.');
    } finally {
      setRunningMachine(null);
    }
  }

  async function toggleMachineSchedule(machine: MachineView) {
    if (!token) return;
    const on = Boolean(machine.state.autoDaily);
    setBusy(true);
    try {
      await fetch('/api/machines', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          machine: 'schedule',
          id: machine.id,
          auto: !on,
          hour: DEFAULT_HOUR[machine.id] ?? 21,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      await load();
    } catch {
      setError('Non sono riuscito a cambiare la cadenza.');
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
    <section className="daily-panel" aria-label="MIND">
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

      {notifications === 'off' && !!automations.length && (
        <p className="daily-notice">
          Le automazioni girano, ma non possono avvisarti.{' '}
          <button type="button" onClick={() => void enableNotifications()}>Attiva le notifiche</button>
        </p>
      )}
      {notifications === 'busy' && <p className="daily-panel__meta">Attivo le notifiche…</p>}

      {!!machines.length && <p className="daily-group">THINK · cosa ha notato di te</p>}
      <ul className="daily-list">
        {machines.map((machine) => (
          <li key={machine.id} className="daily-row">
            <div className="daily-row__main">
              <p className="daily-row__title">
                {(() => {
                  const Icon = MACHINE_ICONS[machine.id] ?? EyeIcon;
                  return (
                    <Icon
                      className={`daily-row__icon${machine.state.autoDaily ? ' daily-row__icon--live' : ''}`}
                      aria-hidden="true"
                    />
                  );
                })()}
                {machine.name.replace(/\s*MACHINE$/i, '')}
              </p>
              <p className="daily-row__meta">{machine.purpose}</p>
              <p className="daily-row__meta">
                {machine.state.autoDaily
                  ? `Ogni giorno alle ${two(machine.state.autoDaily.hour)}:00`
                  : 'Solo se la lanci tu'}
                {machine.state.nextRunAt ? ` · Prossima · ${whenLabel(machine.state.nextRunAt)}` : ''}
              </p>
              <p className="daily-row__meta">
                {machine.state.lastRun ? `Ultima · ${whenLabel(machine.state.lastRun)}` : 'Mai eseguita'}
              </p>
              {machine.id === 'reflection' && pendingInsights > 0 && (
                <p className="daily-row__meta daily-row__meta--live">
                  {pendingInsights} pensiero{pendingInsights > 1 ? 'i' : ''} da leggere
                </p>
              )}
            </div>
            <div className="daily-row__stack">
              <button
                type="button"
                className="daily-row__action"
                disabled={busy}
                onClick={() => void toggleMachineSchedule(machine)}
              >
                {machine.state.autoDaily ? 'Non da sola' : 'Da sola'}
              </button>
              <button
                type="button"
                className="daily-row__action"
                disabled={busy || runningMachine !== null}
                onClick={() => void runMachine(machine.id)}
              >
                {runningMachine === machine.id ? 'Pensa…' : 'Fai girare'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!!automations.length && <p className="daily-group">ACT · cosa fa per te</p>}
      <ul className="daily-list">
        {automations.map((automation) => (
          <li key={automation.id} className="daily-row">
            <div className="daily-row__main">
              <p className="daily-row__title">
                <TopicIcon
                  text={`${automation.title} ${automation.prompt}`}
                  icon={automation.icon}
                  className={`daily-row__icon${automation.enabled ? ' daily-row__icon--live' : ''}`}
                />
                {automation.title}
              </p>
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

      {/* Un promemoria è l'ACT più piccolo che esista — «a quest'ora dammi una
          gomitata» — non una terza categoria da imparare. L'etichetta lo dice. */}
      {!!reminders.length && <p className="daily-group">ACT · una volta sola</p>}
      <ul className="daily-list">
        {reminders.map((row) => (
          <li key={row.event.id} className="daily-row">
            <div className="daily-row__main">
              <p className="daily-row__title">
                <TopicIcon
                  text={row.event.title}
                  className={`daily-row__icon${row.event.status === 'planned' ? ' daily-row__icon--live' : ''}`}
                />
                {row.event.title}
              </p>
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
