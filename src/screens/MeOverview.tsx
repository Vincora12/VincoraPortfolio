/* ============================================================================
   09 — ME OVERVIEW (§12)

   "FORM / ATK / SPD / DEF / REC / CARE, Condition e scorciatoie di dominio."

   §11 — questo è il livello di verità analitica. La presenza della creatura è
   secondaria: qui non compare.

   🔶 v1.9 §4.1 — la schermata dichiara in testa la distinzione che prima
   lasciava indovinare. Vedere CONDITION, DISC, CONFIDENZA e SYNC nella stessa
   pagina faceva sembrare che fossero quattro punteggi dello stesso gioco,
   quando §4 dice l'opposto: «Health truth and game progression stay separate».

   Quindi: qui c'è **come stai**, e non fa crescere niente. SYNC — quanto
   VINZ.MON ti ha potuto leggere — è l'unica cosa che fa crescere, e sta in
   fondo, separata e detta a parole.

   Via due numeri che nessuno sapeva leggere:
   • **DISC** misurava la costanza, ed era l'ultimo residuo del modello a
     valute: un punteggio su quanto sei bravo a presentarti. Adesso quella cosa
     la dice il calendario, mostrando i giorni invece di riassumerli in un voto.
   • **CONFIDENZA DEL DATO** è un concetto del motore — quanto il generatore si
     fida della finestra recente — non un fatto sulla persona. È rimasto in DEV,
     dove serve.
   ========================================================================= */

import { useApp } from '../state/store';
import { ScreenHead, SegmentedBar, SystemLabel, Window } from '../system/components';
import { STAT_LABELS, formatDelta, formatSignal, trend } from '../engine/health';
import { STAT_KEYS, isKnown } from '../engine/types';
import { t } from '../i18n/it';

export function MeOverviewScreen() {
  const health = useApp((s) => s.health);
  const progression = useApp((s) => s.progression);

  const anyUnknown = STAT_KEYS.some((k) => !isKnown(health.stats[k].value));

  return (
    <div className="screen">
      <ScreenHead title={t.me.title} sub={t.me.subtitle} />

      <div className="screen__body me">
        {/* 🔶 La riga che toglie l'ambiguità prima di mostrare qualunque
             numero: quello che segue non è un punteggio. */}
        <p className="t-small me__preamble">{t.me.preamble}</p>

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

        {/* --- L'unica cosa che fa crescere. Separata, e detta a parole. --- */}
        <Window title={`SYNC · ${t.me.syncTitle}`}>
          <div className="me__game">
            <div className="me__gameitem">
              <span className="t-meta">{t.me.syncTotal}</span>
              <span className="t-display">{progression.sync.lifetime}</span>
            </div>
            <div className="me__gameitem">
              <span className="t-meta">{t.me.syncInForm}</span>
              <span className="t-display">{progression.sync.inForm}</span>
            </div>
            <div className="me__gameitem">
              <span className="t-meta">{t.home.bond}</span>
              <span className="t-display">{Math.round(progression.bond * 100)}%</span>
            </div>
          </div>
          <p className="t-small me__note">{t.me.syncNote}</p>
        </Window>

        {anyUnknown && (
          <p className="me__unknown t-small">
            <SystemLabel tone="warning">UNKNOWN</SystemLabel> {t.me.unknownNote}
          </p>
        )}
      </div>
    </div>
  );
}
