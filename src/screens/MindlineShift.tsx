/* ============================================================================
   11 — MINDLINE SHIFT (§12)

   "Decision surface: CONTINUE / EVOLVE versus BRANCH / NEW SIGNAL."

   §7.2 — CONTINUE è un impegno verso il percorso attuale: si spende XP e la
   stessa identità evolve.
   §7.3 — BRANCH è un addio: si segue una deviazione e nasce un nuovo .mon che
   eredita 1–3 tratti riconoscibili.

   Le due strade sono presentate con lo stesso peso visivo: stessa cornice,
   stessa gerarchia tipografica, stesso spazio. Il sistema non spinge verso
   nessuna delle due. Quello che cambia fra le due card è solo se la strada è
   percorribile adesso — che è un fatto, non una preferenza.

   Il testo lungo è stato tolto: la descrizione di cosa comporta una scelta si
   legge una volta. Resta la frase che dice cosa succede al .mon, perché quella
   è la differenza fra le due strade, e sparisce tutto il resto.
   ========================================================================= */

import { useApp, useActiveMon, useBranchCheck, useContinueCheck } from '../state/store';
import { Button, HoldButton, ScreenHead, SegmentedBar, SystemLabel } from '../system/components';
import { Icon } from '../system/Icon';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function MindlineShiftScreen() {
  const mon = useActiveMon();
  const { check: cont, cost } = useContinueCheck();
  const { check: branch, days } = useBranchCheck();
  const doContinue = useApp((s) => s.doContinue);
  const startBranch = useApp((s) => s.startBranch);
  const enterLive = useApp((s) => s.enterLive);

  if (!mon) return null;
  const short = displayName(mon.data.name);

  return (
    <div className="screen">
      <ScreenHead title={t.shift.title} sub={t.shift.subtitle} />

      <div className="screen__body shift">
        <p className="shift__lead t-small">
          <strong>{short}</strong> · {days} {days === 1 ? 'giorno' : 'giorni'} su questo percorso
        </p>

        {/* --- CONTINUE / EVOLVE --- */}
        <section className={`shiftcard ${cont.eligible ? 'shiftcard--open' : ''}`}>
          <header className="shiftcard__head">
            <Icon name="dna" size={18} strokeWidth={2} />
            <h2 className="t-display shiftcard__title">{t.shift.continueTitle}</h2>
            {cont.eligible ? (
              <SystemLabel tone="character">{cost} XP</SystemLabel>
            ) : (
              <SystemLabel>{t.shift.notEligible}</SystemLabel>
            )}
          </header>

          <p className="t-small shiftcard__body">{t.shift.continueBody}</p>

          {cont.eligible ? (
            <HoldButton onComplete={doContinue} hint={t.shift.hold}>
              {t.shift.continueAction}
            </HoldButton>
          ) : (
            <>
              <SegmentedBar
                value={cont.progress}
                segments={20}
                readout={`${Math.round(cont.progress * 100)}%`}
                tone="warning"
              />
              <p className="t-micro shiftcard__reason">{cont.reason}</p>
            </>
          )}
        </section>

        {/* --- BRANCH / NEW SIGNAL --- */}
        <section className={`shiftcard ${branch.eligible ? 'shiftcard--open' : ''}`}>
          <header className="shiftcard__head">
            <Icon name="branch" size={18} strokeWidth={2} />
            <h2 className="t-display shiftcard__title">{t.shift.branchTitle}</h2>
            {!branch.eligible && <SystemLabel>{t.shift.notEligible}</SystemLabel>}
          </header>

          <p className="t-small shiftcard__body">{t.shift.branchBody}</p>

          {branch.eligible ? (
            <HoldButton variant="secondary" onComplete={startBranch} hint={t.shift.hold}>
              {t.shift.branchAction}
            </HoldButton>
          ) : (
            <>
              <SegmentedBar
                value={branch.progress}
                segments={20}
                readout={`${Math.round(branch.progress * 100)}%`}
                tone="warning"
              />
              <p className="t-micro shiftcard__reason">{branch.reason}</p>
            </>
          )}
        </section>

        <Button variant="ghost" block onClick={enterLive}>
          {t.shift.stay}
        </Button>
      </div>
    </div>
  );
}
