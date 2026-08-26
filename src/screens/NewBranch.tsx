/* 13 — CAMBIO DI FORMA: la scelta e l'azione coincidono. */
import { useApp, useActiveMon } from '../state/store';
import { Button, HoldButton } from '../system/components';
import { readEvolutionWish, syncRewardProgress } from '../engine/syncRewards';

export function NewBranchScreen() {
  const mon = useActiveMon();
  const beginFormEvolution = useApp((s) => s.beginFormEvolution);
  const enterLive = useApp((s) => s.enterLive);

  if (!mon) return null;
  const wish = readEvolutionWish();
  const evolutionReady = wish ? wish.kind === 'evolution' : syncRewardProgress('evolution').ready;
  const megaReady = wish ? wish.kind === 'mega-evolution' : syncRewardProgress('mega-evolution').ready;

  return (
    <div className="screen screen--ink branch-screen">
      <Button className="branch__back" variant="ghost" onClick={enterLive}>
        INDIETRO
      </Button>
      <div className="screen__body branch branch--simple">
        <section className="branch__direct" aria-label="Scegli la trasformazione">
          {evolutionReady && <HoldButton className="branch__direct-choice" onComplete={() => beginFormEvolution('evolution')}>
            <strong className="t-display">EVOLVI</strong>
          </HoldButton>}
          {megaReady && <HoldButton className="branch__direct-choice branch__direct-choice--mega" onComplete={() => beginFormEvolution('mega-evolution')}>
            <strong className="t-display">MEGAEVOLVI</strong>
          </HoldButton>}
        </section>
      </div>
    </div>
  );
}
