/* ============================================================================
   08 — DAILY SCAN (§12) + INPUT MOOD (§11)

   §11 — regola canonica:
   «Canonical selectable inputs: Sereno · Affettuoso · Arrapato · Energico ·
    Euforico · Irritato · Stressato · Paranoiato · Scarico · Malinconico ·
    Cazzaro · Sicuro · Distaccato.»
   «Up to 3 per day. ONE DAY NEVER DIRECTLY ASSIGNS CREATURE MOOD.»
   «Rolling windows create latent dimensions.»

   La schermata lo dice esplicitamente all'utente, perché è la differenza fra
   un tracker dell'umore e questo: quello che dichiari oggi non decide come
   sarà il tuo .mon domani, entra in una finestra di 14 giorni.

   §22 — con Data Confidence sotto 35 il motore usa un mood neutro invece di
   fabbricare uno stato emotivo forte. Anche questo è dichiarato.

   §28 — nessun umore è migliore di un altro. Nessuna voce è colorata come
   positiva o negativa.
   ========================================================================= */

import { useState } from 'react';
import { useApp, useToday, useTodayMoods } from '../state/store';
import { Button, ScreenHead, SegmentedBar, SystemLabel } from '../system/components';
import { IconButton } from '../system/components';
import {
  DAILY_SIGNAL_LABELS,
  type DailySignalKey,
  type SignalStatus,
} from '../engine/progression';
import {
  MOOD_INPUTS,
  MOOD_INPUT_RULES,
  MOOD_CONFIDENCE_FLOOR,
  type MoodInputId,
} from '../engine/generation-config';
import { aggregateDataConfidence, computeMoodLatents } from '../engine/signals';
import { STAT_KEYS, isKnown } from '../engine/types';
import { formatSignal } from '../engine/health';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';

/** Etichette leggibili: gli id di §11 sono già in italiano, in maiuscolo. */
function label(id: MoodInputId): string {
  return id.charAt(0) + id.slice(1).toLowerCase();
}

