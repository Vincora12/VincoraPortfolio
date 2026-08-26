/* 13 — CAMBIO DI FORMA: la scelta e l'azione coincidono. */
import { useApp, useActiveMon } from '../state/store';
import { Button, HoldButton } from '../system/components';
import { completeDayStreak, readEvolutionWish, syncRewardProgress } from '../engine/syncRewards';
import { dateForDay } from '../engine/progression';

export function NewBranchScreen() {
  const mon = useActiveMon();
  const beginFormEvolution = useApp((s) => s.beginFormEvolution);
  const enterLive = useApp((s) => s.enterLive);
  const day = useApp((s) => s.day);
  const startedAt = useApp((s) => s.startedAt);

  if (!mon) return null;
  /* 🔴 «La barra si muove ma non triggera le evoluzioni.» Stessa correzione
     di `store.ts`: «pronto» va misurato sulla data del giorno di gioco, non
     su quella vera del telefono — altrimenti questa schermata nascondeva i
     due pulsanti anche quando la ruota diceva che erano pronti. */
  const streak = completeDayStreak(undefined, dateForDay(day, startedAt));
  const wish = readEvolutionWish();
  const evolutionReady = wish ? wish.kind === 'evolution' : syncRewardProgress('evolution', streak).ready;
  const megaReady = wish ? wish.kind === 'mega-evolution' : syncRewardProgress('mega-evolution', streak).ready;

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
