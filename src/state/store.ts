/* ============================================================================
   STATO DELL'APPLICAZIONE

   Orchestra il dominio puro di `engine/` e lo persiste. Nessuna regola di
   generazione vive qui: §29 impone che pesi e soglie stiano tutti in
   `generation-config.ts`.

   §29 — riproducibilità: ogni .mon conserva seed e versione di config con cui
   è nato. Cambiare i pesi non riscrive la storia.
   ========================================================================= */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  DEFAULT_BIAS,
  applyDay,
  initialHealthState,
  simulateDayInput,
  type SimulationBias,
} from '../engine/health';
import {
  DEFAULT_ECONOMY,
  branchEligibility,
  continueEligibility,
  evolveCost,
  levelFromXp,
  type EconomyConfig,
} from '../engine/economy';
import { evolveMon, generateFirstMon, generateMon } from '../engine/characterGenerator';
import { selectHeritageOrigins, type HeritageOrigin } from '../engine/heritage';
import { createNode, makeNodeId, nextChapter } from '../engine/mindline';
import { carryMemoriesThroughBranch, makeMemory, rollDailyEvent } from '../engine/simulation';
import { fallbackGreeting, fallbackReply } from '../engine/voiceDna';
import { makeRng, randomSeed, seedFromString } from '../engine/rng';
import {
  EMPTY_NOVELTY,
  aggregateDataConfidence,
  buildNoveltyMemory,
  neutralPersonality,
  type CulturalAffinities,
  type GeneratorInput,
  type MoodDayEntry,
  type PersonalitySeed,
} from '../engine/signals';
import { MOOD_INPUT_RULES, type MoodInputId } from '../engine/generation-config';
import type {
  AssetType,
  ChatMessage,
  GenerationTrace,
  HealthState,
  Memory,
  MindlineNode,
  MonRecord,
  Progression,
  Signal,
  StatKey,
} from '../engine/types';
import { STAT_KEYS, UNKNOWN, isKnown } from '../engine/types';
import { preloadMonAssets } from '../assets-pipeline/assetStore';

export type Phase =
  | 'incubation'
  | 'first-encounter'
  | 'live'
  | 'shift'
  | 'evolution'
  | 'branch'
  | 'new-encounter';

/** §25 — nel prototipo non serve attendere 28 giorni reali. */
export const INCUBATION_DAYS = 28;

export interface DevFlags {
  enabled: boolean;
  forceContinue: boolean;
  forceBranch: boolean;
  /** §25 DEV://UNLOCK_ALL — solo test, §29 lo vieta in produzione. */
  unlockAll: boolean;
}

export interface BatchCandidate {
  name: string;
  family: string;
  archetype: string;
  affinity: string;
  size: string;
  role: string;
  fashion: string;
  mood: string;
  appearance: string;
  rarity: string;
  score: number;
  heritageCount: number;
  seed: number;
}

interface AppState {
  phase: Phase;
  day: number;

  health: HealthState;
  progression: Progression;
  totalXpEarned: number;
  activeDays: number;
  branchCount: number;

  /** §2 — seme di personalità, stabile. */
  personality: PersonalitySeed;
  /** §11 — umori dichiarati, max 3 al giorno. */
  moodHistory: MoodDayEntry[];
  cultural: CulturalAffinities;

  mons: Record<string, MonRecord>;
  activeMonName: string | null;
  nodes: MindlineNode[];
  memories: Memory[];
  chat: ChatMessage[];

  pendingHeritage: HeritageOrigin[];

  /** §29 — traccia dell'ultima generazione, visibile solo in DEV. */
  lastTrace: GenerationTrace | null;
  batch: BatchCandidate[];

  dev: DevFlags;
  economy: EconomyConfig;
  bias: SimulationBias;

  advanceDays: (n: number) => void;
  endWeek: () => void;
  hatch: () => void;
  enterLive: () => void;
  openShift: () => void;
  doContinue: () => void;
  startBranch: () => void;
  confirmBranch: () => void;