export function DailyScanScreen({ onClose }: { onClose: () => void }) {
  const day = useApp((s) => s.day);
  const health = useApp((s) => s.health);
  const moodHistory = useApp((s) => s.moodHistory);
  const setMoodInputs = useApp((s) => s.setMoodInputs);
  const setDailySignal = useApp((s) => s.setDailySignal);
  const syncDay = useApp((s) => s.syncDay);
  const logInput = useApp((s) => s.logInput);

  const todayMoods = useTodayMoods();
  const scan = useToday();
  const [selected, setSelected] = useState<MoodInputId[]>(todayMoods);

  const confidence = aggregateDataConfidence(health);
  const latents = computeMoodLatents(moodHistory, day);
  const missing = STAT_KEYS.filter((k) => !isKnown(health.stats[k].value));

  const toggle = (id: MoodInputId) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MOOD_INPUT_RULES.maxPerDay
          ? prev
          : [...prev, id],
    );
  };

  /**
   * Registrare l'umore riempie il terzo segnale. Non è un effetto collaterale
   * nascosto: è la stessa informazione detta una volta sola. Dichiarare zero
   * umori NON lo riempie — «should not silently fabricate subjective
   * information such as Mood».
   */
  const save = () => {
    setMoodInputs(selected);
    if (selected.length > 0) {
      setDailySignal('MOOD', 'KNOWN', selected.join(' · '));
    }
  };

  const confirm = () => {
    save();
    onClose();
  };

  const closeDay = () => {
    save();
    syncDay();
    haptic('impact');
    onClose();
  };

  const full = selected.length >= MOOD_INPUT_RULES.maxPerDay;

  // Il giorno è chiudibile se lo è già, o se lo diventerà appena si salvano gli
  // umori scelti in questa schermata ma non ancora registrati.
  const moodPending = selected.length > 0 && scan.day.signals.MOOD.status === 'UNKNOWN';
  const canClose =
    !scan.closed &&
    (scan.canClose ||
      (moodPending &&
        scan.day.signals.FOOD.status !== 'UNKNOWN' &&
        scan.day.signals.WORKOUT.status !== 'UNKNOWN'));

  return (
    <div className="screen scan">
      <ScreenHead
        title={t.scan.title}
        sub={`${t.common.day} ${day}`}
        left={<IconButton icon="left" label={t.common.back} light onClick={onClose} />}
      />

      <div className="screen__body scan__body">
        {/* --- I tre Daily Signals (v1.5) ---

            Sono la cosa che decide se il giorno conta, quindi stanno per
            primi. NOT_APPLICABLE non è un buco: un giorno di riposo è una
            risposta, e vale come segnale noto quanto un allenamento. --- */}
        <section className="scan__section">
          <div className="scan__sectionhead">
            <p className="t-meta">{t.scan.signalsTitle}</p>
            <SystemLabel tone={scan.closed ? 'positive' : 'default'}>
              {scan.known}/3
            </SystemLabel>
          </div>

          <SignalRow
            signal="FOOD"
            status={scan.day.signals.FOOD.status}
            knownLabel={t.scan.ateSomething}
            naLabel={t.scan.notApplicable}
            onSet={setDailySignal}
          />
          <SignalRow
            signal="WORKOUT"
            status={scan.day.signals.WORKOUT.status}
            knownLabel={t.scan.known}
            naLabel={t.scan.restDay}
            onSet={setDailySignal}
          />
          <SignalRow
            signal="MOOD"
            status={
              scan.day.signals.MOOD.status === 'UNKNOWN' && selected.length > 0
                ? 'KNOWN'
                : scan.day.signals.MOOD.status
            }
            knownLabel={t.scan.moodFromChips}
            knownDisabled
            naLabel={t.scan.moodPrivate}
            onSet={setDailySignal}
          />

          <p className="t-micro scan__note">{t.scan.signalsNote}</p>
        </section>

        {/* --- Umori dichiarati (§11) --- */}
        <section className="scan__section">
          <div className="scan__sectionhead">
            <p className="t-meta">{t.scan.moodTitle}</p>
            <SystemLabel tone={full ? 'warning' : 'default'}>
              {selected.length}/{MOOD_INPUT_RULES.maxPerDay}
            </SystemLabel>
          </div>

          <div className="scan__moods">
            {MOOD_INPUTS.map((m) => {
              const on = selected.includes(m.id);
              const blocked = !on && full;
              return (
                <button
                  key={m.id}
                  type="button"
                  className="moodchip"
                  aria-pressed={on}
                  disabled={blocked}
                  onClick={() => {
                    haptic('tick');
                    toggle(m.id);
                  }}
                >
                  {/* Lo stato non è solo colore: c'è il segno (§17). */}
                  <span className="moodchip__mark" aria-hidden="true">
                    {on ? '■' : '□'}
                  </span>
                  {label(m.id)}
                </button>
              );
            })}
          </div>

          {/* La regola che distingue questo da un tracker dell'umore. */}
          <p className="t-small scan__rule">{t.scan.rule}</p>
        </section>

        {/* --- Finestra latente (§22) --- */}
        <section className="scan__section">
          <p className="t-meta">{t.scan.latentTitle}</p>
          <p className="t-micro scan__note">{t.scan.latentNote}</p>

          <div className="scan__latents">
            {(['warmth', 'energy', 'stress', 'melancholy', 'vigilance', 'arousal'] as const).map(
              (k) => (
                <SegmentedBar
                  key={k}
                  value={latents[k] / 100}
                  segments={12}
                  label={k.toUpperCase()}
                  readout={String(Math.round(latents[k]))}
                />
              ),
            )}
          </div>
        </section>

        {/* 🔷 v1.10 — qui c'era la barra DATA CONFIDENCE, la TERZA superficie
            di prodotto che la mostrava. Era già uscita da ME (§4.1) e dal
            profilo, e questa è la volta buona: è un concetto del motore —
            quanto il generatore si fida della finestra recente — non un fatto
            sulla persona, e un numero che nessuno sa leggere.

            Resta l'unica parte che serviva davvero all'utente: l'avviso che,
            con pochi dati, il sistema usa un umore neutro invece di
            inventarne uno forte. Quella è una promessa di onestà (§5), non
            una metrica. */}
        {confidence < MOOD_CONFIDENCE_FLOOR && (
          <section className="scan__section">
            <p className="t-small scan__warning">
              <SystemLabel tone="warning">POCHI DATI</SystemLabel>{' '}
              {t.scan.lowConfidence}
            </p>
          </section>
        )}

        {/* --- Segnali mancanti: dichiarati, non trattati come zero (§3) --- */}
        {missing.length > 0 && (
          <section className="scan__section">
            <p className="t-meta">{t.scan.missingTitle}</p>
            <div className="scan__missing">
              {missing.map((k) => (
                <span key={k} className="scan__missingchip t-micro">
                  {k} <em>{formatSignal(health.stats[k].value)}</em>
                </span>
              ))}
            </div>
            <p className="t-micro scan__note">{t.scan.missingNote}</p>
            <Button small variant="secondary" icon="measure" onClick={() => logInput('measure')}>
              {t.scan.syncNow}
            </Button>
          </section>
        )}
      </div>

      <footer className="screen__foot screen__foot--stack">
        {/* La chiusura della giornata è l'UNICO punto in cui si guadagna SYNC.
            Sta qui, in fondo alla schermata che raccoglie i segnali, perché è
            la conclusione di quello che si è appena fatto. */}
        <Button variant="primary" block disabled={!canClose} onClick={closeDay}>
          {scan.closed
            ? t.scan.alreadyClosed
            : canClose
              ? t.scan.closeDay
              : t.scan.closeDayBlocked}
        </Button>
        <Button variant="ghost" block onClick={confirm}>
          {t.scan.confirm}
        </Button>
        <p className="t-micro scan__note">{t.scan.closeRule}</p>
      </footer>
    </div>
  );
}

