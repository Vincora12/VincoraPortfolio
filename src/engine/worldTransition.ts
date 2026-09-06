import { displayName, type MonRecord } from './types';
import { emptyLedger, seedWorld, withCanon, type StoryLedger, type World } from './world';

/** Completed previous Worlds only. The active World/ledger retain their existing owners. */
export interface ArchivedWorld {
  world: World;
  ledger: StoryLedger;
  leftOnDay: number;
  transitionId: string;
  nextWorldId: string;
}

/** Pure completion boundary; no generation, images, rewards or MindMap layout. */
export function completeWorldTransition(input: {
  kind: 'evolution' | 'mega-evolution';
  world: World | null;
  ledger: StoryLedger;
  worldHistory?: ArchivedWorld[];
  previous: MonRecord;
  record: MonRecord;
  day: number;
}): { world: World; ledger: StoryLedger; worldHistory: ArchivedWorld[]; record: MonRecord; previous: MonRecord } {
  const history = input.worldHistory ?? [];
  const previousWorld = input.world ?? seedWorld(input.previous, input.day);
  const previous = input.previous.worldId ? input.previous : { ...input.previous, worldId: previousWorld.id };
  const transitionId = `canon_${input.kind}_${input.record.data.mindline_node}`;
  if (input.kind === 'evolution') {
    return {
      world: withCanon(previousWorld, { id: transitionId, day: input.day, kind: 'evolution', epistemic: 'WORLD_CANON', monName: input.record.data.name,
        text: `${displayName(previous.data.name)} è diventato ${displayName(input.record.data.name)}. Il posto è lo stesso, ma non risponde più allo stesso modo.` }),
      ledger: input.ledger, worldHistory: history, previous,
      record: { ...input.record, worldId: previousWorld.id },
    };
  }
  const nextWorld = seedWorld(input.record, input.day);
  // Replay/reload of an already completed reveal cannot archive the new World.
  if (previousWorld.id === nextWorld.id) return { world: previousWorld, ledger: input.ledger, worldHistory: history, previous, record: { ...input.record, worldId: nextWorld.id } };
  const departure = withCanon(previousWorld, {
    id: transitionId, day: input.day, kind: 'world-change', epistemic: 'WORLD_CANON', monName: input.record.data.name,
    text: `${displayName(previous.data.name)} è diventato ${displayName(input.record.data.name)}. Il viaggio prosegue in un nuovo World; questo luogo e la sua storia restano.`,
  });
  const world = withCanon(nextWorld, {
    id: `${transitionId}_arrival`, day: input.day, kind: 'world-change', epistemic: 'WORLD_CANON', monName: input.record.data.name,
    text: `${displayName(input.record.data.name)} arriva da ${previousWorld.name}. Questo è un nuovo luogo, non una riscrittura del precedente.`,
  });
  return {
    world, ledger: emptyLedger(), previous,
    record: { ...input.record, worldId: world.id },
    worldHistory: history.some((entry) => entry.world.id === previousWorld.id) ? history : [...history, {
      world: departure, ledger: structuredClone(input.ledger), leftOnDay: input.day, transitionId, nextWorldId: world.id,
    }],
  };
}
