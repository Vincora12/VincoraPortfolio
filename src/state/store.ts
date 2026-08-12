/* ============================================================================
   STATO DELL'APPLICAZIONE

   Qui vive la mutazione. Tutta la logica di dominio sta in engine/ come
   funzioni pure: questo modulo la orchestra e la persiste.

   §25 — i confini di servizio restano intatti: sostituire il generatore locale
   con un servizio remoto significa cambiare le chiamate dentro queste azioni,
   non riprogettare lo stato.
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
import { evolveMon, generateMon } from '../engine/characterGenerator';
import { selectHeritageOrigins, type HeritageOrigin } from '../engine/heritage';
import { createNode, makeNodeId, nextChapter } from '../engine/mindline';
import { carryMemoriesThroughBranch, makeMemory, rollDailyEvent } from '../engine/simulation';
import { fallbackGreeting, fallbackReply } from '../engine/voiceDna';
import { makeRng, randomSeed, seedFromString } from '../engine/rng';
import type { RarityBreakdown } from '../engine/rarity';
import type {
  AssetType,
  ChatMessage,
  HealthState,
  Memory,
  MindlineNode,
  MonRecord,
  Progression,
  Signal,
  StatKey,
  UserState,
} from '../engine/types';
import { STAT_KEYS, UNKNOWN, isKnown } from '../engine/types';
import { preloadMonAssets } from '../assets-pipeline/assetStore';

/* --- Fasi del flusso -------------------------------------------------------
   Corrispondono alle schermate di §12 che cambiano lo stato del sistema.
   Le schermate di sola consultazione (ME, MINDLINE, BIO…) non sono fasi:
   sono destinazioni di navigazione.
   -------------------------------------------------------------------------- */

export type Phase =
  | 'incubation' // 04 FIRST SIGNAL / INCUBATION
  | 'first-encounter' // 05 FIRST ENCOUNTER
  | 'live' // 06 MON / COMPANION HOME e tutto il resto
  | 'shift' // 11 MINDLINE SHIFT
  | 'evolution' // 12 EVOLUTION
  | 'branch' // 13 NEW BRANCH
  | 'new-encounter'; // 14 NEW ENCOUNTER

/** 🟡 PROVISIONAL (§18: terminologia e durata dell'incubazione da definire). */
export const INCUBATION_DAYS = 28;

export interface DevFlags {
  enabled: boolean;
  forceContinue: boolean;
  forceBranch: boolean;
}

export interface BatchCandidate {
  name: string;
  family: string;
  familyArchetype: string;
  affinity: string;
  size: string;
  role: string;
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
  /** XP totali guadagnati: il livello ne deriva e non scende mai (§3). */
  totalXpEarned: number;

  mood: string;
  focus: string;
  scanAnswers: string[];

  mons: Record<string, MonRecord>;
  activeMonName: string | null;
  nodes: MindlineNode[];
  memories: Memory[];
  chat: ChatMessage[];

  /** Tratti in partenza durante un BRANCH, prima che il nuovo .mon esista. */
  pendingHeritage: HeritageOrigin[];

  /** Ultima matematica di rarità, esposta in DEV (§20.1). */
  lastRarity: RarityBreakdown | null;
  batch: BatchCandidate[];

  dev: DevFlags;
  economy: EconomyConfig;
  bias: SimulationBias;

  /* --- Azioni di flusso --- */
  advanceDays: (n: number) => void;
  endWeek: () => void;
  hatch: () => void;
  enterLive: () => void;
  openShift: () => void;
  doContinue: () => void;
  startBranch: () => void;
  confirmBranch: () => void;

  /* --- Interazione --- */
  sendMessage: (text: string) => void;
  logInput: (kind: 'camera' | 'tell' | 'measure' | 'workout', note?: string) => void;