/* --- Una riga di segnale ---------------------------------------------------- */

function SignalRow({
  signal,
  status,
  knownLabel,
  knownDisabled,
  naLabel,
  onSet,
}: {
  signal: DailySignalKey;
  status: SignalStatus;
  knownLabel: string;
  knownDisabled?: boolean;
  naLabel: string;
  onSet: (key: DailySignalKey, status: SignalStatus, note?: string) => void;
}) {
  const known = status !== 'UNKNOWN';

  return (
    <div className="signalrow">
      <div className="signalrow__head">
        {/* Lo stato non è solo colore: c'è il segno (§17). */}
        <span className="signalrow__mark" aria-hidden="true">
          {known ? '■' : '□'}
        </span>
        <span className="t-meta">{DAILY_SIGNAL_LABELS[signal]}</span>
        <span className="t-micro signalrow__status">
          {status === 'UNKNOWN'
            ? t.scan.unknown
            : status === 'NOT_APPLICABLE'
              ? naLabel
              : t.scan.known}
        </span>
      </div>

      <div className="signalrow__actions">
        {/* L'umore non ha un pulsante «lo so»: si dichiara scegliendo gli umori
            qui sotto. Un pulsante disattivato direbbe che c'è una strada
            chiusa, quando invece la strada è solo un'altra. */}
        {knownDisabled ? (
          <span className="t-micro signalrow__hint">{knownLabel}</span>
        ) : (
          <Button
            small
            variant={status === 'KNOWN' ? 'primary' : 'ghost'}
            onClick={() => {
              haptic('tick');
              onSet(signal, 'KNOWN');
            }}
          >
            {knownLabel}
          </Button>
        )}
        <Button
          small
          variant={status === 'NOT_APPLICABLE' ? 'primary' : 'ghost'}
          onClick={() => {
            haptic('tick');
            onSet(signal, 'NOT_APPLICABLE', naLabel);
          }}
        >
          {naLabel}
        </Button>
      </div>
    </div>
  );
}
