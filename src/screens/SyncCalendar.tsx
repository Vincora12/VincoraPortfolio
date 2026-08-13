/* ============================================================================
   CALENDARIO — superficie primaria (MASTER SPEC v1.8 §13, §14)

   🔶 Promossa. Prima era un riquadro in fondo a ME; la v1.8 la elenca come
   «NEW primary surface for Daily Sync and milestones» e le dà una sezione sua.
   Adesso è la quarta voce della navigazione, accanto a MON / ME / MINDLINE.

   §14 chiede quattro cose, e ci sono tutte:
     • stati EMPTY / PARTIAL / SYNCED / GRACE
     • i traguardi segnati: hatch, micro-growth, cambio di forma
     • il dettaglio del giorno con i tre segnali e la loro PROVENIENZA
     • quanti giorni sincronizzati mancano al prossimo traguardo

   E una quinta, per negazione: «No red punishment language for missed days.»
   Nessuna casella è rossa, nessuna frase dice che hai perso qualcosa. Un
   giorno vuoto è un giorno non raccontato, e la crescita lo aspetta.

   🔶 GRACE — §14 lo dichiarava canonico senza dire cosa lo facesse scattare.
   Deciso: è una **pausa dichiarata** — malattia, ricovero, giorni in cui non
   c'eri — e NON dà SYNC. Il perché sta per intero in `progression.ts`; qui
   basta la conseguenza: si marca da questa schermata, sui giorni ancora
   aperti, ed è sempre reversibile.
   ========================================================================= */

import { useState } from 'react';
import { useApp, useGrowth } from '../state/store';
import { Button, ScreenHead, SystemLabel, TextField } from '../system/components';
import {
  DAILY_SIGNALS,
  DAILY_SIGNAL_LABELS,
  dayStatus,
  type DailySync,
  type DayStatus,
} from '../engine/progression';
import { haptic } from '../system/haptics';
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

/** I traguardi che §14 chiede di marcare, con il segno che li distingue. */
const MILESTONES = {
  origin: { mark: '✦', it: 'prima forma' },
  evolution: { mark: '+', it: 'maturazione' },
  branch: { mark: '⌥', it: 'cambio di forma' },
} as const;

interface Cell {
  day: number;
  status: DayStatus;
  record: DailySync | null;
  milestone: keyof typeof MILESTONES | null;
}

export function CalendarScreen() {
  const days = useApp((s) => s.days);
  const today = useApp((s) => s.day);
  const nodes = useApp((s) => s.nodes);
  const setDayGrace = useApp((s) => s.setDayGrace);
  const { event, sync } = useGrowth();

  const [selected, setSelected] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const milestones = new Map<number, keyof typeof MILESTONES>();
  for (const n of nodes) milestones.set(n.day, n.kind);

  const cells: Cell[] = Array.from({ length: today }, (_, i) => {
    const day = i + 1;
    const record = days[day] ?? null;
    return {
      day,
      status: record ? dayStatus(record) : 'EMPTY',
      record,
      milestone: milestones.get(day) ?? null,
    };
  });

  const synced = cells.filter((c) => c.status === 'SYNCED').length;
  const open = selected !== null ? cells.find((c) => c.day === selected) : undefined;

  return (
    <div className="screen">
      <ScreenHead title={t.calendar.title} sub={t.calendar.subtitle} />

      <div className="screen__body cal">
        {/* §14 — «Show synced-days remaining to milestones.» In giorni, non in
            percentuale: «mancano 16 giorni» si capisce, «43%» no. */}
        <section className="cal__next">
          <SystemLabel tone="character">{t.calendar.nextTitle}</SystemLabel>
          <p className="t-display cal__nextline">
            {t.calendar.eventNames[event.kind]}
          </p>
          <p className="t-small cal__nextnote">
            {event.ready
              ? t.calendar.ready
              : t.calendar.remaining(Math.max(0, event.need - event.have))}
          </p>
        </section>

        <div className="cal__grid">
          {cells.map((c) => (
            <button
              key={c.day}
              type="button"
              className={`cal__cell cal__cell--${c.status.toLowerCase()} ${
                c.day === today ? 'cal__cell--today' : ''
              } ${c.day === selected ? 'cal__cell--open' : ''}`}
              onClick={() => {
                haptic('tick');
                setSelected(c.day === selected ? null : c.day);
              }}
              aria-pressed={c.day === selected}
            >
              <span className="cal__mark" aria-hidden="true">
                {MARKS[c.status]}
              </span>
              <span className="cal__day t-micro">{c.day}</span>
              {c.milestone && (
                <span className="cal__event" aria-hidden="true">
                  {MILESTONES[c.milestone].mark}
                </span>
              )}
              <span className="sr-only">
                Giorno {c.day}: {STATUS_LABELS[c.status]}
                {c.milestone ? `, ${MILESTONES[c.milestone].it}` : ''}
              </span>
            </button>
          ))}
        </div>

        <p className="t-micro cal__legend">
          {MARKS.SYNCED} sincronizzato · {MARKS.PARTIAL} parziale · {MARKS.EMPTY} vuoto ·{' '}
          {MARKS.GRACE} pausa · {MILESTONES.origin.mark} prima forma ·{' '}
          {MILESTONES.evolution.mark} maturazione · {MILESTONES.branch.mark} cambio di forma
        </p>

        {/* §14 — «Day detail shows FOOD / WORKOUT / MOOD and relevant source
            provenance.» La provenienza è il campo `note` del segnale: dice se
            il dato l'hai messo tu, se arriva dai dati automatici o da DEV. */}
        {open ? (
          <section className="cal__detail">
            <header className="cal__detailhead">
              <span className="t-display">
                {t.common.day} {open.day}
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

            <ul className="cal__signals">
              {DAILY_SIGNALS.map((key) => {
                const entry = open.record?.signals[key];
                const status = entry?.status ?? 'UNKNOWN';
                return (
                  <li key={key} className="cal__signal">
                    <span className="cal__signalmark" aria-hidden="true">
                      {status === 'UNKNOWN' ? '□' : '■'}
                    </span>
                    <span className="t-meta">{DAILY_SIGNAL_LABELS[key]}</span>
                    <span className="t-micro cal__signalstatus">
                      {status === 'UNKNOWN' ? t.calendar.notKnown : status}
                    </span>
                    {/* La provenienza sta sotto e in grigio: serve a capire da
                        dove viene il dato, non a giudicare la giornata. */}
                    {entry?.note && <span className="t-micro cal__source">{entry.note}</span>}
                  </li>
                );
              })}
            </ul>

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
                  {/* La pausa si dichiara solo sui giorni aperti, e il motivo è
                      facoltativo: chiedere perché stavi male come condizione
                      sarebbe esattamente la vergogna che §4 vieta. */}
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
          <strong>{synced}</strong> {t.calendar.syncedOf} {today}
          {sync.lifetime !== synced && ` · ${sync.lifetime} SYNC totali`}. {t.calendar.noStreak}
        </p>
      </div>
    </div>
  );
}
