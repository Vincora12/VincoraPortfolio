/* ============================================================================
   VINZ.MON — SCHEMA CANONICO

   Il blocco CHARACTER DATA segue §27 della GENERATION BIBLE v2.1 alla lettera,
   nomi di campo compresi. È snake_case di proposito: così il record TypeScript
   **è** il `character_data.json` esportato (§48), senza un livello di
   mappatura che possa divergere.

   Lo schema resta CHIUSO: la regola della MASTER SPEC §13 vale ancora —
   niente `species`, `class`, `protector`, `seraphim` o altri campi fuori dagli
   assi canonici. §28 aggiunge che nessuna Family è premio o punizione per lo
   stato di salute.
   ========================================================================= */

import type {
  Appearance,
  HeritageCategory,
  Rarity,
  Size,
} from './generation-config';
import type { RarityScoreBreakdown } from './rarity';
import type { SyncState } from './progression';

/* --- SEGNALI DI SALUTE (MASTER SPEC §3) ------------------------------------
   Il dato mancante è *unknown*, mai negativo e mai zero. Il tipo lo impone.
   -------------------------------------------------------------------------- */

export type Signal = number | 'unknown';
export const UNKNOWN = 'unknown' as const;

export function isKnown(s: Signal): s is number {
  return s !== UNKNOWN;
}

export type StatKey = 'FORM' | 'ATK' | 'SPD' | 'DEF' | 'REC' | 'CARE';
export const STAT_KEYS: readonly StatKey[] = ['FORM', 'ATK', 'SPD', 'DEF', 'REC', 'CARE'];

export interface StatEntry {
  value: Signal;
  delta: Signal;
  confidence: number;
}

export interface HealthSample {
  day: number;
  stats: Record<StatKey, Signal>;
  condition: Signal;
}

export interface HealthState {
  stats: Record<StatKey, StatEntry>;
  /** CONDITION è lo stato del giorno, NON una stat permanente. */
  condition: Signal;
  /** DISC = costanza; §2 «does NOT equal moral quality». */
  disc: Signal;
  history: HealthSample[];
}

/* --- PROGRESSIONE DI GIOCO -------------------------------------------------- */

/**
 * 🔶 v1.4/v1.5 — una sola valuta visibile. XP, DISC ed EVOLUTION SYNC erano
 * tre barre in competizione sulla stessa schermata; adesso c'è SYNC.
 * DISC sopravvive come metrica di costanza in `HealthState`, non come valuta.
 */
export interface Progression {
  /** §2 BOND 0–100, normalizzato 0–1. Alimenta i gate di rarità e la voce. */
  bond: number;
  sync: SyncState;
}

/* ============================================================================
   §27 — CHARACTER DATA CONTRACT
   ========================================================================= */

/**
 * §27 palette_dna — la creatura è l'unica sorgente di colore della UI.
 *
 * 🔷 MASTER CHARACTER SYSTEM v1.1 §9 — HOUSE COLOR DNA. I colori non sono più
 * un elenco: hanno RUOLI dichiarati, e il ruolo dice dove il colore va a
 * finire sul corpo. Senza, il modello riceve cinque esadecimali e li sparge.
 */
export interface PaletteRoles {
  /** Il campo grande. Domina la superficie. */
  base: string;
  /**
   * 🔒 L'ACID HERO. Marca anatomia importante, occhiali, tratti firma — non si
   * sparge. È il colore che rende la palette «energetica, sintetica,
   * leggermente artificiale» invece che gradevole.
   */
  acidHero: string;
  /** Il terzo colore, che tiene su l'accordo: né la base né l'acido. */
  contrast: string;
  /** Uno o due, in quantità piccolissime. */
  micro: string[];
  /** I due neutri: fondo chiaro e nero non-nero. */
  neutralLight: string;
  neutralDark: string;
}

export interface PaletteDna {
  primary: string;
  accent: string;
  /** Colore leggibile sopra `primary`, calcolato per contrasto. */
  on_primary: string;
  swatches: string[];
  /** Nomi leggibili, usati testualmente nei prompt (§40). */
  swatch_names: string[];
  /** §9 — i ruoli, che il prompt legge al posto dell'elenco. */
  roles: PaletteRoles;
}