  /* --- DEV (§20.1) --- */
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

function initialProgression(): Progression {
  return { xp: 0, level: 1, bond: 0, evolutionSync: 0 };
}

const INITIAL = {
  phase: 'incubation' as Phase,
  day: 1,
  health: initialHealthState(),
  progression: initialProgression(),
  totalXpEarned: 0,
  mood: 'non dichiarato',
  focus: 'non dichiarato',
  scanAnswers: [],
  mons: {} as Record<string, MonRecord>,
  activeMonName: null as string | null,
  nodes: [] as MindlineNode[],
  memories: [] as Memory[],
  chat: [] as ChatMessage[],
  pendingHeritage: [] as HeritageOrigin[],
  lastRarity: null as RarityBreakdown | null,
  batch: [] as BatchCandidate[],
  dev: { enabled: false, forceContinue: false, forceBranch: false },
  economy: DEFAULT_ECONOMY,
  bias: DEFAULT_BIAS,
};

/* --- Helper ---------------------------------------------------------------- */

function userStateOf(s: AppState): UserState {
  return {
    day: s.day,
    health: s.health,
    progression: s.progression,
    mood: s.mood,
    focus: s.focus,
    scanAnswers: s.scanAnswers,
  };
}

function activeRecord(s: AppState): MonRecord | null {
  return s.activeMonName ? (s.mons[s.activeMonName] ?? null) : null;
}

/** Giorni passati con il .mon attivo, per l'eleggibilità del branch (§7.3). */
function daysWithActiveMon(s: AppState): number {
  const rec = activeRecord(s);
  return rec ? Math.max(0, s.day - rec.bornOnDay) : 0;
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      /* ======================================================================
         AVANZAMENTO DEL TEMPO (§20.1)
         Cheat di prototipo dichiarato: sta al posto dell'accumulo reale di
         calendario e dati sanitari (§25).
         =================================================================== */

      advanceDays: (n) => {
        for (let i = 0; i < n; i++) advanceOneDay(set, get);
      },

      endWeek: () => {
        const remaining = 7 - ((get().day - 1) % 7);
        for (let i = 0; i < remaining; i++) advanceOneDay(set, get);
      },

      /* ======================================================================
         05 FIRST ENCOUNTER — nasce il primo .mon
         =================================================================== */

      hatch: () => {
        const s = get();
        if (s.phase !== 'incubation') return;

        const nodeId = makeNodeId(0);
        const seed = randomSeed();

        const { record, rarity } = generateMon({
          user: userStateOf(s),
          mindlineNodeId: nodeId,
          originNodeId: null,
          heritageOrigins: [],
          lineageNames: Object.keys(s.mons),
          seed,
        });

        const node = createNode({
          index: 0,
          kind: 'origin',
          monName: record.data.name,
          parentId: null,
          day: s.day,
          chapter: 1,
          label: record.data.evolutionState?.label ?? 'BASIC FORM',
        });

        set({
          phase: 'first-encounter',
          mons: { [record.data.name]: record },
          activeMonName: record.data.name,
          nodes: [node],
          lastRarity: rarity,
          chat: [openingMessage(record, s.day)],
        });

        void preloadMonAssets(record.data.name);
      },

      enterLive: () => set({ phase: 'live' }),

      /* ======================================================================
         11 MINDLINE SHIFT — superficie decisionale
         =================================================================== */

      openShift: () => set({ phase: 'shift' }),

      /* ======================================================================
         12 EVOLUTION — CONTINUE/EVOLVE (§7.2)
         La STESSA identità avanza. Si spende XP.
         =================================================================== */

      doContinue: () => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec) return;

        const stage = rec.data.evolutionState?.stage ?? 0;
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

        const { record, rarity } = evolveMon(rec, userStateOf(s), nodeId, randomSeed());

        const node = createNode({
          index: s.nodes.length,
          kind: 'evolution',
          monName: record.data.name,
          parentId: rec.data.mindlineNodeId,
          day: s.day,
          chapter: nextChapter(s.nodes, 'evolution'),
          label: record.data.evolutionState?.label ?? 'BASIC FORM',
        });

        const memory = makeMemory({
          id: `mem_evo_${s.day}_${s.nodes.length}`,
          day: s.day,
          event: {
            kind: 'milestone',
            title: `${record.data.evolutionState?.label ?? 'NUOVA FORMA'} sbloccata`,
            text: `Ha raggiunto ${record.data.evolutionState?.label ?? 'una forma nuova'}. Stessa identità, forma nuova.`,
            memorable: true,
          },
          monName: record.data.name,
        });

        set({
          phase: 'evolution',
          mons: { ...s.mons, [record.data.name]: record },
          nodes: [...s.nodes, node],
          progression: {
            ...s.progression,
            xp: Math.max(0, s.progression.xp - cost),
            evolutionSync: 0,
          },
          memories: [...s.memories, memory],
          lastRarity: rarity,
          dev: { ...s.dev, forceContinue: false },
        });

