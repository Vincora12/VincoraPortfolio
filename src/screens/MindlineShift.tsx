/* ============================================================================
   11 — MINDLINE SHIFT

   🔶 Riscritta sul modello SYNC. La versione precedente presentava CONTINUE
   contro BRANCH: due strade, e una era un addio. Non è più così.

   VINZ.MON è UNA entità. Qui non si sceglie fra due creature, si sceglie
   quanto lasciarla cambiare:

     MATURA        stessa forma, un dettaglio che si risolve   (ogni 7 SYNC)
     CAMBIA FORMA  stessa entità, configurazione nuova         (a 28 SYNC)

   Le due card hanno lo stesso peso visivo perché il sistema non spinge verso
   nessuna delle due, e sotto c'è sempre NON ORA. È la regola che il documento
   lasciava aperta e che è stata fissata dopo la v1.6: la Form Evolution è
   un'offerta, non un obbligo. Rimandarla non costa niente e non blocca il
   conteggio — per questo la riga «i giorni continuano a contare» sta in
   schermata e non in un tooltip.
   ========================================================================= */

import { useApp, useActiveMon, useGrowth } from '../state/store';
import { Button, HoldButton, ScreenHead, SegmentedBar, SystemLabel } from '../system/components';
import { Icon } from '../system/Icon';
import { PROGRESSION } from '../engine/progression';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function MindlineShiftScreen() {
  const mon = useActiveMon();
  const { sync, microGrowthReady, formEvolutionReady } = useGrowth();
  const doMicroGrowth = useApp((s) => s.doMicroGrowth);
  const openFormEvolution = useApp((s) => s.openFormEvolution);
  const enterLive = useApp((s) => s.enterLive);

  if (!mon) return null;
  const short = displayName(mon.data.name);

  return (
    <div className="screen">
      <ScreenHead title={t.shift.title} sub={t.shift.subtitle} />

      <div className="screen__body shift">
        <p className="shift__lead t-small">
          <strong>{short}</strong> · {t.shift.days(sync.inForm)}
        </p>

        {/* --- MICRO-GROWTH --- */}
        <section className={`shiftcard ${microGrowthReady ? 'shiftcard--open' : ''}`}>
          <header className="shiftcard__head">
            <Icon name="dna" size={18} strokeWidth={2} />
            <h2 className="t-display shiftcard__title">{t.shift.growthTitle}</h2>
            {!microGrowthReady && <SystemLabel>{t.shift.notEligible}</SystemLabel>}
          </header>

          <p className="t-small shiftcard__body">{t.shift.growthBody}</p>

          {microGrowthReady ? (
            <HoldButton onComplete={doMicroGrowth} hint={t.shift.hold}>
              {t.shift.growthAction}
            </HoldButton>
          ) : (
            <Countdown
              have={sync.sinceGrowth}
              need={PROGRESSION.microGrowthEvery}
            />
          )}
        </section>

        {/* --- FORM EVOLUTION --- */}
        <section className={`shiftcard ${formEvolutionReady ? 'shiftcard--open' : ''}`}>
          <header className="shiftcard__head">
            <Icon name="branch" size={18} strokeWidth={2} />
            <h2 className="t-display shiftcard__title">{t.shift.formTitle}</h2>
            {!formEvolutionReady && <SystemLabel>{t.shift.notEligible}</SystemLabel>}
          </header>

          <p className="t-small shiftcard__body">{t.shift.formBody}</p>

          {formEvolutionReady ? (
            <HoldButton variant="secondary" onComplete={openFormEvolution} hint={t.shift.hold}>
              {t.shift.formAction}
            </HoldButton>
          ) : (
            <Countdown have={sync.inForm} need={PROGRESSION.formEvolutionAt} />
          )}
        </section>

        <p className="t-micro shift__norush">{t.shift.noRush}</p>

        <Button variant="ghost" block onClick={enterLive}>
          {t.shift.stay}
        </Button>
      </div>
    </div>
  );
}

/**
 * Quanto manca, in giorni sincronizzati. Non in percentuale: «12 giorni su 28»
 * si capisce e «43%» no, perché non dice di cosa.
 */
function Countdown({ have, need }: { have: number; need: number }) {
  return (
    <>
      <SegmentedBar
        value={Math.min(1, have / need)}
        segments={Math.min(28, need)}
        readout={`${have} / ${need}`}
        tone="warning"
      />
      <p className="t-micro shiftcard__reason">
        mancano {Math.max(0, need - have)} giorni sincronizzati
      </p>
    </>
  );
}
