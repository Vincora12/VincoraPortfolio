/* ============================================================================
   13 — CAMBIO DI FORMA (Form Evolution)

   🔒 Vincolo esplicito: "show Heritage traits that will carry forward WITHOUT
   PREVIEWING FULL NEW IDENTITY." Il prototipo lo rispetta per costruzione: a
   questo punto del flusso la forma nuova NON È ANCORA STATA GENERATA. Esistono
   solo gli assi ancorati e i tratti in partenza. La generazione avviene su
   `confirmFormEvolution`, quindi non c'è nessuna identità da mostrare per
   sbaglio.

   🔶 Riscritta: non è più un addio. La schermata diceva «SALUTA» e trattava la
   creatura uscente come qualcuno che se ne va. VINZ.MON è una entità sola e la
   forma è una sua configurazione, quindi qui si legge cosa RESTA prima di cosa
   cambia — l'ancora di continuità decisa in `progression.ts`.
   ========================================================================= */

import { useApp, useActiveMon, usePendingPlan } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { MonName, SpeciesName } from '../system/MonName';
import { Button, ScreenHead, SystemLabel } from '../system/components';
import { heritageCategoryLabel } from '../engine/heritage';
import { AXIS_LABELS, PATTERN_LABELS, type ContinuityAxis } from '../engine/progression';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function NewBranchScreen() {
  const mon = useActiveMon();
  const pending = useApp((s) => s.pendingHeritage);
  const plan = usePendingPlan();
  const confirmFormEvolution = useApp((s) => s.confirmFormEvolution);
  const enterLive = useApp((s) => s.enterLive);

  if (!mon) return null;
  const short = displayName(mon.data.name);

  /** Il valore corrente di un asse ancorato, letto dal .mon di adesso. */
  const axisValue = (axis: ContinuityAxis): string => String(mon.data[axis]);

  return (
    <div className="screen screen--ink">
      <ScreenHead title={t.branch.title} sub={t.branch.subtitle} />

      <div className="screen__body branch">
        {/* La forma di adesso. Non se ne va: si riconfigura. */}
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
            <p className="t-micro">{t.branch.current}</p>
            <p className="t-display branch__name">
              <MonName name={mon.data.name} />
            </p>
            <p className="t-micro branch__form">
              <SpeciesName /> · {mon.data.evolution_state?.label ?? 'BASIC FORM'}
            </p>
          </div>
        </div>

        {/* --- Cosa resta: l'ancora di continuità --- */}
        {plan && (
          <section className="branch__anchor">
            <SystemLabel tone="character">{t.branch.anchorTitle}</SystemLabel>
            <p className="t-display branch__anchorline">{plan.it}</p>
            <p className="t-small branch__anchordesc">
              {PATTERN_LABELS[plan.pattern].description}
            </p>
            <ul className="branch__keeps">
              {plan.keeps.map((axis: ContinuityAxis) => (
                <li key={axis} className="branch__keep">
                  <span className="t-micro">{AXIS_LABELS[axis]}</span>
                  <span className="t-small branch__keepvalue">{axisValue(axis)}</span>
                </li>
              ))}
            </ul>
            <p className="t-micro branch__anchornote">{t.branch.anchorNote}</p>
          </section>
        )}

        {/* --- Cosa passa tradotto: i tratti in partenza --- */}
        <p className="branch__lead t-small">{t.branch.lead}</p>

        <ul className="branch__traits">
          {pending.map((h) => (
            <li key={h.id} className="traitcard">
              <SystemLabel tone="character">{heritageCategoryLabel(h.category)}</SystemLabel>
              <p className="traitcard__origin t-small">{h.origin}</p>
              <p className="traitcard__arrow t-micro">
                → si tradurrà nell'anatomia della forma nuova
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
        <Button variant="primary" block onClick={confirmFormEvolution}>
          {t.branch.confirm}
        </Button>
        <Button variant="ghost" block onClick={enterLive}>
          {t.branch.back}
        </Button>
      </footer>
    </div>
  );
}
