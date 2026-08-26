/* 13 — CAMBIO DI FORMA: la scelta e l'azione coincidono. */
import { useApp, useActiveMon } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { MonName, SpeciesName } from '../system/MonName';
import { Button, HoldButton, ScreenHead } from '../system/components';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function NewBranchScreen() {
  const mon = useActiveMon();
  const beginFormEvolution = useApp((s) => s.beginFormEvolution);
  const enterLive = useApp((s) => s.enterLive);

  if (!mon) return null;
  const short = displayName(mon.data.name);

  return (
    <div className="screen screen--ink branch-screen">
      <ScreenHead title={t.branch.title} sub="SCEGLI QUANTO CAMBIARE" />
      <div className="screen__body branch branch--simple">
        <section className="branch__direct" aria-label="Scegli la trasformazione">
          <HoldButton className="branch__direct-choice" onComplete={() => beginFormEvolution('evolution')} hint="TIENI PREMUTO">
            <span className="branch__choicecopy">
              <strong className="t-display">EVOLUZIONE</strong>
              <span className="t-small">Cresce restando riconoscibile.</span>
            </span>
          </HoldButton>
          <HoldButton className="branch__direct-choice branch__direct-choice--mega" onComplete={() => beginFormEvolution('mega-evolution')} hint="TIENI PREMUTO">
            <span className="branch__choicecopy">
              <strong className="t-display">MEGA EVOLUZIONE</strong>
              <span className="t-small">Può cambiare corpo e famiglia.</span>
            </span>
          </HoldButton>
        </section>

        <div className="branch__hero">
          <AssetSlot monName={mon.data.name} type="character_toy" fallbackTypes={['character_master']} alt={short} compactPlaceholder />
        </div>
        <div className="branch__identity">
          <p className="t-display branch__name"><MonName name={mon.data.name} fit /></p>
          <p className="t-micro branch__form"><SpeciesName /> · {mon.data.evolution_state?.label ?? 'BASIC FORM'}</p>
        </div>
      </div>
      <footer className="screen__foot">
        <Button variant="ghost" block onClick={enterLive}>{t.branch.back}</Button>
      </footer>
    </div>
  );
}