  sendMessage: (text: string) => void;
  logInput: (kind: 'camera' | 'tell' | 'measure' | 'workout', note?: string) => void;
  /** §11 — dichiara gli umori del giorno, al massimo 3. */
  setMoodInputs: (inputs: MoodInputId[]) => void;

  setDev: (patch: Partial<DevFlags>) => void;
  setEconomy: (patch: Partial<EconomyConfig>) => void;
  setBias: (patch: Partial<SimulationBias>) => void;
  setSignal: (key: StatKey, value: Signal) => void;
  grantXp: (amount: number) => void;
  grantBond: (amount: number) => void;
  setEvolutionSync: (value: number) => void;
  injectEvent: (kind: 'event' | 'joke' | 'milestone' | 'gift', text: string) => void;
  generateBatch: (n: number) => void;
  clearBatch: () => void;
  resetCurrentNode: () => void;
  restoreNode: (nodeId: string) => void;
  cloneScenario: () => void;
  markAssetResolved: (monName: string, type: AssetType) => void;
  markAssetWaiting: (monName: string, type: AssetType) => void;
  resetAll: () => void;
}

/* --- Stato iniziale -------------------------------------------------------- */

const INITIAL = {
  phase: 'incubation' as Phase,
  day: 1,
  health: initialHealthState(),
  progression: { xp: 0, level: 1, bond: 0, evolutionSync: 0 } as Progression,
  totalXpEarned: 0,
  activeDays: 0,
  branchCount: 0,
  personality: neutralPersonality(),
  moodHistory: [] as MoodDayEntry[],
  cultural: {} as CulturalAffinities,
  mons: {} as Record<string, MonRecord>,
  activeMonName: null as string | null,
  nodes: [] as MindlineNode[],
  memories: [] as Memory[],
  chat: [] as ChatMessage[],
  pendingHeritage: [] as HeritageOrigin[],
  lastTrace: null as GenerationTrace | null,
  batch: [] as BatchCandidate[],
  dev: { enabled: false, forceContinue: false, forceBranch: false, unlockAll: false },
  economy: DEFAULT_ECONOMY,
  bias: DEFAULT_BIAS,
};

/* --- Helper ---------------------------------------------------------------- */

function activeRecord(s: AppState): MonRecord | null {
  return s.activeMonName ? (s.mons[s.activeMonName] ?? null) : null;
}

/** Costruisce l'input del generatore da tutto ciò che il prodotto misura. */
function generatorInput(s: AppState): GeneratorInput {
  const novelty =
    s.nodes.length === 0
      ? EMPTY_NOVELTY
      : buildNoveltyMemory(s.nodes, (monName) => {
          const rec = s.mons[monName];
          if (!rec) return null;
          return {
            family: rec.data.family,
            archetype: rec.data.family_archetype,
            affinity: rec.data.affinity,
            eyewear: rec.data.eyewear?.category ?? null,
            fashion: rec.data.fashion,
          };
        });

  return {
    day: s.day,
    health: s.health,
    personality: s.personality,
    moodHistory: s.moodHistory,
    cultural: s.cultural,
    novelty,
    mindlineDepth: s.nodes.length,
    bond: Math.round(s.progression.bond * 100),
    dataConfidence: aggregateDataConfidence(s.health),
    activeDays: s.activeDays,
    branchCount: s.branchCount,
  };
}