/** §27 eyewear — §9 la rende obbligatoria dove l'anatomia lo consente. */
export interface EyewearSolution {
  /** Una delle 16 categorie di §9. */
  category: string;
  /** Soluzione specifica, adattata a questa anatomia. */
  description: string;
}

/**
 * §27 character_dna — §40 impone che si materializzi in elementi precisi:
 * un tic di sagoma, un espediente anatomico, la palette, la logica del volto,
 * un motivo ricorrente e 1–3 contraddizioni comportamentali.
 */
export interface CharacterDna {
  silhouette_quirk: string;
  anatomical_gimmick: string;
  face_logic: string;
  body_language: string;
  recurring_motif: string;
  /** §40 — 1–3 contraddizioni, tradotte visivamente quando possibile. */
  contradictions: { a: string; b: string }[];
  traits: string[];
  drives: string[];
}

/** §13 — dodici assi parametrici, ognuno 0–100 sopra il preset di base. */
export type VoiceDna = Record<string, number> & {
  /** Assi che deviano marcatamente dal preset: alimentano §16. */
  deviations?: string[];
};

/** §23 — un tratto ereditato porta con sé origine e forma tradotta. */
export interface HeritageTrait {
  id: string;
  category: HeritageCategory;
  origin: string;
  transformed: string;
  from_mon: string;
}

/* --- ASSET (§45, MASTER SPEC §23) ------------------------------------------ */

export type AssetType =
  | 'character_master'
  | 'profile_portrait'
  | 'bio_doodle'
  | 'reaction_pack'
  /** 🔶 v1.9 §23.1 — ciclo di riposo animato: splash d'ingresso e testa chat. */
  | 'idle_animation'
  | 'encounter_hero';

export type AssetState = 'waiting' | 'resolved';
export type AssetStatusMap = Record<AssetType, AssetState>;

/* --- EVOLUZIONE ------------------------------------------------------------- */

export interface EvolutionState {
  label: string;
  stage: number;
  previous_labels: string[];
}

/* ============================================================================
   CHARACTER DATA — i campi di §27, nell'ordine del documento.
   ========================================================================= */

export interface CharacterData {
  /** §24 step 17 — inizia per V, contiene Z, finisce in `.mon`, unico in lineage. */
  name: string;

  family: string;
  family_archetype: string;
  affinity: string;
  size: Size;
  role: string;
  fashion: string;

  mood_primary: string;
  /** §22 — sfumatura secondaria, facoltativa. */
  mood_secondary: string | null;

  appearance: Appearance;
  rarity: Rarity;
  /** §16 — punteggio 0–100 che ha fatto da tetto. */
  rarity_score: number;

  season: string | null;

  /**
   * 🔷 MASTER CHARACTER SYSTEM v1.1 §8 — chi lo ha «disegnato».
   *
   * ⚠️ Non è `appearance`, ed è la distinzione che il master fa apposta:
   * `appearance` dice COME è reso (cel, inchiostro, vinile), questo dice
   * COM'È COSTRUITO (proporzioni, masse, faccia). Lo stesso .mon alla Ward e
   * alla Nomura sono due creature; lo stesso .mon in CEL e in INK è una
   * creatura resa in due modi.
   */
  /**
   * 🔷 §5 (MASTER v1.1) — quanto il corpo resta leggibile come umano, 1–5.
   *
   * ⚠️ Indipendente da `appearance`: quella dice come è RESO, questa quanto è
   * UMANO. E indipendente dal realismo — un 4/5 può avere proporzioni da
   * cartone estreme.
   */
  humanoidity: number;
  character_design_dna: string;
  /**
   * 🔷 §7 — i 2–4 riferimenti culturali ATTIVI di questa forma, per id.
   *
   * ⚠️ Non è `cultural_affinities`, che sono i TUOI interessi dichiarati.
   * Questi sono gli ingredienti scelti per questa creatura, uno per cluster,
   * ed è l'unica cosa che finisce nel prompt: il serbatoio completo resta nel
   * generatore.
   */
  cultural_dna: string[];
  palette_dna: PaletteDna;
  /** `null` quando l'anatomia non consente ottica (§9). */
  eyewear: EyewearSolution | null;
  /** `null` quando l'anatomia non ha capelli o equivalenti (§9). */
  hair_state: string | null;
  haircut: string | null;

