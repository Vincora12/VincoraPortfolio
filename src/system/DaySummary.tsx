/* ============================================================================
   RIEPILOGO DELLA GIORNATA (MASTER SPEC v1.11 §5.4)

   🔷 «Mi piacerebbe che quando segno le cose della giornata posso farlo solo
   scrivendo. Quindi nel riepilogo c'è se quel giorno hai segnato tutto il cibo
   — colazione, merenda, pranzo, merenda, cena. L'allenamento lui saprà dal mio
   piano se sono a riposo quel giorno. E il mood.»

   La differenza con quello che c'era prima: CIBO era una casella sola. Diceva
   «di cibo oggi so qualcosa», che è vero anche se hai raccontato solo il
   caffè. Adesso le caselle sono cinque, si riempiono nel corso della giornata,
   e si riempiono SCRIVENDO — il pasto lo deduce chi legge, non lo chiede.

   ⚠️ DUE REGOLE DI TONO, e sono la ragione per cui questo componente non è una
   checklist:

   1. **I pasti mancanti non sono mancanze.** Non c'è nessuna spunta rossa,
      nessun «ti manca la merenda», nessun conteggio che scende. Una casella
      vuota è una casella vuota: dice che di quel pasto non si sa niente, non
      che hai sbagliato. §4 vieta la vergogna, e una checklist della giornata
      alimentare è il posto più facile del mondo per farla rientrare.

   2. **I pasti NON decidono se il giorno conta.** `canCloseDay` guarda i tre
      segnali, non i cinque pasti. Far dipendere il SYNC dal ricordarsi la
      merenda trasformerebbe il prodotto in una lista da non sbagliare.
   ========================================================================= */

import { DAILY_SIGNAL_LABELS, type DailySync } from '../engine/progression';
import {
  MEAL_LABELS,
  MEAL_SLOTS,
  WORKOUT_KIND_LABELS,
  expectedMeals,
  plannedFor,
  type DietProtocol,
  type TrainingProtocol,
} from '../engine/protocol';
import { t } from '../i18n/it';

export function DaySummary({
  day,
  date,
  diet,
  training,
}: {
  day: DailySync | null;
  date: Date;
  diet: DietProtocol | null;
  training: TrainingProtocol | null;
}) {
  const meals = day?.meals ?? {};
  const expected = expectedMeals(diet);
  /* Senza un protocollo che dica quanti pasti fai, si mostrano tutti e cinque
     senza pretenderne nessuno: il riepilogo racconta invece di misurare. */
  const shown = expected ?? [...MEAL_SLOTS];
  const told = shown.filter((m) => meals[m]).length;

  const planned = plannedFor(training, date);
  const workout = day?.signals.WORKOUT;

  return (
    <div className="daysum">
      <section className="daysum__block">
        <header className="daysum__head">
          <span className="t-meta">{DAILY_SIGNAL_LABELS.FOOD}</span>
          {/* Un conteggio senza aggettivi. «3 su 5» è un fatto; «ti mancano 2»
              è un rimprovero, e dicono la stessa cosa. */}
          <span className="t-micro daysum__count">
            {told} {t.summary.of} {shown.length}
          </span>
        </header>

        <ul className="daysum__meals">
          {shown.map((slot) => {
            const entry = meals[slot];
            return (
              <li key={slot} className={`daysum__meal ${entry ? 'daysum__meal--told' : ''}`}>
                <span className="daysum__mark" aria-hidden="true">{entry ? '■' : '□'}</span>
                <span className="t-meta daysum__mealname">{MEAL_LABELS[slot]}</span>
                <span className="t-micro daysum__mealnote">
                  {entry
                    ? entry.groups.length > 0
                      ? entry.note
                      : t.summary.toldNoDetail
                    : t.summary.notTold}
                </span>
                {/* Quando il pasto è stato dedotto dall'ora e non dalle parole,
                    si dice. Dedurre in silenzio è la stessa bugia che §5 vieta
                    ai sensori. */}
                {entry?.fromClock && (
                  <span className="t-micro daysum__guess">{t.summary.fromClock}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="daysum__block">
        <header className="daysum__head">
          <span className="t-meta">{DAILY_SIGNAL_LABELS.WORKOUT}</span>
          {planned && (
            <span className="t-micro daysum__count">
              {planned === 'REST'
                ? t.summary.plannedRest
                : `${t.summary.planned} ${planned.map((k) => WORKOUT_KIND_LABELS[k]).join(', ')}`}
            </span>
          )}
        </header>
        <p className="t-small daysum__line">
          {workout && workout.status !== 'UNKNOWN'
            ? (workout.note ?? workout.status)
            : t.summary.notTold}
        </p>
      </section>

      <section className="daysum__block">
        <header className="daysum__head">
          <span className="t-meta">{DAILY_SIGNAL_LABELS.MOOD}</span>
        </header>
        <p className="t-small daysum__line">
          {day?.signals.MOOD.status === 'KNOWN'
            ? (day.signals.MOOD.note ?? '—')
            : t.summary.notTold}
        </p>
      </section>

      <p className="t-micro daysum__rule">{t.summary.rule}</p>
    </div>
  );
}