function daysWithActiveMon(s: AppState): number {
  const rec = activeRecord(s);
  return rec ? Math.max(0, s.day - rec.bornOnDay) : 0;
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      /* --- Avanzamento del tempo (§25) --- */

      advanceDays: (n) => {
        for (let i = 0; i < n; i++) advanceOneDay(set, get);
      },

      endWeek: () => {
        const remaining = 7 - ((get().day - 1) % 7);
        for (let i = 0; i < remaining; i++) advanceOneDay(set, get);
      },

      /* --- Il primo .mon si estrae come tutti gli altri: due partite non
         cominciano dalla stessa creatura. --- */

      hatch: () => {
        const s = get();
        if (s.phase !== 'incubation') return;

        const nodeId = makeNodeId(0);
        const { record, trace } = generateFirstMon({
          input: generatorInput(s),
          mindlineNodeId: nodeId,
          originNodeId: null,
          lineageNames: [],
          seed: randomSeed(),
          devUnlockAll: s.dev.unlockAll,
        });

        set({
          phase: 'first-encounter',
          mons: { [record.data.name]: record },
          activeMonName: record.data.name,
          nodes: [
            createNode({
              index: 0,
              kind: 'origin',
              monName: record.data.name,
              parentId: null,
              day: s.day,
              chapter: 1,
              label: 'ROOT',
            }),
          ],
          lastTrace: trace,
          chat: [openingMessage(record, s.day)],
        });

        void preloadMonAssets(record.data.name);
      },

      enterLive: () => set({ phase: 'live' }),
      openShift: () => set({ phase: 'shift' }),

      /* --- CONTINUE / EVOLVE --- */

      doContinue: () => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec) return;

        const stage = rec.data.evolution_state?.stage ?? 0;
        const check = continueEligibility(
          s.economy,
          s.progression.xp,
          s.progression.evolutionSync,
          stage,
          s.dev.forceContinue,
        );
        if (!check.eligible) return;

        const cost = s.dev.forceContinue ? 0 : evolveCost(s.economy, stage);
        const nodeId = makeNodeId(s.nodes.length);

        const { record, trace } = evolveMon(
          rec,
          {
            input: generatorInput(s),
            mindlineNodeId: nodeId,
            originNodeId: rec.data.mindline_node,
            heritageOrigins: [],
            lineageNames: Object.keys(s.mons),
            previous: rec,
            seed: randomSeed(),
          },
          nodeId,
        );

        set({
          phase: 'evolution',
          mons: { ...s.mons, [record.data.name]: record },
          nodes: [
            ...s.nodes,
            createNode({
              index: s.nodes.length,
              kind: 'evolution',
              monName: record.data.name,
              parentId: rec.data.mindline_node,
              day: s.day,
              chapter: nextChapter(s.nodes, 'evolution'),
              label: record.data.evolution_state?.label ?? 'BASIC FORM',
            }),
          ],
          progression: {
            ...s.progression,
            xp: Math.max(0, s.progression.xp - cost),
            evolutionSync: 0,
          },
          memories: [
            ...s.memories,
            makeMemory({
              id: `mem_evo_${s.day}_${s.nodes.length}`,
              day: s.day,
              event: {
                kind: 'milestone',
                title: `${record.data.evolution_state?.label ?? 'NUOVA FORMA'} sbloccata`,
                text: 'Stessa identità, forma nuova.',
                memorable: true,
              },
              monName: record.data.name,
            }),
          ],
          lastTrace: trace,
          dev: { ...s.dev, forceContinue: false },
        });

        void preloadMonAssets(record.data.name);
      },

      /* --- BRANCH: prima si sceglie cosa sopravvive (§23) --- */

      startBranch: () => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec) return;

        const check = branchEligibility(
          s.economy,
          daysWithActiveMon(s),
          s.progression.bond,
          s.dev.forceBranch,
        );
        if (!check.eligible) return;

        const rng = makeRng(seedFromString(`branch:${rec.data.name}:${s.day}`));
        set({ phase: 'branch', pendingHeritage: selectHeritageOrigins(rng, rec) });
      },

      confirmBranch: () => {
        const s = get();
        const previous = activeRecord(s);
        if (!previous || s.phase !== 'branch') return;

        const nodeId = makeNodeId(s.nodes.length);
        const { record, trace } = generateMon({
          input: generatorInput(s),
          mindlineNodeId: nodeId,
          originNodeId: previous.data.mindline_node,
          heritageOrigins: s.pendingHeritage,
          lineageNames: Object.keys(s.mons),
          previous,
          seed: randomSeed(),
          devUnlockAll: s.dev.unlockAll,
        });

        const rng = makeRng(seedFromString(`carry:${record.data.name}`));
        const carried = carryMemoriesThroughBranch(rng, s.memories, previous, record.data.name);

        set({
          phase: 'new-encounter',
          mons: {
            ...s.mons,
            [previous.data.name]: { ...previous, retiredOnDay: s.day },
            [record.data.name]: record,
          },
          activeMonName: record.data.name,
          branchCount: s.branchCount + 1,
          nodes: [
            ...s.nodes,
            createNode({
              index: s.nodes.length,
              kind: 'branch',
              monName: record.data.name,
              parentId: previous.data.mindline_node,
              day: s.day,
              chapter: nextChapter(s.nodes, 'branch'),
              label: 'BASIC FORM',
            }),
          ],
          memories: [...s.memories, ...carried],
          chat: [openingMessage(record, s.day)],
          pendingHeritage: [],
          progression: { ...s.progression, bond: 0, evolutionSync: 0 },
          lastTrace: trace,
          dev: { ...s.dev, forceBranch: false },
        });

        void preloadMonAssets(record.data.name);
      },

      /* --- Interazione --- */

      sendMessage: (text) => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec || text.trim().length === 0) return;

        const rng = makeRng(seedFromString(`reply:${rec.data.name}:${s.chat.length}:${text}`));

        const mine: ChatMessage = {
          id: `msg_${s.chat.length}_v`,
          from: 'vinz',
          text: text.trim(),
          day: s.day,
        };
        const theirs: ChatMessage = {
          id: `msg_${s.chat.length}_m`,
          from: 'mon',
          text: fallbackReply(rng, rec.data.mood_primary, rec.data.voice_dna, rec.data.role),
          day: s.day,
          fallback: true,
        };

        set({
          chat: [...s.chat, mine, theirs].slice(-60),
          progression: {
            ...s.progression,
            bond: Math.min(1, s.progression.bond + s.economy.bondPerInteraction),
          },
        });
      },

      logInput: (kind, note) => {
        const s = get();
        const rec = activeRecord(s);

        const gained = kind === 'workout' ? s.economy.xpPerWorkout : s.economy.xpPerLoggedDay;
        const totalXpEarned = s.totalXpEarned + gained;

        const current = (k: StatKey) =>
          isKnown(s.health.stats[k].value) ? (s.health.stats[k].value as number) : 50;
        const touched: Partial<Record<StatKey, number>> = {};

        if (kind === 'workout') {
          touched.ATK = Math.min(100, current('ATK') + 2.5);
          touched.SPD = Math.min(100, current('SPD') + 1.8);
        } else if (kind === 'measure') touched.FORM = Math.min(100, current('FORM') + 1.2);
        else if (kind === 'camera') touched.CARE = Math.min(100, current('CARE') + 1.5);
        else touched.REC = Math.min(100, current('REC') + 1);

        const health = applyDay(s.health, s.day, {
          touched,
          logged: true,
          workout: kind === 'workout',
        });

        const memories = [...s.memories];
        if (note && note.trim().length > 0 && rec) {
          memories.push(
            makeMemory({
              id: `mem_input_${s.day}_${memories.length}`,
              day: s.day,
              event: {
                kind: kind === 'workout' ? 'workout' : 'conversation',
                title: INPUT_TITLES[kind],
                text: note.trim(),
                memorable: true,
              },
              monName: rec.data.name,
            }),
          );
        }

        set({
          health,
          memories,
          totalXpEarned,
          progression: {
            ...s.progression,
            xp: s.progression.xp + gained,
            level: levelFromXp(s.economy, totalXpEarned),
            bond: Math.min(1, s.progression.bond + s.economy.bondPerInteraction),
            evolutionSync: Math.min(1, s.progression.evolutionSync + s.economy.syncPerLoggedDay),
          },
        });
      },

      /* --- §11 — umori dichiarati, mai più di 3 al giorno --- */

      setMoodInputs: (inputs) =>
        set((s) => {
          const capped = inputs.slice(0, MOOD_INPUT_RULES.maxPerDay);
          const rest = s.moodHistory.filter((d) => d.day !== s.day);
          return {
            moodHistory: capped.length > 0 ? [...rest, { day: s.day, inputs: capped }] : rest,
          };
        }),

      /* --- DEV --- */

      setDev: (patch) => set((s) => ({ dev: { ...s.dev, ...patch } })),
      setEconomy: (patch) => set((s) => ({ economy: { ...s.economy, ...patch } })),
      setBias: (patch) => set((s) => ({ bias: { ...s.bias, ...patch } })),

      setSignal: (key, value) =>
        set((s) => {
          const stats = { ...s.health.stats };
          stats[key] = { value, delta: UNKNOWN, confidence: value === UNKNOWN ? 0 : 1 };
          return { health: { ...s.health, stats } };
        }),

      grantXp: (amount) =>
        set((s) => {
          const totalXpEarned = Math.max(0, s.totalXpEarned + Math.max(0, amount));
          return {
            totalXpEarned,
            progression: {
              ...s.progression,
              xp: Math.max(0, s.progression.xp + amount),
              level: levelFromXp(s.economy, totalXpEarned),
            },
          };
        }),

      grantBond: (amount) =>
        set((s) => ({
          progression: {
            ...s.progression,
            bond: Math.max(0, Math.min(1, s.progression.bond + amount)),
          },
        })),

      setEvolutionSync: (value) =>
        set((s) => ({
          progression: { ...s.progression, evolutionSync: Math.max(0, Math.min(1, value)) },
        })),

      injectEvent: (kind, text) =>
        set((s) => {
          const rec = activeRecord(s);
          if (!rec) return {};
          return {
            memories: [
              ...s.memories,
              makeMemory({
                id: `mem_dev_${s.day}_${s.memories.length}`,
                day: s.day,
                event: { kind, title: 'Iniettato da DEV', text, memorable: true },
                monName: rec.data.name,
              }),
            ],
          };
        }),

      /** §25 DEV://GENERATE_10 — solo dati strutturati, nessuna immagine. */
      generateBatch: (n) => {
        const s = get();
        const previous = activeRecord(s);
        const lineage = [...Object.keys(s.mons)];
        const out: BatchCandidate[] = [];
        const input = generatorInput(s);

        for (let i = 0; i < n; i++) {
          const seed = randomSeed();
          const heritageOrigins =
            previous && i % 3 === 0
              ? selectHeritageOrigins(makeRng(seed ^ 0x9e3779b9), previous)
              : [];

          const { record } = generateMon({
            input,
            mindlineNodeId: `batch_${i}`,
            originNodeId: previous?.data.mindline_node ?? null,
            heritageOrigins,
            lineageNames: lineage,
            previous,
            seed,
            devUnlockAll: s.dev.unlockAll,
          });

          lineage.push(record.data.name);
          const d = record.data;
          out.push({
            name: d.name,
            family: d.family,
            archetype: d.family_archetype,
            affinity: d.affinity,
            size: d.size,
            role: d.role,
            fashion: d.fashion,
            mood: d.mood_primary,
            appearance: d.appearance,
            rarity: d.rarity,
            score: d.rarity_score,
            heritageCount: d.heritage_traits.length,
            seed,
          });
        }

        set({ batch: out });
      },

      clearBatch: () => set({ batch: [] }),

      resetCurrentNode: () => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec) return;
        const node = s.nodes.find((n) => n.id === rec.data.mindline_node);
        if (!node) return;

        const lineage = Object.keys(s.mons).filter((n) => n !== rec.data.name);
        const isRoot = node.parentId === null;

        const ctx = {
          input: generatorInput(s),
          mindlineNodeId: node.id,
          originNodeId: rec.data.origin_node,
          lineageNames: lineage,
          seed: randomSeed(),
          devUnlockAll: s.dev.unlockAll,
        };

        const { record, trace } = isRoot
          ? generateFirstMon(ctx)
          : generateMon({
              ...ctx,
              heritageOrigins: rec.data.heritage_traits.map(({ transformed: _t, ...rest }) => rest),
              previous: null,
            });

        const mons = { ...s.mons };
        delete mons[rec.data.name];
        mons[record.data.name] = record;

        set({
          mons,
          activeMonName: record.data.name,
          nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, monName: record.data.name } : n)),
          chat: [openingMessage(record, s.day)],
          lastTrace: trace,
        });
      },

      restoreNode: (nodeId) => {
        const s = get();
        const node = s.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const rec = s.mons[node.monName];
        if (!rec) return;

        set({
          activeMonName: node.monName,
          phase: 'live',
          mons: { ...s.mons, [node.monName]: { ...rec, retiredOnDay: null } },
          chat: [openingMessage(rec, s.day)],
        });

        void preloadMonAssets(node.monName);
      },

      cloneScenario: () => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec) return;

        const nodeId = makeNodeId(s.nodes.length);
        const { record, trace } = generateMon({
          input: generatorInput(s),
          mindlineNodeId: nodeId,
          originNodeId: rec.data.mindline_node,
          heritageOrigins: [],
          lineageNames: Object.keys(s.mons),
          previous: rec,
          seed: randomSeed(),
          devUnlockAll: s.dev.unlockAll,
        });

        set({
          mons: { ...s.mons, [record.data.name]: record },
          nodes: [
            ...s.nodes,
            createNode({
              index: s.nodes.length,
              kind: 'branch',
              monName: record.data.name,
              parentId: rec.data.mindline_node,
              day: s.day,
              chapter: nextChapter(s.nodes, 'branch'),
              label: 'CLONE DEV',
            }),
          ],
          lastTrace: trace,
        });
      },

      /* --- Import asset: tocca SOLO assetStatus --- */

      markAssetResolved: (monName, type) => setAssetState(set, monName, type, 'resolved'),
      markAssetWaiting: (monName, type) => setAssetState(set, monName, type, 'waiting'),

      resetAll: () =>
        set({
          ...INITIAL,
          health: initialHealthState(),
          personality: neutralPersonality(),
          dev: get().dev,
        }),
    }),
    {
      name: 'vinzverce.prototype.v2',
      version: 2,
      partialize: (s) => {
        const { batch: _batch, ...rest } = s;
        return rest as AppState;
      },
    },
  ),
);