  character_dna: CharacterDna;
  voice_preset: string;
  voice_dna: VoiceDna;

  cultural_affinities: string[];

  /** §23 — 1–3 al branch, vuoto altrove. */
  heritage_traits: HeritageTrait[];

  mindline_node: string;
  /** Nodo precedente. `null` solo per la radice. */
  origin_node: string | null;

  bond: number;
  data_confidence: number;

  /** §27 — perché è uscito così, in una riga leggibile. */
  generation_reason_summary: string;

  asset_manifest_status: AssetStatusMap;

  /* --- §29 riproducibilità: seed + versione config + giorno --- */
  seed: number;
  generation_config_version: string;
  generated_at_day: number;

  /** Presente quando il .mon ha fatto CONTINUE/EVOLVE. */
  evolution_state?: EvolutionState;
}

/* --- SIGILLO ----------------------------------------------------------------
   🔷 v1.15 §23.5 — il seme vive in `engine/sigil.ts` insieme alle regole che
   lo producono. Stava qui quando era quattro numeri a caso; adesso che ogni
   campo ha un padre, il tipo e la mappa che lo riempie devono potersi leggere
   nello stesso posto.
   -------------------------------------------------------------------------- */

import type { SigilSeed } from './sigil';
export type { SigilSeed };

/* --- BIO / PERSONAL FILE ---------------------------------------------------- */

export interface BioFile {
  story: string;
  annotations: string[];
  rememberedDetails: string[];
  tags: string[];
}

/* --- MEMORIE ---------------------------------------------------------------- */

export type MemoryKind = 'conversation' | 'milestone' | 'joke' | 'event' | 'gift' | 'workout';

export interface Memory {
  id: string;
  day: number;
  kind: MemoryKind;
  title: string;
  text: string;
  /** La forma che ha vissuto il ricordo. È un'etichetta, non un contenitore. */
  monName: string;
}

/* --- MINDLINE ---------------------------------------------------------------- */

export type NodeKind = 'origin' | 'evolution' | 'branch';

export interface MindlineNode {
  id: string;
  kind: NodeKind;
  monName: string;
  parentId: string | null;
  day: number;
  chapter: number;
  label: string;
}

/* --- RECORD COMPLETO --------------------------------------------------------- */

export interface MonRecord {
  data: CharacterData;
  bio: BioFile;
  sigil: SigilSeed;
  /** Reazioni testuali di fallback finché il Reaction Pack non è importato. */
  reactions: string[];
  bornOnDay: number;
  retiredOnDay: number | null;
  /**
   * §22.5 — quanto ti piace questa forma, 1–5. `null` finché non lo dici.
   *
   * 🔒 Sta sul record e non fuori: è un giudizio su QUELLA creatura, e la
   * segue anche quando smette di essere attiva e finisce nella teca.
   *
   * ⚠️ E lo sa anche lei. Finisce nel briefing della voce (`voicePrompt.ts`):
   * un compagno che non sa cosa pensi di lui è un compagno a cui hai parlato
   * per niente.
   */
  rating?: number | null;
  /**
   * 🔷 v1.2 §10 — i prompt riscritti dal compilatore AI, per tipo di asset.
   *
   * 🔒 SI SCRIVONO UNA VOLTA SOLA. Stessa regola dei ricordi e dei post della
   * stanza: un prompt che cambia a ogni apertura produce sei immagini di sei
   * creature diverse con lo stesso nome. Assente = si usa quello
   * deterministico, che resta sempre valido e non costa niente.
   */
  compiledPrompts?: Partial<Record<AssetType, string>>;
  /**
   * 🔷 §8.1 — la bio riscritta da un modello, quando c'è.
   *
   * ⚠️ NON sostituisce `bio`, le sta accanto. `bio` resta quella
   * deterministica: è la rete di sicurezza (una creatura nata senza chiave
   * deve avere comunque un quaderno) ed è il termine di paragone in DEV.
   * Chi mostra la bio all'utente legge `writtenBio ?? bio`.
   *
   * 🔒 SI SCRIVE UNA VOLTA SOLA. Una bio che cambia a ogni apertura non è una
   * bio: è un generatore di frasi che ti gira intorno.
   */
  writtenBio?: BioFile;
  /**
   * 🔷 v1 COMPILER — le decisioni di design prese dal resolver.
   *
   * ⚠️ NON è un prompt: è l'oggetto con cui il prompt viene scritto. Il prompt
   * si può sempre ricompilare da qui, quindi è questo che va conservato — un
   * prompt salvato invecchia quando cambia il compilatore, una risoluzione no.
   *
   * 🔒 SI DECIDE UNA VOLTA SOLA. È la stessa regola dei prompt e della bio, e
   * qui pesa di più: la risoluzione dice chi È questa creatura, e cambiarla
   * fra un asset e l'altro produrrebbe sei disegni di sei personaggi.
   */
  resolution?: import('../assets-pipeline/resolver/vendor/types').CreativeResolution;
}

