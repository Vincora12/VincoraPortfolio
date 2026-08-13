/* ============================================================================
   09 — ME OVERVIEW (§12)

   "FORM / ATK / SPD / DEF / REC / CARE, Condition, DISC e scorciatoie di dominio."

   §11 — questo è il livello di verità analitica. La presenza della creatura è
   secondaria: qui non compare.
   §3 — CONDITION è lo stato di oggi, DISC è separata, il dato mancante resta
   UNKNOWN. Nessuna metrica inventata "per completezza" (§17).
   ========================================================================= */

import { useApp } from '../state/store';
import { ScreenHead, SegmentedBar, SystemLabel, Window } from '../system/components';
import {
  STAT_LABELS,
  formatDelta,
  formatSignal,
  overallConfidence,
  trend,
} from '../engine/health';
import { STAT_KEYS, isKnown } from '../engine/types';
import { t } from '../i18n/it';

export function MeOverviewScreen() {
  const health = useApp((s) => s.health);
  const progression = useApp((s) => s.progression);
  const confidence = overallConfidence(health);

  const anyUnknown = STAT_KEYS.some((k) => !isKnown(health.stats[k].value));

  return (
    <div className="screen">
      <ScreenHead title={t.me.title} sub={t.me.subtitle} />

      <div className="screen__body me">
        {/* --- CONDITION: stato del giorno, con il nome di sistema accanto alla
             domanda a cui risponde. «CONDITION» da solo non si capisce. --- */}
        <Window title={`CONDITION · ${t.me.conditionTitle}`}>
          <div className="me__condition">
            <span className="me__big t-display">{formatSignal(health.condition)}</span>
            <div className="me__conditionbar">
              <SegmentedBar
                value={isKnown(health.condition) ? health.condition / 100 : 'unknown'}
                segments={20}
                readout={isKnown(health.condition) ? `${Math.round(health.condition)}/100` : undefined}
                tone={
                  !isKnown(health.condition)
                    ? 'character'
                    : health.condition > 65
                      ? 'positive'
                      : health.condition > 40
                        ? 'warning'
                        : 'alert'
                }
              />
              {/* Una spiegazione si legge come una frase: il maiuscoletto
                  monospaziato è per le etichette, non per i periodi. */}
              <p className="t-small me__note">{t.me.conditionNote}</p>
            </div>
          </div>
        </Window>

        {/* --- Le sei metriche di §3 --- */}
        <div className="me__stats">
          {STAT_KEYS.map((key) => {
            const entry = health.stats[key];
            const t7 = trend(health, key, 7);
            return (
              <section key={key} className="statcard">
                <header className="statcard__head">
                  <span className="statcard__key t-display">{key}</span>
                  <span className="statcard__value t-display">{formatSignal(entry.value)}</span>
                </header>

                <SegmentedBar
                  value={isKnown(entry.value) ? entry.value / 100 : 'unknown'}
                  segments={16}
                />

                {/* Una riga sola invece di tre: cosa misura, come si muove,
                    quanto è affidabile. Le etichette lunghe stavano ripetute
                    sei volte e non aggiungevano niente dopo la prima lettura. */}
                <div className="statcard__meta t-micro">
                  <span className="statcard__label">{STAT_LABELS[key]}</span>
                  <span title={t.me.trend7}>7G {formatDelta(t7)}</span>
                  <span title={t.me.confidence}>{Math.round(entry.confidence * 100)}%</span>
                </div>
              </section>
            );
          })}
        </div>

        {/* --- DISC, tenuta fuori dalle stat di salute (§3) --- */}
        <Window title={`DISC · ${t.me.discTitle}`}>
          <div className="me__disc">
            <span className="me__big t-display">{formatSignal(health.disc)}</span>
            <div>
              <SegmentedBar
                value={isKnown(health.disc) ? health.disc / 100 : 'unknown'}
                segments={20}
              />
              <p className="t-small me__note">{t.me.discNote}</p>
            </div>
          </div>
        </Window>

        {/* --- Progressione di gioco, separata dalla salute (§3).

            🔶 Niente livelli, niente XP: SYNC non misura quanto stai bene, ma
            quanti giorni VINZ.MON ha potuto leggere. Stare male e raccontarlo
            vale esattamente come stare bene e raccontarlo. --- */}
        <Window title="PROGRESSIONE DI GIOCO">
          <div className="me__game">
            <div className="me__gameitem">
              <span className="t-meta">{t.common.sync}</span>
              <span className="t-display">{progression.sync.lifetime}</span>
            </div>
            <div className="me__gameitem">
              <span className="t-meta">IN QUESTA FORMA</span>
              <span className="t-display">{progression.sync.inForm}</span>
            </div>
            <div className="me__gameitem">
              <span className="t-meta">{t.home.bond}</span>
              <span className="t-display">{Math.round(progression.bond * 100)}%</span>
            </div>
          </div>
        </Window>

        <div className="me__confidence">
          <SegmentedBar
            value={confidence}
            segments={20}
            label={t.me.confidence}
            readout={`${Math.round(confidence * 100)}%`}
          />
          {anyUnknown && (
            <p className="me__unknown t-small">
              <SystemLabel tone="warning">UNKNOWN</SystemLabel> {t.me.unknownNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
