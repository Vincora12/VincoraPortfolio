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
  trend,
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
  hiddenEventFor,
  knownSignals,
  nextEvent,
  planContinuity,
  type ContinuityPlan,
  type DailySignalKey,
  type DailySync,
  type SignalStatus,
} from '../engine/progression';
import { evolveMon, generateFirstMon, generateMon } from '../engine/characterGenerator';
import type { BackendFailure } from '../ai/backend';
import {
  WEEKLY_EVERY,
  arrivalPosts,
  weekFacts,
  weeklyPosts,
  type RoomPost,
} from '../engine/room';
import {
  resetRarityThresholds,
  setRarityThresholds,
  type RarityThresholds,
} from '../engine/rarityTuning';
import type { Page } from '../engine/pages';
import {
  addPage,
  addReminder,
  afterSaying,
  dueReminder,
  editPage,
  type Reminder,
} from './pagesSlice';
import { runTool, TOOLS, type ToolContext, type ToolResult, type ToolUse } from '../ai/tools';
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
import { deservesThinking, extractFromMessage, extractionLabels } from '../engine/chatExtract';
import { eggReply } from '../engine/eggVoice';
import { typingRhythmFor } from '../engine/typingRhythm';
import { unpromptedFor, type UnpromptedKind } from '../engine/unprompted';
import { buildMemoryBlock, recentTurns } from '../engine/memoryContext';
import {
  addNote,
  decideNote,
  gatherEvidence,
  worthReviewing,
  type VoiceNote,
} from '../engine/notebook';
import {
  addOpinion,
  contradictOpinion,
  inheritOpinions,
  opinionsBlock,
  type Opinion,
} from '../engine/opinions';
import { planReveal, type RevealPlan } from '../engine/reveal';
import {
  applyMoodEvent,
  decayMood,
  initialMood,
  moodEventFromInputs,
  type MoodEvent,
  type MoodState,
} from '../engine/mood';
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
import { dropKeptAssets, keepAssetsOf, preloadMonAssets } from '../assets-pipeline/assetStore';

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
  /** §20.1 — soglie di rarità tarate a mano. `null` = quelle del config. */
  rarityThresholds: RarityThresholds | null;
}

/* ============================================================================
   LA TECA (§21.3)

   🔷 «E se mi affeziono a un .mon che poi non vedrò più? Posso salvarlo
   comunque prima di ricominciare, come ricordo.»

   Sì, e deve esistere PRIMA della prima partita di prova, non dopo — perché è
   una cosa che serve nel momento esatto in cui stai per premere «ricomincia»,
   e a quel punto è tardi per costruirla.

   🔒 Un .mon conservato NON è più una forma della lineage: è un ricordo. Non
   ha nodo, non eredita, non evolve, non torna in gioco. Rimetterlo in partita
   riscriverebbe una storia che è già finita, ed è esattamente il contrario di
   quello che vuol dire conservarlo.
   ========================================================================= */

export interface KeptMon {
  id: string;
  /** Il record intero: sigillo, statistiche, motivo della generazione. */
  record: MonRecord;
  /** Il nome sotto cui vivono le sue immagini (spazio `kept/`). */
  assetName: string;
  /** Quando l'hai conservato, in data vera. */
  keptAt: string;
  /** Il giorno di gioco in cui l'hai conservato. */
  day: number;
  /**
   * Vero se la partita in cui è nato aveva usato il salto del tempo.
   *
   * Non è un'etichetta di serie B: è la verità su quella creatura. Un .mon
   * nato da sette giorni saltati non è nato dai tuoi dati, e fra un anno,
   * guardandolo nella teca, questa è la cosa che vorrai sapere.
   */
  fromAcceleratedRun: boolean;
  /** Perché l'hai tenuto. Lo scrivi tu. */
  note: string | null;
}

/** §20.1 — il campione che alimenta DEV → RARITÀ. */
export interface RaritySample {
  /** Il punteggio 0–100 di ogni nascita simulata. */
  scores: number[];
  /** La rarità che ne sarebbe uscita, sblocchi compresi. */
  rarities: string[];
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

  /**
   * 🔷 v1.12 §10.6 — l'umore di fondo del .mon attivo. Vive nello store, non
   * in memoria volatile, perché il punto è esattamente che SOPRAVVIVA alla
   * chiusura: se si azzerasse a ogni apertura sarebbe un'animazione, non uno
   * stato d'animo. `null` finché non è nato nessuno.
   */
  mood: MoodState | null;

  /**
   * 🔷 v1.12 §17.4 — l'indicatore «sta scrivendo» è acceso? Va a `false` per
   * un attimo quando il .mon ESITA: qualcuno che inizia a scrivere, si ferma e
   * ricomincia. Non lo fanno tutti — dipende dal Voice DNA (§17.3).
   */
  typingVisible: boolean;

  /**
   * 🔷 v1.12 §16.3 — quello che il .mon è arrivato a pensare. Nasce dalla
   * riflessione settimanale, vive nel salvataggio, e passa solo in parte alla
   * forma successiva: un'evoluzione che eredita tutto è un aggiornamento.
   */
  opinions: Opinion[];
  /** Giorno dell'ultima riflessione: non se ne fa più di una a settimana. */
  lastReflectionDay: number;

  /**
   * 🔷 v1.14 §22 — gli aggiustamenti che il .mon ha proposto a SE STESSO.
   * Nessuno è attivo finché non lo accetti: `proposta` sta in attesa in DEV,
   * `accettata` entra nel prompt, `rifiutata` resta perché serve a non farlo
   * riproporre la stessa cosa il mese dopo.
   */
  voiceNotes: VoiceNote[];
  /** Giorno dell'ultima revisione: non più di una al mese. */
  lastNotebookDay: number;

  /**
   * 🔷 v1.14 §13.10 — i messaggi che ha mandato per primo, per tipo. Serve a
   * non ripetersi MAI: ripetersi è il modo più veloce che ha un'app di
   * diventare rumore da ignorare.
   */
  saidUnprompted: UnpromptedKind[];
  /** Giorno dell'ultimo messaggio spontaneo: massimo uno al giorno. */
  lastUnpromptedDay: number;

  pendingHeritage: HeritageOrigin[];
  /** Cosa sopravvive alla prossima Form Evolution. Deciso prima di confermare. */
  pendingPlan: ContinuityPlan | null;

  /** §29 — traccia dell'ultima generazione, visibile solo in DEV. */
  lastTrace: GenerationTrace | null;
  batch: BatchCandidate[];
  pages: Page[];
  reminders: Reminder[];
  lastToolUses: string[];

  dev: DevFlags;
  bias: SimulationBias;