/* --- CONVERSAZIONE ----------------------------------------------------------- */

export interface ChatMessage {
  id: string;
  from: 'mon' | 'vinz';
  text: string;
  day: number;
  /** §17 — vero quando il testo viene dalla voce deterministica, non dall'AI. */
  fallback?: boolean;
  /** L'AI sta ancora scrivendo: intanto si legge il fallback. */
  pending?: boolean;
  /** 🔶 v1.9 — cosa il sistema ha registrato da questo messaggio (§5.1). */
  extracted?: string[];
  /**
   * 🔶 v1.10 §7.2 — questo messaggio è un SUONO, non una frase: l'uovo non
   * parla. Il valore dice che tipo di reazione era, e serve solo a disegnarla.
   */
  sound?: 'ACK' | 'WARM' | 'CURIOUS' | 'ALERT' | 'DORMANT';
}

/* ============================================================================
   §29 — TRACCIA DI GENERAZIONE
   «The prototype must expose a GENERATION TRACE in DEV only showing scores,
    penalties, chosen pool, rarity normalization and final random seed.»
   §29 vieta di mostrare le probabilità di Family in produzione.
   ========================================================================= */

export interface TraceCandidate {
  id: string;
  fit: number;
  noveltyPenalty: number;
  culturalModifier: number;
  noise: number;
  total: number;
  chosen: boolean;
}

export interface TraceStep {
  /** Numero del passo in §24. */
  step: number;
  stage: string;
  outcome: string;
  candidates?: TraceCandidate[];
  note?: string;
}

export interface GenerationTrace {
  seed: number;
  generation_config_version: string;
  steps: TraceStep[];
  rarity: {
    score: number;
    breakdown: RarityScoreBreakdown[];
    cap: Rarity;
    unlockedPool: { rarity: Rarity; chance: number }[];
    eligiblePool: { rarity: Rarity; chance: number }[];
    rolled: Rarity;
  };
}

/* --- UTILITÀ ----------------------------------------------------------------- */

/** Stem del nome, senza estensione: `VAZIEL.mon` → `VAZIEL`. */
/**
 * §8.1 — quale bio va sotto gli occhi: quella scritta dal modello se c'è,
 * altrimenti quella del motore.
 *
 * 🔒 Sta QUI e non in ogni schermata perché i posti che mostrano la bio sono
 * due (il quaderno e il dossier alla nascita) e diventeranno tre. Due `??`
 * sparsi sono due posti dove dimenticarsene, e dimenticarsene vuol dire una
 * schermata che mostra la versione vecchia senza che nessuno se ne accorga.
 */
export function readableBio(record: MonRecord): BioFile {
  return record.writtenBio ?? record.bio;
}

export function displayName(canonical: string): string {
  return canonical.replace(/\.mon$/i, '');
}
