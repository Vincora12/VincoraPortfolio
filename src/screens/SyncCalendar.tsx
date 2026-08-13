/* ============================================================================
   GIORNI — calendario (MASTER SPEC v1.8 §13/§14, v1.9 §14.1)

   🔶 Riscritto come calendario vero. Prima era una griglia di caselle numerate
   1, 2, 3… che è il modo in cui il prototipo conta i giorni, non il modo in
   cui una persona guarda il proprio tempo. Adesso è un mese, con i nomi dei
   giorni in cima, le settimane allineate e le date reali.

   In testa c'è **oggi, in grande**: è la cosa che si viene a cercare aprendo
   questa schermata, ed è anche da lì che si apre la giornata per raccontarla.

   §14 chiede quattro cose, e ci sono tutte:
     • stati EMPTY / PARTIAL / SYNCED / GRACE
     • i traguardi segnati: hatch, micro-growth, cambio di forma
     • il dettaglio del giorno con i tre segnali e la loro PROVENIENZA
     • quanti giorni sincronizzati mancano al prossimo traguardo

   E una quinta, per negazione: «No red punishment language for missed days.»
   Nessuna casella è rossa. Un giorno vuoto è un giorno non raccontato.

   🔶 GRACE è una **pausa dichiarata** — malattia, assenza — e NON dà SYNC.
   Il perché sta per intero in `progression.ts`.
   ========================================================================= */

import { useState } from 'react';
import type { Overlay } from '../App';
import { useApp, useGrowth, useProtocol, useToday } from '../state/store';
import { Button, ScreenHead, SystemLabel, TextField } from '../system/components';
import {
  MONTH_NAMES,
  WEEKDAY_LONG,
  WEEKDAY_NAMES,
  dateForDay,
  dayStatus,
  mondayIndex,
  type DailySync,
  type DayStatus,
} from '../engine/progression';
import { haptic } from '../system/haptics';
import { DaySummary } from '../system/DaySummary';
import { t } from '../i18n/it';

/** I segni. Non è solo colore: §17 vuole lo stato leggibile comunque. */
const MARKS: Record<DayStatus, string> = {
  SYNCED: '●',
  PARTIAL: '◐',
  EMPTY: '○',
  GRACE: '◍',
};

const STATUS_LABELS: Record<DayStatus, string> = {
  SYNCED: 'sincronizzato',
  PARTIAL: 'parziale',
  EMPTY: 'vuoto',
  GRACE: 'in pausa',
};

const MILESTONES = {
  origin: { mark: '✦', it: 'prima forma' },
  evolution: { mark: '+', it: 'maturazione' },
  branch: { mark: '⌥', it: 'cambio di forma' },
} as const;

interface Cell {
  day: number;
  date: Date;
  status: DayStatus;
  record: DailySync | null;
  milestone: keyof typeof MILESTONES | null;
}

