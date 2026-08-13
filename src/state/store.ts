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
  DAILY_SIGNALS,
  PROGRESSION,
  canCloseDay,
  dateForDay,
  dayStatus,
  emptyDay,
  emptySync,
  knownSignals,
  nextEvent,
  planContinuity,
  type ContinuityPlan,
  type DailySignalKey,
  type DailySync,
  type SignalStatus,
} from '../engine/progression';
import { evolveMon, generateFirstMon, generateMon } from '../engine/characterGenerator';
import { selectHeritageOrigins, type HeritageOrigin } from '../engine/heritage';
import { createNode, makeNodeId, nextChapter } from '../engine/mindline';
import { makeMemory, rollDailyEvent } from '../engine/simulation';
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
import {
  isScanComplete,
  seedFromAnswers,
  type ScanAnswers,
} from '../engine/personalityScan';
import { extractFromMessage, extractionLabels } from '../engine/chatExtract';
import { eggReply } from '../engine/eggVoice';
import {
  ADHERENCE_EFFECT,
  EMPTY_PROTOCOL,
  hasUsableDiet,
  parseDiet,
  parseTraining,
  plannedFor,
  type Protocol,
} from '../engine/protocol';
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
  /** 🔶 §12 — il Signal Scan semina la personalità PRIMA che il tempo cominci. */
  | 'scan'
  /**
   * 🔶 v1.10 §5.3 — la dieta e l'allenamento che segui. Senza questo, «hai
   * mangiato?» è l'unica domanda possibile sul cibo, e non è quella giusta.
   */
  | 'protocol'
  | 'incubation'
  /** Rivelazione della prima forma. */
  | 'first-encounter'
  | 'live'
  /** L'offerta: micro-growth o forma nuova. Si può sempre rimandare. */
  | 'shift'
  /** Micro-growth: stessa forma, un dettaglio maturato. */
  | 'evolution'
  /** Conferma della Form Evolution: cosa resta, cosa cambia. */
  | 'form-evolution'
  /** Rivelazione di una forma nuova dopo una Form Evolution. */
  | 'new-encounter';

/** 🔶 v1.4 — sette giorni SINCRONIZZATI, non sette giorni di calendario. */
export const INCUBATION_DAYS = PROGRESSION.incubationSyncDays;

