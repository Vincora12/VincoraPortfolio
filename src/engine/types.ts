/* ============================================================================
   VINZ.VERCE — SCHEMA CANONICO
   Fonte: MASTER SPEC §3, §4, §5, §7, §8, §13, §21, §23, §24.

   ATTENZIONE (§13 SUPERSEDING RULE): questo schema è CHIUSO.
   È vietato aggiungere campi fantasy non generati da uno degli assi canonici
   — niente `species`, `class`, `protector`, `seraphim` o simili. Se serve un
   campo nuovo, prima si aggiorna la spec, poi questo file.
   ========================================================================= */

import type {
  Affinity,
  Appearance,
  Family,
  FamilyArchetype,
  FashionAttitude,
  HairBleachState,
  Mood,
  Rarity,
  Role,
  Season,
  Size,
} from './taxonomy';

/* --- SOLUZIONE FASHION (§4, §6) --------------------------------------------
   L'asse FASHION di §4 copre esplicitamente "Outfit logic, eyewear, haircut,
   footwear, accessories, material/styling attitude": occhiali e capelli
   stanno QUI dentro, non come campi inventati fuori dagli assi canonici (§13).
   -------------------------------------------------------------------------- */

export interface FashionSolution {
  attitude: FashionAttitude;
  /** §6: obbligatori quando l'anatomia lo consente. `null` se non plausibile. */
  eyewear: string | null;
  /** §6: presenti solo dove l'anatomia supporta i capelli. */
  hair: { cut: string; bleach: HairBleachState } | null;
  footwear: string;
  accessories: string[];
}

/* --- SEGNALI DI SALUTE (§3) ------------------------------------------------
   Il dato mancante è *unknown*, mai negativo e mai zero. Il tipo lo impone:
   la UI non può stampare uno 0 al posto di un buco senza passare da un check.
   -------------------------------------------------------------------------- */

export type Signal = number | 'unknown';

export const UNKNOWN = 'unknown' as const;

export function isKnown(s: Signal): s is number {
  return s !== UNKNOWN;
}

/** Le sei metriche di §3. Sono trend, non punteggi di gioco. */
export type StatKey = 'FORM' | 'ATK' | 'SPD' | 'DEF' | 'REC' | 'CARE';

export const STAT_KEYS: readonly StatKey[] = ['FORM', 'ATK', 'SPD', 'DEF', 'REC', 'CARE'];

export interface StatEntry {
  /** 0–100. `unknown` quando non è stato rilevato nulla. */
  value: Signal;
  /** Variazione rispetto alla rilevazione precedente; `unknown` se non calcolabile. */
  delta: Signal;
  /** Confidenza del dato 0–1 (§9 ME: "data confidence"). */
  confidence: number;
}

export interface HealthState {
  stats: Record<StatKey, StatEntry>;
  /** CONDITION è lo stato del giorno, NON una stat permanente (§3). */
  condition: Signal;
  /** DISC = costanza/collaborazione col sistema. Separata dalle stat. */
  disc: Signal;
  /** Storico giornaliero per i trend di ME e del report settimanale. */
  history: HealthSample[];
}

export interface HealthSample {
  day: number;
  stats: Record<StatKey, Signal>;
  condition: Signal;
}

/* --- PROGRESSIONE DI GIOCO (§3) --------------------------------------------
   Tenuta separata dalla salute: "Health information and game scores remain
   conceptually and technically separate."
   -------------------------------------------------------------------------- */

export interface Progression {
  xp: number;
  /** Il livello non diminuisce mai (§3). */
  level: number;
  /** Legame con il .mon attivo, 0–1. */
  bond: number;
  /** Avanzamento verso la prossima evoluzione, 0–1 (board: EVOLUTION SYNC). */
  evolutionSync: number;
}

/* --- COLOR DNA (§10.2) -----------------------------------------------------
   Il personaggio è la sorgente del colore dell'interfaccia. Nessun arcobaleno.
   -------------------------------------------------------------------------- */

export interface ColorDna {
  /** Character Primary — accento dominante campionato dal .mon. */
  primary: string;
  /** Character Secondary/Accent. */
  accent: string;
  /** Colore del testo leggibile sopra `primary`, calcolato per contrasto. */
  onPrimary: string;
  /** Palette completa del .mon, per riferimento nei prompt asset. */
  palette: string[];
  /** Nomi leggibili della palette, usati nei prompt (§22.1). */
  paletteNames: string[];
}

