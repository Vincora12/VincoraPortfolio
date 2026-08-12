/* ============================================================================
   CHARACTER GENERATOR (§21)

   🔒 LOCKED (§21): "When the prototype generates a new .mon, it must first
   generate the complete structured identity BEFORE requesting images."

   Pipeline, nell'ordine esatto della spec:
     USER STATE → MINDLINE CONTEXT → PREVIOUS NODE / HERITAGE CONTEXT →
     CHARACTER GENERATOR → CHARACTER DATA → RARITY → NAME → COLOR DNA →
     VOICE DNA → ASSET MANIFEST

   Questo modulo è un CONFINE DI SERVIZIO (§25): funzioni pure, nessuna
   dipendenza da React o dallo store. Sostituirlo con una chiamata HTTP a un
   futuro Character Generation service non deve toccare la UI.

   §4 — priorità di lettura, rispettata anche nell'ordine di estrazione:
   FAMILY → FAMILY ARCHETYPE → AFFINITY → SIZE → ROLE → FASHION → MOOD →
   marcatori di styling VINZ. CREATURE FIRST. STYLING SECOND.
   ========================================================================= */

import {
  ACCESSORIES,
  AFFINITIES,
  APPEARANCES,
  CONTRADICTIONS,
  CULTURAL_DOMAINS,
  DRIVES,
  EYEWEAR,
  FAMILIES,
  FASHION_ATTITUDES,
  FOOTWEAR,
  HAIR_BLEACH_STATES,
  HAIR_CUTS,
  MOODS,
  ROLES,
  SEASONS,
  SIZES,
  TRAITS,
  familyDef,
  type Appearance,
  type Mood,
  type Season,
} from './taxonomy';
import { ACCESSORY_IT, AFFINITY_IT, EYEWEAR_IT, MOOD_IT, it } from './taxonomyIt';
import { chance, makeRng, pick, pickInt, pickMany, type Rng } from './rng';
import { generateColorDna } from './colorDna';
import { generateVoiceDna } from './voiceDna';
import { computeRarity, type RarityBreakdown } from './rarity';
import { generateMonName } from './naming';
import { translateHeritage, type HeritageOrigin } from './heritage';
import { emptyAssetStatus } from './assets';
import type {
  BioFile,
  CharacterData,
  CharacterDna,
  FashionSolution,
  MonRecord,
  SigilSeed,
  UserState,
} from './types';
import { STAT_KEYS, displayName, isKnown } from './types';

/* --- Contesto di generazione ----------------------------------------------- */

export interface GenerationContext {
  /** Stato reale dell'utente: è il motore neutro sotto la finzione (§1). */
  user: UserState;
  /** Nodo Mindline che il nuovo .mon occuperà. */
  mindlineNodeId: string;
  /** Nodo precedente. `null` solo per il primo .mon in assoluto. */
  originNodeId: string | null;
  /** Tratti in eredità, già selezionati al branch. Vuoto per origin/evolution. */
  heritageOrigins: readonly HeritageOrigin[];
  /** Nomi già usati nella lineage: il genoma vieta i duplicati (§4). */
  lineageNames: readonly string[];
  /** Seed esplicito per la riproducibilità in QA (§20.2). */
  seed: number;
}

export interface GenerationResult {
  record: MonRecord;
  /** Matematica della rarità, esposta in DEV (§20.1). */
  rarity: RarityBreakdown;
}

/* --- Generazione ----------------------------------------------------------- */

