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
  hiddenEventFor,
  knownSignals,
  nextEvent,
  planContinuity,
  type ContinuityAxis,
  type ContinuityPlan,
  type DailySignalKey,
  type DailySync,
  type SignalStatus,
} from '../engine/progression';
import { evolveMon, generateFirstMon, generateMon } from '../engine/characterGenerator';
import type { BackendFailure } from '../ai/backend';
import type { CreativeResolution } from '../assets-pipeline/resolver/vendor/types';
import { migratedStepModels, type VecchieScelte } from './migrateSteps';
import { formeGiaViste } from '../assets-pipeline/resolver/taste';
/* 🔒 IL CATALOGO SI IMPORTA, NON SI RICOPIA. `routing.ts` non ha un solo
   import: è dati puri, e il browser lo può leggere com'è. Una seconda copia
   dei nomi dei modelli in `src/` sarebbe la cosa che va fuori sincrono per
   prima, e lo farebbe in silenzio. */
import {
  AI_STEPS,
  modelForStep,
  recommendedPreset,
  type AiStepId,
} from '../../netlify/functions/_shared/routing';
import { assetTypeDef, generationOrder } from '../engine/assets';
import {
  RESET_SKIN,
  applySkin,
  cambia as cambiaSkin,
  describeSkin,
  type Skin,
} from '../engine/skin';
import {
  RESET_LAYOUT,
  applyLayout,
  describeLayout,
  mostra as mostraPezzo,
  sposta as spostaPezzo,
  type Layout,
} from '../engine/layout';
import { parseResolution } from '../assets-pipeline/resolver/parse';
import type { GenerationProgress } from '../assets-pipeline/generate';
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
import {
  addMeal,
  addWeight,
  addWorkout,
  configureHealthDisplay,
  configureHealthTargets,
  healthJournalReport,
  manageMeBlock,
  readHealthJournal,
  setDietPlan,
  setWorkoutPlan,
  updateLatestMeal,
  updateLatestWeight,
  updateLatestWorkout,
} from '../engine/healthJournal';
import {
  claimSyncReward,
  clearEvolutionWish,
  completeDayStreak,
  isCompleteHealthDay,
  readEvolutionWish,
  syncRewardProgress,
} from '../engine/syncRewards';
import { selectHeritageOrigins, type HeritageOrigin } from '../engine/heritage';
import { createNode, makeNodeId, nextChapter } from '../engine/mindline';
import { makeMemory, rollDailyEvent } from '../engine/simulation';
import { fallbackGreeting, fallbackReply } from '../engine/voiceDna';
import { buildPersonalityCard } from '../engine/voiceCard';
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
import {
  firstSyncResult,
  isSyncComplete,
  lensLine,
  seedFromSync,
  type FirstSyncResult,
  type SyncAnswers,
} from '../engine/firstSync';
import {
  emptyLedger,
  seedWorld,
  withCanon,
  worldBlock,
  promoteConnection,
  payOff,
  type CanonKind,
  type Epistemic,
  type StoryLedger,
  type World,
} from '../engine/world';
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
  Lesson,
  MindlineNode,
  MonRecord,
  Progression,
  Signal,
  StatKey,
} from '../engine/types';
import { STAT_KEYS, UNKNOWN, displayName, isKnown } from '../engine/types';
import { dropKeptAssets, keepAssetsOf, preloadMonAssets, restoreKeptAssets } from '../assets-pipeline/assetStore';

export type Phase =
  /**
   * 🔷 v4 §3 — FIRST SYNC, il test dei 16 tipi. È l'ingresso di chi arriva
   * adesso, e la prima cosa che l'app fa.
   */
  | 'first-sync'
  /**
   * 🔷 v4 §4 — le tre interpretazioni. Si vede Family + Affinità e nient'altro.
   */
  | 'egg-choice'
  /**
   * 🔶 §12 — il Signal Scan semina la personalità PRIMA che il tempo cominci.
   *
   * 🔒 RESTA PER I SALVATAGGI GIÀ COMINCIATI, non per chi arriva ora. È la
   * «smallest compatibility layer possible» che §1 del brief v4 chiede: chi
   * era a metà delle dodici domande le finisce, invece di trovarsi la partita
   * ricominciata da un test che non ha mai visto.
   */
  | 'scan'
  /**
   * 🔶 v1.10 §5.3 — la dieta e l'allenamento che segui. Senza questo, «hai
   * mangiato?» è l'unica domanda possibile sul cibo, e non è quella giusta.
   */
  | 'protocol'
  /**
   * 🔶 L'attesa dei sette giorni.
   *
   * 🔒 FUORI DAL PERCORSO NUOVO, VIVA PER QUELLO VECCHIO. §3.2 del brief v4:
   * «The old one-week incubation must not be preserved as user-facing
   * onboarding behavior. Legacy saves still need compatibility.» Chi ha
   * un'uovo a metà strada lo porta a termine; chi comincia oggi non passa
   * mai di qui.
   */
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

export type EvolutionKind = 'evolution' | 'mega-evolution';
const ANGEL_ARCHETYPES_BY_STAGE: readonly (readonly string[])[] = [
  ['PUTTO', 'MESSENGER', 'GUARDIAN'],
  ['WARRIOR', 'VIRTUE'],
  ['POWER', 'DOMINION'],
  ['CHERUB', 'THRONE'],
  ['SERAPH'],
];

function angelArchetypesForStage(stage: number): readonly string[] {
  return ANGEL_ARCHETYPES_BY_STAGE[Math.min(Math.max(0, stage), ANGEL_ARCHETYPES_BY_STAGE.length - 1)]!;
}