  /**
   * 🔷 v1.13 §19.3 — il segreto che apre le TUE funzioni. NON è più una chiave
   * del fornitore: quella vive sul server e il browser non la vede mai.
   *
   * La differenza conta anche se il posto dove sta è lo stesso: se questo
   * esce, chi ce l'ha può spendere al massimo il tetto del mese, e si
   * disinnesca cambiando una variabile d'ambiente e ripubblicando. Una chiave
   * del fornitore, invece, non aveva né tetto né interruttore.
   */
  token: string | null;

  /**
   * Quando hai ricominciato da capo l'ultima volta, o `null`.
   *
   * 🔒 È l'unica cosa che impedisce a una partita cancellata di tornare
   * indietro dal server: vedi `syncWithServer`.
   */
  resetAt: string | null;

  /** §22 — accetta o rifiuta un aggiustamento proposto dal .mon. */
  decideVoiceNote: (id: string, accept: boolean) => void;

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
  setToken: (key: string | null) => void;

  setBias: (patch: Partial<SimulationBias>) => void;
  setSignal: (key: StatKey, value: Signal) => void;
  grantBond: (amount: number) => void;
  /** DEV — aggiunge giorni sincronizzati senza aspettarli. */
  grantSync: (days: number) => void;
  injectEvent: (kind: 'event' | 'joke' | 'milestone' | 'gift', text: string) => void;
  generateBatch: (n: number) => void;
  clearBatch: () => void;
  /** §20.1 DEV → RARITÀ: campiona punteggi e rarità senza toccare lo stato. */
  sampleRarity: (n: number) => RaritySample;
  /** §20.1 — applica una taratura. Torna i problemi, o lista vuota. */
  tuneRarity: (next: RarityThresholds | null) => string[];
  /** §21.2 — cambia l'ordine dell'elenco delle pagine. */
  pinPage: (slug: string, pinned: boolean) => void;
  removePage: (slug: string) => void;
  /** §21 — esegue uno strumento con i dati veri. Usato dalla voce e da DEV. */
  runMonTool: (use: ToolUse) => ToolResult;
  resetCurrentNode: () => void;
  restoreNode: (nodeId: string) => void;
  cloneScenario: () => void;
  markAssetResolved: (monName: string, type: AssetType) => void;
  markAssetWaiting: (monName: string, type: AssetType) => void;
  resetAll: () => void;

  /* --- §21.3 LA TECA --- */
  kept: KeptMon[];
  usedDevTime: boolean;
  /** Conserva il .mon attivo come ricordo. Torna `null` se non c'è nessuno. */
  keepActiveMon: (note?: string) => Promise<string | null>;
  /** Toglie un ricordo dalla teca, immagini comprese. */
  forgetKept: (id: string) => void;