        void preloadMonAssets(record.data.name);
      },

      /* ======================================================================
         13 NEW BRANCH — si sceglie che cosa sopravvive (§7.3)
         La schermata mostra i tratti in partenza SENZA anticipare la nuova
         identità: il nuovo .mon non esiste ancora, per costruzione.
         =================================================================== */

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

      /* ======================================================================
         14 NEW ENCOUNTER — nasce il .mon del nuovo ramo
         =================================================================== */

      confirmBranch: () => {
        const s = get();
        const previous = activeRecord(s);
        if (!previous || s.phase !== 'branch') return;

        const nodeId = makeNodeId(s.nodes.length);
        const seed = randomSeed();

        const { record, rarity } = generateMon({
          user: userStateOf(s),
          mindlineNodeId: nodeId,
          originNodeId: previous.data.mindlineNodeId,
          heritageOrigins: s.pendingHeritage,
          lineageNames: Object.keys(s.mons),
          seed,
        });

        const node = createNode({
          index: s.nodes.length,
          kind: 'branch',
          monName: record.data.name,
          parentId: previous.data.mindlineNodeId,
          day: s.day,
          chapter: nextChapter(s.nodes, 'branch'),
          label: 'BASIC FORM',
        });

        // §8.2 — parte delle memorie sopravvive al branch, in forma parziale.
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
          nodes: [...s.nodes, node],
          memories: [...s.memories, ...carried],
          chat: [openingMessage(record, s.day)],
          pendingHeritage: [],
          progression: { ...s.progression, bond: 0, evolutionSync: 0 },
          lastRarity: rarity,
          dev: { ...s.dev, forceBranch: false },
        });

        void preloadMonAssets(record.data.name);
      },

      /* ======================================================================
         INTERAZIONE
         =================================================================== */

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

        // §17 — ogni superficie dipendente da AI ha un fallback. Nel prototipo
        // la risposta È il fallback: deterministica, dal Voice DNA.
        const theirs: ChatMessage = {
          id: `msg_${s.chat.length}_m`,
          from: 'mon',
          text: fallbackReply(rng, rec.data.mood, rec.data.voiceDna, rec.data.role),
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

        // Un input registrato migliora la metrica che gli compete.
        const touched: Partial<Record<StatKey, number>> = {};
        const current = (k: StatKey) =>
          isKnown(s.health.stats[k].value) ? (s.health.stats[k].value as number) : 50;

        if (kind === 'workout') {
          touched.ATK = Math.min(100, current('ATK') + 2.5);
          touched.SPD = Math.min(100, current('SPD') + 1.8);
        } else if (kind === 'measure') {
          touched.FORM = Math.min(100, current('FORM') + 1.2);
        } else if (kind === 'camera') {
          touched.CARE = Math.min(100, current('CARE') + 1.5);
        } else {
          touched.REC = Math.min(100, current('REC') + 1);
        }

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

      /* ======================================================================
         PANNELLO DEV (§20.1)
         =================================================================== */

      setDev: (patch) => set((s) => ({ dev: { ...s.dev, ...patch } })),
      setEconomy: (patch) => set((s) => ({ economy: { ...s.economy, ...patch } })),
      setBias: (patch) => set((s) => ({ bias: { ...s.bias, ...patch } })),

      setSignal: (key, value) =>
        set((s) => {
          const stats = { ...s.health.stats };
          stats[key] = {
            value,
            delta: UNKNOWN,
            // Un valore imposto a mano è certo per definizione; UNKNOWN azzera
            // la confidenza, com'è giusto.
            confidence: value === UNKNOWN ? 0 : 1,
          };
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
              // §3 — il livello non scende mai: deriva dagli XP guadagnati,
              // non da quelli attualmente in tasca.
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

      /**
       * §20.2 — genera solo DATI STRUTTURATI, nessun asset. Serve a valutare
       * varianza, doppioni, distribuzione di rarità, bilanciamento
       * Family/Affinity, coerenza Heritage e qualità dei nomi.
       */
      generateBatch: (n) => {
        const s = get();
        const previous = activeRecord(s);
        const lineage = [...Object.keys(s.mons)];
        const out: BatchCandidate[] = [];

        for (let i = 0; i < n; i++) {
          const seed = randomSeed();
          // Un candidato su tre nasce da un branch, così l'Heritage entra
          // davvero nel campione.
          const heritageOrigins =
            previous && i % 3 === 0
              ? selectHeritageOrigins(makeRng(seed ^ 0x9e3779b9), previous)
              : [];

          const { record, rarity } = generateMon({
            user: userStateOf(s),
            mindlineNodeId: `batch_${i}`,
            originNodeId: previous?.data.mindlineNodeId ?? null,
            heritageOrigins,
            lineageNames: lineage,
            seed,
          });

          lineage.push(record.data.name);
          out.push({
            name: record.data.name,
            family: record.data.family,
            familyArchetype: record.data.familyArchetype,
            affinity: record.data.affinity,
            size: record.data.size,
            role: record.data.role,
            appearance: record.data.appearance,
            rarity: record.data.rarity,
            score: rarity.score,
            heritageCount: record.data.heritage.length,
            seed,
          });
        }

        set({ batch: out });
      },

      clearBatch: () => set({ batch: [] }),

      /** Rigenera il .mon del nodo corrente con un nuovo seed. */
      resetCurrentNode: () => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec) return;

        const node = s.nodes.find((n) => n.id === rec.data.mindlineNodeId);
        if (!node) return;

        const lineage = Object.keys(s.mons).filter((n) => n !== rec.data.name);
        const { record, rarity } = generateMon({
          user: userStateOf(s),
          mindlineNodeId: node.id,
          originNodeId: rec.data.originNodeId,
          heritageOrigins: rec.data.heritage.map(({ transformed: _t, ...rest }) => rest),
          lineageNames: lineage,
          seed: randomSeed(),
        });

        const mons = { ...s.mons };
        delete mons[rec.data.name];
        mons[record.data.name] = record;

        set({
          mons,
          activeMonName: record.data.name,
          nodes: s.nodes.map((n) => (n.id === node.id ? { ...n, monName: record.data.name } : n)),
          chat: [openingMessage(record, s.day)],
          lastRarity: rarity,
        });
      },

      /** Torna a un nodo precedente rendendolo di nuovo attivo. */
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

      /** Duplica lo scenario corrente su un nuovo nodo, per confronti a coppie. */
      cloneScenario: () => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec) return;

        const nodeId = makeNodeId(s.nodes.length);
        const { record, rarity } = generateMon({
          user: userStateOf(s),
          mindlineNodeId: nodeId,
          originNodeId: rec.data.mindlineNodeId,
          heritageOrigins: [],
          lineageNames: Object.keys(s.mons),
          seed: randomSeed(),
        });

        set({
          mons: { ...s.mons, [record.data.name]: record },
          nodes: [
            ...s.nodes,
            createNode({
              index: s.nodes.length,
              kind: 'branch',
              monName: record.data.name,
              parentId: rec.data.mindlineNodeId,
              day: s.day,
              chapter: nextChapter(s.nodes, 'branch'),
              label: 'BASIC FORM (CLONE DEV)',
            }),
          ],
          lastRarity: rarity,
        });
      },

      /* --- Import asset (§22.3) ---
         Tocca SOLO `assetStatus`. Nessun campo di identità viene modificato:
         il record sopravvive alla sostituzione degli asset. */

      markAssetResolved: (monName, type) =>
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
                  assetStatus: { ...rec.data.assetStatus, [type]: 'resolved' },
                },
              },
            },
          };
        }),

      markAssetWaiting: (monName, type) =>
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
                  assetStatus: { ...rec.data.assetStatus, [type]: 'waiting' },
                },
              },
            },
          };
        }),

      resetAll: () => set({ ...INITIAL, health: initialHealthState(), dev: get().dev }),
    }),
    {
      name: 'vinzverce.prototype.v1',
      version: 1,
      // Le immagini stanno in IndexedDB: qui va solo il modello.
      partialize: (s) => {
        const { batch: _batch, ...rest } = s;
        return rest as AppState;
      },
    },
  ),
);