/** Bond guadagnato per interazione. Era in EconomyConfig; qui è una costante. */
const BOND_PER_INTERACTION = 0.02;

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
  /**
   * 🔶 v1.9 §14.1 — la data in cui è cominciata la partita. Serve al calendario
   * per mostrare date vere invece di «GIORNO 8». Si fissa una volta e non si
   * tocca più: spostarla riscriverebbe la storia.
   */
  startedAt: string;

  health: HealthState;
  progression: Progression;
  /** Un record per giorno di calendario toccato. È la fonte del SYNC. */
  days: Record<number, DailySync>;
  /** Quante forme VINZ.MON ha scoperto finora. */
  formsDiscovered: number;

  /** §2 — seme di personalità, stabile. */
  personality: PersonalitySeed;
  /** §12 — le risposte del Signal Scan, conservate per poterle rileggere. */
  scanAnswers: ScanAnswers;
  /**
   * 🔶 v1.10 §5.3 — il riferimento contro cui si legge il cibo. Dichiarato
   * all'ingresso, modificabile sempre: una dieta cambia, e un metro che non si
   * può aggiornare diventa una bugia nel giro di un mese.
   */
  protocol: Protocol;
  /** §11 — umori dichiarati, max 3 al giorno. */
  moodHistory: MoodDayEntry[];
  cultural: CulturalAffinities;

  mons: Record<string, MonRecord>;
  activeMonName: string | null;
  nodes: MindlineNode[];
  memories: Memory[];
  chat: ChatMessage[];

  pendingHeritage: HeritageOrigin[];
  /** Cosa sopravvive alla prossima Form Evolution. Deciso prima di confermare. */
  pendingPlan: ContinuityPlan | null;

  /** §29 — traccia dell'ultima generazione, visibile solo in DEV. */
  lastTrace: GenerationTrace | null;
  batch: BatchCandidate[];

  dev: DevFlags;
  bias: SimulationBias;

  /** ⚠️ Chiave API nel browser: prototipo di una persona sola. Vedi ai/client.ts. */
  apiKey: string | null;

  /** §12 — registra una risposta del Signal Scan. */
  answerScan: (index: number, answerId: string) => void;
  /** §12 CTA `LOCK SIGNAL`: chiude lo scan e semina la personalità. */
  lockSignal: () => void;
  /** DEV — rifà lo scan da capo, senza toccare il resto della partita. */
  reopenScan: () => void;

  /**
   * 🔶 v1.10 §5.3 — dichiara dieta e allenamento. Testo libero, come tutto il
   * resto: §5.2 vieta i campi preimpostati, e una dieta è la cosa che uno ha
   * già scritta da qualche parte e vuole solo incollare.
   */
  declareProtocol: (dietText: string, trainingText: string) => void;
  /** Va avanti senza dichiarare niente. Il cibo resta registrabile, senza metro. */
  skipProtocol: () => void;
  /** Riapre la dichiarazione: una dieta cambia, e il metro deve poterla seguire. */
  reopenProtocol: () => void;

  advanceDays: (n: number) => void;
  /**
   * Come `advanceDays`, ma chiude ogni giornata. Sta in piedi da sé perché il
   * tempo, da solo, non dà più SYNC: lo dà l'utente che si presenta. Simulare
   * «sette giorni vissuti e raccontati» richiede di dire entrambe le cose.
   */
  simulateSyncedDays: (n: number) => void;
  endWeek: () => void;
  hatch: () => void;
  enterLive: () => void;
  openShift: () => void;
  /** Micro-growth: stessa forma, un dettaglio matura (ogni 7 SYNC). */
  doMicroGrowth: () => void;
  /** Prepara l'offerta di Form Evolution mostrando cosa sopravvive. */
  openFormEvolution: () => void;
  /** Accetta la trasformazione. È sempre una scelta: si può rimandare. */
  confirmFormEvolution: () => void;

  sendMessage: (text: string) => void;
  /**
   * 🔶 v1.10 §7.2 — parlare all'uovo. Registra esattamente come `sendMessage`,
   * ma la risposta è un suono e non una frase: durante l'incubazione non c'è
   * ancora nessuno che possa parlare. Vedi `eggVoice.ts`.
   */
  sendToEgg: (text: string) => void;
  /**
   * 🔶 v1.9 §5.2 — registra un racconto libero e/o una foto. Sostituisce le
   * quattro voci a menu di `logInput`: uno sa cosa gli è successo, non in che
   * casella il sistema lo mette.
   */
  captureEntry: (text: string, photoDataUrl: string | null) => void;
  logInput: (kind: 'camera' | 'tell' | 'measure' | 'workout', note?: string) => void;
  /** §11 — dichiara gli umori del giorno, al massimo 3. */
  setMoodInputs: (inputs: MoodInputId[]) => void;
  /** v1.5 — imposta uno dei tre Daily Signals del giorno corrente. */
  setDailySignal: (key: DailySignalKey, status: SignalStatus, note?: string) => void;
  /** Chiude la giornata: +1 SYNC, una volta sola per giorno di calendario. */
  syncDay: () => void;
  /**
   * 🔶 Dichiara una giornata come pausa — malattia, ricovero, giorni in cui non
   * c'eri. Vedi `progression.ts` per il perché NON dà SYNC. Reversibile: se poi
   * quel giorno lo vuoi raccontare, si toglie.
   */
  setDayGrace: (day: number, on: boolean, note?: string) => void;

  setDev: (patch: Partial<DevFlags>) => void;
  setApiKey: (key: string | null) => void;

  setBias: (patch: Partial<SimulationBias>) => void;
  setSignal: (key: StatKey, value: Signal) => void;
  grantBond: (amount: number) => void;
  /** DEV — aggiunge giorni sincronizzati senza aspettarli. */
  grantSync: (days: number) => void;
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
  phase: 'scan' as Phase,
  day: 1,
  startedAt: new Date().toISOString(),
  health: initialHealthState(),
  progression: { bond: 0, sync: emptySync() } as Progression,
  days: {} as Record<number, DailySync>,
  formsDiscovered: 0,
  personality: neutralPersonality(),
  scanAnswers: {} as ScanAnswers,
  protocol: EMPTY_PROTOCOL as Protocol,
  moodHistory: [] as MoodDayEntry[],
  cultural: {} as CulturalAffinities,
  mons: {} as Record<string, MonRecord>,
  activeMonName: null as string | null,
  nodes: [] as MindlineNode[],
  memories: [] as Memory[],
  chat: [] as ChatMessage[],
  pendingHeritage: [] as HeritageOrigin[],
  pendingPlan: null as ContinuityPlan | null,
  lastTrace: null as GenerationTrace | null,
  batch: [] as BatchCandidate[],
  dev: { enabled: false, forceContinue: false, forceBranch: false, unlockAll: false },
  bias: DEFAULT_BIAS,
  apiKey: null as string | null,
};

/* --- Helper ---------------------------------------------------------------- */

/** Scrive uno dei tre Daily Signals del giorno, creando il giorno se manca. */
function withSignal(
  days: Record<number, DailySync>,
  day: number,
  key: DailySignalKey,
  status: SignalStatus,
  note?: string,
): Record<number, DailySync> {
  const current = days[day] ?? emptyDay(day);
  return {
    ...days,
    [day]: {
      ...current,
      signals: { ...current.signals, [key]: { status, note } },
    },
  };
}

/**
 * 🔶 v1.10 §7.2 — l'etichetta di forma sui ricordi nati prima dell'HATCH.
 * `Memory.monName` è «un'etichetta, non un contenitore» (types.ts): qui non c'è
 * ancora nessuna forma da nominare, e inventarne una sarebbe uno spoiler.
 */
const PRE_HATCH = 'UOVO';

/**
 * Applica un'estrazione al giorno corrente: segnali e umori.
 *
 * Esiste per una ragione sola, ed è la ragione per cui ci sono tre superfici
 * che registrano — chat, chat con l'uovo, registrazione — e una regola sola:
 * **un segnale estratto non sovrascrive mai uno dichiarato a mano.** Tenerla
 * copiata in tre posti significherebbe che prima o poi due si comportano
 * diverso, e nessuno se ne accorge.
 */