export function generateMon(ctx: GenerationContext): GenerationResult {
  const rng = makeRng(ctx.seed);
  const { user } = ctx;

  /* 1. FAMILY — anatomia primaria. Prima di ogni styling. */
  const familyEntry = pick(rng, FAMILIES);
  const family = familyEntry.id;

  /* 2. FAMILY ARCHETYPE — sottotipo morfologico dentro la Family. */
  const familyArchetype = pick(rng, familyEntry.archetypes);

  /* 3. AFFINITY — trasforma anatomia e materia, non è un costume. */
  const affinity = pick(rng, AFFINITIES).id;

  /* 4. SIZE — grammatica proporzionale, mai scalatura. */
  const size = pick(rng, SIZES);

  /* 5. ROLE — direzione narrativa tradotta in anatomia e comportamento. */
  const role = pick(rng, ROLES).id;

  /* 6. FASHION — outfit, occhiali, capelli, scarpe, accessori (§4, §6). */
  const fashion = generateFashion(rng, family);

  /* 7. MOOD — presenza emotiva del momento, orientata dallo stato reale. */
  const mood = pickMoodFromUserState(rng, user);

  /* 8. CHARACTER DNA — genoma persistente. */
  const characterDna = generateCharacterDna(rng);

  /* 9. APPEARANCE — grammatica di resa, indipendente dalla Family (§5). */
  const appearance: Appearance = pick(rng, APPEARANCES);

  /* 10. SEASON — solo quando rilevante (§21.1). */
  const season: Season | undefined = chance(rng, 0.45) ? pick(rng, SEASONS) : undefined;

  /* 11. HERITAGE — tradotto nella nuova Family, mai copiato (§7.3). */
  const heritage = translateHeritage(rng, ctx.heritageOrigins, family, affinity);

  /* 12. COLOR DNA — derivato dall'Affinity (§10.2). */
  const colorDna = generateColorDna(rng, affinity);

  /* 13. VOICE DNA — genoma di scrittura (§14). */
  const voiceDna = generateVoiceDna(rng, characterDna);

  /* 14. RARITÀ — calcolata sulla configurazione uscita, non estratta (§4). */
  const draft = {
    family,
    familyArchetype,
    role,
    fashion,
    affinity,
    mood,
    size,
    characterDna,
    season,
    appearance,
    colorDna,
    voiceDna,
    mindlineNodeId: ctx.mindlineNodeId,
    originNodeId: ctx.originNodeId,
    heritage,
    assetStatus: emptyAssetStatus(),
    seed: ctx.seed,
    generatedAtDay: user.day,
  } satisfies Omit<CharacterData, 'rarity' | 'name'>;

  const rarity = computeRarity(draft);

  /* 15. NOME — genoma V…Z….mon, senza duplicati in lineage (§4). */
  const name = generateMonName(rng, ctx.lineageNames);

  const data: CharacterData = { ...draft, rarity: rarity.rarity, name };

  /* 16. BIO, SIGILLO, REAZIONI — contenuto di personaggio, non tassonomia. */
  const bio = generateBio(rng, data, user);
  const sigil = generateSigil(rng, data);
  const reactions = generateReactions(rng, data);

  return {
    record: {
      data,
      bio,
      sigil,
      reactions,
      bornOnDay: user.day,
      retiredOnDay: null,
    },
    rarity,
  };
}

/* ============================================================================
   EVOLUZIONE (§7.2, §12)
   CONTINUE/EVOLVE non genera un nuovo personaggio: la STESSA identità avanza.
   Cambiano stato, mood, palette e progressione visiva; restano nome, Family,
   Archetype, Affinity, Size, Role e Character DNA.
   ========================================================================= */

const EVOLUTION_LABELS = [
  'BASIC FORM',
  'POWER FORM',
  'HYPER FORM',
  'OVERDRIVE FORM',
  'TERMINAL FORM',
] as const;

export function evolveMon(
  record: MonRecord,
  user: UserState,
  newNodeId: string,
  seed: number,
): GenerationResult {
  const rng = makeRng(seed);
  const prev = record.data;
  const stage = (prev.evolutionState?.stage ?? 0) + 1;

  const previousLabels = [
    ...(prev.evolutionState?.previousLabels ?? []),
    prev.evolutionState?.label ?? EVOLUTION_LABELS[0],
  ];

  const label = EVOLUTION_LABELS[Math.min(stage, EVOLUTION_LABELS.length - 1)]!;

  // L'identità resta. Cambia lo stato, e con esso la presenza e gli accenti.
  const data: CharacterData = {
    ...prev,
    mood: pickMoodFromUserState(rng, user),
    fashion: evolveFashion(rng, prev.fashion, prev.family),
    colorDna: generateColorDna(rng, prev.affinity),
    mindlineNodeId: newNodeId,
    originNodeId: prev.mindlineNodeId,
    evolutionState: { label, stage, previousLabels },
    // Gli asset vanno rigenerati: la forma è cambiata (§21.2, §14).
    assetStatus: emptyAssetStatus(),
    seed,
    generatedAtDay: user.day,
    rarity: prev.rarity,
  };

  const rarity = computeRarity(data);
  data.rarity = rarity.rarity;

  return {
    record: {
      ...record,
      data,
      bio: {
        ...record.bio,
        annotations: [
          ...record.bio.annotations,
          `${label} — giorno ${user.day}. Stessa identità, forma nuova.`,
        ],
      },
    },
    rarity,
  };
}