/* --- VOICE DNA (§14) — genoma persistente di personalità e scrittura ------- */

export interface VoiceDna {
  /** Registro di base della voce. */
  register: string;
  /** Lunghezza tipica delle battute. */
  verbosity: 'terse' | 'normal' | 'expansive';
  /** Tic verbali e abitudini di scrittura. */
  quirks: string[];
  /** Uso di emoji/simboli: da 'none' a 'frequent'. */
  symbolUse: 'none' | 'rare' | 'occasional' | 'frequent';
  /** Come si rivolge a VINZ. Non è mai deferente: non lo tratta da dio (§2.2). */
  addressesVinzAs: string;
}

/* --- CHARACTER DNA (§4) ----------------------------------------------------
   "Persistent personality, behavior, voice, visual and memory genome."
   Ogni .mon è una verità parziale su VINZ, mai la personalità intera (§2.2),
   e può incarnare una contraddizione.
   -------------------------------------------------------------------------- */

export interface CharacterDna {
  /** Tratti di personalità dominanti. */
  traits: string[];
  /** Spinte/motivazioni. */
  drives: string[];
  /** La contraddizione che il .mon incarna (§2.2). Sempre presente. */
  contradiction: { a: string; b: string };
  /** Sottoinsieme del mondo culturale di VINZ campionato da questo .mon (§16). */
  interests: string[];
  /** Domini culturali verso cui questo .mon NON ha affinità (§16). */
  blindSpots: string[];
}

/* --- HERITAGE (§7.3, §8.3) -------------------------------------------------
   1–3 tratti riconoscibili ereditati dal nodo precedente, *tradotti* nella
   nuova Family, mai copiati alla lettera. Conserviamo sia la forma d'origine
   sia quella trasformata: la schermata 18 HERITAGE DNA deve mostrare il
   passaggio, non solo il risultato.
   -------------------------------------------------------------------------- */

export type HeritageKind =
  | 'anatomical'
  | 'behavioral'
  | 'visual'
  | 'symbolic'
  | 'memory'
  | 'relational';

export interface HeritageTrait {
  id: string;
  kind: HeritageKind;
  /** Come si manifestava nel .mon precedente. */
  origin: string;
  /** Come si manifesta nel nuovo .mon, tradotto nella nuova Family. */
  transformed: string;
  /** Nome canonico del .mon da cui proviene. */
  fromMon: string;
}

/* --- ASSET (§21.1, §23, §24) ----------------------------------------------- */

export type AssetType =
  | 'character_master'
  | 'rotation_sprite'
  | 'profile_portrait'
  | 'bio_doodle'
  | 'reaction_pack'
  | 'encounter_hero'
  | 'sigil';

export type AssetState = 'waiting' | 'resolved';

/** Mappa stato asset: sempre presente, anche a slot tutti vuoti (§21.2). */
export type AssetStatusMap = Record<AssetType, AssetState>;

/* --- EVOLUZIONE (§7.2, §12) ------------------------------------------------ */

export interface EvolutionState {
  /** Etichetta di stato corrente mostrata nel profilo (§13). */
  label: string;
  /** Quante volte questa identità ha fatto CONTINUE/EVOLVE. */
  stage: number;
  /** Storia delle forme attraversate da questa stessa identità. */
  previousLabels: string[];
}

/* ============================================================================
   CHARACTER DATA — output minimo strutturato di §21.1.
   Questi campi sono l'identità. Devono sopravvivere invariati alla
   sostituzione degli asset (§21.2): l'import di un'immagine tocca solo
   `assetStatus`.
   ========================================================================= */

export interface CharacterData {
  /** Nome canonico: inizia per V, contiene Z, termina in `.mon` (§4). */
  name: string;

  family: Family;
  familyArchetype: FamilyArchetype;
  role: Role;
  fashion: FashionSolution;
  affinity: Affinity;
  mood: Mood;
  size: Size;

  characterDna: CharacterDna;

  /** Presente solo quando rilevante (§21.1). */
  season?: Season;

  appearance: Appearance;
  rarity: Rarity;

  colorDna: ColorDna;
  voiceDna: VoiceDna;

  /** Nodo Mindline che questo .mon occupa. */
  mindlineNodeId: string;
  /** Nodo di origine / precedente. `null` solo per il primo .mon. */
  originNodeId: string | null;

  /** 1–3 tratti, presenti quando il .mon nasce da un BRANCH (§7.3). */
  heritage: HeritageTrait[];