function applyExtraction(
  s: AppState,
  found: ReturnType<typeof extractFromMessage>,
): { days: Record<number, DailySync>; moodHistory: MoodDayEntry[] } {
  let days = s.days;
  for (const [key, value] of Object.entries(found.signals)) {
    const k = key as DailySignalKey;
    if ((days[s.day]?.signals[k].status ?? 'UNKNOWN') === 'UNKNOWN') {
      days = withSignal(days, s.day, k, value.status, value.note);
    }
  }

  /* 🔷 v1.11 §5.4 — il pasto si aggiunge SEMPRE, anche quando il segnale CIBO
     è già noto. È la differenza fra il segnale e il dettaglio: FOOD dice «di
     cibo oggi so qualcosa» e si riempie una volta; i pasti sono cinque caselle
     che si riempiono nel corso della giornata, ed è esattamente quello che una
     persona fa — racconta la colazione la mattina e la cena la sera. */
  if (found.meal && found.signals.FOOD?.status === 'KNOWN') {
    const current = days[s.day] ?? emptyDay(s.day);
    days = {
      ...days,
      [s.day]: {
        ...current,
        meals: {
          ...current.meals,
          [found.meal]: {
            groups: found.foodGroups,
            note: found.signals.FOOD.note ?? '',
            fromClock: found.mealFromClock,
          },
        },
      },
    };
  }

  // §11 — al massimo 3 umori al giorno, e quelli già dichiarati restano.
  const declared = s.moodHistory.find((d) => d.day === s.day)?.inputs ?? [];
  const merged = [...declared];
  for (const m of found.moods) {
    if (merged.length >= MOOD_INPUT_RULES.maxPerDay) break;
    if (!merged.includes(m)) merged.push(m);
  }

  return {
    days,
    moodHistory:
      merged.length > 0
        ? [...s.moodHistory.filter((d) => d.day !== s.day), { day: s.day, inputs: merged }]
        : s.moodHistory,
  };
}

/**
 * 🔶 v1.10 §5.3 — come «cosa ho mangiato» diventa un numero.
 *
 * È l'unico punto del sistema in cui l'aderenza al protocollo tocca qualcosa, e
 * tocca solo le sei stat di salute: non il SYNC, non l'evoluzione, non un
 * punteggio. Un giorno fuori protocollo produce una creatura diversa, non una
 * creatura peggiore — vedi `ADHERENCE_EFFECT` per il perché CARE sale sempre.
 */
function adherenceTouch(
  s: AppState,
  found: ReturnType<typeof extractFromMessage>,
): Partial<Record<StatKey, number>> {
  const current = (k: StatKey) =>
    isKnown(s.health.stats[k].value) ? (s.health.stats[k].value as number) : 50;
  const touched: Partial<Record<StatKey, number>> = {};

  if (found.signals.FOOD?.status === 'KNOWN') {
    const effect = ADHERENCE_EFFECT[found.adherence];
    touched.FORM = Math.max(0, Math.min(100, current('FORM') + effect.FORM));
    touched.CARE = Math.max(0, Math.min(100, current('CARE') + effect.CARE));
  }

  if (found.signals.WORKOUT?.status === 'KNOWN') {
    touched.ATK = Math.min(100, current('ATK') + 2.5);
    touched.SPD = Math.min(100, current('SPD') + 1.8);
  }

  return touched;
}

/**
 * 🔷 v1.11 §5.4 — «lui saprà dal mio piano se sono a riposo quel giorno».
 *
 * Se il piano dice che oggi è riposo, ALLENAMENTO si riempie da solo come
 * NOT_APPLICABLE — che non è un buco ma una risposta (§v1.5). Chiudere la
 * giornata smette di richiedere che tu dica «oggi niente palestra» a un
 * sistema che ha già il tuo programma sotto gli occhi.
 *
 * 🔒 Tre limiti, e sono la differenza fra aiutare e decidere al posto tuo:
 *
 * 1. Vale SOLO quando il piano nomina quel giorno. Un giorno che il piano non
 *    dice resta UNKNOWN: inventare un riposo dove non è scritto sarebbe la
 *    stessa bugia che §5 vieta ai sensori.
 * 2. NON sovrascrive mai quello che hai raccontato. Se il piano dice riposo e
 *    tu sei andato a correre, vince quello che hai detto.
 * 3. Il contrario NON esiste. Un giorno in cui il piano prevede pesi non
 *    diventa mai «allenamento fatto», e soprattutto non diventa mai un
 *    allenamento MANCATO: il piano è un'intenzione, non un debito. §4 vieta la
 *    vergogna, e un sistema che segna le assenze la reintroduce dal retro.
 */
function applyPlannedRest(
  set: (p: Partial<AppState>) => void,
  get: () => AppState,
): void {
  const s = get();
  const date = dateForDay(s.day, s.startedAt);
  if (plannedFor(s.protocol.training, date) !== 'REST') return;
  if ((s.days[s.day]?.signals.WORKOUT.status ?? 'UNKNOWN') !== 'UNKNOWN') return;

  set({ days: withSignal(s.days, s.day, 'WORKOUT', 'NOT_APPLICABLE', 'riposo, da programma') });
}

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
    activeDays: s.progression.sync.lifetime,
    branchCount: s.formsDiscovered,
  };
}