/* --- Sotto-generatori ------------------------------------------------------ */

function generateFashion(rng: Rng, family: string): FashionSolution {
  const fam = familyDef(family as never);

  return {
    attitude: pick(rng, FASHION_ATTITUDES).id,
    // §6: gli occhiali sono obbligatori quando l'anatomia lo consente.
    eyewear: fam.supportsEyewear ? pick(rng, EYEWEAR) : null,
    // §6: i capelli solo dove l'anatomia li supporta, con storia di decolorazione.
    hair: fam.supportsHair
      ? { cut: pick(rng, HAIR_CUTS), bleach: pick(rng, HAIR_BLEACH_STATES).id }
      : null,
    footwear: pick(rng, FOOTWEAR),
    accessories: pickMany(rng, ACCESSORIES, pickInt(rng, 1, 3)),
  };
}

/** All'evoluzione la soluzione fashion cambia, ma i marcatori VINZ restano. */
function evolveFashion(rng: Rng, prev: FashionSolution, family: string): FashionSolution {
  const fam = familyDef(family as never);
  return {
    attitude: chance(rng, 0.5) ? pick(rng, FASHION_ATTITUDES).id : prev.attitude,
    eyewear: fam.supportsEyewear ? (chance(rng, 0.4) ? pick(rng, EYEWEAR) : prev.eyewear) : null,
    // I capelli crescono: lo stato di decolorazione avanza, il taglio resta.
    hair: prev.hair ? { ...prev.hair, bleach: pick(rng, HAIR_BLEACH_STATES).id } : null,
    footwear: chance(rng, 0.4) ? pick(rng, FOOTWEAR) : prev.footwear,
    accessories: [...new Set([...prev.accessories, ...pickMany(rng, ACCESSORIES, 1)])].slice(0, 4),
  };
}

/**
 * Il mood non è casuale: è la presenza emotiva del momento, e il momento è
 * fatto dai dati reali (§1 — "Health and self-improvement data remain the
 * neutral engine underneath the fiction").
 */
function pickMoodFromUserState(rng: Rng, user: UserState): Mood {
  const rec = user.health.stats.REC.value;
  const condition = user.health.condition;

  if (isKnown(condition) && condition < 35) return pick(rng, ['DEPLETED', 'FLAT', 'GUARDED']);
  if (isKnown(condition) && condition > 78) return pick(rng, ['ELATED', 'FOCUSED', 'WARM']);
  if (isKnown(rec) && rec < 40) return pick(rng, ['WIRED', 'RESTLESS', 'DEPLETED']);

  return pick(rng, MOODS).id;
}

function generateCharacterDna(rng: Rng): CharacterDna {
  const contradiction = pick(rng, CONTRADICTIONS);
  // §16: ogni .mon campiona solo un SOTTOINSIEME del mondo culturale di VINZ,
  // e può non avere affinità con alcuni domini.
  const interests = pickMany(rng, CULTURAL_DOMAINS, pickInt(rng, 2, 4));
  const blindSpots = pickMany(
    rng,
    CULTURAL_DOMAINS.filter((d) => !interests.includes(d)),
    pickInt(rng, 1, 2),
  );

  return {
    traits: pickMany(rng, TRAITS, 3),
    drives: pickMany(rng, DRIVES, 2),
    contradiction: { a: contradiction.a, b: contradiction.b },
    interests,
    blindSpots,
  };
}

/**
 * BIO (§8.1): storia generata dal contesto REALE di creazione e dal Character
 * DNA. Concisa e caratterizzata. Non inventa lore estranea.
 */