/* ============================================================================
   AVANZAMENTO DI UN GIORNO
   ========================================================================= */

function advanceOneDay(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
): void {
  const s = get();
  const day = s.day + 1;
  const rng = makeRng(seedFromString(`day:${day}:${s.activeMonName ?? 'incubation'}`));

  const input = simulateDayInput(rng, s.health, s.bias);
  const health = applyDay(s.health, day, input);

  // Durante l'incubazione non c'è ancora un .mon: si accumulano solo segnali.
  if (s.phase === 'incubation') {
    set({ day, health });
    return;
  }

  const rec = activeRecord(s);
  if (!rec) {
    set({ day, health });
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
      makeMemory({
        id: `mem_${day}_${memories.length}`,
        day,
        event,
        monName: rec.data.name,
      }),
    );
    bonusXp = s.economy.xpPerMemory;
  }

  const totalXpEarned = s.totalXpEarned + gained + bonusXp;

  set({
    day,
    health,
    memories,
    totalXpEarned,
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

/* --- Utilità --------------------------------------------------------------- */

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
    text: fallbackGreeting(rng, record.data.mood, record.data.voiceDna),
    day,
    fallback: true,
  };
}

/* --- Selettori -------------------------------------------------------------
   NB: ogni selettore passato a `useApp` deve restituire un valore già presente
   nello store o un primitivo. Restituire un oggetto costruito al volo manda
   zustand in loop infinito, perché il confronto è per identità. I derivati si
   calcolano fuori dal selettore, nel corpo dell'hook.
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

  const stage = rec?.data.evolutionState?.stage ?? 0;
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

/** Progresso dell'incubazione 0–1 (schermata 04). */
export function useIncubation() {
  const day = useApp((s) => s.day);
  const stats = useApp((s) => s.health.stats);

  const elapsed = Math.min(INCUBATION_DAYS, day);
  const knownSignals = STAT_KEYS.filter((k) => isKnown(stats[k].value)).length;

  return {
    day: elapsed,
    total: INCUBATION_DAYS,
    progress: elapsed / INCUBATION_DAYS,
    // "SIGNAL STABILITY" del board: quanti segnali il sistema legge davvero.
    stability: knownSignals / STAT_KEYS.length,
    ready: elapsed >= INCUBATION_DAYS,
  };
}
