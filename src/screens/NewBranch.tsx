/* ============================================================================
   13 — NEW BRANCH (§12)

   🔒 Vincolo esplicito: "Transition away from current node; show Heritage
   traits that will carry forward WITHOUT PREVIEWING FULL NEW IDENTITY."

   Il prototipo rispetta il vincolo per costruzione, non per disciplina
   grafica: a questo punto del flusso il nuovo .mon NON È ANCORA STATO
   GENERATO. Esistono solo i tratti in partenza, scelti dal .mon uscente.
   La generazione avviene su `confirmBranch`, quindi non c'è nessuna identità
   da poter mostrare per sbaglio.
   ========================================================================= */

import { useApp, useActiveMon } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { MonName } from '../system/MonName';
import { Button, ScreenHead, SystemLabel } from '../system/components';
import { heritageCategoryLabel } from '../engine/heritage';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function NewBranchScreen() {
  const mon = useActiveMon();
  const pending = useApp((s) => s.pendingHeritage);
  const confirmBranch = useApp((s) => s.confirmBranch);
  const enterLive = useApp((s) => s.enterLive);

  if (!mon) return null;
  const short = displayName(mon.data.name);

  return (
    <div className="screen screen--ink">
      <ScreenHead title={t.branch.title} sub={t.branch.subtitle} />

      <div className="screen__body branch">
        {/* Il .mon che si sta salutando. */}
        <div className="branch__leaving">
          <div className="branch__portrait">
            <AssetSlot
              monName={mon.data.name}
              type="profile_portrait"
              fallbackTypes={['character_master']}
              alt={short}
              compactPlaceholder
            />
          </div>
          <div>
            <p className="t-micro">{t.branch.goodbye}</p>
            <p className="t-display branch__name">
              <MonName name={mon.data.name} />
            </p>
            <p className="t-micro branch__form">
              {mon.data.evolution_state?.label ?? 'BASIC FORM'}
            </p>
          </div>
        </div>

        <p className="branch__lead t-small">{t.branch.lead}</p>

        {/* I tratti in partenza. Ne conosciamo l'origine, non ancora l'arrivo. */}
        <ul className="branch__traits">
          {pending.map((h) => (
            <li key={h.id} className="traitcard">
              <SystemLabel tone="character">{heritageCategoryLabel(h.category)}</SystemLabel>
              <p className="traitcard__origin t-small">{h.origin}</p>
              <p className="traitcard__arrow t-micro">
                → si tradurrà nell'anatomia del prossimo .mon
              </p>
            </li>
          ))}
        </ul>

        {/* Il vuoto è dichiarato: non c'è niente da anticipare. */}
        <div className="branch__unknown">
          <p className="t-display branch__qmark" aria-hidden="true">
            ?
          </p>
          <p className="t-small">{t.branch.unknownAhead}</p>
        </div>
      </div>

      <footer className="screen__foot screen__foot--stack">
        <Button variant="primary" block onClick={confirmBranch}>
          {t.branch.confirm}
        </Button>
        <Button variant="ghost" block onClick={enterLive}>
          {t.branch.back}
        </Button>
      </footer>
    </div>
  );
}