export function CalendarScreen({ onGo }: { onGo: (o: Overlay) => void }) {
  const days = useApp((s) => s.days);
  const { protocol } = useProtocol();
  const today = useApp((s) => s.day);
  const startedAt = useApp((s) => s.startedAt);
  const nodes = useApp((s) => s.nodes);
  const setDayGrace = useApp((s) => s.setDayGrace);
  const { event } = useGrowth();
  const todayState = useToday();

  const [selected, setSelected] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const milestones = new Map<number, keyof typeof MILESTONES>();
  for (const n of nodes) milestones.set(n.day, n.kind);

  const cells: Cell[] = Array.from({ length: today }, (_, i) => {
    const day = i + 1;
    const record = days[day] ?? null;
    return {
      day,
      date: dateForDay(day, startedAt),
      status: record ? dayStatus(record) : 'EMPTY',
      record,
      milestone: milestones.get(day) ?? null,
    };
  });

  const todayDate = dateForDay(today, startedAt);
  const synced = cells.filter((c) => c.status === 'SYNCED').length;
  const open = selected !== null ? cells.find((c) => c.day === selected) : undefined;

  /* Il mese si costruisce dalle date vere: si parte dal primo del mese di
     oggi e si riempie fino alla fine, marcando le caselle che corrispondono a
     giorni vissuti. I giorni fuori partita restano vuoti e non cliccabili —
     un calendario mostra anche i giorni in cui non è successo niente. */
  const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  const daysInMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
  const leading = mondayIndex(monthStart);

  const byDate = new Map<string, Cell>();
  for (const c of cells) byDate.set(c.date.toDateString(), c);

  return (
    <div className="screen">
      <ScreenHead title={t.calendar.title} sub={t.calendar.subtitle} />

      <div className="screen__body cal">
        {/* --- OGGI, in grande. È quello che si viene a cercare. --- */}
        <button
          type="button"
          className="cal__today"
          onClick={() => {
            haptic('tick');
            onGo('scan');
          }}
        >
          <span className="cal__todayleft">
            <span className="t-meta cal__todayweekday">
              {WEEKDAY_LONG[todayDate.getDay()]}
            </span>
            <span className="cal__todaynum t-display">{todayDate.getDate()}</span>
            <span className="t-meta cal__todaymonth">
              {MONTH_NAMES[todayDate.getMonth()]} {todayDate.getFullYear()}
            </span>
          </span>
          <span className="cal__todayright">
            <SystemLabel tone={todayState.closed ? 'positive' : 'default'}>
              {todayState.closed
                ? t.calendar.todayClosed
                : t.calendar.todayOpen(todayState.known)}
            </SystemLabel>
            <span className="t-small cal__todaycta">
              {todayState.closed ? t.calendar.todayDone : t.calendar.todayGo}
            </span>
          </span>
        </button>

        {/* §14 — «Show synced-days remaining to milestones.» In giorni, non in
            percentuale: «mancano 16 giorni» si capisce, «43%» no.

            🔷 v1.10 — e SOLO quando manca ancora qualcosa. Quando l'evento è
            disponibile lo annuncia la Home, sulla linea di SYNC piena: dirlo
            anche qui significava leggere due volte la stessa notizia con
            parole diverse, e la seconda volta non si capisce se sia nuova.
            Questa schermata conta i giorni; l'altra dà la notizia. */}
        {!event.ready && (
          <section className="cal__next">
            <SystemLabel tone="character">{t.calendar.nextTitle}</SystemLabel>
            <p className="t-display cal__nextline">{t.calendar.eventNames[event.kind]}</p>
            <p className="t-small cal__nextnote">
              {t.calendar.remaining(Math.max(0, event.need - event.have))}
            </p>
          </section>
        )}

        {/* --- Il mese --- */}
        <section className="cal__month">
          <p className="t-meta cal__monthname">
            {MONTH_NAMES[todayDate.getMonth()]} {todayDate.getFullYear()}
          </p>

          <div className="cal__weekdays" aria-hidden="true">
            {WEEKDAY_NAMES.map((w, i) => (
              <span key={i} className="t-micro">
                {w}
              </span>
            ))}
          </div>

          <div className="cal__grid">
            {Array.from({ length: leading }, (_, i) => (
              <span key={`pad-${i}`} className="cal__pad" aria-hidden="true" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = new Date(todayDate.getFullYear(), todayDate.getMonth(), i + 1);
              const cell = byDate.get(date.toDateString());
              const isToday = date.toDateString() === todayDate.toDateString();

              if (!cell) {
                return (
                  <span
                    key={i}
                    className="cal__cell cal__cell--outside"
                    aria-hidden="true"
                  >
                    <span className="cal__day t-micro">{i + 1}</span>
                  </span>
                );
              }

              return (
                <button
                  key={i}
                  type="button"
                  className={`cal__cell cal__cell--${cell.status.toLowerCase()} ${
                    isToday ? 'cal__cell--today' : ''
                  } ${cell.day === selected ? 'cal__cell--open' : ''}`}
                  onClick={() => {
                    haptic('tick');
                    setSelected(cell.day === selected ? null : cell.day);
                  }}
                  aria-pressed={cell.day === selected}
                >
                  <span className="cal__day t-micro">{date.getDate()}</span>
                  <span className="cal__mark" aria-hidden="true">
                    {MARKS[cell.status]}
                  </span>
                  {cell.milestone && (
                    <span className="cal__event" aria-hidden="true">
                      {MILESTONES[cell.milestone].mark}
                    </span>
                  )}
                  <span className="sr-only">
                    {date.getDate()} {MONTH_NAMES[date.getMonth()]}:{' '}
                    {STATUS_LABELS[cell.status]}
                    {cell.milestone ? `, ${MILESTONES[cell.milestone].it}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 🔷 v1.10 — la legenda aveva sette voci in mono da 10px, e nessuno
            legge una legenda di sette voci. Ne restano tre, che sono gli
            stati veri di un giorno. I traguardi non sono stati: sono eventi,
            e un evento si legge sul giorno in cui è successo — toccandolo si
            apre e dice cosa era. Spiegare tre simboli in fondo alla pagina
            per un fatto che capita tre volte in un mese era spesa in perdita. */}
        <p className="t-micro cal__legend">
          {MARKS.SYNCED} raccontato · {MARKS.PARTIAL} a metà · {MARKS.GRACE} pausa
        </p>

        {/* §14 — dettaglio del giorno con i tre segnali e la provenienza. */}
        {open ? (
          <section className="cal__detail">
            <header className="cal__detailhead">
              <span className="t-display">
                {open.date.getDate()} {MONTH_NAMES[open.date.getMonth()]}
              </span>
              <SystemLabel tone={open.status === 'SYNCED' ? 'positive' : 'default'}>
                {STATUS_LABELS[open.status].toUpperCase()}
              </SystemLabel>
            </header>

            {open.milestone && (
              <p className="t-small cal__milestone">
                {MILESTONES[open.milestone].mark} {MILESTONES[open.milestone].it}
              </p>
            )}

            {/* 🔷 v1.11 §5.4 — il riepilogo vero: cinque caselle per il cibo,
                l'allenamento letto anche dal piano, l'umore. Prima c'erano tre
                righe con scritto KNOWN o UNKNOWN, cioè lo stato interno del
                motore invece del racconto della giornata. */}
            <DaySummary
              day={open.record}
              date={open.date}
              diet={protocol.diet}
              training={protocol.training}
            />

            {open.status === 'GRACE' ? (
              <div className="cal__grace">
                <p className="t-small cal__gracenote">
                  {open.record?.graceNote?.trim()
                    ? `${t.calendar.graceWas} ${open.record.graceNote}`
                    : t.calendar.graceGeneric}
                </p>
                <p className="t-micro cal__nopunish">{t.calendar.graceRule}</p>
                <Button small variant="ghost" onClick={() => setDayGrace(open.day, false)}>
                  {t.calendar.graceUndo}
                </Button>
              </div>
            ) : (
              open.status !== 'SYNCED' && (
                <div className="cal__grace">
                  <p className="t-micro cal__nopunish">{t.calendar.openDay}</p>
                  <TextField
                    label={t.calendar.graceReason}
                    placeholder={t.calendar.graceePlaceholder}
                    value={reason}
                    onChange={setReason}
                  />
                  <Button
                    small
                    variant="secondary"
                    onClick={() => {
                      setDayGrace(open.day, true, reason);
                      setReason('');
                    }}
                  >
                    {t.calendar.graceMark}
                  </Button>
                </div>
              )
            )}
          </section>
        ) : (
          <p className="t-small cal__hint">{t.calendar.hint}</p>
        )}

        <p className="t-small cal__total">
          <strong>{synced}</strong> {t.calendar.syncedOf} {today}. {t.calendar.noStreak}
        </p>
      </div>
    </div>
  );
}