/* --- Avanzamento di un giorno ---------------------------------------------- */

function advanceOneDay(set: (p: Partial<AppState>) => void, get: () => AppState): void {
  const s = get();
  const day = s.day + 1;
  const rng = makeRng(seedFromString(`day:${day}:${s.activeMonName ?? 'incubation'}`));

  const input = simulateDayInput(rng, s.health, s.bias);
  const health = applyDay(s.health, day, input);
  const activeDays = s.activeDays + (input.logged ? 1 : 0);

  if (s.phase === 'incubation') {
    set({ day, health, activeDays });
    return;
  }

  const rec = activeRecord(s);
  if (!rec) {
    set({ day, health, activeDays });
    return;
  }

  const gained = input.logged
    ? s.economy.xpPerLoggedDay + (input.workout ? s.economy.xpPerWorkout : 0)
    : 0;

  const event = rollDailyEvent(rng, input.logged, input.workout);
  const memories = [...s.memories];
  let bonusXp = 0;

  if (event?.memorable) {
    memories.push(
      makeMemory({ id: `mem_${day}_${memories.length}`, day, event, monName: rec.data.name }),
    );
    bonusXp = s.economy.xpPerMemory;
  }

  const totalXpEarned = s.totalXpEarned + gained + bonusXp;

  set({
    day,
    health,
    memories,
    totalXpEarned,
    activeDays,
    progression: {
      ...s.progression,
      xp: s.progression.xp + gained + bonusXp,
      level: levelFromXp(s.economy, totalXpEarned),
      bond: Math.min(1, s.progression.bond + (input.logged ? 0.012 : 0)),
      evolutionSync: Math.min(
        1,
        s.progression.evolutionSync + (input.logged ? s.economy.syncPerLoggedDay : 0),
      ),
    },
  });
}