  /* --- §21.4 LA STANZA --- */
  room: RoomPost[];
  /** Scrive il testo di un post. 🔒 Se è già scritto non fa niente. */
  writeRoom: (postId: string) => Promise<BackendFailure | null>;
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
  mood: null as MoodState | null,
  typingVisible: false,
  opinions: [] as Opinion[],
  lastReflectionDay: 0,
  voiceNotes: [] as VoiceNote[],
  lastNotebookDay: 0,
  saidUnprompted: [] as UnpromptedKind[],
  lastUnpromptedDay: 0,
  pendingHeritage: [] as HeritageOrigin[],
  pendingPlan: null as ContinuityPlan | null,
  lastTrace: null as GenerationTrace | null,
  batch: [] as BatchCandidate[],
  /* §21.2 — le pagine che il .mon scrive. Vivono nello stato perché devono
     stare nel salvataggio: una pagina che sparisce svuotando la cache di
     Safari sarebbe peggio di non averla mai avuta. */
  pages: [] as Page[],
  reminders: [] as Reminder[],
  /* Solo per il pannello DEV: quali strumenti ha usato l'ultima risposta.
     Non è stato di prodotto e non deve finire nei salvataggi. */
  lastToolUses: [] as string[],
  dev: {
    enabled: false,
    forceContinue: false,
    forceBranch: false,
    unlockAll: false,
    /* §20.1 — soglie di rarità tarate a mano. `null` = quelle del config.
       Vive nello stato per sopravvivere a un ricaricamento: si tara in più
       sedute, non in una. */
    rarityThresholds: null as RarityThresholds | null,
  },
  bias: DEFAULT_BIAS,
  token: null as string | null,
  /* §21.3 — i .mon conservati. NON stanno in INITIAL per caso: `resetAll` li
     rimette a mano proprio perché devono sopravvivere a ricominciare. */
  kept: [] as KeptMon[],
  /* §21.4 — il filo della stanza. I post nascono da eventi veri e restano
     senza testo finché non lo chiedi: niente si genera da solo. */
  room: [] as RoomPost[],
  /* Vero appena il pannello DEV fa saltare del tempo. Serve a marcare i .mon
     conservati: una creatura nata da giorni saltati non è nata dai tuoi dati,
     e la teca deve dirlo invece di lasciartelo indovinare. */
  usedDevTime: false,
  /* ⚠️ QUANDO HAI RICOMINCIATO DA CAPO L'ULTIMA VOLTA.

     Serve a una cosa sola, ma indispensabile: impedire che una partita
     cancellata torni indietro dal server. La regola di conflitto sceglie la
     copia più avanti nel GIORNO di gioco (vedi `syncWithServer`), e dopo un
     reset la copia locale è al giorno 1 mentre quella sul server è al
     quaranta. Senza questo timestamp il server rivincerebbe sempre, e il
     reset verrebbe annullato in silenzio al ricaricamento successivo.

     `null` finché non hai mai ricominciato. */
  resetAt: null as string | null,
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
/**
 * 🔷 v1.12 §10.6 — applica una sequenza di eventi all'umore corrente.
 *
 * Prima riporta l'umore al giorno di oggi (il decadimento verso la base è
 * dovuto anche se non è stato aperto niente per una settimana), poi applica
 * gli eventi in ordine. Gli `null` si saltano: chi chiama passa spesso un
 * evento condizionale, ed è più leggibile lì che qui.
 *
 * Se non c'è ancora un .mon, non c'è umore: `null` resta `null`. L'uovo non
 * ha stati d'animo — ha suoni, che è un'altra cosa (§7.2).
 *
 * ⚠️ Se invece un .mon c'è ma l'umore no, l'umore NASCE QUI. È il caso di una
 * partita salvata prima che questa funzione esistesse: senza questa riga
 * resterebbe senza umore per sempre, e l'unica persona che ha una partita in
 * corso è quella per cui stiamo costruendo l'app. Vale più di una migrazione.
 */
function touchMood(
  s: AppState,
  moodPrimary: string,
  events: (MoodEvent | null)[],
): MoodState | null {
  if (!s.mood && !s.activeMonName) return null;
  let mood = s.mood
    ? decayMood(s.mood, moodPrimary, s.day)
    : initialMood(moodPrimary, s.day);
  for (const e of events) {
    if (e) mood = applyMoodEvent(mood, e, moodPrimary, s.day);
  }
  return mood;
}

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
        /* 🔒 Da qui in poi la partita non è più fatta di giorni veri. Il flag
           non serve a niente durante il gioco: serve fra un anno, quando
           guarderai un .mon nella teca e vorrai sapere se è nato dai tuoi dati
           o da sette giorni saltati in due secondi. */
        markAccelerated(set, get);
        for (let i = 0; i < n; i++) advanceOneDay(set, get);
      },

      simulateSyncedDays: (n) => {
        markAccelerated(set, get);
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
        markAccelerated(set, get);
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
          hiddenEvent: hiddenEventFor({
            day: s.day,
            formNumber: 1,
            activeDays: s.progression.sync.lifetime,
          }),
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
          chat: [openingMessage(record, s.day, s.token !== null)],
          // §10.6 — nasce sul punto di riposo del suo temperamento, e la
          // nascita stessa e il primo evento: tono e carica su, appiglio
          // GIU. Uno appena arrivato non e sicuro di stare qui.
          mood: applyMoodEvent(
            initialMood(record.data.mood_primary, s.day),
            'NATO',
            record.data.mood_primary,
            s.day,
          ),
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
          mood: touchMood(s, record.data.mood_primary, ['EVOLUTO']),
          // §16.3 — passa solo quello che era radicato, e con un grado di
          // certezza in meno. La forma nuova non è la vecchia con più roba
          // addosso: ha dimenticato qualcosa, ed è quello che la rende nuova.
          opinions: inheritOpinions(s.opinions, record.data.name),
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
          hiddenEvent: hiddenEventFor({
            day: s.day,
            formNumber: s.nodes.length + 1,
            activeDays: s.progression.sync.lifetime,
          }),
        });

        /* 🔒 §21.4 — NEL DEX NON NASCE NIENTE, SI ARRIVA.
           La forma che smette di essere attiva entra nella stanza, e gli altri
           la accolgono. Separato dal commento sulla faccia nuova di VINZ:
           sono due cose diverse, una guarda dentro e una guarda fuori. */
        const arrived = arrivalPosts(
          previous,
          record.data,
          { residents: Object.values(s.mons), active: record.data.name },
          s.day,
        );

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
          room: [...s.room, ...arrived],
          chat: [...s.chat, openingMessage(record, s.day, s.token !== null)].slice(-60),
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
        /* 🔷 v1.12 §17.4 — LA BOLLA NASCE VUOTA.
           Prima nasceva con la frase deterministica dentro, e quando arrivava
           la voce vera quella frase VENIVA SOSTITUITA: stavi leggendo e il
           testo cambiava sotto gli occhi. Non è un compagno che ci ripensa, è
           una macchina che si corregge, ed era la cosa più finta dell'app.

           Adesso: se c'è una chiave la bolla resta vuota con i puntini, e il
           fallback entra SOLO se la voce vera non arriva — quando non hai
           ancora letto niente e non c'è niente da sostituire. Se la chiave non
           c'è, il fallback è la risposta e compare col ritmo della creatura,
           che è la stessa esperienza meno la qualità del testo. */
        const spoken = fallbackReply(rng, rec.data.mood_primary, rec.data.voice_dna, rec.data.role);
        const waiting = s.token !== null;
        const theirs: ChatMessage = {
          id: `msg_${s.chat.length}_m`,
          from: 'mon',
          text: '',
          day: s.day,
          fallback: !waiting,
          pending: true,
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
          // §10.6 — due eventi, in quest'ordine. Prima che ti sei fatto
          // sentire, che vale sempre; poi, se hai detto come stai, la
          // confidenza. Se non l'hai detto, il secondo semplicemente non c'è.
          mood: touchMood(s, rec.data.mood_primary, [
            'PARLATO',
            moodEventFromInputs(found.moods),
          ]),
        });

        if (waiting) {
          requestReply(set, get, rec, theirs.id);
        } else {
          // Nessuna chiamata da aspettare: si va dritti alla comparsa.
          const rhythm = typingRhythmFor(rec.data.voice_dna);
          playReveal(set, get, theirs.id, spoken, planReveal(spoken, rhythm), true);
        }
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
            // §10.6 — il cerchio si chiude, e lui lo sente. Nota bene COSA
            // muove l'umore qui: che la giornata sia stata chiusa insieme,
            // non che sia andata bene. Un giorno storto ma chiuso vale
            // esattamente come uno perfetto.
            mood: touchMood(s, activeRecord(s)?.data.mood_primary ?? 'CALM', ['GIORNO_CHIUSO']),
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

      /* §22 — l'unico punto in cui un aggiustamento diventa attivo. Non c'è
         un percorso in cui il .mon se lo applichi da solo, e non deve
         esserci: è tutta la differenza fra proporre e decidere. */
      decideVoiceNote: (id, accept) =>
        set((s) => ({ voiceNotes: decideNote(s.voiceNotes, id, accept) })),

      setDev: (patch) => set((s) => ({ dev: { ...s.dev, ...patch } })),
      setToken: (value) =>
        set({ token: value && value.trim().length > 0 ? value.trim() : null }),
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

      pinPage: (slug, pinned) =>
        set((s) => ({ pages: s.pages.map((p) => (p.slug === slug ? { ...p, pinned } : p)) })),

      removePage: (slug) => set((s) => ({ pages: s.pages.filter((p) => p.slug !== slug) })),

      /* ============================================================================
         §21 — GLI STRUMENTI, CON I DATI VERI DAVANTI

         🔒 Il contesto si costruisce QUI e non dentro `tools.ts` perché è
         l'unico posto che ha lo stato. `tools.ts` resta una funzione pura di
         quello che gli passi, e per questo si può provare senza montare l'app —
         che è l'unico modo di verificare gli strumenti finché le chiavi non ci
         sono.
         ========================================================================= */
      runMonTool: (use) => {
        const s = get();
        const rec = activeRecord(s);

        const ctx: ToolContext = {
          day: s.day,
          health: s.health,
          protocol: s.protocol,
          days: s.days,
          memories: s.memories,
          pages: s.pages,
          monName: rec?.data.name ?? null,

          writePage: (input) => {
            const { pages, outcome } = addPage(get().pages, input, {
              day: get().day,
              monName: rec?.data.name ?? null,
            });
            if (outcome.ok) set({ pages });
            return outcome;
          },

          updatePage: (slug, heading, body) => {
            const { pages, outcome } = editPage(get().pages, slug, heading, body, get().day);
            if (outcome.ok) set({ pages });
            return outcome;
          },

          remember: (text, inDays, everyDays) => {
            const { reminders, outcome } = addReminder(
              get().reminders,
              text,
              inDays,
              everyDays,
              get().day,
            );
            if (outcome.ok) set({ reminders });
            return outcome;
          },
        };

        return runTool(use, ctx);
      },

      /* ============================================================================
         §20.1 DEV → RARITÀ — il campione su cui si tara.

         🔒 NON scrive niente. Le creature generate qui non nascono, non entrano
         nella Mindline e non consumano nomi: esistono il tempo di dire che
         punteggio avrebbero preso. Serve per rispondere alla domanda «con queste
         soglie, quanto esce SINGULAR?» senza aspettare tre anni di partita.

         Parte dallo stato VERO — i tuoi dati, il tuo bond, la tua profondità —
         perché una taratura fatta su un giocatore inventato non dice niente su
         come andrà a te. */
      /* La taratura vive in due posti e deve restare coerente: nel modulo, che
         è quello che il motore legge, e nello stato, che è quello che
         sopravvive al ricaricamento. Passare da qui è l'unico modo di
         scriverla — così non possono divergere. */
      tuneRarity: (next) => {
        if (next === null) {
          resetRarityThresholds();
          set((s) => ({ dev: { ...s.dev, rarityThresholds: null } }));
          return [];
        }

        const problems = setRarityThresholds(next);
        if (problems.length === 0) {
          set((s) => ({ dev: { ...s.dev, rarityThresholds: { ...next } } }));
        }
        return problems;
      },

      sampleRarity: (n) => {
        const s = get();
        const previous = activeRecord(s);
        const input = generatorInput(s);
        const scores: number[] = [];
        const rarities: string[] = [];

        for (let i = 0; i < n; i++) {
          const seed = randomSeed();
          const { record } = previous
            ? generateMon({
                input,
                mindlineNodeId: `sample_${i}`,
                originNodeId: previous.data.mindline_node,
                heritageOrigins: selectHeritageOrigins(makeRng(seed ^ 0x5bf03635), previous),
                lineageNames: [],
                previous,
                seed,
                devUnlockAll: s.dev.unlockAll,
                hiddenEvent: false,
              })
            : generateFirstMon({
                input,
                mindlineNodeId: `sample_${i}`,
                originNodeId: null,
                lineageNames: [],
                seed,
                devUnlockAll: s.dev.unlockAll,
                hiddenEvent: false,
              });

          scores.push(record.data.rarity_score);
          rarities.push(record.data.rarity);
        }

        return { scores, rarities };
      },

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
          chat: [openingMessage(record, s.day, s.token !== null)],
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
          chat: [openingMessage(rec, s.day, s.token !== null)],
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

      /* ============================================================================
         §21.3 — CONSERVARE UN .MON

         Copia il record E le immagini in uno spazio che nessun reset tocca.
         Il record si copia in profondità: se restasse un riferimento a quello
         vivo, un'evoluzione futura riscriverebbe il ricordo — e un ricordo che
         cambia da solo non è un ricordo.
         ========================================================================= */
      keepActiveMon: async (note) => {
        const s = get();
        const rec = activeRecord(s);
        if (!rec) return null;

        const already = s.kept.find((k) => k.record.data.name === rec.data.name);
        const assetName = await keepAssetsOf(rec.data.name);

        const entry: KeptMon = {
          id: already?.id ?? `kept_${Date.now()}_${rec.data.name}`,
          record: structuredClone(rec),
          assetName,
          keptAt: new Date().toISOString(),
          day: s.day,
          fromAcceleratedRun: s.usedDevTime,
          note: note?.trim() ? note.trim() : (already?.note ?? null),
        };

        set({
          kept: already
            ? s.kept.map((k) => (k.id === already.id ? entry : k))
            : [...s.kept, entry],
        });

        return entry.id;
      },

      /* ============================================================================
         §21.4 — SCRIVERE UN POST

         🔒 Se il testo c'è già non si tocca. Una cosa che cambia a ogni
         rilettura non è un ricordo, ed è la stessa regola che vale per le
         memorie e per i .mon già nati.
         ========================================================================= */
      writeRoom: async (postId) => {
        const s = get();
        const post = s.room.find((p) => p.id === postId);
        if (!post || post.text !== null) return null;

        const author = s.mons[post.from] ?? s.kept.find((k) => k.record.data.name === post.from)?.record;
        if (!author) return 'error';

        const voices = post.voices
          .map((n) => s.mons[n] ?? s.kept.find((k) => k.record.data.name === n)?.record)
          .filter((r): r is MonRecord => Boolean(r));

        const { writeRoomPost } = await import('../ai/roomVoice');
        const { post: written, failure } = await writeRoomPost(s.token, post, author, voices);
        if (!written) return failure ?? 'error';

        set({
          room: get().room.map((p) =>
            p.id === postId ? { ...p, text: written.text, comments: written.comments } : p,
          ),
        });
        return null;
      },

      forgetKept: (id) => {
        const entry = get().kept.find((k) => k.id === id);
        if (!entry) return;
        void dropKeptAssets(entry.assetName);
        set({ kept: get().kept.filter((k) => k.id !== id) });
      },

      resetAll: () =>
        set({
          ...INITIAL,
          startedAt: new Date().toISOString(),
          /* 🔒 Il momento del reset viene PRIMA di qualunque salvataggio nuovo,
             quindi qualsiasi copia sul server scritta prima di adesso è di una
             partita che hai buttato via. */
          resetAt: new Date().toISOString(),
          health: initialHealthState(),
          personality: neutralPersonality(),
          scanAnswers: {},
          dev: get().dev,
          // Ricominciare la partita non è motivo per far reincollare la chiave.
          token: get().token,
          /* 🔒 LA TECA SOPRAVVIVE. È l'unica cosa che deve: ricominciare
             cancella la partita, non i ricordi che avevi deciso di tenere. */
          kept: get().kept,
        }),
    }),
    {
      // 🔶 Chiave NUOVA, non un bump di `version`. Il modello di progressione è
      // cambiato in modo incompatibile — `progression` non ha più `xp`, `level`
      // né `evolutionSync` — e una partita salvata con la forma vecchia
      // manderebbe in errore la prima schermata che legge `sync.lifetime`.
      // Cambiare chiave fa ripartire da capo invece di rompersi, che per un
      // prototipo è il comportamento onesto.
      /* 🔷 v1.13 — chiave NUOVA. Nel salvataggio precedente il campo conteneva
         una chiave del fornitore, e riusarla come token del backend
         significherebbe mandare una chiave Anthropic all'header di
         autorizzazione delle proprie funzioni: non funzionerebbe, e lo farebbe
         in modo confuso. Ripartire da zero costringe a incollare il token
         giusto una volta, che è il comportamento onesto. */
      name: 'vinzmon.prototype.v4',
      version: 3,
      partialize: (s) => {
        const { batch: _batch, lastToolUses: _tools, ...rest } = s;
        return rest as AppState;
      },
      /* 🔒 Il modulo di taratura è la sorgente che il motore legge, e allo
         start non sa niente. Senza questa riga una taratura salvata resterebbe
         visibile nel pannello e non avrebbe alcun effetto sulle creature: il
         tipo di bug che si scopre dopo tre giorni di prove sbagliate. */
      onRehydrateStorage: () => (state) => {
        if (state?.dev.rarityThresholds) setRarityThresholds(state.dev.rarityThresholds);
      },
    },
  ),
);

