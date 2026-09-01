import type { MonRecord } from './types';
import type { StoryLedger, World } from './world';

/** Runtime-only context shared by future narrative consumers (Bio/Narrator).
 * It deliberately contains no persistence or retrieval logic. */
export interface NarrativeContext {
  currentMon: MonRecord;
  previousMon?: MonRecord;
  transitionType?: string;
  world?: World;
  worldCulturalDna: string[];
  monCulturalDna: string[];
  narrativeDna: MonRecord['data']['narrativeDNA'];
  heritage: MonRecord['data']['heritage_traits'];
  wish?: string;
  canon: World['canon'];
  ledger?: StoryLedger;
}

/** Builds a bounded, deterministic context from already persisted state. */
export function buildNarrativeContext(input: {
  currentMon: MonRecord;
  previousMon?: MonRecord;
  world?: World | null;
  ledger?: StoryLedger;
  transitionType?: string;
  wish?: string;
}): NarrativeContext {
  return {
    currentMon: input.currentMon,
    previousMon: input.previousMon,
    transitionType: input.transitionType,
    world: input.world ?? undefined,
    worldCulturalDna: input.world?.worldCulturalDna ?? [],
    monCulturalDna: input.currentMon.data.cultural_dna ?? [],
    narrativeDna: input.currentMon.data.narrativeDNA,
    heritage: input.currentMon.data.heritage_traits ?? [],
    wish: input.wish,
    canon: input.world?.canon ?? [],
    ledger: input.ledger,
  };
}