export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      /* --- §12 SIGNAL SCAN --- */

      answerScan: (index, answerId) =>
        set((s) => ({ scanAnswers: { ...s.scanAnswers, [index]: answerId } })),

      lockSignal: () => {
        const s = get();
        // Il seme si calcola una volta e resta: §2 lo vuole stabile. Non è
        // l'umore, è il temperamento — non si ricalcola ogni giorno.
        set({
          personality: seedFromAnswers(s.scanAnswers),
          phase: 'protocol',
        });
      },

      reopenScan: () => set({ phase: 'scan' }),

      /* --- 🔶 v1.10 §5.3 PROTOCOLLO --- */

      declareProtocol: (dietText, trainingText) => {
        const protocol: Protocol = {
          diet: parseDiet(dietText),
          training: parseTraining(trainingText),
          declaredAt: new Date().toISOString(),
        };
        set({ protocol, phase: 'incubation' });
        applyPlannedRest(set, get);
      },

      // Saltare è legittimo e non è un ripiego: senza protocollo il cibo si
      // registra lo stesso, l'aderenza resta SCONOSCIUTA e nessuna schermata
      // insiste. Obbligare a compilare qualcosa prima di cominciare è
      // esattamente l'attrito che §5.2 è nato per togliere.
      skipProtocol: () => set({ phase: 'incubation' }),

      reopenProtocol: () => set({ phase: 'protocol' }),

      /* --- Avanzamento del tempo (§25) --- */

      advanceDays: (n) => {
        for (let i = 0; i < n; i++) advanceOneDay(set, get);
      },

      simulateSyncedDays: (n) => {
        for (let i = 0; i < n; i++) {
          // Il giorno corrente può essere ancora vuoto: `advanceOneDay` riempie
          // il giorno in cui *arriva*, non quello da cui parte. I segnali già
          // noti non si toccano — sovrascriverli cancellerebbe un NOT_APPLICABLE
          // dichiarato dall'utente, che è una risposta e non un buco.
          const today = get().days[get().day];
          for (const key of DAILY_SIGNALS) {
            if (today?.signals[key].status === undefined || today.signals[key].status === 'UNKNOWN') {
              get().setDailySignal(key, 'KNOWN', 'simulazione');
            }
          }
          get().syncDay();
          advanceOneDay(set, get);
        }
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
        if (s.progression.sync.lifetime < PROGRESSION.incubationSyncDays) return;

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
          chat: [openingMessage(record, s.day, s.apiKey !== null)],
        });

        void preloadMonAssets(record.data.name);
        requestIntroduction(set, get, record);
      },

      enterLive: () => set({ phase: 'live' }),
      openShift: () => set({ phase: 'shift' }),

      /* --- CONTINUE / EVOLVE --- */

      /* --- MICRO-GROWTH: stessa forma, un dettaglio che matura --- */

      doMicroGrowth: () => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec) return;
        if (!s.dev.forceContinue && s.progression.sync.sinceGrowth < PROGRESSION.microGrowthEvery) {
          return;
        }

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
          // Il contatore del micro-growth riparte; quello verso la forma no:
          // «Missing days delay the evolution; they do not erase progress.»
          progression: {
            ...s.progression,
            sync: { ...s.progression.sync, sinceGrowth: 0 },
          },
          memories: [
            ...s.memories,
            makeMemory({
              id: `mem_evo_${s.day}_${s.nodes.length}`,
              day: s.day,
              event: {
                kind: 'milestone',
                title: `${record.data.evolution_state?.label ?? 'NUOVA FORMA'} sbloccata`,
                text: 'Stessa forma, un dettaglio in più risolto.',
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

      /* --- FORM EVOLUTION: la stessa entità si trasforma --- */

      openFormEvolution: () => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec) return;

        if (!s.dev.forceBranch && s.progression.sync.inForm < PROGRESSION.formEvolutionAt) return;

        // L'ancora si estrae qui, non alla conferma: la schermata deve poter
        // dire cosa resta *prima* che l'utente decida, altrimenti la scelta è
        // al buio. Il seme è stabile sul giorno, quindi rientrare non rimescola.
        const rng = makeRng(seedFromString(`form:${rec.data.name}:${s.day}`));
        const plan = planContinuity(rng);

        set({
          phase: 'form-evolution',
          pendingHeritage: selectHeritageOrigins(rng, rec),
          pendingPlan: plan,
        });
      },

      confirmFormEvolution: () => {
        const s = get();
        const previous = activeRecord(s);
        if (!previous || s.phase !== 'form-evolution') return;

        const nodeId = makeNodeId(s.nodes.length);
        const { record, trace } = generateMon({
          input: generatorInput(s),
          mindlineNodeId: nodeId,
          originNodeId: previous.data.mindline_node,
          heritageOrigins: s.pendingHeritage,
          lineageNames: Object.keys(s.mons),
          previous,
          continuity: s.pendingPlan?.keeps,
          seed: randomSeed(),
          devUnlockAll: s.dev.unlockAll,
        });

        // 🔶 Niente `carryMemoriesThroughBranch`: la memoria non si filtra più.
        // VINZ.MON è una entità sola e le memorie sono sue, non della forma —
        // la forma è solo un metadato sul ricordo.

        set({
          phase: 'new-encounter',
          mons: {
            ...s.mons,
            [previous.data.name]: { ...previous, retiredOnDay: s.day },
            [record.data.name]: record,
          },
          activeMonName: record.data.name,
          formsDiscovered: s.formsDiscovered + 1,
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
          memories: s.memories,
          chat: [...s.chat, openingMessage(record, s.day, s.apiKey !== null)].slice(-60),
          pendingHeritage: [],
          pendingPlan: null,
          // Il bond NON si azzera: è la stessa relazione. Riparte solo il
          // conteggio dei giorni dentro la forma.
          progression: {
            ...s.progression,
            sync: { ...s.progression.sync, inForm: 0, sinceGrowth: 0 },
          },
          lastTrace: trace,
          dev: { ...s.dev, forceBranch: false },
        });

        void preloadMonAssets(record.data.name);
        requestIntroduction(set, get, record);
      },

      /* --- Interazione --- */

      /**
       * 🔶 v1.9 §5.1 — la chat è una superficie di REGISTRAZIONE, non solo di
       * conversazione. Scrivere «oggi palestra e poi carbonara» riempie il
       * giorno: non deve esistere un secondo posto dove dire le stesse cose.
       */
      sendMessage: (text) => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec || text.trim().length === 0) return;

        const rng = makeRng(seedFromString(`reply:${rec.data.name}:${s.chat.length}:${text}`));
        const found = extractFromMessage(text, s.protocol.diet);
        const labels = extractionLabels(found);

        const mine: ChatMessage = {
          id: `msg_${s.chat.length}_v`,
          from: 'vinz',
          text: text.trim(),
          day: s.day,
          // Quello che ha capito si vede subito, sotto al messaggio. Registrare
          // in silenzio sarebbe peggio che non registrare: non sapresti mai se
          // hai già detto una cosa o no.
          extracted: labels.length > 0 ? labels : undefined,
        };
        const theirs: ChatMessage = {
          id: `msg_${s.chat.length}_m`,
          from: 'mon',
          text: fallbackReply(rng, rec.data.mood_primary, rec.data.voice_dna, rec.data.role),
          day: s.day,
          fallback: true,
          pending: s.apiKey !== null,
        };

        const { days, moodHistory } = applyExtraction(s, found);

        set({
          chat: [...s.chat, mine, theirs].slice(-60),
          days,
          moodHistory,
          progression: {
            ...s.progression,
            bond: Math.min(1, s.progression.bond + BOND_PER_INTERACTION),
          },
        });

        requestReply(set, get, rec, theirs.id);
      },

      /**
       * 🔶 v1.10 §7.2 — la stessa chat, ma l'altro capo non sa parlare.
       *
       * Registra identico a `sendMessage`: gli stessi segnali, gli stessi umori,
       * la stessa riga di conferma. Cambiano due cose, ed è di proposito:
       * la risposta è un suono, e non parte nessuna chiamata AI — non c'è
       * ancora nessuna voce da far scrivere a un modello, e sette giorni di
       * incubazione non devono costare niente.
       */
      sendToEgg: (text) => {
        const s = get();
        if (s.phase !== 'incubation' || text.trim().length === 0) return;

        const found = extractFromMessage(text, s.protocol.diet);
        const labels = extractionLabels(found);
        const rng = makeRng(seedFromString(`egg:${s.day}:${s.chat.length}:${text}`));
        const progress = Math.min(1, s.progression.sync.lifetime / PROGRESSION.incubationSyncDays);
        const sound = eggReply(rng, found, progress);

        const mine: ChatMessage = {
          id: `msg_${s.chat.length}_v`,
          from: 'vinz',
          text: text.trim(),
          day: s.day,
          extracted: labels.length > 0 ? labels : undefined,
        };
        const theirs: ChatMessage = {
          id: `msg_${s.chat.length}_e`,
          from: 'mon',
          text: sound.text,
          day: s.day,
          sound: sound.reaction,
        };

        const { days, moodHistory } = applyExtraction(s, found);
        const health = applyDay(s.health, s.day, {
          touched: adherenceTouch(s, found),
          logged: true,
          workout: found.signals.WORKOUT?.status === 'KNOWN',
        });

        set({
          chat: [...s.chat, mine, theirs].slice(-60),
          days,
          moodHistory,
          health,
          // Quello che gli racconti prima che nasca non va perso: i suoni sono
          // presenza e spariscono con l'HATCH, il contenuto resta e alimenta la
          // voce che avrà dopo.
          memories: [
            ...s.memories,
            makeMemory({
              id: `mem_egg_${s.day}_${s.memories.length}`,
              day: s.day,
              event: {
                kind: 'conversation',
                title: 'Prima di nascere',
                text: text.trim(),
                memorable: true,
              },
              monName: PRE_HATCH,
            }),
          ],
          progression: {
            ...s.progression,
            bond: Math.min(1, s.progression.bond + BOND_PER_INTERACTION),
          },
        });
      },

      captureEntry: (text, photoDataUrl) => {
        const s = get();
        const rec = activeRecord(s);
        const found = extractFromMessage(text, s.protocol.diet);

        const applied = applyExtraction(s, found);
        let days = applied.days;

        /* Una foto senza parole è quasi sempre un piatto. Lo si dichiara come
           deduzione — «da una foto» — invece di farlo passare per un dato
           raccontato: la provenienza resta leggibile nel calendario. */
        if (photoDataUrl && (days[s.day]?.signals.FOOD.status ?? 'UNKNOWN') === 'UNKNOWN') {
          days = withSignal(days, s.day, 'FOOD', 'KNOWN', 'da una foto');
        }

        /* Le misure toccano le sei stat di §4, e con loro l'aderenza al
           protocollo. Non sono un quarto segnale e non danno SYNC: la salute
           forma la creatura, non ne compra la crescita. */
        const current = (k: StatKey) =>
          isKnown(s.health.stats[k].value) ? (s.health.stats[k].value as number) : 50;
        const touched = adherenceTouch(s, found);
        for (const m of found.measures) {
          touched[m.stat] = Math.max(0, Math.min(100, current(m.stat) + 2));
        }
        if (photoDataUrl) touched.CARE = Math.min(100, current('CARE') + 1.5);

        const health = applyDay(s.health, s.day, {
          touched,
          logged: true,
          workout: found.signals.WORKOUT?.status === 'KNOWN',
        });

        const memories = [...s.memories];
        if (rec && text.trim().length > 0) {
          memories.push(
            makeMemory({
              id: `mem_capture_${s.day}_${memories.length}`,
              day: s.day,
              event: {
                kind: found.signals.WORKOUT?.status === 'KNOWN' ? 'workout' : 'conversation',
                title: 'Registrato',
                text: text.trim(),
                memorable: true,
              },
              monName: rec.data.name,
            }),
          );
        }

        set({
          health,
          days,
          memories,
          moodHistory: applied.moodHistory,
          progression: {
            ...s.progression,
            bond: Math.min(1, s.progression.bond + BOND_PER_INTERACTION),
          },
        });

        if (photoDataUrl) readPhoto(set, get, photoDataUrl);
      },

      logInput: (kind, note) => {
        const s = get();
        const rec = activeRecord(s);

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

        // v1.5 — registrare un dato riempie il segnale corrispondente. Non dà
        // SYNC: il SYNC lo dà la chiusura della giornata, una volta sola.
        const signal: DailySignalKey | null =
          kind === 'workout' ? 'WORKOUT' : kind === 'camera' ? 'FOOD' : null;

        set({
          health,
          memories,
          progression: {
            ...s.progression,
            bond: Math.min(1, s.progression.bond + BOND_PER_INTERACTION),
          },
          days: signal
            ? withSignal(s.days, s.day, signal, 'KNOWN', note)
            : s.days,
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

      setDailySignal: (key, status, note) =>
        set((s) => ({ days: withSignal(s.days, s.day, key, status, note) })),

      /**
       * Chiude la giornata. È l'unico punto in cui si guadagna SYNC, e vale
       * una volta sola per giorno di calendario: «Logging more meals,
       * workouts, messages or photos improves the quality of the day's data,
       * but never farms additional SYNC.»
       */
      syncDay: () =>
        set((s) => {
          const today = s.days[s.day] ?? emptyDay(s.day);
          if (today.syncAwarded || !canCloseDay(today)) return {};

          return {
            days: {
              ...s.days,
              [s.day]: { ...today, status: 'SYNCED', syncAwarded: true },
            },
            progression: {
              ...s.progression,
              sync: {
                lifetime: s.progression.sync.lifetime + 1,
                inForm: s.progression.sync.inForm + 1,
                sinceGrowth: s.progression.sync.sinceGrowth + 1,
              },
            },
          };
        }),

      setDayGrace: (day, on, note) =>
        set((s) => {
          const record = s.days[day] ?? emptyDay(day);
          // Un giorno che ha già dato SYNC non si marca: il SYNC è stato
          // guadagnato e togliere un giorno dalla storia sarebbe una bugia.
          if (record.syncAwarded) return {};

          const rec = activeRecord(s);
          const already = record.status === 'GRACE';
          if (on === already) return {};

          return {
            days: {
              ...s.days,
              [day]: {
                ...record,
                status: on ? 'GRACE' : 'EMPTY',
                graceNote: on ? note : undefined,
              },
            },
            // Il punto di GRACE non è il calendario, è che VINZ.MON se ne
            // accorga. Una pausa dichiarata entra nella memoria come qualunque
            // altra cosa che gli hai raccontato.
            memories:
              on && rec
                ? [
                    ...s.memories,
                    makeMemory({
                      id: `mem_grace_${day}`,
                      day,
                      event: {
                        kind: 'event',
                        title: 'Una pausa',
                        text: note?.trim()
                          ? `Non c'eri: ${note.trim().toLowerCase()}`
                          : 'Non c’eri. Nessun dato, e va bene così.',
                        memorable: true,
                      },
                      monName: rec.data.name,
                    }),
                  ]
                : s.memories.filter((m) => m.id !== `mem_grace_${day}`),
          };
        }),

      /* --- DEV --- */

      setDev: (patch) => set((s) => ({ dev: { ...s.dev, ...patch } })),
      setApiKey: (key) => set({ apiKey: key && key.trim().length > 0 ? key.trim() : null }),
      setBias: (patch) => set((s) => ({ bias: { ...s.bias, ...patch } })),

      setSignal: (key, value) =>
        set((s) => {
          const stats = { ...s.health.stats };
          stats[key] = { value, delta: UNKNOWN, confidence: value === UNKNOWN ? 0 : 1 };
          return { health: { ...s.health, stats } };
        }),

      grantBond: (amount) =>
        set((s) => ({
          progression: {
            ...s.progression,
            bond: Math.max(0, Math.min(1, s.progression.bond + amount)),
          },
        })),

      grantSync: (days) =>
        set((s) => ({
          progression: {
            ...s.progression,
            sync: {
              lifetime: Math.max(0, s.progression.sync.lifetime + days),
              inForm: Math.max(0, s.progression.sync.inForm + days),
              sinceGrowth: Math.max(0, s.progression.sync.sinceGrowth + days),
            },
          },
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
          chat: [openingMessage(record, s.day, s.apiKey !== null)],
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
          chat: [openingMessage(rec, s.day, s.apiKey !== null)],
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
          startedAt: new Date().toISOString(),
          health: initialHealthState(),
          personality: neutralPersonality(),
          scanAnswers: {},
          dev: get().dev,
          // Ricominciare la partita non è motivo per far reincollare la chiave.
          apiKey: get().apiKey,
        }),
    }),
    {
      // 🔶 Chiave NUOVA, non un bump di `version`. Il modello di progressione è
      // cambiato in modo incompatibile — `progression` non ha più `xp`, `level`
      // né `evolutionSync` — e una partita salvata con la forma vecchia
      // manderebbe in errore la prima schermata che legge `sync.lifetime`.
      // Cambiare chiave fa ripartire da capo invece di rompersi, che per un
      // prototipo è il comportamento onesto.
      name: 'vinzmon.prototype.v3',
      version: 3,
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

  // La simulazione riempie i segnali che i dati automatici possono riempire —
  // cibo e allenamento — e lascia UNKNOWN l'umore, che nessun sensore può
  // dedurre: «should not silently fabricate subjective information such as
  // Mood». Il giorno resta PARTIAL finché non lo chiudi tu.
  let days = s.days;
  if (input.logged) {
    days = withSignal(days, day, 'FOOD', 'KNOWN', 'da dati automatici');
    days = withSignal(
      days,
      day,
      'WORKOUT',
      'KNOWN',
      input.workout ? 'allenamento rilevato' : 'giorno di riposo',
    );
  }

  if (s.phase === 'incubation') {
    set({ day, health, days });
    applyPlannedRest(set, get);
    return;
  }

  const rec = activeRecord(s);
  if (!rec) {
    set({ day, health, days });
    applyPlannedRest(set, get);
    return;
  }

  const event = rollDailyEvent(rng, input.logged, input.workout);
  const memories = [...s.memories];

  if (event?.memorable) {
    memories.push(
      makeMemory({ id: `mem_${day}_${memories.length}`, day, event, monName: rec.data.name }),
    );
  }

  set({
    day,
    health,
    days,
    memories,
    // Nessun SYNC qui: il giorno lo chiude l'utente, non il passare del tempo.
    progression: {
      ...s.progression,
      bond: Math.min(1, s.progression.bond + (input.logged ? 0.012 : 0)),
    },
  });

  applyPlannedRest(set, get);
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

/**
 * Il primo messaggio esiste SEMPRE, ed è sempre leggibile: nasce dalla voce
 * deterministica (§17). Se c'è una chiave, l'AI sta già scrivendo la vera
 * presentazione e questa riga verrà sostituita quando arriva.
 */
function openingMessage(record: MonRecord, day: number, pending: boolean): ChatMessage {
  const rng = makeRng(seedFromString(`greet:${record.data.name}:${day}`));
  return {
    id: `msg_open_${record.data.name}`,
    from: 'mon',
    text: fallbackGreeting(rng, record.data.mood_primary, record.data.voice_dna),
    day,
    fallback: true,
    pending,
  };
}

/**
 * Chiede all'AI la presentazione e sostituisce il messaggio d'apertura quando
 * arriva. Non blocca niente e non lancia mai: se fallisce, resta il fallback,
 * dichiarato come tale in interfaccia.
 */
function requestIntroduction(
  set: (p: Partial<AppState>) => void,
  get: () => AppState,
  record: MonRecord,
): void {
  const apiKey = get().apiKey;
  if (!apiKey) return;

  const id = `msg_open_${record.data.name}`;

  // L'SDK arriva solo a chi ha una chiave: import dinamico, chunk separato.
  void import('../ai/client')
    .then((m) => m.generateIntroduction(apiKey, record))
    .then(({ result }) => {
      const s = get();
      const index = s.chat.findIndex((m) => m.id === id);
      if (index === -1) return; // la partita è andata avanti: non si riscrive il passato

      const chat = [...s.chat];
      chat[index] = result
        ? { ...chat[index]!, text: result.text, fallback: false, pending: false }
        : { ...chat[index]!, pending: false };

      set({ chat });
    });
}

/**
 * Chiede all'AI la vera risposta e sostituisce il fallback quando arriva.
 * Stessa forma di `requestIntroduction`: non blocca, non lancia, e se fallisce
 * resta il testo deterministico dichiarato come tale (§17).
 */
function requestReply(
  set: (p: Partial<AppState>) => void,
  get: () => AppState,
  record: MonRecord,
  messageId: string,
): void {
  const s0 = get();
  const apiKey = s0.apiKey;
  if (!apiKey) return;

  // Cosa il sistema ha già capito da solo: serve al modello per non richiedere
  // una cosa appena letta, non per farlo ringraziare.
  const mine = s0.chat.find((m) => m.id === messageId.replace(/_m$/, '_v'));
  const context =
    mine?.extracted && mine.extracted.length > 0
      ? `the system already recorded from this message: ${mine.extracted.join(', ')}`
      : null;
  const userText = mine?.text ?? '';

  void import('../ai/client')
    .then((m) => m.generateReply(apiKey, record, userText, context))
    .then(({ result }) => {
      const s = get();
      const index = s.chat.findIndex((m) => m.id === messageId);
      if (index === -1) return;

      const chat = [...s.chat];
      chat[index] = result
        ? { ...chat[index]!, text: result.text, fallback: false, pending: false }
        : { ...chat[index]!, pending: false };

      set({ chat });
    });
}

/**
 * 🔶 v1.9 §5.2 — fa leggere la foto al modello e aggiunge quello che trova.
 *
 * Regola: può solo AGGIUNGERE segnali ancora sconosciuti, mai sovrascriverne
 * uno già noto. Una lettura automatica non ha il diritto di correggere quello
 * che hai detto tu — vale per i sensori (§5) e vale identico qui.
 */
function readPhoto(
  set: (p: Partial<AppState>) => void,
  get: () => AppState,
  dataUrl: string,
): void {
  const apiKey = get().apiKey;
  if (!apiKey) return;

  void import('../ai/client')
    .then((m) => m.readPhotoSignals(apiKey, dataUrl))
    .then((found) => {
      if (!found) return;
      const s = get();
      let days = s.days;
      for (const [key, value] of Object.entries(found.signals)) {
        const k = key as DailySignalKey;
        const v = value as { status: SignalStatus; note: string };
        if ((days[s.day]?.signals[k].status ?? 'UNKNOWN') === 'UNKNOWN') {
          days = withSignal(days, s.day, k, v.status, v.note);
        }
      }
      if (days !== s.days) set({ days });
    });
}

/* --- Selettori --------------------------------------------------------------
   Ogni selettore restituisce un valore già nello store o un primitivo:
   costruire un oggetto dentro `useApp` manda zustand in loop infinito.
   -------------------------------------------------------------------------- */

export function useActiveMon(): MonRecord | null {
  return useApp((s) => (s.activeMonName ? (s.mons[s.activeMonName] ?? null) : null));
}

/** Il prossimo evento di crescita e quanto manca. È l'unica barra della Home. */
export function useGrowth() {
  const sync = useApp((s) => s.progression.sync);
  const phase = useApp((s) => s.phase);
  const forceGrowth = useApp((s) => s.dev.forceContinue);
  const forceForm = useApp((s) => s.dev.forceBranch);

  const hatched = phase !== 'incubation';
  const event = nextEvent(sync, hatched);

  return {
    sync,
    event,
    microGrowthReady: forceGrowth || sync.sinceGrowth >= PROGRESSION.microGrowthEvery,
    formEvolutionReady: forceForm || sync.inForm >= PROGRESSION.formEvolutionAt,
    progress: Math.min(1, event.have / event.need),
  };
}

/** Il giorno corrente: i tre segnali e se è chiudibile. */
export function useToday() {
  const day = useApp((s) => s.day);
  const record = useApp((s) => s.days[s.day]);

  const today = record ?? emptyDay(day);
  return {
    day: today,
    status: dayStatus(today),
    known: knownSignals(today),
    canClose: canCloseDay(today) && !today.syncAwarded,
    closed: today.syncAwarded,
  };
}

/**
 * 🔶 v1.4 — l'incubazione conta i giorni SINCRONIZZATI, non quelli passati.
 * «If a day is missing, incubation does NOT reset»: il giorno resta aperto e
 * l'hatch aspetta finché non ce ne sono sette validi.
 */
export function useIncubation() {
  const synced = useApp((s) => s.progression.sync.lifetime);
  const stats = useApp((s) => s.health.stats);

  const done = Math.min(INCUBATION_DAYS, synced);
  const known = STAT_KEYS.filter((k) => isKnown(stats[k].value)).length;

  return {
    day: done,
    total: INCUBATION_DAYS,
    progress: done / INCUBATION_DAYS,
    stability: known / STAT_KEYS.length,
    ready: synced >= INCUBATION_DAYS,
  };
}

/** Il piano di continuità in attesa di conferma. */
export function usePendingPlan(): ContinuityPlan | null {
  return useApp((s) => s.pendingPlan);
}

/** Lo stato del Signal Scan: a che punto è e se si può chiudere. */
export function useScan() {
  const answers = useApp((s) => s.scanAnswers);
  return {
    answers,
    answered: Object.keys(answers).length,
    complete: isScanComplete(answers),
  };
}

/** 🔶 v1.10 §5.3 — il protocollo dichiarato, e se basta a misurare l'aderenza. */
export function useProtocol() {
  const protocol = useApp((s) => s.protocol);
  return { protocol, usable: hasUsableDiet(protocol) };
}

/** Umori dichiarati oggi (§11). */
export function useTodayMoods(): MoodInputId[] {
  const day = useApp((s) => s.day);
  const history = useApp((s) => s.moodHistory);
  return history.find((d) => d.day === day)?.inputs ?? [];
}