/* ============================================================================
   🔷 v1.14 §13.10 — IL MESSAGGIO CHE ARRIVA DA SOLO

   Gira all'apertura dell'app e all'avanzare di un giorno. Non parte MAI da
   una chiamata AI: il testo è scritto a mano, il codice sceglie solo quale.

   Non è un risparmio, è una garanzia. Un messaggio spontaneo generato da un
   modello è un messaggio che può dire qualunque cosa, e questi arrivano
   quando non stai guardando lo schermo. Così invece non esiste un messaggio
   non previsto.
   ========================================================================= */

export function maybeSpeakFirst(): boolean {
  const s = useApp.getState();
  const rec = activeRecord(s);
  if (!rec || s.phase === 'incubation') return false;

  const spoke = s.chat.filter((m) => m.from === 'vinz');
  const lastSpokeDay = spoke.length > 0 ? spoke[spoke.length - 1]!.day : 0;

  /* ============================================================================
     §21.3 — UN PROMEMORIA BATTE UNA COSA SPONTANEA.

     🔒 E NON È UN SECONDO CANALE. Passa esattamente da qui, dallo stesso posto
     e con la stessa regola: una cosa al giorno. Se avesse un canale suo, un
     giorno con un promemoria e una cosa da dire diventerebbe due messaggi, e
     due messaggi non richiesti nello stesso giorno sono il punto in cui
     un'app comincia a essere una che rompe.

     Ha la precedenza perché gliel'hai chiesto TU: una cosa che hai chiesto
     vale più di una che gli è venuta in mente. */
  const due = dueReminder(s.reminders, s.day);
  if (due && s.lastUnpromptedDay !== s.day) {
    useApp.setState({
      chat: [
        ...s.chat,
        {
          id: `msg_rem_${due.id}_${s.day}`,
          from: 'mon' as const,
          text: due.text,
          day: s.day,
        },
      ].slice(-60),
      reminders: afterSaying(s.reminders, due.id, s.day),
      lastUnpromptedDay: s.day,
    });
    return true;
  }

  const message = unpromptedFor({
    day: s.day,
    today: s.days[s.day] ?? emptyDay(s.day),
    plannedRest: plannedFor(s.protocol.training, dateForDay(s.day, s.startedAt)) === 'REST',
    lastSpokeDay,
    daysToEvolution: Math.max(0, PROGRESSION.formEvolutionAt - s.progression.sync.inForm),
    opinions: s.opinions,
    alreadySaid: s.saidUnprompted,
    lastUnpromptedDay: s.lastUnpromptedDay,
  });

  if (!message) return false;

  /* Entra nella chat come una battuta qualsiasi, e questo è voluto: un
     messaggio spontaneo marcato «AUTOMATICO» smetterebbe di essere qualcuno
     che ti scrive e tornerebbe a essere una notifica. Non è `fallback`
     perché non è un ripiego: è esattamente quello che voleva dire. */
  useApp.setState({
    chat: [
      ...s.chat,
      {
        id: `msg_first_${s.day}_${message.kind}`,
        from: 'mon' as const,
        text: message.text,
        day: s.day,
      },
    ].slice(-60),
    saidUnprompted: [...s.saidUnprompted, message.kind],
    lastUnpromptedDay: s.day,
  });

  return true;
}