  /** Metadati di stato, presenti quando il .mon ha fatto CONTINUE (§7.2). */
  evolutionState?: EvolutionState;

  assetStatus: AssetStatusMap;

  /* --- Tracciabilità di generazione (non è tassonomia) ---
     Il seed rende ogni generazione riproducibile in QA (§20.2). */
  seed: number;
  generatedAtDay: number;
}

/* --- SIGILLO (§13, §23) ----------------------------------------------------
   Marchio monocromo derivato dal Character DNA. Finché non arriva l'asset
   disegnato, il prototipo mostra una costruzione geometrica deterministica:
   è un segnaposto dichiarato, non character art inventata (§18A).
   -------------------------------------------------------------------------- */

export interface SigilSeed {
  /** Numero di punte/bracci della costruzione. */
  arms: number;
  /** Rotazione in gradi. */
  rotation: number;
  /** Presenza del cerchio esterno. */
  ring: boolean;
  /** Riempimento del nucleo. */
  solidCore: boolean;
}

/* --- BIO / PERSONAL FILE (§8.1, §16 di §12) --------------------------------
   Linguaggio Doodle. Testo conciso e caratterizzato, che non inventa lore
   estranea (§8.1).
   -------------------------------------------------------------------------- */

export interface BioFile {
  /** Storia breve generata dal contesto reale di creazione + Character DNA. */
  story: string;
  /** Annotazioni sparse, come note a margine di un quaderno. */
  annotations: string[];
  /** Dettagli ricordati, selezionati. */
  rememberedDetails: string[];
  /** Hashtag scritti a mano nel file personale. */
  tags: string[];
}

/* --- MEMORIE (§8.2) --------------------------------------------------------
   Appartengono alla relazione, non al singolo .mon: possono sopravvivere a un
   branch in forma trasformata/parziale.
   -------------------------------------------------------------------------- */

export type MemoryKind = 'conversation' | 'milestone' | 'joke' | 'event' | 'gift' | 'workout';

export interface Memory {
  id: string;
  day: number;
  kind: MemoryKind;
  title: string;
  text: string;
  /** .mon presente quando la memoria è nata. */
  monName: string;
  /** Valorizzato quando la memoria è sopravvissuta a un branch in forma parziale. */
  carriedFrom?: string;
}

/* --- MINDLINE (§7, §17 di §12) --------------------------------------------- */

export type NodeKind = 'origin' | 'evolution' | 'branch';

export interface MindlineNode {
  id: string;
  kind: NodeKind;
  /** Nome canonico del .mon che occupa il nodo. */
  monName: string;
  /** Nodo padre nella topologia. `null` per il nodo di origine. */
  parentId: string | null;
  /** Giorno di simulazione in cui il nodo è stato creato. */
  day: number;
  /** Capitolo Mindline (board S12: "CHAPTER 2"). */
  chapter: number;
  /** Etichetta di forma al momento della creazione del nodo. */
  label: string;
}

/* --- RECORD COMPLETO DI UN .MON -------------------------------------------- */

export interface MonRecord {
  data: CharacterData;
  bio: BioFile;
  sigil: SigilSeed;
  /** Reazioni testuali di fallback quando il Reaction Pack non è ancora arrivato. */
  reactions: string[];
  /** Giorno di simulazione in cui il .mon è comparso. */
  bornOnDay: number;
  /** Giorno in cui il .mon ha lasciato il nodo attivo. `null` se ancora attivo. */
  retiredOnDay: number | null;
}

/* --- CONVERSAZIONE (§6 di §12) --------------------------------------------- */

export interface ChatMessage {
  id: string;
  from: 'mon' | 'vinz';
  text: string;
  day: number;
  /** Vero quando il testo è un fallback deterministico e non generato (§17). */
  fallback?: boolean;
}

/* --- STATO UTENTE, input del generatore (§21) ------------------------------ */

export interface UserState {
  day: number;
  health: HealthState;
  progression: Progression;
  /** Umore corrente dichiarato o dedotto. */
  mood: string;
  /** Focus dichiarato del periodo. */
  focus: string;
  /** Risposte del Signal Scan iniziale, seme latente di personalità (§3 di §12). */
  scanAnswers: string[];
}

/* --- UTILITÀ --------------------------------------------------------------- */

/** Nome da mostrare: `VAZIEL.mon` → `VAZIEL`. */
export function displayName(canonical: string): string {
  return canonical.replace(/\.mon$/i, '');
}