/* --- Utilità ---------------------------------------------------------------- */

function setAssetState(
  set: (fn: (s: AppState) => Partial<AppState>) => void,
  monName: string,
  type: AssetType,
  state: 'resolved' | 'waiting',
) {
  set((s) => {
    const rec = s.mons[monName];
    if (!rec) return {};
    return {
      mons: {
        ...s.mons,
        [monName]: {
          ...rec,
          data: {
            ...rec.data,
            asset_manifest_status: { ...rec.data.asset_manifest_status, [type]: state },
          },
        },
      },
    };
  });
}

const INPUT_TITLES: Record<'camera' | 'tell' | 'measure' | 'workout', string> = {
  camera: 'Foto registrata',
  tell: 'Racconto',
  measure: 'Misurazione',
  workout: 'Allenamento',
};

function openingMessage(record: MonRecord, day: number): ChatMessage {
  const rng = makeRng(seedFromString(`greet:${record.data.name}:${day}`));
  return {
    id: `msg_open_${record.data.name}`,
    from: 'mon',
    text: fallbackGreeting(rng, record.data.mood_primary, record.data.voice_dna),
    day,
    fallback: true,
  };
}

/* --- Selettori --------------------------------------------------------------
   Ogni selettore restituisce un valore già nello store o un primitivo:
   costruire un oggetto dentro `useApp` manda zustand in loop infinito.
   -------------------------------------------------------------------------- */