/* ============================================================================
   🔷 v1.14 §21.2 — QUELLO CHE LE SHORTCUT HANNO LASCIATO

   La porta `/api/ingest` esisteva già e nessuno la leggeva: i dati sarebbero
   arrivati sul server e sarebbero rimasti lì. Mezzo lavoro fatto è peggio di
   nessun lavoro, perché sembra finito.

   🔒 DUE REGOLE, E SONO LE STESSE DEI SENSORI E DELLE FOTO.

   • Può solo AGGIUNGERE un segnale sconosciuto. Se hai già dichiarato tu com'è
     andata quella giornata, un'automazione notturna non ha il diritto di
     correggerti — vale per la foto (§5.2), vale identico qui.

   • NON tocca mai l'UMORE, nemmeno se il payload lo contenesse. «The system
     should not silently fabricate subjective information such as Mood»: i
     passi non sanno come stai. Il server già scarta quel campo; questo è il
     secondo muro, e i due non sono ridondanti — uno protegge dal payload,
     l'altro dal codice che un giorno lo leggesse comunque.

   ⚠️ La soglia dei 3.000 passi non è una misura di salute ed è importante che
   non lo diventi: dice solo «questa giornata ha lasciato una traccia», cioè
   distingue un telefono acceso da uno rimasto sul comodino. Non entra nel
   giudizio su niente, e §28 vieta che ci entri.
   ========================================================================= */

const TRACE_STEPS = 3000;

