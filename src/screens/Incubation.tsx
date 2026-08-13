/* ============================================================================
   04 — FIRST SIGNAL / INCUBATION (§12)

   "Initial relationship and data-acquisition state."
   Board S05: campo nero, DAY n / 28, SIGNAL STABILITY, linguaggio scanner.

   🟡 §18 — la terminologia definitiva dopo l'abbandono del nome DIGIVINZ non è
   fissata: le stringhe vivono in i18n/it.ts e sono marcate come provvisorie.

   §12/01 — nessuno spoiler della forma futura: qui non si mostra e non si
   anticipa nessun .mon.
   ========================================================================= */

import { useApp, useIncubation } from '../state/store';
import { Button, DataDots, GlitchBar, ScannerFrame, SegmentedBar, SignalWave } from '../system/components';
import { Icon } from '../system/Icon';
import { STAT_KEYS, isKnown } from '../engine/types';
import { t } from '../i18n/it';

export function IncubationScreen() {
  const inc = useIncubation();
  const day = useApp((s) => s.day);
  const stats = useApp((s) => s.health.stats);
  const hatch = useApp((s) => s.hatch);
  const simulateSyncedDays = useApp((s) => s.simulateSyncedDays);

  return (
    <div className="screen screen--ink">
      <div className="screen__body incubation">
        <header className="incubation__head">
          <p className="t-meta">{t.incubation.subtitle}</p>
          <h1 className="t-display incubation__title">{t.incubation.title}</h1>
        </header>

        {/* Il "guscio" è un oggetto di sistema, non un uovo illustrato: §18A
            vieta di inventare arte, e qui non c'è ancora nessun personaggio. */}
        <div className="incubation__stage">
          <ScannerFrame>
            <div className="incubation__vessel">
              <Icon name="egg" size={148} strokeWidth={1.2} />
              <div className="incubation__crack" style={{ opacity: inc.progress }} aria-hidden="true">
                <GlitchBar seed={day} slices={18} />
              </div>
            </div>
          </ScannerFrame>
        </div>

        <div className="incubation__readouts">
          <div className="incubation__row">
            <span className="t-meta">{t.incubation.day}</span>
            <span className="t-display incubation__day">
              {inc.day} <span className="incubation__total">/ {inc.total}</span>
            </span>
          </div>

          <SegmentedBar
            value={inc.progress}
            segments={inc.total}
            label="INCUBAZIONE"
            readout={`${inc.day} / ${inc.total}`}
          />

          <SegmentedBar
            value={inc.stability}
            segments={12}
            label={t.incubation.stability}
            readout={`${Math.round(inc.stability * 100)}%`}
            tone={inc.stability > 0.6 ? 'positive' : 'warning'}
          />

          <div className="incubation__signals">
            <span className="t-micro">SEGNALI LETTI</span>
            <div className="incubation__chips">
              {STAT_KEYS.map((k) => (
                <span
                  key={k}
                  className={`incubation__chip ${isKnown(stats[k].value) ? 'incubation__chip--on' : ''}`}
                >
                  {k}
                  {/* Il colore non basta (§17): lo stato è anche scritto. */}
                  <em>{isKnown(stats[k].value) ? 'OK' : '—'}</em>
                </span>
              ))}
            </div>
          </div>

          <div className="incubation__trace" aria-hidden="true">
            <SignalWave seed={day * 977} width={320} height={28} />
            <DataDots cols={40} rows={3} />
          </div>
        </div>
      </div>

      <footer className="incubation__foot">
        <p className="t-small incubation__note">
          {inc.ready ? t.incubation.ready : t.incubation.waiting}
        </p>

        <Button
          variant="primary"
          block
          disabled={!inc.ready}
          haptics="impact"
          onClick={hatch}
          aria-describedby="hatch-note"
        >
          {inc.ready ? t.incubation.hatch : t.incubation.notReady}
        </Button>

        <p id="hatch-note" className="t-micro incubation__definitive">
          {inc.ready
            ? t.incubation.definitive
            : `MANCANO ${inc.total - inc.day} GIORNI SINCRONIZZATI`}
        </p>

        {/* Il tempo scorre solo dal pannello DEV: nel prodotto reale è la vita
            dell'utente a farlo avanzare. Qui il tasto resta accessibile perché
            senza di esso il prototipo non sarebbe testabile (§20).

            🔶 Simula giorni *sincronizzati*, non giorni passati: l'incubazione
            conta le volte che ti sei presentato, e il tempo da solo non basta
            più a farla finire. */}
        <button
          type="button"
          className="incubation__skip t-micro"
          onClick={() => simulateSyncedDays(7)}
        >
          + 7 GIORNI SINCRONIZZATI (SIMULAZIONE)
        </button>
      </footer>
    </div>
  );
}
