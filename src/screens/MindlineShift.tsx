/* ============================================================================
   11 — MINDLINE SHIFT (§12)

   "Decision surface: CONTINUE / EVOLVE versus BRANCH / NEW SIGNAL."

   §7.2 — CONTINUE è un impegno verso il percorso attuale: si spende XP e la
   stessa identità evolve.
   §7.3 — BRANCH è un addio: si segue una deviazione e nasce un nuovo .mon che
   eredita 1–3 tratti riconoscibili.

   Le due strade sono presentate con lo stesso peso visivo. Il sistema non
   spinge verso nessuna delle due.
   ========================================================================= */

import { useApp, useActiveMon, useBranchCheck, useContinueCheck } from '../state/store';
import { Button, ScreenHead, SegmentedBar, SystemLabel } from '../system/components';
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
          Sei al nodo di <strong>{short}</strong>, {days}{' '}
          {days === 1 ? 'giorno' : 'giorni'} su questo percorso.
        </p>

        {/* --- CONTINUE / EVOLVE --- */}
        <section className="shiftcard">
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

          <SegmentedBar
            value={cont.progress}
            segments={20}
            label="REQUISITO"
            readout={cont.eligible ? 'PRONTO' : `${Math.round(cont.progress * 100)}%`}
            tone={cont.eligible ? 'positive' : 'warning'}
          />

          <p className="t-micro shiftcard__reason">{cont.reason}</p>

          <Button variant="primary" block disabled={!cont.eligible} onClick={doContinue}>
            {t.shift.continueAction}
          </Button>
        </section>

        {/* --- BRANCH / NEW SIGNAL --- */}
        <section className="shiftcard">
          <header className="shiftcard__head">
            <Icon name="branch" size={18} strokeWidth={2} />
            <h2 className="t-display shiftcard__title">{t.shift.branchTitle}</h2>
            {!branch.eligible && <SystemLabel>{t.shift.notEligible}</SystemLabel>}
          </header>

          <p className="t-small shiftcard__body">{t.shift.branchBody}</p>

          <SegmentedBar
            value={branch.progress}
            segments={20}
            label="REQUISITO"
            readout={branch.eligible ? 'APERTA' : `${Math.round(branch.progress * 100)}%`}
            tone={branch.eligible ? 'positive' : 'warning'}
          />

          <p className="t-micro shiftcard__reason">{branch.reason}</p>

          <Button variant="secondary" block disabled={!branch.eligible} onClick={startBranch}>
            {t.shift.branchAction}
          </Button>
        </section>

        <Button variant="ghost" block onClick={enterLive}>
          {t.shift.stay}
        </Button>
      </div>
    </div>
  );
}