export async function pullIngested(): Promise<number> {
  const s = useApp.getState();
  if (!s.token) return 0;

  const { loadIngested } = await import('../ai/backend');
  const { data, failure } = await loadIngested(s.token);
  if (failure || !data) return 0;

  /* Le date arrivano come `YYYY-MM-DD` e il gioco conta i giorni da 1. Il
     ponte è il giorno di oggi: l'ultima data ricevuta è il giorno corrente,
     quelle prima scalano indietro. È approssimativo e va bene — serve ad
     attribuire un dato al giorno giusto, non a datare la storia. */
  const today = new Date().toISOString().slice(0, 10);
  const dayOf = (date: string) => {
    const diff = Math.round(
      (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000,
    );
    return s.day - diff;
  };

  let days = s.days;
  let applied = 0;

  for (const incoming of data.days) {
    const day = dayOf(incoming.date);
    if (day < 1 || day > s.day) continue;

    const record = days[day] ?? emptyDay(day);

    /* 🔒 Solo se non lo sai già. `UNKNOWN` è l'unico stato che
       un'automazione ha il diritto di riempire. */
    const workoutUnknown = (record.signals.WORKOUT?.status ?? 'UNKNOWN') === 'UNKNOWN';
    if (workoutUnknown && typeof incoming.workoutMinutes === 'number') {
      days = withSignal(
        days,
        day,
        'WORKOUT',
        incoming.workoutMinutes > 0 ? 'KNOWN' : 'NOT_APPLICABLE',
        incoming.workoutMinutes > 0
          ? `${incoming.workoutMinutes} min, dal telefono`
          : 'nessun allenamento rilevato',
      );
      applied++;
    }

    const foodUnknown = (record.signals.FOOD?.status ?? 'UNKNOWN') === 'UNKNOWN';
    const note = incoming.notes[incoming.notes.length - 1];
    if (foodUnknown && note) {
      days = withSignal(days, day, 'FOOD', 'KNOWN', `dalle scorciatoie: ${note}`);
      applied++;
    }

    /* I passi non riempiono nessun segnale: non sono cibo, non sono
       allenamento, e non sono un giudizio. Restano come traccia che quella
       giornata è esistita, e servono solo dove una giornata vuota andrebbe
       altrimenti persa. */
    if (workoutUnknown && !incoming.workoutMinutes && (incoming.steps ?? 0) > TRACE_STEPS) {
      days = withSignal(days, day, 'WORKOUT', 'NOT_APPLICABLE', 'giornata in movimento, senza allenamento');
      applied++;
    }
  }

  if (applied > 0) useApp.setState({ days });
  return applied;
}

/* ============================================================================
   🔷 v1.13 §20 — IL SALVATAGGIO SUL SERVER

   Il browser resta la copia di lavoro: senza rete l'app deve funzionare
   uguale, e un'app che si blocca perché non riesce a salvare è peggio di una
   che non salva. Il server è la copia che SOPRAVVIVE al telefono.

   ⚠️ CHI VINCE QUANDO LE DUE DIFFERISCONO: la più avanti nel GIORNO DI GIOCO,
   non la più recente nell'orologio. L'orologio di un telefono può essere
   sbagliato, e un salvataggio vecchio con l'ora avanti cancellerebbe
   settimane. Il giorno di gioco invece cresce solo giocando: «più avanti»
   significa davvero «contiene più storia». Il server applica la stessa regola
   e rifiuta un PUT che tornerebbe indietro.

   🔒 IL TOKEN NON VIENE MAI SALVATO. È una credenziale, non stato di gioco:
   metterla nel blob significherebbe conservarla in un secondo posto senza
   guadagnarci niente — al ritorno la si reincolla, e nel frattempo il
   salvataggio resta una cosa che non fa danni se qualcuno lo legge.
   ========================================================================= */

/** Attesa prima di salvare: si scrive quando ti fermi, non a ogni tasto. */
const SAVE_DEBOUNCE_MS = 4000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSavedSignature = '';

/** Lo stato da mandare: tutto tranne le cose che non hanno senso altrove. */
function snapshotFor(state: AppState): unknown {
  const {
    token: _token,
    batch: _batch,
    lastTrace: _trace,
    ...rest
  } = state as AppState & Record<string, unknown>;
  return rest;
}

function scheduleRemoteSave(): void {
  const s = useApp.getState();
  if (!s.token) return;

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const now = useApp.getState();
    if (!now.token) return;

    const snapshot = snapshotFor(now);
    const signature = JSON.stringify(snapshot);
    /* Niente da salvare: succede spesso, perché zustand notifica anche
       cambiamenti che non toccano niente di persistito (l'indicatore «sta
       scrivendo», per dire, cambia decine di volte per messaggio). */
    if (signature === lastSavedSignature) return;

    void import('../ai/backend').then(async ({ saveRemote }) => {
      const { failure } = await saveRemote(now.token, now.day, snapshot);
      if (!failure) {
        lastSavedSignature = signature;
        return;
      }
      /* Un salvataggio fallito non si annuncia e non si ritenta a raffica: la
         copia locale c'è, e il prossimo cambiamento riproverà da solo. Se la
         rete è giù, insistere non la riaccende. */
      console.warn('[sync] salvataggio non riuscito:', failure);
    });
  }, SAVE_DEBOUNCE_MS);
}

useApp.subscribe(scheduleRemoteSave);

/* ============================================================================
   CHI VINCE FRA IL TELEFONO E IL SERVER

   Funzione pura, e separata apposta: è la decisione che può far sparire mesi
   di storia, quindi deve essere leggibile in dieci righe e verificabile senza
   una rete finta.
   ========================================================================= */

export interface LocalSave {
  day: number;
  /** Quando hai ricominciato da capo, o `null`. */
  resetAt: string | null;
}

export interface ServerSave {
  day: number;
  savedAt: string | null;
}

/**
 * Vero se la copia del server va scaricata sopra quella locale.
 *
 * ⚠️ UN RESET NON SI PUÒ ANNULLARE DAL SERVER.
 *
 * La regola normale è «vince chi è più avanti nel GIORNO di gioco», ed è
 * giusta: protegge da un orologio del telefono sbagliato, che l'ora reale non
 * fa. Ma dopo che hai ricominciato da capo diventa esattamente la regola
 * sbagliata — la partita buttata via è al giorno 40, quella nuova al giorno 1,
 * e il server rivincerebbe. Il reset verrebbe annullato in silenzio al
 * ricaricamento successivo, e nessun errore lo direbbe.
 *
 * Quindi: un salvataggio scritto PRIMA del reset appartiene a una partita che
 * non esiste più. Non si scarica, e il primo salvataggio della partita nuova
 * ci scrive sopra.
 */
export function shouldDownload(local: LocalSave, server: ServerSave): boolean {
  if (local.resetAt && server.savedAt && server.savedAt <= local.resetAt) return false;
  return server.day > local.day;
}

/**
 * All'avvio: si guarda cosa c'è sul server e si tiene la storia più lunga.
 *
 * Va chiamata DOPO che zustand ha reidratato dal `localStorage`, altrimenti
 * confronterebbe il server con uno stato vuoto e scaricherebbe sempre.
 */
export async function syncWithServer(): Promise<'locale' | 'scaricato' | 'niente'> {
  const local = useApp.getState();
  if (!local.token) return 'niente';

  const { loadRemote } = await import('../ai/backend');
  const { data, failure } = await loadRemote(local.token);
  if (failure || !data || data.state == null) return 'niente';

  if (!shouldDownload({ day: local.day, resetAt: local.resetAt }, data)) return 'locale';

  /* Il server ha più storia: quella locale era indietro (telefono nuovo,
     dati del browser cancellati, o semplicemente un altro dispositivo). Il
     token NON si sovrascrive: è di questo browser, non del salvataggio. */
  useApp.setState({ ...(data.state as Partial<AppState>), token: local.token });
  lastSavedSignature = JSON.stringify(snapshotFor(useApp.getState()));
  return 'scaricato';
}

/* ============================================================================
   §21.4 — IL GIRO SETTIMANALE

   🔒 Nessun ciclo e nessun tick: questa gira SOLO quando avanza un giorno, che
   è già una cosa che succede. Non c'è niente acceso mentre l'app è chiusa.

   E i post nascono senza testo. Il testo lo chiedi tu, se ti va — vedi
   `writeRoom`.
   ========================================================================= */
