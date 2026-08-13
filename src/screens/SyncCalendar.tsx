/* ============================================================================
   CALENDARIO SYNC

   La cronologia dei giorni, come griglia. È la superficie che rende visibile
   la regola che regge tutto il modello:

     ● SYNCED    giorno chiuso, +1 SYNC
     ◐ PARTIAL   qualcosa si sa, il giorno è ancora aperto
     ○ EMPTY     niente

   🔶 Nessuna casella è rossa e nessuna è un fallimento. Un giorno vuoto è un
   giorno che non è stato raccontato, non un giorno andato male — e non azzera
   niente: «If a day is missing, incubation does NOT reset.» Per questo non
   c'è nessuna serie da difendere, nessun contatore di giorni consecutivi.
   Difendere una serie è esattamente il comportamento che questo prodotto non
   deve produrre.

   Vive dentro ME, non in una schermata a sé: è il livello analitico, ed è lì
   che uno va a guardare com'è andata.
   ========================================================================= */

import { useApp } from '../state/store';
import { dayStatus, type DayStatus } from '../engine/progression';

/** I segni. Non è solo colore: §17 vuole che lo stato sia leggibile comunque. */
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

export function SyncCalendar() {
  const days = useApp((s) => s.days);
  const today = useApp((s) => s.day);
  const nodes = useApp((s) => s.nodes);

  /** Cosa è successo in un giorno, oltre al SYNC: nascita, crescita, forma. */
  const events = new Map<number, string>();
  for (const n of nodes) {
    events.set(n.day, n.kind === 'origin' ? 'nascita' : n.kind === 'evolution' ? 'crescita' : 'forma');
  }

  const cells = Array.from({ length: today }, (_, i) => {
    const day = i + 1;
    const record = days[day];
    return {
      day,
      status: record ? dayStatus(record) : ('EMPTY' as DayStatus),
      event: events.get(day) ?? null,
    };
  });

  const synced = cells.filter((c) => c.status === 'SYNCED').length;

  return (
    <div className="cal">
      <div className="cal__grid">
        {cells.map((c) => (
          <div
            key={c.day}
            className={`cal__cell cal__cell--${c.status.toLowerCase()} ${
              c.day === today ? 'cal__cell--today' : ''
            }`}
            title={`Giorno ${c.day} · ${STATUS_LABELS[c.status]}${c.event ? ` · ${c.event}` : ''}`}
          >
            <span className="cal__mark" aria-hidden="true">
              {MARKS[c.status]}
            </span>
            <span className="cal__day t-micro">{c.day}</span>
            {c.event && (
              <span className="cal__event" aria-hidden="true">
                {c.event === 'nascita' ? '✦' : c.event === 'forma' ? '⌥' : '+'}
              </span>
            )}
            <span className="sr-only">
              Giorno {c.day}: {STATUS_LABELS[c.status]}
              {c.event ? `, ${c.event}` : ''}
            </span>
          </div>
        ))}
      </div>

      <p className="t-micro cal__legend">
        {MARKS.SYNCED} sincronizzato · {MARKS.PARTIAL} parziale · {MARKS.EMPTY} vuoto · ✦ nascita ·
        + crescita · ⌥ cambio di forma
      </p>

      <p className="t-small cal__total">
        <strong>{synced}</strong> giorni sincronizzati su {today}. Un giorno vuoto non toglie
        niente: la crescita aspetta, non torna indietro.
      </p>
    </div>
  );
}
