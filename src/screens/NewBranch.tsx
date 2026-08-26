/* 13 — CAMBIO DI FORMA: la scelta e l'azione coincidono. */
import { useApp, useActiveMon } from '../state/store';
import { Button, HoldButton } from '../system/components';

export function NewBranchScreen() {
  const mon = useActiveMon();
  const beginFormEvolution = useApp((s) => s.beginFormEvolution);
  const enterLive = useApp((s) => s.enterLive);

  if (!mon) return null;

  return (
    <div className="screen screen--ink branch-screen">
      <Button className="branch__back" variant="ghost" onClick={enterLive}>
        INDIETRO
      </Button>
      <div className="screen__body branch branch--simple">
        <section className="branch__direct" aria-label="Scegli la trasformazione">
          <HoldButton className="branch__direct-choice" onComplete={() => beginFormEvolution('evolution')}>
            <strong className="t-display">EVOLVI</strong>
          </HoldButton>
          <HoldButton className="branch__direct-choice branch__direct-choice--mega" onComplete={() => beginFormEvolution('mega-evolution')}>
            <strong className="t-display">MEGAEVOLVI</strong>
          </HoldButton>
        </section>
      </div>
    </div>
  );
}