function maybeWeeklyRound(set: (p: Partial<AppState>) => void, get: () => AppState): void {
  const s = get();
  if (s.day % WEEKLY_EVERY !== 0) return;

  // Serve qualcuno nella stanza: la forma attiva non partecipa.
  const residents = Object.values(s.mons).filter((r) => r.data.name !== s.activeMonName);
  if (residents.length === 0) return;

  // Già fatto per questo giorno? Non se ne fanno due.
  if (s.room.some((p) => p.kind === 'SETTIMANA' && p.day === s.day)) return;

  const from = Math.max(1, s.day - WEEKLY_EVERY + 1);
  let closed = 0;
  for (let d = from; d <= s.day; d++) if (s.days[d]?.status === 'SYNCED') closed += 1;

  const moved = STAT_KEYS.map((k) => ({ key: k, delta: trend(s.health, k, WEEKLY_EVERY) }))
    .filter((m): m is { key: StatKey; delta: number } => isKnown(m.delta))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] ?? null;

  const said =
    [...s.chat].reverse().find((m) => m.from === 'vinz' && m.day >= from)?.text ?? null;

  const posts = weeklyPosts(
    { residents, active: s.activeMonName },
    s.day,
    weekFacts({ day: s.day, closed, moved, said: said ? said.slice(0, 120) : null }),
  );

  if (posts.length > 0) set({ room: [...s.room, ...posts] });
}

/** Segna che questa partita ha saltato del tempo dal pannello DEV. */
function markAccelerated(set: (p: Partial<AppState>) => void, get: () => AppState): void {
  if (!get().usedDevTime) set({ usedDevTime: true });
}

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

  /* §10.6 — un giorno passato. Se in quel giorno non ti sei fatto sentire, è
     SILENZIO; altrimenti il tempo passa e basta, e l'umore scivola verso la
     sua base da solo.

     ⚠️ `touchMood` legge `s.day`, che qui è ancora IERI: gli si passa quindi
     lo stato con il giorno nuovo, altrimenti il decadimento conterebbe un
     giorno in meno a ogni avanzamento e l'umore resterebbe appiccicato. */
  const spoke = s.chat.some((m) => m.from === 'vinz' && m.day === s.day);
  const mood = touchMood({ ...s, day }, rec.data.mood_primary, [spoke ? null : 'SILENZIO']);

  set({
    day,
    health,
    days,
    memories,
    mood,
    // Nessun SYNC qui: il giorno lo chiude l'utente, non il passare del tempo.
    progression: {
      ...s.progression,
      bond: Math.min(1, s.progression.bond + (input.logged ? 0.012 : 0)),
    },
  });

  applyPlannedRest(set, get);
  maybeReflect(set, get);
  maybeReview(set, get);
  maybeWeeklyRound(set, get);
  maybeSpeakFirst();
}

/* ============================================================================
   🔷 v1.12 §16.2 — LA RIFLESSIONE SETTIMANALE

   È l'unica chiamata AI che parte da sola, senza che tu abbia scritto niente.
   Per questo ha tre freni, e nessuno dei tre è di troppo:

   • una a settimana, mai di più — una creatura che rivede le proprie
     convinzioni ogni ora non ha convinzioni, ha umori;
   • solo dopo la schiusa — l'uovo non ha niente da rileggere;
   • solo se la settimana contiene qualcosa (il controllo è dentro
     `reflectOnWeek`, prima della chiamata: costa zero e risparmia la
     richiesta invece di chiedere a un modello di rifiutarsi).

   Non blocca e non riporta niente in interfaccia. Se va male, la settimana
   passa senza che se ne accorga nessuno — che è quello che succede anche alle
   persone quando una settimana non insegna niente.
   ========================================================================= */

const REFLECTION_EVERY = 7;

function maybeReflect(set: (p: Partial<AppState>) => void, get: () => AppState): void {
  const s = get();
  const record = activeRecord(s);
  if (!record || !s.token) return;
  if (s.day - s.lastReflectionDay < REFLECTION_EVERY) return;

  /* Si segna PRIMA della chiamata, non dopo. Se si segnasse dopo, due
     avanzamenti rapidi — «+7 GIORNI» premuto due volte — ne farebbero partire
     due in parallelo sulla stessa settimana. */
  set({ lastReflectionDay: s.day });

  void import('../ai/reflect')
    .then((m) => m.reflectOnWeek(s.token, record, s.memories, s.opinions, s.day))
    .then(({ formed, contradicted }) => {
      if (formed.length === 0 && contradicted.length === 0) return;

      const now = get();
      let opinions = now.opinions;
      for (const id of contradicted) opinions = contradictOpinion(opinions, id);
      for (const o of formed) opinions = addOpinion(opinions, o);
      set({ opinions });
    });
}

/* ============================================================================
   🔷 v1.14 §22 — LA REVISIONE MENSILE

   Stessa forma della riflessione settimanale, con una differenza che è tutta
   la differenza: la riflessione CAMBIA quello che il .mon pensa di te e lo fa
   da sola; questa propone di cambiare COME PARLA, e non applica niente.

   Il giorno si segna prima della chiamata, come per la riflessione: due
   avanzamenti rapidi ne farebbero partire due sullo stesso mese.
   ========================================================================= */

const REVIEW_EVERY = 30;