export function useActiveMon(): MonRecord | null {
  return useApp((s) => (s.activeMonName ? (s.mons[s.activeMonName] ?? null) : null));
}

export function useContinueCheck() {
  const rec = useActiveMon();
  const economy = useApp((s) => s.economy);
  const xp = useApp((s) => s.progression.xp);
  const sync = useApp((s) => s.progression.evolutionSync);
  const forced = useApp((s) => s.dev.forceContinue);

  const stage = rec?.data.evolution_state?.stage ?? 0;
  return {
    check: continueEligibility(economy, xp, sync, stage, forced),
    cost: evolveCost(economy, stage),
  };
}

export function useBranchCheck() {
  const rec = useActiveMon();
  const economy = useApp((s) => s.economy);
  const day = useApp((s) => s.day);
  const bond = useApp((s) => s.progression.bond);
  const forced = useApp((s) => s.dev.forceBranch);

  const days = rec ? Math.max(0, day - rec.bornOnDay) : 0;
  return { check: branchEligibility(economy, days, bond, forced), days };
}

export function useIncubation() {
  const day = useApp((s) => s.day);
  const stats = useApp((s) => s.health.stats);

  const elapsed = Math.min(INCUBATION_DAYS, day);
  const known = STAT_KEYS.filter((k) => isKnown(stats[k].value)).length;

  return {
    day: elapsed,
    total: INCUBATION_DAYS,
    progress: elapsed / INCUBATION_DAYS,
    stability: known / STAT_KEYS.length,
    ready: elapsed >= INCUBATION_DAYS,
  };
}

/** Umori dichiarati oggi (§11). */
export function useTodayMoods(): MoodInputId[] {
  const day = useApp((s) => s.day);
  const history = useApp((s) => s.moodHistory);
  return history.find((d) => d.day === day)?.inputs ?? [];
}