export interface EvolutionJob {
  kind: EvolutionKind | 'hatch';
  status: 'running' | 'ready' | 'error';
  previousName: string | null;
  candidateName: string;
  done: number;
  total: number;
  label: string;
  error: string | null;
  /** Identificativo persistente del lavoro Netlify: sopravvive alla chiusura. */
  serverJobId: string | null;
}

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
  /** Solo DEV: forza il temperamento di nascita dei prossimi MON. */
  forcedMood: string | null;
  /**
   * 🔷 IMMAGINI IN BOZZA — la leva che decide il conto.
   *
   * `gpt-image-2` accetta `quality`, e finora non gliela mandavamo: ogni
   * immagine usciva al default del fornitore, che è `medium`. A 1024×1024
   * `low` costa circa un nono. Le quattro immagini di una creatura fanno
   * ~$0,12 con la qualità dichiarata per asset e ~$0,024 tutte in bozza — su
   * una giornata di prove in cui la stessa creatura si rigenera dieci volte,
   * $1,20 contro 24 centesimi.
   *
   * ⚠️ SPENTA DI DEFAULT, ED È GIUSTO COSÌ. L'immagine che l'utente TIENE
   * deve restare quella buona. Questo interruttore serve a rispondere alla
   * domanda «la pipeline funziona e la creatura somiglia a quello che
   * volevo?», che non richiede la qualità piena — e la documentazione di
   * OpenAI consiglia esattamente questo per le prove.
   */
  draftImages: boolean;
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
   * 🔷 v4 §3 — le risposte del FIRST SYNC, il test dei 16 tipi.
   *
   * ⚠️ ACCANTO A `scanAnswers`, NON AL SUO POSTO. Sono due onboarding diversi
   * e un salvataggio ha fatto l'uno o l'altro: sovrascrivere il campo vecchio
   * vorrebbe dire che chi aveva già giocato si ritrova con risposte che non
   * ha mai dato. §17 del brief: «Keep existing saves readable; new narrative
   * fields are additive.»
   */
  syncAnswers: SyncAnswers;
  /** Il tipo risolto, `null` finché il First Sync non è chiuso. */
  firstSync: FirstSyncResult | null;
  /**
   * 🔷 v4 §4 — le tre interpretazioni fra cui scegliere, generate insieme.
   *
   * 🔒 SONO CREATURE VERE, GIÀ GENERATE. Non tre etichette che diventano un
   * .mon dopo la scelta: tre `MonRecord` completi, di cui se ne mostrano due
   * campi. È l'unico modo perché «Family: ANGEL / Affinity: DREAM» sia una
   * promessa mantenuta invece che un'anteprima che poi non corrisponde.
   *
   * ⚠️ E LE DUE SCARTATE MUOIONO QUI. §4: «they do not enter Dex». Non
   * finiscono in `mons`, non hanno un nodo, non esistono da nessun'altra
   * parte: possibilità che non si sono materializzate.
   */
  eggs: MonRecord[];
  /**
   * 🔷 v4 §13 — il mondo, che appartiene al MON e non alla forma.
   *
   * 🔒 UNO SOLO, ed è §18 a chiederlo così: «Add one persistent World and a
   * minimal World canon». Più mondi collegati da portali sono esplicitamente
   * fuori dal primo passaggio sicuro.
   */
  world: World | null;
  /** 🔷 v4 §10.2 — cosa è stato piantato, cosa raccolto, cosa non ripetere. */
  ledger: StoryLedger;
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
  /** Trasformazione visiva in background: Chat e ME restano utilizzabili. */
  evolutionJob: EvolutionJob | null;

  /** §29 — traccia dell'ultima generazione, visibile solo in DEV. */
  lastTrace: GenerationTrace | null;
  batch: BatchCandidate[];
  pages: Page[];
  /** §10 — l'aspetto scelto insieme a lui. Vuoto = di fabbrica. */
  skin: Skin;
  /** §13 — pezzi nascosti e spostati. Vuoto = schermate come sono nate. */
  layout: Layout;
  /**
   * 🔷 MODALITÀ COSTRUZIONE — «facciamolo neutro, usiamolo per modificare
   * l'app». Niente personaggio, niente memoria, niente ripiego.
   */
  buildMode: boolean;
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
   * 🔷 §19.2 — chi dà la voce, se hai scelto qualcuno diverso dal predefinito.
   *
   * «Vorrei poter cambiare fornitore senza perdere quello che è l'AI, ma tanto
   * la memoria ce l'abbiamo noi.»
   *
   * Ed è così, e si vede da DOVE sta questo campo: è un pezzetto di
   * configurazione perso in mezzo a `memories`, `nodes`, `mons`, `mood` e
   * `opinions` — che sono il .mon. Cambiare questa stringa non tocca nessuno
   * degli altri, e non c'è una riga di codice che lo faccia.
   *
   * `null` = quello della tabella in `routing.ts`.
   */
  voiceModel: string | null;

  /**
   * 🔷 §10 — chi scrive i prompt delle immagini. `null` = il predefinito.
   *
   * Sta accanto a `voiceModel` e non dentro una creatura per la stessa
   * ragione: è configurazione di questo browser, non un pezzo della partita.
   */
  compilerModel: string | null;

  /**
   * 🔷 §22.4 — chi DISEGNA. `null` = il predefinito.
   *
   * 🔷 «Ma io non ho potuto scegliere che AI immagini usare.» Era vero: la
   * voce e il compilatore erano due menù, il disegnatore una riga inchiodata.
   */
  imageModel: string | null;

  /* ════════════════════════════════════════════════════════════════════════
     UN MODELLO PER OGNI LAVORO (§19.3)

     🔷 «Non voglio che scegliere SOL per il Character Master obblighi
        automaticamente SOL per Bio, Teach o altri lavori.»

     ⚠️ I tre campi qui sopra sono la vecchia forma, e `compilerModel` era
     quello rotto: un menu solo per quattro lavori con profili incompatibili.
     Restano dichiarati perché un salvataggio vecchio li contiene, e la
     migrazione li legge — non perché qualcuno li usi ancora.
     ════════════════════════════════════════════════════════════════════ */
  /** Solo le scelte ESPLICITE. Uno step assente usa il proprio predefinito. */
  stepModels: Partial<Record<AiStepId, string>>;
  /** Scegli il modello di uno step. `null` torna al suo predefinito. */
  setStepModel: (step: AiStepId, model: string | null) => void;
  /**
   * Mette tutti gli step compatibili sul livello economico.
   *
   * 🔒 TRANNE IL CHARACTER MASTER, e non è una svista: «non voglio un
   * pulsante economico che mi peggiora i character». Gli step marcati
   * `qualityCritical` questo preset non li tocca.
   */
  useCheapPreset: () => void;
  /** Rimette tutti gli step sui loro predefiniti. */
  useQualityPreset: () => void;

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

  /* --- 🔷 v4 §3/§4 — FIRST SYNC e le tre uova --- */

  /** Registra una risposta del First Sync. */
  answerSync: (index: number, answerId: string) => void;
  /**
   * Chiude il First Sync: risolve il tipo, semina la personalità e genera le
   * tre interpretazioni.
   *
   * 🔒 LE TRE UOVA NASCONO QUI, non alla schermata dopo. Generarle mentre si
   * mostra la scelta vorrebbe dire che tornando indietro e avanti se ne
   * vedrebbero altre tre: la scelta smetterebbe di essere una scelta.
   */
  lockFirstSync: () => void;
  /**
   * Esce dal First Sync verso il protocollo.
   *
   * 🔒 SEPARATA DA `lockFirstSync` PERCHÉ IL RISULTATO È UN MOMENTO. Se
   * chiudere il test cambiasse fase nello stesso istante, il tipo verrebbe
   * calcolato e non lo vedrebbe nessuno.
   */
  leaveFirstSync: () => void;
  /** DEV — rifà il First Sync da capo. */
  reopenFirstSync: () => void;
  /**
   * §4 — sceglie una delle tre e la fa nascere SUBITO.
   *
   * 🔒 Nessuna incubazione: §3.2 toglie la settimana dal percorso nuovo.
   */
  chooseEgg: (index: number) => void;

  /* --- 🔷 v4 §13/§14 — mondo, canone, ritorno --- */

  /**
   * Scrive una voce nel canone del mondo.
   *
   * ⚠️ `epistemic` è obbligatorio e non ha un valore predefinito, di
   * proposito: §15.1 vieta che una cosa entri nel canone senza dichiarare da
   * dove viene, e un default sarebbe il modo in cui succede lo stesso.
   */
  recordCanon: (event: { kind: CanonKind; epistemic: Epistemic; text: string }) => void;
  /** §15.1 — promuove un'ipotesi del modello a canone. Mai automatico. */
  promoteCanon: (eventId: string) => void;
  /** §10.2 — pianta un setup che il narratore potrà raccogliere più avanti. */
  addSetup: (summary: string) => void;
  /** §10.2 — dichiara raccolto un setup. */
  closeSetup: (id: string, how: string) => void;
  /**
   * §14 — «Riparti da qui»: riprende il mondo col sé di adesso.
   *
   * Torna il testo scritto, o `null` se non c'era niente da riprendere.
   */
  returnToWorld: () => Promise<string | null>;

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
  /**
   * 🔷 «Se non lo faccio io dal DEV, il giorno deve andare avanti da solo
   * perché è passata una vera giornata.» `dateForDay(s.day, s.startedAt)`
   * esiste apposta per dire a che data corrisponde il giorno di gioco — ma
   * prima nessuno lo confrontava mai con `new Date()`. Chi non apriva l'app
   * per tre giorni la ritrovava ancora al giorno di prima.
   *
   * 🔒 NON DÀ SYNC. Recupera solo il NUMERO — la stessa cosa che farebbe
   * `advanceOneDay` se tu avessi aperto l'app quei giorni e non avessi fatto
   * niente. Il tempo da solo non ha mai dato SYNC, e questo non fa eccezione:
   * lo dà ancora e solo `syncDay()`.
   */
  catchUpToRealDay: () => void;
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
  /** Avvia una trasformazione leggera o radicale senza bloccare l'app. */
  beginFormEvolution: (kind: EvolutionKind) => void;
  /** Avvia o riprende il controllo del lavoro persistente sul server. */
  resumeFormEvolution: () => void;
  /** Apre la rivelazione quando tutte le immagini sono pronte. */
  revealFormEvolution: () => void;
  /** Riparte dalla scelta se la rete ha interrotto la generazione. */
  retryFormEvolution: () => void;

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
  /** 🔷 §19.2 — sceglie chi dà la voce. `null` torna al predefinito. */
  setVoiceModel: (model: string | null) => void;
  setCompilerModel: (model: string | null) => void;
  setImageModel: (model: string | null) => void;
  /**
   * 🔷 v1.2 §10 — fa riscrivere il prompt di un asset dal compilatore.
   *
   * 🔒 Se esiste già non lo rifà: un prompt che cambia produce sei immagini di
   * sei creature diverse. Torna il motivo del rifiuto quando il risultato non
   * ha retto i controlli — quello serve a DEV, non al prodotto.
   */
  compileAssetPrompt: (monName: string, assetType: AssetType) => Promise<string | null>;
  /** §8.1 — fa riscrivere la bio. Torna il motivo del rifiuto, o `null`. */
  writeBio: (monName: string) => Promise<string | null>;
  /**
   * VINZMON_NARRATIVE_ROLE_IMPLEMENTATION_BRIEF §10 — fa scrivere la riga del
   * narratore. Se l'AI non risponde o viene scartata, scrive comunque il
   * fallback deterministico: il narratore parla sempre, non solo con la chiave.
   */
  writeNarrator: (monName: string) => Promise<string | null>;
  /**
   * 🔷 v1 COMPILER — accetta una risoluzione incollata a mano.
   *
   * ⚠️ Esiste perché il resolver come chiamata automatica oggi non può girare:
   * le funzioni Netlify muoiono a 10 secondi. Ma il pezzo che serve davvero a
   * capire se il metodo funziona è l'USCITA GREZZA, e quella si può ottenere
   * incollando il prompt in una chat qualsiasi. Questa porta esiste per non
   * tenere in ostaggio la domanda dietro una decisione di hosting.
   *
   * Torna l'elenco dei problemi, vuoto se è stata accettata.
   */
  useResolution: (monName: string, raw: string) => { problems: string[]; repaired: string[] };
  /** Butta la risoluzione, per rifarla. */
  clearResolution: (monName: string) => void;
  /**
   * 🔷 «Proviamo con un'API.» Il primo stadio chiesto a un modello, invece che
   * copiato a mano. Torna i problemi, vuoti se è andata.
   */
  resolveWithAi: (
    monName: string,
    /** Quanti secondi sta aspettando: l'attesa ora può durare minuti. */
    onTick?: (secondi: number) => void,
  ) => Promise<{
    problems: string[];
    repaired: string[];
    ms?: number | null;
    /** Con quante lezioni è stata fatta. Zero = non sono arrivate. */
    usedLessons?: number;
  }>;
  /**
   * 🔷 «Adesso mi aspetto che tutto vada con un solo click.»
   *
   * 🔶 Bio, sei immagini e — solo per il master — un prompt riscritto. Qui
   * c'era scritto «sei prompt riscritti»: era vero, ed era il difetto. Cinque
   * di quelle riscritture rimasticavano un personaggio già deciso. Torna l'elenco di
   * quello che NON è riuscito, vuoto se è andato tutto.
   */
  forgeEverything: (monName: string) => Promise<string[]>;
  /**
   * 🔷 «O con click consecutivi che mi mostra tutte le immagini, le approvo e
   * andiamo avanti.»
   *
   * Un asset solo: scrive il prompt se manca e genera l'immagine. Torna il
   * motivo del guasto, o `null`.
   *
   * @param rewritePrompt butta il prompt scritto e ne fa scrivere un altro.
   *   Costa più di rifare l'immagine e basta, quindi lo si chiede a parte.
   */
  forgeOne: (
    monName: string,
    type: AssetType,
    opts?: { rewritePrompt?: boolean },
  ) => Promise<string | null>;
  /** L'ordine in cui si affrontano gli asset: il master per primo. */
  forgeOrder: () => Promise<AssetType[]>;
  /** A che punto è il giro completo, o `null`. Solo per la UI. */
  forgeProgress: { label: string; done: number; total: number } | null;

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
  /** §10 — rimette l'aspetto di fabbrica. Anche da `?aspetto=reset`. */
  resetSkin: () => void;
  /** Accende la modalità costruzione: il .mon diventa un operatore neutro. */
  setBuildMode: (on: boolean) => void;
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
  /** Conserva una forma precisa senza renderla attiva. */
  keepMon: (monName: string, note?: string) => Promise<string | null>;
  /** Toglie un ricordo dalla teca, immagini comprese. */
  forgetKept: (id: string) => void;
  /** Riprende un ricordo come radice di un nuovo percorso. */
  startFromKept: (id: string) => Promise<boolean>;

  /* --- §22.4 LE IMMAGINI --- */
  /** A che punto è la generazione in corso, o `null`. Solo per la UI. */
  assetProgress: (GenerationProgress & { monName: string }) | null;
  /** Chiede le immagini che mancano. Non blocca: torna subito. */
  generateAssetsFor: (
    monName: string,
    opts?: { only?: readonly AssetType[]; replace?: boolean; quality?: 'low' | 'medium' | 'high' },
  ) => void;
  /** Quante volte gli hai fatto rifare la faccia. Lo sa anche lui. */
  faceRedos: number;
  /** Il voto che hai dato alla forma attiva, 1–5, o `null`. */
  rateMon: (monName: string, stars: number | null) => void;

  /* --- LE LEZIONI AL RESOLVER --------------------------------------------
     🔷 «Gli insegno io, e quello che gli insegno resta anche se resetti.» */
  lessons: Lesson[];
  /**
   * Gli id delle lezioni dimenticate.
   *
   * ⚠️ Senza questo elenco «DIMENTICALA» sarebbe un pulsante che non funziona:
   * la fusione col server unisce gli insiemi, quindi una lezione tolta qui
   * tornerebbe indietro dal server per sempre. La pietra tombale è come si
   * cancella una cosa in un elenco che si fonde.
   */
  forgottenLessons: string[];
  /**
   * 🔷 «Vorrei poter scaricare la memoria, sistemarla con ChatGPT e
   *    ridargliela.»
   *
   * Il documento tuo, se ce n'è uno. `null` = si usa quello del pacchetto.
   *
   * 🔒 L'originale non viene mai toccato: sta nel codice e torna con un
   * pulsante. Una modifica che non si può annullare non è una modifica.
   */
  customMemory: string | null;
  /** Quando l'hai data, per sapere quale delle due copie è più recente. */
  customMemoryAt: string | null;
  /** Adotta un documento come memoria. Stringa vuota o `null` = torna all'originale. */
  setMemory: (testo: string | null) => void;
  /**
   * Gli parli, e se c'è qualcosa da imparare resta.
   *
   * 🔒 Salva da sé invece di chiedere conferma: la lezione è VISIBILE
   * nell'elenco subito sotto e si cancella con un tocco, quindi una conferma
   * prima aggiungerebbe un passo per proteggere da una cosa già reversibile.
   * E quello che hai detto tu resta accanto, parola per parola.
   */
  teachResolver: (
    said: string,
    /** Quello che vi siete già detti in questa schermata. */
    detto: readonly { mio: boolean; testo: string }[],
    /**
     * La risoluzione su cui lo stai giudicando, se il feedback nasce lì.
     *
     * 🔷 «Quando genero con resolver devo poter dare un feedback che diventa
     *    una lezione.» Senza questo, la lezione nasce da una frase sospesa;
     *    con questo nasce guardando la scelta che l'ha provocata.
     */
    giudicando?: CreativeResolution | null,
  ) => Promise<{ reply: string | null; failure: BackendFailure | null; detail?: string; ms: number | null }>;
  /** Toglie una lezione. Non c'è nessun altro modo di toglierla, di proposito. */
  forgetLesson: (id: string) => void;
  /**
   * Le toglie tutte.
   *
   * 🔒 Esiste per UN caso solo: hai scaricato il documento, le lezioni erano
   * dentro (sezione 15), le hai fatte consolidare nel testo e l'hai ridato.
   * A quel punto tenerle anche nell'elenco vuol dire dirle due volte — e due
   * copie della stessa regola non si sommano, si fanno concorrenza.
   */
  forgetAllLessons: () => void;

  /* --- §21.4 LA STANZA --- */
  /** Scrive il testo di un post. 🔒 Se è già scritto non fa niente. */
}

/* --- Stato iniziale -------------------------------------------------------- */

const INITIAL = {
  /* 🔷 v4 §3 — chi apre l'app oggi comincia dal First Sync. I salvataggi
     vecchi tengono la loro fase: `persist` la ripristina e non passa di qui. */
  phase: 'first-sync' as Phase,
  day: 1,
  startedAt: new Date().toISOString(),
  health: initialHealthState(),
  progression: { bond: 0, sync: emptySync() } as Progression,
  days: {} as Record<number, DailySync>,
  formsDiscovered: 0,
  personality: neutralPersonality(),
  scanAnswers: {} as ScanAnswers,
  syncAnswers: {} as SyncAnswers,
  firstSync: null as FirstSyncResult | null,
  eggs: [] as MonRecord[],
  world: null as World | null,
  ledger: emptyLedger(),
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
  evolutionJob: null as EvolutionJob | null,
  lastTrace: null as GenerationTrace | null,
  batch: [] as BatchCandidate[],
  /* §21.2 — le pagine che il .mon scrive. Vivono nello stato perché devono
     stare nel salvataggio: una pagina che sparisce svuotando la cache di
     Safari sarebbe peggio di non averla mai avuta. */
  pages: [] as Page[],
  skin: RESET_SKIN,
  layout: RESET_LAYOUT,
  buildMode: false,
  reminders: [] as Reminder[],
  /* Solo per il pannello DEV: quali strumenti ha usato l'ultima risposta.
     Non è stato di prodotto e non deve finire nei salvataggi. */
  lastToolUses: [] as string[],
  /* §22.4 — l'avanzamento delle immagini. Telemetria della UI: non va salvata,
     e infatti `partialize` la butta via insieme al batch. */
  assetProgress: null as (GenerationProgress & { monName: string }) | null,
  forgeProgress: null as { label: string; done: number; total: number } | null,
  /* §22.4 — quante volte hai chiesto di rifare una faccia. Vive fuori dal
     record perché è una cosa TUA, non della creatura. */
  faceRedos: 0,
  dev: {
    enabled: false,
    forceContinue: false,
    forceBranch: false,
    unlockAll: false,
    /* §20.1 — soglie di rarità tarate a mano. `null` = quelle del config.
       Vive nello stato per sopravvivere a un ricaricamento: si tara in più
       sedute, non in una. */
    rarityThresholds: null as RarityThresholds | null,
    forcedMood: null as string | null,
    /* 🔒 Spenta: il predefinito è il prodotto, non le prove. */
    draftImages: false,
  },
  bias: DEFAULT_BIAS,
  token: null as string | null,
  voiceModel: null as string | null,
  compilerModel: null as string | null,
  imageModel: null as string | null,
  stepModels: {} as Partial<Record<AiStepId, string>>,
  /* ⚠️ LE LEZIONI NON STANNO IN `INITIAL`, e per la stessa ragione della teca:
     quello che c'è in `INITIAL` è quello che un reset rimette a zero. Il
     mestiere imparato non è la partita. */
  lessons: [] as Lesson[],
  forgottenLessons: [] as string[],
  customMemory: null as string | null,
  customMemoryAt: null as string | null,

  /* §21.3 — i .mon conservati. NON stanno in INITIAL per caso: `resetAll` li
     rimette a mano proprio perché devono sopravvivere a ricominciare. */
  kept: [] as KeptMon[],
  /* §21.4 — il filo della stanza. I post nascono da eventi veri e restano
     senza testo finché non lo chiedi: niente si genera da solo. */
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

/** Evita due poller sullo stesso lavoro quando React rimonta la schermata. */
const runningEvolutionJobs = new Set<string>();

async function notifyEvolutionReady(monName: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration) {
    await registration.showNotification('VINZ.MON pronto', {
      body: `${displayName(monName)} ha completato la trasformazione.`,
      icon: '/icon-180.png?v=2',
      tag: `evolution-${monName}`,
    });
  }
}

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