function maybeReview(set: (p: Partial<AppState>) => void, get: () => AppState): void {
  const s = get();
  if (!activeRecord(s) || !s.token) return;
  if (s.day - s.lastNotebookDay < REVIEW_EVERY) return;

  const evidence = gatherEvidence(s.chat, s.opinions);
  /* Un mese con quattro messaggi non ha niente da insegnare a nessuno. Il
     controllo è deterministico e sta prima della chiamata: costa zero. */
  if (!worthReviewing(evidence)) return;

  set({ lastNotebookDay: s.day });

  void import('../ai/notebook')
    .then((m) => m.reviewVoice(s.token, evidence, s.voiceNotes, s.day))
    .then(({ note }) => {
      if (!note) return;
      set({ voiceNotes: addNote(get().voiceNotes, note) });
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

/* ============================================================================
   🔷 v1.12 §17.4 — L'ESECUTORE DELLA COMPARSA

   Il piano lo calcola `engine/reveal.ts`, che è puro e verificato da riga di
   comando. Qui non c'è nessuna decisione: si rispettano degli orari.

   ⚠️ NIENTE STREAMING, ed è una scelta, non una mancanza.

   Lo streaming serve quando la risposta è lunga e l'attesa della fine sarebbe
   insopportabile. Qui una risposta sono due frasi — una sessantina di token —
   e con il ragionamento spento arriva in un paio di secondi, cioè dentro la
   pausa di pensiero che il .mon si prende comunque. Lo streaming
   guadagnerebbe quasi niente e costerebbe la parte più preziosa: un piano che
   si può calcolare tutto insieme è un piano che si può CONTROLLARE tutto
   insieme, e infatti lo si controlla.

   Se un giorno le risposte diventassero lunghe — un racconto, un riepilogo
   della settimana — la scelta va rifatta, e questo commento è il posto dove
   scoprire perché era stata presa così.
   ========================================================================= */

/** I timer in volo. Un nuovo messaggio annulla la comparsa del precedente. */
let revealTimers: ReturnType<typeof setTimeout>[] = [];

function stopReveal(): void {
  revealTimers.forEach(clearTimeout);
  revealTimers = [];
}

/**
 * Fa comparire `text` nella bolla `messageId` secondo il ritmo della creatura.
 *
 * La seconda bolla — quella di chi prima reagisce e poi argomenta — viene
 * creata solo quando arriva il suo primo passo: una bolla vuota che aspetta
 * in fondo alla chat non è una pausa, è un difetto.
 */
function playReveal(
  set: (p: Partial<AppState>) => void,
  get: () => AppState,
  messageId: string,
  text: string,
  plan: RevealPlan,
  fallback: boolean,
): void {
  stopReveal();

  const secondId = `${messageId}_2`;
  const patch = (id: string, fields: Partial<ChatMessage>) => {
    const s = get();
    const index = s.chat.findIndex((m) => m.id === id);
    if (index === -1) return;
    const chat = [...s.chat];
    chat[index] = { ...chat[index]!, ...fields };
    set({ chat });
  };

  set({ typingVisible: true });

  if (plan.hesitation) {
    revealTimers.push(setTimeout(() => set({ typingVisible: false }), plan.hesitation.from));
    revealTimers.push(setTimeout(() => set({ typingVisible: true }), plan.hesitation.to));
  }

  for (const step of plan.steps) {
    revealTimers.push(
      setTimeout(() => {
        if (step.bubble === 0) {
          patch(messageId, { text: step.text, fallback, pending: true });
          return;
        }

        const s = get();
        if (!s.chat.some((m) => m.id === secondId)) {
          const source = s.chat.find((m) => m.id === messageId);
          if (!source) return;
          set({
            chat: [
              ...s.chat,
              { ...source, id: secondId, text: step.text, pending: true },
            ].slice(-60),
          });
          return;
        }
        patch(secondId, { text: step.text });
      }, step.at),
    );
  }

  revealTimers.push(
    setTimeout(() => {
      patch(messageId, { pending: false });
      patch(secondId, { pending: false });
      set({ typingVisible: false });
    }, plan.endsAt + 40),
  );

  /* Il testo intero è già deciso: se qualcosa andasse storto nei timer — la
     scheda in background, il browser che rallenta — la bolla non deve restare
     a metà per sempre. Questa è la rete, non il percorso normale. */
  revealTimers.push(
    setTimeout(() => {
      const s = get();
      const shown = s.chat.find((m) => m.id === messageId);
      if (shown?.pending) {
        patch(messageId, { text, pending: false, fallback });
        set({ typingVisible: false });
      }
    }, plan.endsAt + 4000),
  );
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
  const token = get().token;
  if (!token) return;

  const id = `msg_open_${record.data.name}`;

  // L'SDK arriva solo a chi ha una chiave: import dinamico, chunk separato.
  void import('../ai/client')
    .then((m) => m.generateIntroduction(token, record, get().mood, get().voiceNotes))
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
  const token = s0.token;
  if (!token) return;

  // Cosa il sistema ha già capito da solo: serve al modello per non richiedere
  // una cosa appena letta, non per farlo ringraziare.
  const mine = s0.chat.find((m) => m.id === messageId.replace(/_m$/, '_v'));
  const context =
    mine?.extracted && mine.extracted.length > 0
      ? `the system already recorded from this message: ${mine.extracted.join(', ')}`
      : null;
  const userText = mine?.text ?? '';

  /* Il fallback si prepara PRIMA della chiamata e resta da parte: serve solo
     se la voce vera non arriva. Preparandolo qui, il seme è quello del turno
     — la stessa creatura, nello stesso punto della conversazione, ripiega
     sempre sulla stessa frase invece che su una a caso. */
  const spoken = fallbackReply(
    makeRng(seedFromString(`reply:${record.data.name}:${messageId}`)),
    record.data.mood_primary,
    record.data.voice_dna,
    record.data.role,
  );
  const rhythm = typingRhythmFor(record.data.voice_dna);

  /* 🔷 v1.12 §15.2 — la memoria si compone ADESSO, non dentro il client: il
     client parla all'API e basta, e cosa il .mon si ricorda è una domanda di
     prodotto. La conversazione recente esclude il messaggio corrente e la
     bolla vuota che sta aspettando questa risposta — sono già altrove nella
     richiesta, e mandarli due volte gli farebbe leggere l'eco. */
  const opinions = opinionsBlock(s0.opinions);
  const memory = {
    /* Le opinioni stanno nello STESSO blocco della memoria, non in uno terzo:
       cambiano con la stessa lentezza — una volta a settimana — quindi
       condividono la stessa voce di cache. Un blocco in più sarebbe un punto
       di cache in più speso per niente (e sono quattro in tutto). */
    memory: [
      buildMemoryBlock({ memories: s0.memories, bio: record.bio, today: s0.day }),
      opinions,
    ]
      .filter((p) => p.length > 0)
      .join('\n\n'),
    turns: recentTurns(s0.chat.filter((m) => m.id !== messageId && m.id !== messageId.replace(/_m$/, '_v'))),
  };

  void import('../ai/client')
    .then((m) =>
      m.generateReply(
        token,
        record,
        userText,
        context,
        get().mood,
        memory,
        s0.voiceNotes,
        deservesThinking(userText, extractFromMessage(userText, s0.protocol.diet)),
        /* §21 — gli strumenti. `run` passa dallo store, così una pagina scritta
           dal modello entra nello stato vero e viene salvata come tutto il
           resto, invece di vivere in una variabile che sparisce. */
        {
          defs: TOOLS,
          run: (use) => get().runMonTool(use),
          webSearch: true,
          onUsed: (uses) => set({ lastToolUses: uses.map((u) => u.name) }),
        },
      ),
    )
    .then(({ result }) => {
      // La partita può essere andata avanti mentre il modello scriveva: se
      // quella bolla non c'è più, non si riscrive il passato.
      if (get().chat.findIndex((m) => m.id === messageId) === -1) return;

      const text = result ? result.text : spoken;
      playReveal(set, get, messageId, text, planReveal(text, rhythm), !result);
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
  const token = get().token;
  if (!token) return;

  void import('../ai/client')
    .then((m) => m.readPhotoSignals(token, dataUrl))
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