function generateBio(rng: Rng, data: CharacterData, user: UserState): BioFile {
  const short = displayName(data.name);
  const { contradiction, drives, traits } = data.characterDna;

  const openings = [
    `È comparso al giorno ${user.day}, mentre ${describeUserMoment(user)}.`,
    `Si è formato quando ${describeUserMoment(user)}.`,
    `Il segnale che lo ha prodotto arriva dal giorno ${user.day}: ${describeUserMoment(user)}.`,
  ];

  const middles = [
    `Tiene insieme ${contradiction.a} e ${contradiction.b} senza risolverle.`,
    `Vive nella distanza fra ${contradiction.a} e ${contradiction.b}.`,
    `Non sceglie fra ${contradiction.a} e ${contradiction.b}: le porta tutte e due.`,
  ];

  const closings = [
    `Quello che vuole davvero è ${drives[0]}.`,
    `Sotto tutto il resto: ${drives[0]}.`,
    `Se gli chiedi cosa cerca, dice ${drives[0]} — e per una volta è sincero.`,
  ];

  const story = [pick(rng, openings), pick(rng, middles), pick(rng, closings)].join(' ');

  const annotations = [
    `${traits[0]} più di quanto ammetta.`,
    data.fashion.eyewear
      ? `non si toglie mai ${it(EYEWEAR_IT, data.fashion.eyewear)}`
      : 'nessuna lente: guarda diretto',
    `${AFFINITY_IT[data.affinity]} — si sente al tatto`,
  ];

  const rememberedDetails = [
    data.fashion.accessories[0]
      ? `porta sempre: ${it(ACCESSORY_IT, data.fashion.accessories[0])}`
      : 'niente addosso',
    `modo di stare: ${MOOD_IT[data.mood]}`,
    data.heritage.length > 0
      ? `viene da ${displayName(data.heritage[0]!.fromMon)}`
      : 'primo nodo, nessun prima',
  ];

  const tags = [
    `#${data.affinity}`,
    `#${data.role}`,
    `#${short}`,
    ...(data.season ? [`#${data.season}`] : []),
  ];

  return { story, annotations, rememberedDetails, tags };
}

/** Frase breve che descrive il momento reale che ha generato il .mon. */
function describeUserMoment(user: UserState): string {
  const known = STAT_KEYS.filter((k) => isKnown(user.health.stats[k].value));
  if (known.length === 0) return 'il sistema non aveva ancora nessun dato su di te';

  const best = known.reduce((a, b) =>
    (user.health.stats[a].value as number) >= (user.health.stats[b].value as number) ? a : b,
  );
  const worst = known.reduce((a, b) =>
    (user.health.stats[a].value as number) <= (user.health.stats[b].value as number) ? a : b,
  );

  if (best === worst) return `${best} era l'unico segnale leggibile`;
  return `${best} saliva e ${worst} restava indietro`;
}

/**
 * SIGILLO (§13, §23): marchio monocromo derivato dal Character DNA.
 * Finché non arriva l'asset disegnato, il prototipo costruisce una figura
 * geometrica deterministica — segnaposto dichiarato, non character art
 * inventata (§18A).
 */
function generateSigil(rng: Rng, data: CharacterData): SigilSeed {
  return {
    arms: pickInt(rng, 3, 8),
    rotation: pickInt(rng, 0, 359),
    ring: chance(rng, 0.55),
    solidCore: data.rarity === 'RARE' || data.rarity === 'ANOMALOUS' || data.rarity === 'SINGULAR',
  };
}

/**
 * REAZIONI di fallback (§17): finché il Reaction Pack non è importato, le
 * reazioni esistono comunque, in forma testuale. Nessuna schermata si blocca.
 */
function generateReactions(rng: Rng, data: CharacterData): string[] {
  const base = ['sì', 'no', 'boh', 'ottimo', 'aspetta', 'di nuovo?'];
  const byMood: Record<string, string[]> = {
    FOCUSED: ['annuisce una volta', 'non alza lo sguardo'],
    RESTLESS: ['si sposta di continuo', 'batte un piede'],
    WARM: ['si avvicina', 'ride piano'],
    GUARDED: ['incrocia le braccia', 'gira la spalla'],
    ELATED: ['salta sul posto', 'alza le braccia'],
    FLAT: ['scrolla le spalle', 'niente'],
    WIRED: ['scatta', 'parla sopra'],
    TENDER: ['abbassa la testa', 'appoggia la mano'],
    SARCASTIC: ['alza un sopracciglio', 'applausi lenti'],
    DEPLETED: ['si siede', 'chiude gli occhi'],
  };

  return [...pickMany(rng, base, 3), ...(byMood[data.mood] ?? [])];
}