/**
 * Dove si va dopo aver dichiarato (o saltato) il protocollo.
 *
 * 🔒 È QUI CHE I DUE PERCORSI SI DIVIDONO, ed è l'unico posto dove succede.
 * Chi ha fatto il First Sync ha tre uova che lo aspettano e nasce subito
 * (v4 §3.2). Chi arriva da un salvataggio vecchio — First Sync mai fatto,
 * nessun uovo — va all'incubazione come ha sempre fatto: la sua partita non
 * cambia strada a metà.
 */
function afterProtocolPhase(s: AppState): Phase {
  return s.eggs.length > 0 ? 'egg-choice' : 'incubation';
}

function activeRecord(s: AppState): MonRecord | null {
  return s.activeMonName ? (s.mons[s.activeMonName] ?? null) : null;
}

/** Costruisce l'input del generatore da tutto ciò che il prodotto misura. */
/**
 * 🔶 Esportata da quando DEV → PROVE compone una forma a mano: quella
 * schermata deve generare dalla STESSA porta del gioco vero, o proverebbe
 * creature che non potrebbero nascere.
 */
export function generatorInput(s: AppState): GeneratorInput {
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

      /* ========================================================================
         🔷 v4 §3/§4 — FIRST SYNC E LE TRE INTERPRETAZIONI
         ==================================================================== */

      answerSync: (index, answerId) =>
        set((s) => ({ syncAnswers: { ...s.syncAnswers, [index]: answerId } })),

      lockFirstSync: () => {
        const s = get();
        if (!isSyncComplete(s.syncAnswers)) return;

        /* Il seme si calcola una volta e resta: stessa regola di `lockSignal`.
           Cambia da dove arriva, non cosa diventa — il motore riceve la stessa
           identica forma che riceveva dalle dodici domande. */
        const personality = seedFromSync(s.syncAnswers);
        const result = firstSyncResult(s.syncAnswers);

        /* ⚠️ LE TRE UOVA NASCONO ADESSO, CON TRE SEMI DIVERSI E LO STESSO
           TEMPERAMENTO. È il senso di §4: «three possible interpretations of
           the same initial self-state». Non tre persone diverse — tre letture
           della stessa, che è il motivo per cui la scelta ha un peso invece di
           essere un sorteggio a tre. */
        const base = { ...s, personality };
        const eggs = [0, 1, 2].map(() =>
          generateFirstMon({
            input: generatorInput(base),
            /* Tutte e tre credono di essere il nodo zero: solo quella scelta
               lo diventerà davvero, e le altre due non esisteranno mai. */
            mindlineNodeId: makeNodeId(0),
            originNodeId: null,
            lineageNames: [],
            seed: randomSeed(),
            devUnlockAll: s.dev.unlockAll,
            devForcedMood: s.dev.forcedMood,
            hiddenEvent: hiddenEventFor({ day: s.day, formNumber: 1, activeDays: s.progression.sync.lifetime }),
            allowedArchetypes: angelArchetypesForStage(0),
          }).record,
        );

        /* ⚠️ LA FASE NON CAMBIA QUI, ed è una correzione a me stesso: la
           cambiavo, e la schermata del risultato non faceva in tempo a
           esistere — il tipo veniva calcolato e non lo vedeva nessuno.
           Chiudere il sync e uscire dal sync sono due gesti, e il momento in
           mezzo è tutto quello che l'utente porta a casa da questo rito. */
        set({ personality, firstSync: result, eggs });
      },

      leaveFirstSync: () => {
        if (!get().firstSync) return;
        set({ phase: 'protocol' });
      },

      reopenFirstSync: () => set({ phase: 'first-sync', firstSync: null, syncAnswers: {}, eggs: [] }),

      chooseEgg: (index) => {
        const s = get();
        const record = s.eggs[index];
        if (!record || s.phase !== 'egg-choice') return;

        /* 🔒 LE ALTRE DUE NON VENGONO SALVATE DA NESSUNA PARTE. §4: «they do
           not enter Dex». `eggs: []` non è pulizia — è la regola. */
        const world = seedWorld(record, s.day);

        set({
          phase: 'live',
          eggs: [],
          mons: { [record.data.name]: record },
          activeMonName: record.data.name,
          world,
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
          chat: [openingMessage(record, s.day, s.token !== null)],
          evolutionJob: {
            kind: 'hatch',
            status: 'running',
            previousName: null,
            candidateName: record.data.name,
            done: 0,
            total: generationOrder().length,
            label: 'PREPARAZIONE CHARACTER MASTER',
            error: null,
            serverJobId: null,
          },
          mood: applyMoodEvent(
            initialMood(record.data.mood_primary, s.day),
            'NATO',
            record.data.mood_primary,
            s.day,
          ),
        });

        void preloadMonAssets(record.data.name);
        if (s.token) void import('../system/pushNotifications').then(({ enableEvolutionNotifications }) => enableEvolutionNotifications(s.token as string));
        void get().resumeFormEvolution();
        requestIntroduction(set, get, record);
      },

      /* ========================================================================
         🔷 v4 §13/§14 — MONDO, CANONE, RITORNO
         ==================================================================== */

      recordCanon: ({ kind, epistemic, text }) => {
        const s = get();
        if (!s.world || !s.activeMonName) return;
        set({
          world: withCanon(s.world, {
            id: `canon_${kind}_${s.day}_${s.world.canon.length}`,
            day: s.day,
            kind,
            epistemic,
            text,
            monName: s.activeMonName,
          }),
        });
      },

      promoteCanon: (eventId) => {
        const s = get();
        if (!s.world) return;
        set({ world: promoteConnection(s.world, eventId) });
      },

      addSetup: (summary) => {
        const s = get();
        set({
          ledger: {
            ...s.ledger,
            setups: [
              ...s.ledger.setups,
              { id: `setup_${s.day}_${s.ledger.setups.length}`, summary, status: 'open' as const, day: s.day },
            ].slice(-40),
          },
        });
      },

      closeSetup: (id, how) => set((s) => ({ ledger: payOff(s.ledger, id, how) })),

      returnToWorld: async () => {
        const s = get();
        const record = activeRecord(s);
        if (!s.world || !record) return null;

        const { writeReturnWithAi, returnFallbackLine } = await import('../ai/narratorPrompt');
        const last = s.world.canon.at(-1);
        const elapsedDays = last ? Math.max(0, s.day - last.day) : 0;

        const { line } = await runStep(
          'narrator',
          (model) =>
            writeReturnWithAi(s.token, model, { world: s.world as World, record, elapsedDays, ledger: s.ledger }),
          (out) => ({ ok: out.line !== null, why: out.rejected ?? out.failure ?? undefined }),
        );

        const text = line ?? returnFallbackLine({ world: s.world, record, elapsedDays, ledger: s.ledger });

        /* Il ritorno è un evento del mondo: entra nel canone come tale.
           🔒 `WORLD_CANON` e non `FACT`: è successo nella storia, non nella
           vita di chi legge — e §15.1 vuole che la differenza resti scritta. */
        get().recordCanon({ kind: 'return', epistemic: 'WORLD_CANON', text });
        return text;
      },

      /* --- 🔶 v1.10 §5.3 PROTOCOLLO --- */

      declareProtocol: (dietText, trainingText) => {
        const protocol: Protocol = {
          diet: parseDiet(dietText),
          training: parseTraining(trainingText),
          declaredAt: new Date().toISOString(),
        };
        set({ protocol, phase: afterProtocolPhase(get()) });
        applyPlannedRest(set, get);
      },

      // Saltare è legittimo e non è un ripiego: senza protocollo il cibo si
      // registra lo stesso, l'aderenza resta SCONOSCIUTA e nessuna schermata
      // insiste. Obbligare a compilare qualcosa prima di cominciare è
      // esattamente l'attrito che §5.2 è nato per togliere.
      skipProtocol: () => set({ phase: afterProtocolPhase(get()) }),

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
          /* 🔷 «Quando metto +1 sul DEV, lui dovrebbe dirmi che ho fatto i
             pasti e mi sono allenato.» Quei due segnali qui sopra bastavano
             per i vecchi indicatori — la pagina SYNC nuova legge invece il
             DIARIO (pasti/allenamento veri), che restava vuoto. */
          fillDevHealthDay(get().day, get().startedAt);
          get().syncDay();
          advanceOneDay(set, get);
        }
      },

      endWeek: () => {
        markAccelerated(set, get);
        const remaining = 7 - ((get().day - 1) % 7);
        for (let i = 0; i < remaining; i++) advanceOneDay(set, get);
      },

      /* 🔷 «Se non porto avanti io i giorni dal DEV, deve andare avanti da
         solo perché è passata una vera giornata.»

         🔒 E DELIBERATAMENTE NON CHIAMA `markAccelerated`. Quel flag dice
         «questi giorni sono stati saltati dal DEV, non vissuti» — e qui è
         vero il contrario: il tempo È passato per davvero, l'app era solo
         chiusa. Marcarlo come accelerato mentirebbe nella direzione opposta.

         🔒 Il tetto a 400 non è un limite di gioco: `startedAt` viene da
         `new Date().toISOString()` e non cambia mai da sola — un orologio
         del telefono spostato per errore non deve far girare questo ciclo
         all'infinito. */
      catchUpToRealDay: () => {
        const s = get();
        if (s.phase !== 'incubation' && s.phase !== 'live') return;
        const elapsed = Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 86_400_000) + 1;
        const missing = Math.min(400, elapsed - s.day);
        for (let i = 0; i < missing; i++) {
          if (get().phase !== 'incubation' && get().phase !== 'live') break;
          advanceOneDay(set, get);
        }
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
          devForcedMood: s.dev.forcedMood,
          hiddenEvent: hiddenEventFor({
            day: s.day,
            formNumber: 1,
            activeDays: s.progression.sync.lifetime,
          }),
          allowedArchetypes: angelArchetypesForStage(0),
        });

        set({
          /* Come una trasformazione: l'app resta utilizzabile mentre il
             server prepara CEL, Toy, doodle e reaction. */
          phase: 'live',
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
          evolutionJob: {
            kind: 'hatch',
            status: 'running',
            previousName: null,
            candidateName: record.data.name,
            done: 0,
            total: generationOrder().length,
            label: 'PREPARAZIONE CHARACTER MASTER',
            error: null,
            serverJobId: null,
          },
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
        if (s.token) void import('../system/pushNotifications').then(({ enableEvolutionNotifications }) => enableEvolutionNotifications(s.token as string));
        void get().resumeFormEvolution();
        requestIntroduction(set, get, record);
      },

      enterLive: () => set((s) => ({
        phase: 'live',
        evolutionJob: s.evolutionJob?.status === 'ready' ? null : s.evolutionJob,
      })),
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

        const streak = gameDayStreak(s);
        const anyRewardReady = syncRewardProgress('evolution', streak).ready || syncRewardProgress('mega-evolution', streak).ready || syncRewardProgress('wish', streak).ready;
        if (!s.dev.forceBranch && !anyRewardReady) return;

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
          devForcedMood: s.dev.forcedMood,
          hiddenEvent: hiddenEventFor({
            day: s.day,
            formNumber: s.nodes.length + 1,
            activeDays: s.progression.sync.lifetime,
          }),
        });

        /* 🔶 QUI NASCEVANO I POST DELLA STANZA, e con loro il riconoscimento
           che alzava l'appiglio della forma nuova (`MI_HANNO_RICONOSCIUTO`).
           MIND.SOCIAL è uscita: l'evento d'umore resta nel catalogo, perché
           toglierlo cambierebbe come si comportano gli umori, ma adesso non lo
           scatena più nessuno. Quando la stanza torna, torna anche lui. */

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
          mood: touchMood(s, record.data.mood_primary, []),
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
        /* 🔒 §22.4 — le facce partono da sole e NON si aspettano: la creatura è
           già nata e già visibile, il sigillo fa da faccia finché il ritratto
           non arriva. Non si tocca per il micro-growth: quella resta la stessa
           creatura, e le sue immagini pure. */
        /* 🔶 Qui partiva il ritratto da solo. Adesso non parte niente, e non è
           una regressione: le immagini le chiede la schermata di incontro, una
           per una, e le fa passare dal COMPILATORE — cosa che questa chiamata
           non faceva. Generava dal prompt concatenato, cioè proprio quello che
           produce le creature deformi.

           🔒 Una porta sola. Se restasse anche questa, il ritratto esisterebbe
           già quando la sequenza arriva al suo turno: sarebbe l'unico dei sei
           mai approvato, e per giunta nato prima del master, quindi senza il
           riferimento di consistenza che gli altri cinque hanno. */
        requestIntroduction(set, get, record);
      },

      beginFormEvolution: (kind) => {
        const s = get();
        const previous = activeRecord(s);
        if (!previous || s.phase !== 'form-evolution' || s.evolutionJob?.status === 'running') return;

        const streak = gameDayStreak(s);
        const wish = readEvolutionWish();
        const usingWish = wish?.kind === kind && syncRewardProgress('wish', streak).ready;
        if (!s.dev.forceBranch && !usingWish && !syncRewardProgress(kind, streak).ready) return;
        if (!s.dev.forceBranch) claimSyncReward(usingWish ? 'wish' : kind, streak);

        /* Evoluzione conserva quasi tutto e cambia l'affinità visiva.
           Mega Evoluzione conserva soltanto il temperamento: è sempre la
           stessa entità, ma il corpo può essere completamente diverso. */
        const continuity: readonly ContinuityAxis[] = kind === 'evolution'
          ? ['family', 'size', 'role', 'fashion', 'mood_primary']
          : ['mood_primary'];
        const previousStage = previous.data.evolution_state?.stage ?? 0;
        const nextStage = kind === 'evolution' ? previousStage + 1 : 0;
        const nodeId = makeNodeId(s.nodes.length);
        const { record, trace } = generateMon({
          input: generatorInput(s),
          mindlineNodeId: nodeId,
          originNodeId: previous.data.mindline_node,
          heritageOrigins: s.pendingHeritage,
          lineageNames: Object.keys(s.mons),
          previous,
          continuity,
          seed: randomSeed(),
          devUnlockAll: s.dev.unlockAll,
          devForcedMood: s.dev.forcedMood,
          hiddenEvent: hiddenEventFor({ day: s.day, formNumber: s.nodes.length + 1, activeDays: s.progression.sync.lifetime }),
          allowedArchetypes: angelArchetypesForStage(nextStage),
        });
        if (usingWish && wish) record.data.user_wish = wish.text;
        clearEvolutionWish();

        /* EVOLUZIONE approfondisce la stessa Forma; MEGA cambia corpo e apre
           una nuova Forma, che riparte leggibile come una Basic. La ricchezza
           visiva così diventa una conseguenza del percorso, non del caso. */
        record.data.evolution_state = kind === 'evolution'
          ? {
              label: ['BASIC FORM', 'POWER FORM', 'HYPER FORM', 'OVERDRIVE FORM', 'TERMINAL FORM'][Math.min(previousStage + 1, 4)]!,
              stage: previousStage + 1,
              previous_labels: [
                ...(previous.data.evolution_state?.previous_labels ?? []),
                previous.data.evolution_state?.label ?? 'BASIC FORM',
              ],
            }
          : {
              label: 'BASIC FORM',
              stage: 0,
              previous_labels: [],
            };

        set({
          phase: 'live',
          mons: { ...s.mons, [record.data.name]: record },
          evolutionJob: {
            kind,
            status: 'running',
            previousName: previous.data.name,
            candidateName: record.data.name,
            done: 0,
            total: 1,
            label: 'PREPARAZIONE CHARACTER MASTER',
            error: null,
            serverJobId: null,
          },
          pendingHeritage: [],
          pendingPlan: null,
          lastTrace: trace,
          dev: { ...s.dev, forceBranch: false },
        });

        if (s.token) void import('../system/pushNotifications').then(({ enableEvolutionNotifications }) => enableEvolutionNotifications(s.token as string));
        void get().resumeFormEvolution();
      },

      resumeFormEvolution: () => {
        const initial = get();
        const job = initial.evolutionJob;
        const record = job ? initial.mons[job.candidateName] : null;
        if (!job || job.status !== 'running' || !record) return;

        /* 🔴 IL NARRATORE PARTE PRIMA DEL CONTROLLO SULLA CHIAVE, e ci è
           voluto un giro dal vivo per accorgersene.

           Stava sotto, insieme alla bio. Ma qui sotto c'è un `return` per chi
           non ha il token, quindi senza chiave `writeNarrator` non veniva
           chiamato MAI — e il fallback deterministico che avevo scritto
           apposta perché «il narratore parla sempre» non partiva proprio nel
           caso per cui esisteva. Un ripiego irraggiungibile è un ripiego che
           non c'è.

           ⚠️ La bio resta sotto, e la differenza è vera: `writeBio` non ha un
           fallback: se la chiamata non parte, resta quella deterministica del
           motore, che è già scritta e già mostrata. Il narratore no — senza
           questa riga non avrebbe nessun testo da nessuna parte. */
        void get().writeNarrator(job.candidateName);

        /* 🔴 UN LAVORO CHE NON PUÒ PARTIRE NON DEVE RESTARE «IN CORSO».

           Qui c'era `|| !initial.token` dentro la stessa `return`: senza
           token si usciva zitti e il lavoro restava `running` PER SEMPRE. Non
           è un caso di laboratorio — è quello che vede chiunque non abbia
           ancora fatto ATTIVA VINZ.MON, o a cui la chiave smette di valere.

           E «running» non è uno stato inerte: blocca. `beginFormEvolution`
           comincia con `if (… || s.evolutionJob?.status === 'running') return`,
           quindi da quel momento CAMBIA FORMA non fa più niente, e non fa
           niente in silenzio — tieni premuto e non succede nulla, per sempre.
           (Nascondeva anche la creatura dal MIND.DEX: vedi `Dex.tsx`.)

           Un lavoro che non può partire ha un esito, e l'esito si dichiara. */
        if (!initial.token) {
          set((current) => ({
            evolutionJob:
              current.evolutionJob?.candidateName === job.candidateName
                ? {
                    ...current.evolutionJob,
                    status: 'error',
                    error: 'Serve la chiave: apri ATTIVA VINZ.MON e incolla il token.',
                  }
                : current.evolutionJob,
          }));
          return;
        }

        if (runningEvolutionJobs.has(job.candidateName)) return;
        runningEvolutionJobs.add(job.candidateName);

        /* 🔷 «Rimane sempre il template fisso, non mi piace lo stile.» La
           bio vera la scrive `writeBio` — esisteva già, ma prima la
           chiamava solo DEV. Qui è il punto dove nasce OGNI creatura per
           davvero (hatch e ogni forma successiva): partirla in parallelo
           alle immagini, senza aspettarla, vuol dire che è già pronta
           quando la rivelazione arriva — o resta quella di sempre se la
           chiamata fallisce, perché `writeBio` non tocca `writtenBio` in
           quel caso. */
        void get().writeBio(job.candidateName);

        void import('../assets-pipeline/remoteGeneration').then(async ({ queueRemoteGeneration, pollRemoteGeneration }) => {
          let serverJobId = job.serverJobId;
          try {
            if (!serverJobId) {
              serverJobId = crypto.randomUUID();
              const id = serverJobId;
              set((current) => ({ evolutionJob: current.evolutionJob?.candidateName === job.candidateName ? { ...current.evolutionJob, serverJobId: id, total: generationOrder().length } : current.evolutionJob }));
              /* 🔷 La bozza passa di qui: è l'unica strada da cui nascono
                 davvero le sei immagini, quindi è l'unico posto dove
                 l'interruttore deve arrivare perché conti qualcosa. */
              await queueRemoteGeneration(
                initial.token as string,
                id,
                record,
                stepModel('image'),
                undefined,
                initial.dev.draftImages ? 'low' : undefined,
              );
            }

            const result = await pollRemoteGeneration(initial.token as string, serverJobId, record, (progress) => {
              set((current) => ({ evolutionJob: current.evolutionJob?.candidateName === job.candidateName ? { ...current.evolutionJob, done: progress.done, total: progress.total, label: progress.label, error: progress.error } : current.evolutionJob }));
            });
            markAssetsMade(set, get, record.data.name, result.made);
            if (result.error) {
              set((current) => ({ evolutionJob: current.evolutionJob?.candidateName === job.candidateName ? { ...current.evolutionJob, status: 'error', error: result.error } : current.evolutionJob }));
              return;
            }

            const current = get();
            const finished = current.mons[job.candidateName] ?? record;
            if (job.kind === 'hatch') {
              set({
                mons: { ...current.mons, [record.data.name]: finished },
                activeMonName: record.data.name,
                evolutionJob: { ...job, serverJobId, status: 'ready', done: result.made.length, total: result.made.length, label: 'PRIMO MON PRONTO', error: null },
              });
              void preloadMonAssets(record.data.name);
              void notifyEvolutionReady(record.data.name);
              return;
            }

            /* La nuova Forma è pronta ma NON è ancora quella attiva. Nome,
               immagine, statistiche e voce cambiano solo quando l'utente
               tocca il banner e apre la rivelazione. */
            set({
              mons: { ...current.mons, [record.data.name]: finished },
              evolutionJob: { ...job, serverJobId, status: 'ready', done: result.made.length, total: result.made.length, label: 'NUOVO MON PRONTO', error: null },
            });
            void preloadMonAssets(record.data.name);
            void notifyEvolutionReady(record.data.name);
          } catch (error) {
            set((current) => ({ evolutionJob: current.evolutionJob?.candidateName === job.candidateName ? { ...current.evolutionJob, status: 'error', error: String(error) } : current.evolutionJob }));
          } finally {
            runningEvolutionJobs.delete(job.candidateName);
          }
        });
      },

      revealFormEvolution: () => {
        const current = get();
        const job = current.evolutionJob;
        if (job?.status !== 'ready') return;
        if (job.kind === 'hatch') {
          /* 🔷 «Prima una finestra del terminale con il narratore che
             racconta la storia, poi si apre un'altra finestra con la foto
             del mon, e un'altra con nome e statistiche.»

             🔶 QUI PRIMA IL PRIMO MON SALTAVA DRITTO A `live`: il commento
             diceva che il caricamento lo aveva tenuto nascosto e che questo
             tocco era già la sua rivelazione. Restava vero per il carico —
             ma è esattamente la nascita che VINZ.MON deve raccontare, e
             saltarla voleva dire che nessuno l'avrebbe mai vista sulla
             prima creatura, quella che conta di più. Adesso passa dalla
             STESSA soglia di evoluzione e branch qui sotto: il job resta
             `ready` (lo chiude `enterLive`, come già faceva per loro), la
             pagina MON intera arriva comunque — solo un tocco dopo. */
          set({ phase: 'first-encounter' });
          return;
        }
        const previous = job.previousName ? current.mons[job.previousName] : null;
        const record = current.mons[job.candidateName];
        if (!previous || !record) return;
        set({
          phase: 'new-encounter',
          mons: { ...current.mons, [previous.data.name]: { ...previous, retiredOnDay: current.day } },
          activeMonName: record.data.name,
          formsDiscovered: current.formsDiscovered + 1,
          nodes: [...current.nodes, createNode({ index: current.nodes.length, kind: 'branch', monName: record.data.name, parentId: previous.data.mindline_node, day: current.day, chapter: nextChapter(current.nodes, 'branch'), label: job.kind === 'mega-evolution' ? 'MEGA EVOLUZIONE' : 'EVOLUZIONE' })],
          mood: touchMood(current, record.data.mood_primary, []),
          chat: [...current.chat, openingMessage(record, current.day, current.token !== null)].slice(-60),
          progression: { ...current.progression, sync: { ...current.progression.sync, inForm: 0, sinceGrowth: 0 } },
          /* 🔷 v4 §13 — «Evolution may change parts of the same World. Mega
             Evolution may reveal deeper layers.»

             🔒 IL MONDO NON RIPARTE, SI STRATIFICA. Il canone vecchio resta
             intatto e questa riga si aggiunge in fondo: è la differenza fra
             un posto che ha una storia e un posto che ricomincia da capo a
             ogni forma nuova. */
          world: current.world
            ? withCanon(current.world, {
                id: `canon_${job.kind}_${record.data.mindline_node}`,
                day: current.day,
                kind: job.kind === 'mega-evolution' ? 'mega-evolution' : 'evolution',
                epistemic: 'WORLD_CANON',
                text:
                  job.kind === 'mega-evolution'
                    ? `${displayName(previous.data.name)} è diventato ${displayName(record.data.name)}: il corpo è un altro, e qui si è aperto uno strato che prima non si vedeva.`
                    : `${displayName(previous.data.name)} è diventato ${displayName(record.data.name)}. Il posto è lo stesso, ma non risponde più allo stesso modo.`,
                monName: record.data.name,
              })
            : current.world,
        });
        requestIntroduction(set, get, record);
      },

      retryFormEvolution: () => {
        const s = get();
        const job = s.evolutionJob;
        if (!job || job.status !== 'error') return;
        set({
          evolutionJob: {
            ...job,
            status: 'running',
            done: 0,
            total: generationOrder().length,
            label: 'PREPARAZIONE CHARACTER MASTER',
            error: null,
            serverJobId: null,
          },
        });
        get().resumeFormEvolution();
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

      /* 🔒 Cambia UNA cosa e basta. Nessun `memories: []`, nessun reset
         dell'umore, nessuna riga che tocchi le forme: se un giorno ne
         comparisse una qui dentro, avrebbe smentito la premessa per cui
         questa funzione esiste. C'è un controllo che lo verifica. */
      setVoiceModel: (model) => set({ voiceModel: model }),
      setCompilerModel: (model) => set({ compilerModel: model }),
      setImageModel: (model) => set({ imageModel: model }),

      setStepModel: (step, model) =>
        set((cur) => {
          const next = { ...cur.stepModels };
          if (model === null) delete next[step];
          else next[step] = model;
          return { stepModels: next };
        }),

      /* 🔷 «Un Hub che sceglie automaticamente ogni AI per ogni singola
         azione, la meno costosa e con meno problemi sui dati» — questo.

         🔴 PRIMA QUI C'ERA `gpt-5.6-luna` MURATO PER TUTTI GLI STEP NON
         CRITICI, senza guardare se fosse davvero il più economico o se lo
         step portasse dati personali. Era per questo che il pulsante
         «ECONOMICO» non cambiava mai niente: Luna era già il predefinito di
         ogni step non critico, quindi premerlo confermava lo stato attuale
         invece di deciderlo. Adesso la decisione la fa `recommendedModel`
         in `routing.ts` — guarda cataloghi e dati veri, non un nome fisso —
         ed è lì che va letta la logica, non qui. */
      useCheapPreset: () => set({ stepModels: recommendedPreset() }),

      useQualityPreset: () => set({ stepModels: {} }),

      compileAssetPrompt: async (monName, assetType) => {
        const s = get();
        const rec = s.mons[monName];
        if (!rec) return 'nessuna creatura con questo nome';
        if (rec.compiledPrompts?.[assetType]) return null;

        const { compileWithAi } = await import('../ai/promptCompiler');
        const { text, failure, rejected } = await compileWithAi(
          s.token,
          rec,
          assetType,
          stepModel('imagePrompt'),
        );

        if (!text) return rejected ?? (failure ? `chiamata fallita (${failure})` : 'nessun testo');

        set((cur) => {
          const now = cur.mons[monName];
          if (!now) return {};
          return {
            mons: {
              ...cur.mons,
              [monName]: {
                ...now,
                compiledPrompts: { ...now.compiledPrompts, [assetType]: text },
              },
            },
          };
        });
        return null;
      },
      /* §8.1 — la bio la riscrive un modello, con la stessa disciplina dei
         prompt: i fatti devono sopravvivere, e si scrive una volta sola. */
      writeBio: async (monName) => {
        const s = get();
        const rec = s.mons[monName];
        if (!rec) return 'nessuna creatura con questo nome';
        if (rec.writtenBio) return null;

        const { writeBioWithAi } = await import('../ai/bioWriter');
        const bornDay = rec.data.generated_at_day;
        /* La BIO conosce soltanto ricordi realmente salvati, privilegiando il
           giorno della nascita e il breve periodo che l'ha preparata. */
        const birthMemories = s.memories
          .filter((memory) => memory.day <= bornDay && memory.day >= bornDay - 7)
          .sort((a, b) => {
            const aSameDay = a.day === bornDay ? 1 : 0;
            const bSameDay = b.day === bornDay ? 1 : 0;
            return bSameDay - aSameDay || b.day - a.day;
          })
          .slice(0, 8);
        /* 🔷 v4 §9 — «The Bio Writer should consume Narrative DNA. It should
           not invent an unrelated personality from scratch.» La spina arriva
           già dal `narrativeDNA` sul record; qui si aggiungono le altre due
           sorgenti che il brief elenca per la ORIGIN BIO: la lente del First
           Sync e il posto in cui è arrivato. */
        const { bio, failure, rejected } = await runStep(
          'bio',
          (model) =>
            writeBioWithAi(s.token, rec, model, {
              memories: birthMemories,
              lens: s.firstSync ? lensLine(s.firstSync) : undefined,
              world: s.world ? worldBlock(s.world) : undefined,
            }),
          (out) => ({ ok: out.bio !== null, why: out.rejected ?? out.failure ?? undefined }),
        );

        if (!bio) return rejected ?? (failure ? `chiamata fallita (${failure})` : 'nessun testo');

        set((cur) => {
          const now = cur.mons[monName];
          if (!now) return {};
          return { mons: { ...cur.mons, [monName]: { ...now, writtenBio: bio } } };
        });
        return null;
      },

      /* VINZMON_NARRATIVE_ROLE_IMPLEMENTATION_BRIEF §10 — la voce con cui
         VINZ.MON racconta l'arrivo di una forma. A differenza della bio, se
         l'AI non regge i controlli si scrive comunque il fallback
         deterministico: il narratore deve parlare «tutte le volte che nasce
         un mon», non solo quando la chiave funziona. */
      writeNarrator: async (monName) => {
        const s = get();
        const rec = s.mons[monName];
        if (!rec) return 'nessuna creatura con questo nome';
        if (rec.narratorLine) return null;

        const { writeNarratorWithAi, narratorFallbackLine } = await import('../ai/narratorPrompt');
        const { line, failure, rejected } = await runStep(
          'narrator',
          (model) =>
            /* 🔷 v4 §10.2 — il narratore legge cosa ha già raccontato prima di
               raccontare ancora. Alla primissima nascita il registro è vuoto e
               il mondo non c'è: è corretto, lì non c'è niente da non ripetere. */
            writeNarratorWithAi(s.token, rec, model, { world: s.world, ledger: s.ledger }),
          (out) => ({ ok: out.line !== null, why: out.rejected ?? out.failure ?? undefined }),
        );

        const finalLine = line ?? narratorFallbackLine(rec);

        set((cur) => {
          const now = cur.mons[monName];
          if (!now) return {};
          return {
            mons: { ...cur.mons, [monName]: { ...now, narratorLine: finalLine } },
            /* 🔷 v4 §10.2 — quello che ha appena raccontato entra fra le cose
               da non rifare. È il meccanismo che rende il registro vero invece
               che un campo che qualcuno riempirà a mano: si alimenta da solo,
               a ogni volta che il narratore parla.

               ⚠️ Solo le righe di immagine, non le etichette da sistema:
               «> SEGNALE RILEVATO» tornerà ancora ed è giusto così — è la sua
               voce. Quello che non deve tornare è l'immagine che ha scelto. */
            ledger: {
              ...cur.ledger,
              doNotRepeat: [
                ...cur.ledger.doNotRepeat,
                ...finalLine
                  .split('\n')
                  .filter((l) => l.trim().length > 0 && !l.trimStart().startsWith('>') && !l.trimStart().startsWith('[')),
              ].slice(-24),
            },
          };
        });
        return line ? null : (rejected ?? (failure ? `chiamata fallita (${failure}), usato il fallback` : 'usato il fallback'));
      },

      /* ============================================================================
         🔷 «Adesso mi aspetto che tutto vada con un solo click.»

         I pezzi c'erano tutti e nessuno li chiamava in fila: la bio si
         riscriveva da DEV, i prompt uno per uno da un'altra scheda, e le
         immagini partivano da sole ma leggendo il prompt CONCATENATO, perché
         nessuno aveva compilato quello buono. Cioè: il compilatore esisteva e
         le immagini non lo usavano quasi mai.

         🔶 L'ORDINE ERA DOPPIO, E ADESSO È UNO SOLO.

         Qui c'era scritto: «`generationOrder()` mette il ritratto per primo
         perché alla nascita conta vedere una faccia in fretta; qui invece il
         master va per primo». Due ordini per la stessa sequenza, con una
         spiegazione che li giustificava tutti e due.

         Il master va per primo e basta: gli altri cinque si generano ALLEGANDO
         la sua immagine, e prima di lui non c'è niente da allegare. L'ordine
         adesso viene dalle dipendenze dichiarate in `assets.ts`, una volta per
         tutti e due i giri.

         🔒 In serie e ci si ferma al primo no, come in `generateMissingAssets`:
         sei richieste insieme arriverebbero insieme anche al tetto di spesa,
         che le conterebbe tutte come «ancora sotto».

         💶 🔶 IL CONTO È SCESO. Era «circa 90 centesimi: sei immagini (~$0,24),
         sei prompt riscritti (~$0,60) e la bio (~$0,02)». Adesso il prompt
         riscritto è UNO — quello del master — perché per i cinque derivati il
         testo è un template deterministico. La voce più grossa di quel conto
         era la parte che non decideva niente.
         ========================================================================= */
      forgeProgress: null,

      /* 🔶 QUI SI RIMETTEVA IL MASTER IN TESTA A MANO, perché `generationOrder()`
         cominciava con il ritratto. Adesso l'ordine canonico nasce dalle
         dipendenze dichiarate e il master è già primo per costruzione: due
         liste che dicevano cose diverse sono diventate una. */
      forgeOrder: async () => {
        const { generationOrder } = await import('../assets-pipeline/generate');
        return generationOrder();
      },

      /* 🔷 «O con click consecutivi che mi mostra tutte le immagini, le approvo
         e andiamo avanti.» Un asset alla volta, così il conto si ferma dove
         decidi tu invece che alla fine. */
      forgeOne: async (monName, type, opts) => {
        const { generateMissingAssets } = await import('../assets-pipeline/generate');

        /* 🔒 «Si scrive una volta sola» vale contro la deriva SILENZIOSA — un
           prompt che cambia da sé fra un'immagine e l'altra. Non vale contro
           una richiesta esplicita: se guardi il risultato e dici «riscrivilo»,
           quella è una decisione, non una deriva. */
        if (opts?.rewritePrompt) {
          set((cur) => {
            const now = cur.mons[monName];
            if (!now?.compiledPrompts) return {};
            const { [type]: _dropped, ...kept } = now.compiledPrompts;
            return { mons: { ...cur.mons, [monName]: { ...now, compiledPrompts: kept } } };
          });
        }

        /* ⚠️ QUI L'IMMAGINE NON SI FERMA MAI, E PRIMA SI FERMAVA.
           C'era `if (why) return`: se la riscrittura veniva RIFIUTATA — vincoli
           persi, testo troppo corto — la funzione usciva e l'immagine non
           veniva nemmeno chiesta. Il contatore di OpenAI lo diceva senza
           ambiguità: cinque richieste di testo, ZERO di immagini.

           🔒 Ed è assurdo proprio secondo la regola che avevo scritto io in
           `promptCompiler`: «una riscrittura che perde un vincolo si butta e si
           tiene quello deterministico». Quello deterministico è sempre lì,
           sempre valido, e non costa niente. Rifiutare la riscrittura vuol dire
           usare il prompt di prima, non rinunciare all'immagine.

           Il motivo va nei log e non in faccia: in DEV → PROMPT IMMAGINI si
           vede se un prompt è RISCRITTO o no, che è la stessa informazione
           detta dove serve. */
        /* ════════════════════════════════════════════════════════════════
           🔶 LA RISCRITTURA NON SI CHIEDE PIÙ PER GLI ASSET DERIVATI.

           Prima ogni asset passava di qui: sei chiamate a un modello di testo
           per sei immagini. Ma dal ritratto in poi non c'è niente da decidere
           — il personaggio l'ha deciso il Resolver e sta nel master, che viene
           ALLEGATO. Il testo che accompagna quell'immagine è un ordine di
           produzione: «stesso personaggio, cambia solo l'inquadratura». Lo sa
           già il programma, e chiamare un modello per farselo riformulare è
           spesa senza nessuna decisione dentro.

           🔒 Il master invece continua a passare da qui. È l'unico posto dove
           una riscrittura può ancora migliorare qualcosa, ed è anche l'unico
           asset senza riferimento da allegare.

           🔒 E le creature VECCHIE non cambiano strada: senza `resolution`
           `usaTemplateDerivati` è falso e la riscrittura si chiede come sempre.
           ════════════════════════════════════════════════════════════════ */
        const prima = get().mons[monName];
        if (!prima) return 'nessuna creatura con questo nome';

        const { usaTemplateDerivati } = await import('../assets-pipeline/promptFor');
        const { derivedPrompt } = await import('../assets-pipeline/derived');
        const tecnico = usaTemplateDerivati(prima) && derivedPrompt(type) !== null;

        if (!tecnico) {
          const why = await get().compileAssetPrompt(monName, type);
          if (why) console.warn(`[forgia] prompt non riscritto per ${type}:`, why);
        }

        const rec = get().mons[monName];
        if (!rec) return 'nessuna creatura con questo nome';

        /* `replace` sempre: se sei qui è perché quell'immagine la vuoi adesso,
           e se ce n'era una vecchia la stai rifacendo apposta. */
        const { made, failure, detail } = await generateMissingAssets(
          get().token,
          rec,
          undefined,
          { only: [type], replace: true, quality: get().dev.draftImages ? 'low' : undefined },
          stepModel('image'),
        );
        /* Il motivo vero se c'è, il codice se non c'è: «openai 404: model not
           found» si risolve cambiando modello, «error» non si risolve.

           ⚠️ `timeout` merita parole sue: non è un guasto da riprovare, è il
           tetto di 10 secondi delle funzioni Netlify contro una generazione
           che ne impiega quindici o più. Riprovare non serve a niente, e
           lasciarlo scritto come un codice manda a cercare dove non c'è. */
        if (failure === 'timeout') {
          return 'la funzione è stata fermata da Netlify prima che l’immagine fosse pronta';
        }
        if (failure) return `immagine: ${detail ?? failure}`;
        markAssetsMade(set, get, monName, made);
        return null;
      },

      forgeEverything: async (monName) => {
        const problems: string[] = [];
        if (!get().mons[monName]) return ['nessuna creatura con questo nome'];

        const order = await get().forgeOrder();
        const total = 1 + order.length;
        let done = 0;
        const step = (label: string) => set({ forgeProgress: { label, done: done++, total } });

        try {
          step('la bio');
          const bioWhy = await get().writeBio(monName);
          if (bioWhy) problems.push(`bio: ${bioWhy}`);

          for (const type of order) {
            step(assetLabel(type));
            /* `forgeOne` non fallisce più per una riscrittura rifiutata: quello
               che torna qui è un guasto dell'IMMAGINE, e su quello ci si ferma. */
            const why = await get().forgeOne(monName, type);
            if (why) {
              problems.push(`${assetLabel(type)}: ${why}`);
              /* 🔒 Ci si ferma al primo no: senza chiave o col tetto pieno,
                 insistere sui cinque rimasti darebbe cinque rifiuti invece di
                 uno. */
              break;
            }
          }
        } finally {
          set({ forgeProgress: null });
        }

        return problems;
      },

      useResolution: (monName, raw) => {
        const rec = get().mons[monName];
        if (!rec) return { problems: ['nessuna creatura con questo nome'], repaired: [] };

        /* Il controllo sta in `parse.ts` e non qui: è la stessa validazione
           che userà la chiamata automatica quando potrà girare. Due copie
           vorrebbero dire che la strada a mano accetta cose che quella
           automatica rifiuta, o il contrario. */
        const { resolution, problems, repaired } = parseResolution(raw);
        if (!resolution) return { problems, repaired };

        set((cur) => {
          const now = cur.mons[monName];
          if (!now) return {};
          /* 🔒 Cambiare la risoluzione invalida i prompt già compilati: sono
             scritti DA quelle decisioni, e tenerli sarebbe tenere il ritratto
             di un'altra creatura. */
          return {
            mons: {
              ...cur.mons,
              [monName]: { ...now, resolution, compiledPrompts: undefined },
            },
          };
        });
        return { problems: [], repaired };
      },

      /* 🔷 «Metti una chat con lui, così gli insegno io.» */
      teachResolver: async (said, detto, giudicando) => {
        const s = get();
        const testo = said.trim();
        if (!testo) return { reply: null, failure: null, ms: null };

        const { teachResolver } = await import('../ai/teach');
        const { reply, lesson, replaces, failure, detail, ms } = await runStep(
          'teach',
          (model) => teachResolver(
          s.token,
          testo,
          s.lessons,
          detto,
          s.customMemory,
          giudicando ?? null,
          s.activeMonName,
          model,
          ),
          (out) => ({ ok: out.reply !== null, why: out.detail ?? out.failure ?? undefined }),
        );

        /* 🔒 La lezione si salva solo se ce n'è una: a una domanda si risponde,
           non si impara. Un modello che deve produrre una riga a ogni giro
           finirebbe per inventarne, e la memoria si riempirebbe di regole che
           nessuno ha mai chiesto. */
        if (lesson) {
          const nuova: Lesson = {
            id: `L${Date.now().toString(36)}`,
            at: new Date().toISOString(),
            said: testo,
            text: lesson,
            ...(s.activeMonName ? { about: s.activeMonName } : {}),
          };
          /* ⚠️ METTE INSIEME invece di impilare.

             🔷 «Lui assegna delle informazioni e le mette insieme.»

             Se la lezione nuova copre una che c'era già, quella vecchia esce e
             ne resta UNA più precisa. Venti regole che si sovrappongono sono
             peggio di otto nette: al momento di risolvere una creatura,
             regole che dicono quasi la stessa cosa non si sommano — si fanno
             concorrenza. */
          /* ⚠️ AL MASSIMO UNA, E IL LIMITE STA NEL CODICE.

             🔷 «Io adesso ne vedo sempre solo una: se ne metto un'altra si
                cancella quella di prima.»

             Era colpa mia. Avevo scritto al modello «usalo» a proposito della
             sostituzione, e un modello trova che quasi tutto «tocca» qualcosa
             che ha già: bastava una frase nuova per far sparire quella prima.

             🔒 La regola nel prompt adesso dice il contrario, ma una regola
             scritta a un modello è una richiesta, non una garanzia. Il tetto
             qui è la garanzia: una lezione può mandarne in pensione UNA, mai
             di più. Il consolidamento vero non si fa a colpi di chat — si fa
             scaricando il documento, sistemandolo, e ridandoglielo. */
          const sostituite = replaces
            .filter((id) => s.lessons.some((l) => l.id === id))
            .slice(0, 1);
          set((cur) => ({
            lessons: [...cur.lessons.filter((l) => !sostituite.includes(l.id)), nuova],
            /* Le vecchie diventano pietre tombali come una cancellazione a
               mano: altrimenti il server le rimanderebbe indietro. */
            forgottenLessons: [...new Set([...cur.forgottenLessons, ...sostituite])],
          }));
          /* Subito, non fra quattro secondi come il salvataggio della partita:
             una lezione è una riga sola, e il momento in cui la vuoi al sicuro
             è quello in cui l'hai appena detta. */
          void pushLessons();
        }

        return { reply, failure, detail, ms };
      },

      setMemory: (testo) => {
        const pulito = testo?.trim() ?? '';
        set({
          customMemory: pulito.length > 0 ? pulito : null,
          customMemoryAt: new Date().toISOString(),
        });
        void pushLessons();
      },

      forgetLesson: (id) => {
        set((cur) => ({
          lessons: cur.lessons.filter((l) => l.id !== id),
          /* 🔒 L'id resta. È l'unico modo di far sopravvivere una
             CANCELLAZIONE a una fusione: senza, il server la rimanderebbe
             indietro al primo scambio. */
          forgottenLessons: [...new Set([...cur.forgottenLessons, id])],
        }));
        void pushLessons();
      },

      forgetAllLessons: () =>
        set((cur) => {
          const ids = cur.lessons.map((l) => l.id);
          void Promise.resolve().then(pushLessons);
          return {
            lessons: [],
            forgottenLessons: [...new Set([...cur.forgottenLessons, ...ids])],
          };
        }),

      resolveWithAi: async (monName, onTick) => {
        const s = get();
        const rec = s.mons[monName];
        if (!rec) return { problems: ['nessuna creatura con questo nome'], repaired: [] };

        const { resolveWithAi } = await import('../ai/resolver');
        const { resolution, problems, repaired, ms, usedLessons } = await runStep(
          'characterMaster',
          (model) => resolveWithAi(
          s.token,
          rec,
          /* 🔒 Quello che gli hai insegnato entra QUI, non solo nella chat:
             una lezione che vale solo mentre gliela dici non è una lezione. */
          s.lessons,
          /* E il documento tuo, se gliene hai dato uno. */
          s.customMemory,
          model,
          onTick,
          /* 🔒 Le forme già risolte, per l'anti-ripetizione. Passate da qui e
             non lette dentro il resolver: quel file non deve sapere dove sono
             conservate le creature. */
          formeGiaViste(Object.values(s.mons), monName),
          ),
          (out) => ({ ok: out.resolution !== null, why: out.problems[0] }),
        );
        if (!resolution) return { problems, repaired, ms, usedLessons };

        set((cur) => {
          const now = cur.mons[monName];
          if (!now) return {};
          /* Stessa regola della strada a mano: la risoluzione nuova invalida i
             prompt scritti da quella vecchia. */
          return {
            mons: {
              ...cur.mons,
              [monName]: { ...now, resolution, compiledPrompts: undefined },
            },
          };
        });
        return { problems: [], repaired, ms, usedLessons };
      },

      clearResolution: (monName) =>
        set((cur) => {
          const now = cur.mons[monName];
          if (!now) return {};
          const { resolution: _dropped, ...kept } = now;
          return { mons: { ...cur.mons, [monName]: { ...kept, compiledPrompts: undefined } } };
        }),

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
            devForcedMood: s.dev.forcedMood,
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
      setBuildMode: (on) => set({ buildMode: on }),

      resetSkin: () => {
        set({ skin: RESET_SKIN, layout: RESET_LAYOUT });
        applySkin(null);
        applyLayout(null);
      },

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

          /* 🔷 §10 — l'aspetto, dentro un catalogo chiuso. Vedi `engine/skin.ts`
             per perché non è CSS libero. */
          skinNow: () => describeSkin(get().skin),

          changeSkin: (what, value) => {
            const esito = cambiaSkin(get().skin, what, value);
            if (esito.ok && esito.skin) {
              set({ skin: esito.skin });
              applySkin(esito.skin);
            }
            return { ok: esito.ok, error: esito.error };
          },

          resetSkin: () => get().resetSkin(),

          /* 🔷 §13 — togliere pulsanti e spostare elementi. Vedi
             `engine/layout.ts` per perché non è manipolazione del DOM. */
          layoutNow: () => describeLayout(get().layout),

          showPiece: (id, visible) => {
            const e = mostraPezzo(get().layout, id, visible);
            if (e.ok && e.layout) {
              set({ layout: e.layout });
              applyLayout(e.layout);
            }
            return { ok: e.ok, error: e.error };
          },

          movePiece: (id, at) => {
            const e = spostaPezzo(get().layout, id, at);
            if (e.ok && e.layout) {
              set({ layout: e.layout });
              applyLayout(e.layout);
            }
            return { ok: e.ok, error: e.error };
          },
          readMe: (section) => healthJournalReport(section),
          logMeal: (input) => { addMeal(input, 'chat'); },
          updateMeal: (slot, patch) => updateLatestMeal(slot, patch),
          logWorkout: (input) => { addWorkout(input, 'chat'); },
          updateWorkout: (patch) => updateLatestWorkout(patch),
          logWeight: (kg) => { addWeight(kg, 'chat'); },
          updateWeight: (kg) => updateLatestWeight(kg),
          saveDiet: (title, text) => { setDietPlan(title, text); },
          saveWorkoutPlan: (title, text) => { setWorkoutPlan(title, text); },
          configureTargets: (targets) => { configureHealthTargets(targets); },
          configureHealth: (focus, goal) => { configureHealthDisplay(focus, goal); },
          manageMe: (input) => manageMeBlock(input),
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
                devForcedMood: s.dev.forcedMood,
                hiddenEvent: false,
              })
            : generateFirstMon({
                input,
                mindlineNodeId: `sample_${i}`,
                originNodeId: null,
                lineageNames: [],
                seed,
                devUnlockAll: s.dev.unlockAll,
                devForcedMood: s.dev.forcedMood,
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
          devForcedMood: s.dev.forcedMood,
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
          devForcedMood: s.dev.forcedMood,
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
         §22.4 — LE FACCE ARRIVANO DA SOLE

         🔒 Non si aspetta: la creatura è già nata e già visibile. Questa parte
         gira di lato e riempie gli slot man mano. Se non c'è la chiave, se
         sei offline o se il tetto è stato raggiunto, non succede niente e non
         si urla — il sigillo fa da faccia e l'app resta intera (§26).
         ========================================================================= */
      generateAssetsFor: (monName, opts) => {
        const rec = get().mons[monName];
        if (!rec) return;

        void import('../assets-pipeline/generate').then(async ({ generateMissingAssets }) => {
          const { made, failure } = await generateMissingAssets(
            get().token,
            rec,
            (p) => set({ assetProgress: { monName, ...p } }),
            /* La bozza non sovrascrive una scelta esplicita di chi chiama:
               `opts.quality` vince, l'interruttore riempie solo il vuoto. */
            { ...opts, quality: opts?.quality ?? (get().dev.draftImages ? 'low' : undefined) },
            stepModel('image'),
          );

          /* Ogni «rifallo» si conta. Non serve al motore: serve a LUI, che nel
             suo briefing legge quante volte gli hai rifatto la faccia. Vedi
             `voicePrompt.ts` → quello che sa di te. */
          if (opts?.replace) {
            set({ faceRedos: get().faceRedos + 1 });
          }

          if (failure) console.warn('[asset] generazione interrotta:', failure);
          /* Lo stato degli slot vive dentro i Character Data (§27
             `asset_manifest_status`), non sul record: è la creatura a sapere
             quali sue immagini esistono. */
          markAssetsMade(set, get, monName, made);
          set({ assetProgress: null });
        });
      },

      /* ============================================================================
         §21.3 — CONSERVARE UN .MON

         Copia il record E le immagini in uno spazio che nessun reset tocca.
         Il record si copia in profondità: se restasse un riferimento a quello
         vivo, un'evoluzione futura riscriverebbe il ricordo — e un ricordo che
         cambia da solo non è un ricordo.
         ========================================================================= */
      keepMon: async (monName, note) => {
        const s = get();
        const rec = s.mons[monName];
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

      keepActiveMon: async (note) => {
        const name = get().activeMonName;
        return name ? get().keepMon(name, note) : null;
      },

      /* §22.5 — il voto. Sta sul record perché è un giudizio su QUELLA forma,
         e resta attaccato a lei anche quando finisce nella teca. */
      rateMon: (monName, stars) => {
        const rec = get().mons[monName];
        if (!rec) return;
        set({
          mons: {
            ...get().mons,
            [monName]: { ...rec, rating: stars === null ? null : Math.max(1, Math.min(5, stars)) },
          },
        });
      },

      forgetKept: (id) => {
        const entry = get().kept.find((k) => k.id === id);
        if (!entry) return;
        void dropKeptAssets(entry.assetName);
        set({ kept: get().kept.filter((k) => k.id !== id) });
      },

      startFromKept: async (id) => {
        const s = get();
        const entry = s.kept.find((item) => item.id === id);
        if (!entry) return false;

        const name = entry.record.data.name;
        const existingNode = s.nodes.find((node) => node.monName === name);
        if (existingNode && s.mons[name]) {
          get().restoreNode(existingNode.id);
          return true;
        }

        const nodeId = makeNodeId(s.nodes.length);
        const record = structuredClone(entry.record);
        record.data.mindline_node = nodeId;
        record.data.origin_node = null;
        record.retiredOnDay = null;

        set({
          activeMonName: name,
          phase: 'live',
          mons: { ...s.mons, [name]: record },
          nodes: [
            ...s.nodes,
            createNode({
              index: s.nodes.length,
              kind: 'origin',
              monName: name,
              parentId: null,
              day: s.day,
              chapter: nextChapter(s.nodes, 'branch'),
              label: 'RIPRESO DALLA TECA',
            }),
          ],
          chat: [openingMessage(record, s.day, s.token !== null)],
        });

        await restoreKeptAssets(entry.assetName, name);
        return true;
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
          /* 🔷 v4 — ricominciare vuol dire rifare il First Sync: il tipo era
             una lettura di quel momento, non una proprietà che ti segue. E il
             mondo se ne va con la partita — apparteneva al MON, e il MON non
             c'è più. */
          syncAnswers: {},
          firstSync: null,
          eggs: [],
          world: null,
          ledger: emptyLedger(),
          dev: get().dev,
          // Ricominciare la partita non è motivo per far reincollare la chiave.
          token: get().token,
          /* Né per rimettere a posto chi dà la voce: è configurazione di
             questo browser, non un pezzo della partita. */
          voiceModel: get().voiceModel,
          compilerModel: get().compilerModel,
          imageModel: get().imageModel,
          /* Come gli altri: è configurazione di questo browser, non partita. */
          stepModels: get().stepModels,
          /* 🔒 LA TECA SOPRAVVIVE. È l'unica cosa che deve: ricominciare
             cancella la partita, non i ricordi che avevi deciso di tenere. */
          kept: get().kept,
          /* 🔒 E LE LEZIONI PURE. Ricominciare cancella la partita, non quello
             che gli hai insegnato su come si disegnano le creature: quello non
             apparteneva a nessuna delle creature buttate via. */
          lessons: get().lessons,
          forgottenLessons: get().forgottenLessons,
          /* Come le lezioni: il mestiere non è la partita. */
          customMemory: get().customMemory,
          customMemoryAt: get().customMemoryAt,
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
        const {
          batch: _batch,
          lastToolUses: _tools,
          assetProgress: _p,
          /* Come `assetProgress`: è a che punto sta una cosa che sta girando
             adesso. Salvarlo vorrebbe dire riaprire l'app su una barra ferma
             al 40% di un lavoro che nessuno sta più facendo. */
          forgeProgress: _f,
          ...rest
        } = s;
        return rest as AppState;
      },
      /* 🔒 Il modulo di taratura è la sorgente che il motore legge, e allo
         start non sa niente. Senza questa riga una taratura salvata resterebbe
         visibile nel pannello e non avrebbe alcun effetto sulle creature: il
         tipo di bug che si scopre dopo tre giorni di prove sbagliate. */
      onRehydrateStorage: () => (state) => {
        if (state?.dev.rarityThresholds) setRarityThresholds(state.dev.rarityThresholds);
        if (state) {
          migrateStepModels(state);
          /* Anche i MON nati prima della Voice Card ricevono una carta
             persistente ricavata dai loro valori originali, senza ritirarli. */
          for (const record of Object.values(state.mons)) {
            record.personalityCard ??= buildPersonalityCard(record.data);
          }
          /* Un lavoro `running` vive sul server e viene ripreso da App. */
        }
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
    /* ⚠️ LE LEZIONI NO, E NON È UN'OTTIMIZZAZIONE.

       Hanno una chiave loro (`/api/lessons`) proprio perché non appartengono a
       una partita. Lasciarle anche qui dentro vorrebbe dire DUE sorgenti di
       verità per la stessa cosa, e quella sbagliata vincerebbe nel momento
       peggiore: quando il server ha una partita più avanti e l'app scarica il
       suo salvataggio, si porterebbe dietro l'elenco delle lezioni com'era
       quel giorno — cancellando tutto quello che hai insegnato dopo. */
    lessons: _lessons,
    forgottenLessons: _forgotten,
    /* Stessa ragione: ha una chiave sua, e due sorgenti di verità per la
       stessa cosa vuol dire perderla nel momento peggiore. */
    customMemory: _memoria,
    customMemoryAt: _memoriaAt,
    ...rest
  } = state as AppState & Record<string, unknown>;
  let healthJournal: unknown = null;
  try { healthJournal = JSON.parse(localStorage.getItem('vinzmon.health.journal.v1') ?? 'null'); } catch { /* dato locale corrotto: non sovrascriverlo sul server */ }
  return { ...rest, __healthJournal: healthJournal };
}

export function scheduleRemoteSave(): void {
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

/* La migrazione vera sta in `migrateSteps.ts`, senza import, per poterla
   provare: qui c'è solo il punto in cui si applica. */
function migrateStepModels(state: AppState): void {
  state.stepModels = migratedStepModels(state as VecchieScelte) as AppState['stepModels'];
}

/**
 * Il modello che serve uno step, pronto da mandare al server.
 *
 * 🔒 Passa da `modelForStep`, che è nel catalogo condiviso: un nome che non
 * esiste nel listino della capacità torna al predefinito dello step invece di
 * essere chiamato. La difesa vera resta comunque di là — `resolveRoute` sul
 * server non si fida di niente che arrivi dal browser.
 */
export function stepModel(
  step: AiStepId,
  /**
   * 🔷 Quanto pesa questo turno. Vedi `AiStep.everyday` in `routing.ts`:
   * «ok, segnato» e «oggi non ce la faccio» non meritano lo stesso modello,
   * e a distinguerli è `deservesThinking()` prima di mandare.
   */
  weight: 'everyday' | 'full' = 'full',
): string {
  return modelForStep(step, useApp.getState().stepModels[step], weight);
}

/**
 * Fa girare uno step e ne registra la misura.
 *
 * 🔒 Il cronometro sta QUI e non dentro ogni modulo: misurato in un posto
 * solo, i numeri di step diversi sono confrontabili. Misurato in otto posti,
 * ognuno finirebbe per contare pezzi leggermente diversi — ed è esattamente
 * come si costruisce una tabella che sembra dire qualcosa e non dice niente.
 */
export async function runStep<T>(
  step: AiStepId,
  job: (model: string) => Promise<T>,
  esito: (out: T) => { ok: boolean; why?: string },
): Promise<T> {
  const model = stepModel(step);
  const from = Date.now();
  const { noteRun } = await import('../ai/telemetry');
  try {
    const out = await job(model);
    const { ok, why } = esito(out);
    noteRun(step, {
      model,
      ms: Date.now() - from,
      background: AI_STEPS[step].background,
      ok,
      ...(why ? { why } : {}),
    });
    return out;
  } catch (err) {
    noteRun(step, {
      model,
      ms: Date.now() - from,
      background: AI_STEPS[step].background,
      ok: false,
      why: String(err),
    });
    throw err;
  }
}

useApp.subscribe(scheduleRemoteSave);

/* ============================================================================
   LE LEZIONI VANNO E VENGONO PER CONTO LORO

   🔷 «No, devono sopravvivere sempre.»

   ⚠️ NON PASSANO DAL SALVATAGGIO DELLA PARTITA, e questa è la ragione per cui
   esiste questo pezzo. Quel salvataggio è arbitrato dal giorno di gioco: dopo
   un RICOMINCIA DA CAPO il giorno torna a 1, il server rifiuta di scrivere, e
   tutto quello che gli insegni da lì in poi non arriverebbe mai.

   🔒 E si spingono SUBITO, non col ritardo di quattro secondi della partita.
   Il salvataggio della partita si accumula: se salta un giro, il prossimo
   porta tutto lo stesso. Una lezione no — è una riga sola, detta una volta, e
   il giro dopo potrebbe non esserci perché hai chiuso l'app.
   ========================================================================= */

/** Manda quello che sappiamo e adotta la fusione che torna indietro. */
export async function pushLessons(): Promise<void> {
  const s = useApp.getState();
  if (!s.token) return;

  const { syncLessons } = await import('../ai/backend');
  const { data, failure } = await syncLessons(s.token, {
    lessons: s.lessons,
    forgotten: s.forgottenLessons,
    memory: s.customMemory,
    memoryAt: s.customMemoryAt,
  });

  if (failure || !data) {
    /* 🔒 Non si annuncia e non si ritenta a raffica: la copia locale c'è, e la
       prossima lezione riproverà da sé. Se la rete è giù, insistere non la
       riaccende. */
    console.warn('[lezioni] non sincronizzate:', failure);
    return;
  }
  useApp.setState({
    lessons: data.lessons,
    forgottenLessons: data.forgotten,
    customMemory: data.memory ?? null,
    customMemoryAt: data.memoryAt ?? null,
  });
}

/**
 * All'avvio: si prende quello che c'è sul server e lo si fonde con quello che
 * c'è qui.
 *
 * ⚠️ Si SCRIVE, non si legge soltanto. Leggere e basta perderebbe le lezioni
 * insegnate offline; scrivere e basta cancellerebbe quelle di un altro
 * telefono. Il PUT fa tutt'e due, perché il server risponde con la fusione.
 */
export async function pullLessons(): Promise<void> {
  await pushLessons();
}

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
  return server.day >= local.day;
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
  const remote = data.state as Partial<AppState> & { __healthJournal?: unknown };
  const { __healthJournal, ...appState } = remote;
  if (__healthJournal) {
    localStorage.setItem('vinzmon.health.journal.v1', JSON.stringify(__healthJournal));
    window.dispatchEvent(new Event('vinzmon-health-journal'));
  }
  useApp.setState({
    ...appState,
    token: local.token,
    /* Stessa ragione del token: chi dà la voce è una scelta di QUESTO
       dispositivo. Un salvataggio scaricato non deve cambiartela sotto — e
       soprattutto non deve poterti spostare su un fornitore diverso senza che
       tu l'abbia chiesto. */
    voiceModel: local.voiceModel,
    compilerModel: local.compilerModel,
    imageModel: local.imageModel,
    stepModels: local.stepModels,
  });
  /* I salvataggi creati prima del diario server non hanno ancora questo
     campo: lasciando la firma vuota, il debounce li migra subito. */
  lastSavedSignature = __healthJournal === undefined ? '' : JSON.stringify(snapshotFor(useApp.getState()));
  return 'scaricato';
}

/** Segna che questa partita ha saltato del tempo dal pannello DEV. */
function markAccelerated(set: (p: Partial<AppState>) => void, get: () => AppState): void {
  if (!get().usedDevTime) set({ usedDevTime: true });
}

/* 🔷 «Quando metto più uno sul DEV lui mi aggiorna dicendo che ho fatto dei
   pasti, che mi sono allenato.»

   🔒 LA DATA È QUELLA DEL GIORNO DI GIOCO, NON DI ADESSO. `syncRewardProgress`
   (§ syncRewards.ts) misura uno streak guardando il DIARIO giorno per
   giorno — e se ogni pasto simulato finisse su `new Date()`, dieci giorni
   simulati in due secondi finirebbero tutti sulla STESSA data vera, uno
   sopra l'altro, e lo streak non supererebbe mai 1. `dateForDay` dà a
   ciascun giorno simulato la propria data, come farebbe vivendolo davvero.

   ⚠️ E SOLO SE MANCA. Un giorno già completo (magari raccontato per davvero
   in chat) non riceve pasti finti sopra: `isCompleteHealthDay` lo verifica
   prima di scrivere qualsiasi cosa. */
/* 🔴 «La barra si muove ma non triggera le evoluzioni.» `syncRewardProgress`
   senza un secondo argomento cade su `completeDayStreak()`, che guarda
   `new Date()` — la data vera, non quella del giorno di gioco. La ruota in
   `TodayChecklistScreen` diceva «pronto» guardando la data giusta; QUI, dove
   la trasformazione parte davvero, si guardava quella sbagliata: due
   risposte diverse alla stessa domanda, e vinceva quella sbagliata perché è
   quella che decide se aprire la schermata. */
function gameDayStreak(s: AppState): number {
  return completeDayStreak(undefined, dateForDay(s.day, s.startedAt));
}

function fillDevHealthDay(day: number, startedAt: string): void {
  const date = dateForDay(day, startedAt);
  const journal = readHealthJournal();
  if (isCompleteHealthDay(journal, date)) return;

  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const onThatDate = (at: string) => {
    const d = new Date(at);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === key;
  };
  const filledSlots = new Set(journal.meals.filter((m) => onThatDate(m.at)).map((m) => m.slot));

  for (const slot of ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'] as const) {
    if (filledSlots.has(slot)) continue;
    addMeal({ slot, description: 'Pasto simulato dal pannello DEV', kcal: 0, protein: 0, carbs: 0, fat: 0 }, 'dev', date);
  }
  if (!journal.workouts.some((w) => onThatDate(w.at))) {
    addWorkout({ title: 'Allenamento simulato', details: 'Dichiarato dal pannello DEV', minutes: 30 }, 'dev', date);
  }
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
    .then((m) =>
      m.reflectOnWeek(s.token, record, s.memories, s.opinions, s.day, stepModel('reflection')),
    )
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
    .then((m) => m.reviewVoice(s.token, evidence, s.voiceNotes, s.day, stepModel('reflection')))
    .then(({ note }) => {
      if (!note) return;
      set({ voiceNotes: addNote(get().voiceNotes, note) });
    });
}

/* --- Utilità ---------------------------------------------------------------- */

/** Il nome leggibile di un asset, per i messaggi. */
function assetLabel(type: AssetType): string {
  return assetTypeDef(type).label;
}


/**
 * Segna come risolti gli slot appena riempiti.
 *
 * 🔒 Lo stato degli slot vive dentro i Character Data (§27
 * `asset_manifest_status`), non sul record: è la creatura a sapere quali sue
 * immagini esistono.
 *
 * 🔶 Era scritto dentro `generateAssetsFor`. Da quando anche il giro completo
 * genera immagini, due copie della stessa riga vorrebbero dire due posti dove
 * dimenticare di marcare il master — e senza quel marchio i prompt successivi
 * perdono il riferimento di consistenza in silenzio.
 */
function markAssetsMade(
  set: (patch: Partial<AppState>) => void,
  get: () => AppState,
  monName: string,
  made: readonly AssetType[],
) {
  if (made.length === 0) return;
  const current = get().mons[monName];
  if (!current) return;
  set({
    mons: {
      ...get().mons,
      [monName]: {
        ...current,
        data: {
          ...current.data,
          asset_manifest_status: made.reduce(
            (acc, t) => ({ ...acc, [t]: 'resolved' as const }),
            current.data.asset_manifest_status,
          ),
        },
      },
    },
  });
}

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
    .then((m) =>
      m.generateIntroduction(
        token,
        record,
        get().mood,
        get().voiceNotes,
        /* 🔴 QUI C'ERA `get().voiceModel`, cioè il campo VECCHIO — quello che
           §19.3 ha sostituito con gli step e che la migrazione tiene in giro
           solo per leggerlo. Effetto: la presentazione girava su un modello
           diverso da tutte le risposte che venivano dopo, e nessuno lo
           dichiarava da nessuna parte. La prima frase che una creatura dice
           era l'unica scritta da un altro.

           🔒 E resta `full` per sempre: una presentazione è la prima
           impressione di una forma che vivrà ventotto giorni. Non è un turno
           di tutti i giorni, ed è l'esatto opposto del messaggio che merita
           il modello piccolo. */
        stepModel('voice', 'full'),
      ),
    )
    .then(({ result }) => {
      const s = get();
      const index = s.chat.findIndex((m) => m.id === id);
      if (index === -1) return; // la partita è andata avanti: non si riscrive il passato

      /* Stessa cintura della risposta: una presentazione vuota lascerebbe la
         creatura senza la sua prima frase, che è quella che si rilegge. */
      const vera = result?.text?.trim() ? result.text : null;
      const chat = [...s.chat];
      chat[index] = vera
        ? { ...chat[index]!, text: vera, fallback: false, pending: false }
        : { ...chat[index]!, pending: false };

      set({ chat });
    })
    /* 🔴 QUESTA CATENA NON AVEVA UN `catch`, E LA BOLLA RESTAVA APPESA.

       Un errore SINCRONO dentro `generateIntroduction` — costruire il briefing
       tocca il catalogo dei preset, e `voicePresetDef` LANCIA su un preset che
       non conosce — rifiuta la promessa. Senza nessuno che la raccoglie, il
       `.then` qui sopra non gira mai: `pending` resta vero, i puntini
       continuano, e non arriva niente. Da fuori è indistinguibile da «il
       modello ci sta mettendo molto», e non lo si scopre mai perché non c'è
       nessun errore da nessuna parte.

       🔒 Il ripiego deterministico c'era già ed era il pezzo che non veniva
       raggiunto: qui basta smettere di aspettare. */
    .catch((e: unknown) => {
      console.warn('[voce] presentazione fallita, resta il testo di ripiego:', e);
      const s = get();
      const index = s.chat.findIndex((m) => m.id === id);
      if (index === -1) return;
      const chat = [...s.chat];
      chat[index] = { ...chat[index]!, pending: false };
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
       di cache in più speso per niente. */
    memory: [
      buildMemoryBlock({ memories: s0.memories, bio: record.bio, today: s0.day }),
      opinions,
    ]
      .filter((p) => p.length > 0)
      .join('\n\n'),
    turns: recentTurns(s0.chat.filter((m) => m.id !== messageId && m.id !== messageId.replace(/_m$/, '_v'))),
  };

  /* ════════════════════════════════════════════════════════════════════════
     🔷 QUANTO PESA QUESTO TURNO — e quindi chi risponde.

     La condizione era già qui e serviva a una cosa sola: accendere il
     ragionamento. Adesso ne decide due, ed è giusto che sia una sola riga a
     deciderle entrambe — un messaggio che merita di essere pensato merita il
     modello che sa pensarlo, e uno che non lo merita non merita nemmeno di
     essere pagato al prezzo pieno.

     ⚠️ IN COSTRUZIONE È SEMPRE PESANTE, e non per generosità: lì si decide
     quale strumento chiamare per modificare l'app, che è il lavoro meno
     perdonabile di tutti.
     ════════════════════════════════════════════════════════════════════════ */
  const pesante =
    s0.buildMode || deservesThinking(userText, extractFromMessage(userText, s0.protocol.diet));

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
        /* 🔒 In costruzione il ragionamento si accende sempre: decidere QUALE
           strumento chiamare è esattamente il lavoro che lo merita, e a
           sforzo basso il modello sceglie la strada corta — rispondere. */
        pesante,
        /* §21 — gli strumenti. `run` passa dallo store, così una pagina scritta
           dal modello entra nello stato vero e viene salvata come tutto il
           resto, invece di vivere in una variabile che sparisce. */
        {
          defs: TOOLS,
          run: (use) => get().runMonTool(use),
          webSearch: true,
          onUsed: (uses) => set({ lastToolUses: uses.map((u) => u.name) }),
        },
        /* §22.6 — quello che sa di te. Sono fatti, non lamentele: il voto che
           gli hai dato, le facce che gli hai fatto rifare, e il fatto che
           qualche giorno alle sue spalle l'hai saltato dal pannello DEV. */
        {
          rating: record.rating ?? null,
          faceRedos: s0.faceRedos,
          timeSkipped: s0.usedDevTime,
        },
        /* §19.2 — chi risponde. Ultimo argomento e non primo di proposito:
           tutto quello che viene prima — il personaggio, l'umore, la memoria,
           gli strumenti, quello che sa di te — è identico per chiunque.

           🔷 E adesso non è più sempre lo stesso: `pesante` decide se questo
           turno merita il modello grosso o quello di tutti i giorni. La
           STESSA condizione che accende il ragionamento sceglie anche chi
           risponde — un turno che vale il pensiero vale il modello, e uno che
           non lo vale non vale nemmeno l'altro. Due decisioni separate qui
           vorrebbero dire poter pagare Opus per non farlo ragionare. */
        stepModel('voice', pesante ? 'full' : 'everyday'),
        { build: s0.buildMode, effort: s0.buildMode ? 'medium' : undefined },
      ),
    )
    .then(({ result, failure }) => {
      // La partita può essere andata avanti mentre il modello scriveva: se
      // quella bolla non c'è più, non si riscrive il passato.
      if (get().chat.findIndex((m) => m.id === messageId) === -1) return;

      /* 🔒 LA CINTURA, OLTRE ALLA BRETELLA. `client.ts` già rifiuta una risposta
         senza testo, ma questa riga è l'ultimo posto prima dello schermo: una
         stringa vuota qui diventa una bolla grigia vuota, che è peggio di un
         ripiego perché sembra una scelta del .mon invece di un guasto. */
      const vera = result?.text?.trim() ? result.text : null;

      /* ════════════════════════════════════════════════════════════════════
         🔷 «Staccagli la possibilità di fallback.»

         ⚠️ IL RIPIEGO È GIUSTO IN CHAT E VELENOSO SU UN BANCO DI LAVORO.
         In chat serve a non lasciare un buco: la creatura dice qualcosa di
         suo e la conversazione tiene. Ma in modalità costruzione una frase
         di ripiego dice «ok» dove non è successo NIENTE — e chi legge crede
         che la modifica sia andata, non che la chiamata sia fallita. È
         esattamente il modo in cui uno strumento sembra rotto quando invece
         è muto.

         🔒 Qui il guasto si vede, con il suo nome. */
      const text = vera ?? (s0.buildMode ? `— nessuna risposta (${failure ?? 'errore'})` : spoken);
      playReveal(set, get, messageId, text, planReveal(text, rhythm), !vera);
    })
    /* 🔴 STESSO GUASTO DELLA PRESENTAZIONE, e qui pesa di più: è la chat.

       `.then` senza `.catch`. Un errore sincrono nella costruzione del
       briefing — o qualunque altra eccezione lungo la strada — rifiuta la
       promessa e `playReveal` non viene chiamato: la bolla resta `pending`
       per sempre. I puntini vanno, e il .mon «non risponde».

       🔒 Il ripiego era già pronto sopra, calcolato PRIMA della chiamata.
       Bastava raggiungerlo. */
    .catch((e: unknown) => {
      console.warn('[voce] risposta fallita:', e);
      if (get().chat.findIndex((m) => m.id === messageId) === -1) return;
      /* Stessa regola: in costruzione l'errore si legge, non si maschera. */
      const text = s0.buildMode ? `— errore: ${String(e).slice(0, 140)}` : spoken;
      playReveal(set, get, messageId, text, planReveal(text, rhythm), true);
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
    .then((m) => m.readPhotoSignals(token, dataUrl, stepModel('vision')))
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
    })
    /* Stessa regola delle altre due catene: una promessa senza `catch` è un
       errore che nessuno vedrà mai. Qui non lascia niente appeso, ma tacere
       resta la scelta peggiore. */
    .catch((e: unknown) => console.warn('[foto] lettura fallita:', e));
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
  const day = useApp((s) => s.day);
  const startedAt = useApp((s) => s.startedAt);

  const hatched = phase !== 'incubation';
  const event = nextEvent(sync, hatched);
  /* 🔴 «La barra si muove ma non triggera le evoluzioni.» Qui sotto si
     chiamava `syncRewardProgress('evolution')` SENZA streak: cadeva sul
     default di `completeDayStreak()`, che guarda `new Date()` — la data
     vera del telefono, non quella del giorno di gioco che il DEV avanza.
     Per un giorno simulato la ruota diceva «pronto», e questo controllo
     diceva sempre «non ancora»: due fonti diverse per la stessa domanda. */
  const streak = completeDayStreak(undefined, dateForDay(day, startedAt));

  return {
    sync,
    event,
    microGrowthReady: forceGrowth || syncRewardProgress('evolution', streak).ready,
    formEvolutionReady:
      forceForm
      || syncRewardProgress('evolution', streak).ready
      || syncRewardProgress('mega-evolution', streak).ready
      || syncRewardProgress('wish', streak).ready,
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

/** 🔷 v4 §3 — a che punto è il First Sync. */
export function useFirstSync() {
  const answers = useApp((s) => s.syncAnswers);
  const result = useApp((s) => s.firstSync);
  return {
    answers,
    result,
    answered: Object.keys(answers).length,
    complete: isSyncComplete(answers),
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
