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
import { useApp, useTodayMoods } from '../state/store';
import { Button, ScreenHead, SegmentedBar, SystemLabel } from '../system/components';
import { IconButton } from '../system/components';
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
  const logInput = useApp((s) => s.logInput);

  const today = useTodayMoods();
  const [selected, setSelected] = useState<MoodInputId[]>(today);

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

  const confirm = () => {
    setMoodInputs(selected);
    onClose();
  };

  const full = selected.length >= MOOD_INPUT_RULES.maxPerDay;

  return (
    <div className="screen scan">
      <ScreenHead
        title={t.scan.title}
        sub={`${t.common.day} ${day}`}
        left={<IconButton icon="left" label={t.common.back} light onClick={onClose} />}
      />

      <div className="screen__body scan__body">
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

        {/* --- Confidenza del dato (§2) --- */}
        <section className="scan__section">
          <p className="t-meta">{t.scan.confidenceTitle}</p>
          <SegmentedBar
            value={confidence / 100}
            segments={20}
            readout={`${confidence}%`}
            tone={confidence >= MOOD_CONFIDENCE_FLOOR ? 'positive' : 'warning'}
          />
          {confidence < MOOD_CONFIDENCE_FLOOR && (
            <p className="t-small scan__warning">
              <SystemLabel tone="warning">SOTTO {MOOD_CONFIDENCE_FLOOR}</SystemLabel>{' '}
              {t.scan.lowConfidence}
            </p>
          )}
        </section>

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

      <footer className="screen__foot">
        <Button variant="primary" block onClick={confirm}>
          {t.scan.confirm}
        </Button>
      </footer>
    </div>
  );
}
