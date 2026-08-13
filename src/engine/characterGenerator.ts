/* ============================================================================
   CHARACTER GENERATOR (§17–§24)

   §24 fissa l'ordine autorevole in 20 passi. Questo file lo esegue in quel
   preciso ordine, con i numeri di passo citati, perché l'ordine non è
   cosmetico: l'Archetipo esiste solo dopo la Family, l'Affinity solo dopo
   l'Archetipo, la rarità solo dopo che la configurazione è completa.

   §29 — nessun numero vive qui. Pesi, soglie e cataloghi stanno tutti in
   `generation-config.ts`. Questo modulo li applica e basta.

   §29 — ogni generazione produce una GENERATION TRACE con punteggi, penalità,
   pool e seed. È visibile solo in DEV: §29 vieta di esporre in produzione le
   probabilità di Family.
   ========================================================================= */

import {
  APPEARANCES,
  ENGINE_WEIGHTS,
  EYEWEAR_CATEGORIES,
  FASHIONS,
  GENERATION_CONFIG_VERSION,
  HAIRCUTS,
  HAIR_STATES,
  MOODS,
  MOOD_CONFIDENCE_FLOOR,
  NEUTRAL_MOODS,
  ROLES,
  SELECTABLE_FAMILIES,
  SIZE_ARCHETYPE_MODIFIER_RANGE,
  SIZE_SCORE_WEIGHTS,
  SIZE_THRESHOLDS,
  AFFINITIES,
  familyDef,
  type Appearance,
  type FamilyDef,
  type Size,
} from './generation-config';
import { chance, makeRng, pick, pickInt, pickMany, type Rng } from './rng';
import { buildSignalVector, evaluateFit, type GeneratorInput } from './signals';
import { generatePaletteDna } from './colorDna';
import { generateReactions, generateVoiceDna } from './voiceDna';
import { rollRarity, type UnlockContext } from './rarity';
import { generateMonName } from './naming';
import { countChangedAxes, translateHeritage, type HeritageOrigin } from './heritage';
import { AXIS_LABELS, type ContinuityAxis } from './progression';
import { emptyAssetStatus } from './assets';
import type {
  BioFile,
  CharacterData,
  CharacterDna,
  GenerationTrace,
  MonRecord,
  SigilSeed,
  TraceCandidate,
  TraceStep,
} from './types';
import { STAT_KEYS, displayName, isKnown } from './types';

/* --- Contesto -------------------------------------------------------------- */

export interface GenerationContext {
  input: GeneratorInput;
  mindlineNodeId: string;
  originNodeId: string | null;
  heritageOrigins: readonly HeritageOrigin[];
  lineageNames: readonly string[];
  previous: MonRecord | null;
  /**
   * 🔶 Ancora di continuità di una Form Evolution: gli assi che NON cambiano.
   * VINZ.MON è una entità sola, quindi una forma nuova non è una rigenerazione
   * da zero. Vale solo con `previous` valorizzato; per il primo nodo è vuota.
   */
  continuity?: readonly ContinuityAxis[];
  seed: number;
  /** §25 DEV://UNLOCK_ALL. */
  devUnlockAll?: boolean;
  /** §16 — traguardo o ricorrenza, alimenta l'ultima componente del punteggio. */
  hiddenEvent?: boolean;
}

export interface GenerationResult {
  record: MonRecord;
  trace: GenerationTrace;
}

/* ============================================================================
   §24 — ORDINE AUTOREVOLE
   ========================================================================= */

export function generateMon(ctx: GenerationContext): GenerationResult {
  const rng = makeRng(ctx.seed);
  const steps: TraceStep[] = [];

  /* 01–02 — USER STATE e MINDLINE STATE */
  const signals = buildSignalVector(ctx.input);
  steps.push({
    step: 1,
    stage: 'USER STATE',
    outcome: `confidence ${ctx.input.dataConfidence} · bond ${ctx.input.bond} · giorni attivi ${ctx.input.activeDays}`,
  });
  steps.push({
    step: 2,
    stage: 'MINDLINE STATE',
    outcome: `depth ${ctx.input.mindlineDepth} · branch ${ctx.input.branchCount} · nodi recenti ${ctx.input.novelty.recentFamilies.length}`,
  });

  /* 🔶 ANCORA DI CONTINUITÀ — vedi `progression.ts`.

     Gli assi ancorati si risolvono comunque, e il valore estratto viene poi
     sostituito con quello del .mon precedente. Costa un'estrazione inutile, ma
     tiene la sequenza di rng identica a quella di una generazione libera: il
     seed resta riproducibile a prescindere dall'ancora scelta. */
  const prev = ctx.previous?.data ?? null;
  const anchored = (axis: ContinuityAxis): boolean =>
    prev !== null && ctx.continuity?.includes(axis) === true;

  /* 04 — FAMILY (§17). Il passo 03 sulla rarità si risolve alla fine, quando
     la configurazione esiste: qui si registra solo l'eleggibilità. */
  const { family: drawnFamily, candidates: familyCandidates } = resolveFamily(rng, ctx, signals);
  const family = anchored('family') ? familyDef(prev!.family) : drawnFamily;
  steps.push({
    step: 4,
    stage: 'FAMILY',
    outcome: family.id,
    candidates: familyCandidates,
    note: anchored('family')
      ? 'tenuta ferma dall’ancora di continuità'
      : `estrazione pesata fra i primi ${ENGINE_WEIGHTS.family.topN}`,
  });

  /* 05 — ARCHETIPO (§18). Si può ancorare solo insieme alla Family: un
     archetipo appartiene a una Family sola e da solo non significa niente. */
  const drawnArchetype = resolveArchetype(rng, family, ctx);
  const archetype =
    anchored('family') && anchored('family_archetype') ? prev!.family_archetype : drawnArchetype;
  steps.push({ step: 5, stage: 'ARCHETYPE', outcome: `${family.id} / ${archetype}` });

  /* 06 — AFFINITY (§19) */
  const drawnAffinity = resolveAffinity(rng, family, ctx);
  const affinity = anchored('affinity') ? prev!.affinity : drawnAffinity;
  steps.push({
    step: 6,
    stage: 'AFFINITY',
    outcome: affinity,
    note: affinity === family.id ? 'coincide con la Family: intensificazione, non ridondanza' : undefined,
  });

  /* 07 — SIZE (§21) */
  const { size: drawnSize, score: sizeScore } = resolveSize(rng, signals, family, archetype);
  const size = anchored('size') ? prev!.size : drawnSize;
  steps.push({ step: 7, stage: 'SIZE', outcome: `${size} (score ${sizeScore.toFixed(1)})` });

  /* 08 — ROLE (§20) */
  const drawnRole = resolveRole(rng);
  const role = anchored('role') ? prev!.role : drawnRole;
  steps.push({ step: 8, stage: 'ROLE', outcome: role });

  /* 09 — FASHION (§20) + marcatori personali (§9) */
  const drawnFashion = resolveFashion(rng, ctx);
  const fashion = anchored('fashion') ? prev!.fashion : drawnFashion;
  const markers = resolveMarkers(rng, family, ctx);
  steps.push({
    step: 9,
    stage: 'FASHION',
    outcome: `${fashion} · ottica ${markers.eyewear?.category ?? 'non plausibile'}`,
  });

  /* 10 — MOOD (§22) */
  const { primary: drawnMood, secondary: moodSecondary } = resolveMood(rng, ctx, signals);
  const moodPrimary = anchored('mood_primary') ? prev!.mood_primary : drawnMood;
  steps.push({
    step: 10,
    stage: 'MOOD',
    outcome: moodSecondary ? `${moodPrimary} + ${moodSecondary}` : moodPrimary,
    note:
      ctx.input.dataConfidence < MOOD_CONFIDENCE_FLOOR
        ? `confidence sotto ${MOOD_CONFIDENCE_FLOOR}: mood neutro invece di inventarne uno forte`
        : undefined,
  });

  /* 11 — APPEARANCE (§12), indipendente dall'anatomia */
  const appearance: Appearance = pick(rng, APPEARANCES);
  steps.push({ step: 11, stage: 'APPEARANCE', outcome: appearance });

  /* 12 — HERITAGE (§23) */
  const heritage = translateHeritage(rng, ctx.heritageOrigins, family.id, affinity);
  steps.push({
    step: 12,
    stage: 'HERITAGE',
    outcome: heritage.length === 0 ? 'nodo di origine' : `${heritage.length} tratti tradotti`,
  });

  /* 13 — CHARACTER DNA (§40) */
  const characterDna = generateCharacterDna(rng, family, archetype, affinity);
  const paletteDna = generatePaletteDna(rng, family.id, affinity, moodPrimary);
  steps.push({ step: 13, stage: 'CHARACTER DNA', outcome: characterDna.silhouette_quirk });

  /* 14 — VOICE DNA (§13/§14) */
  const { preset: voicePreset, voice } = generateVoiceDna(rng, characterDna, moodPrimary);
  steps.push({
    step: 14,
    stage: 'VOICE DNA',
    outcome: `${voicePreset} · ${voice.deviations?.length ?? 0} assi in deviazione`,
  });

  /* 03 + 15 + 16 — RARITÀ (§15/§16/§26) */
  const changedAxes = countChangedAxes(ctx.previous, {
    family: family.id,
    archetype,
    affinity,
    fashion,
    eyewear: markers.eyewear?.category ?? null,
    voicePreset,
    palettePrimary: paletteDna.primary,
  });

  const unlockCtx: UnlockContext = {
    mindlineDepth: ctx.input.mindlineDepth,
    bond: ctx.input.bond,
    dataConfidence: ctx.input.dataConfidence,
    activeDays: ctx.input.activeDays,
    branchCount: ctx.input.branchCount,
    hiddenTriggerFired: ctx.hiddenEvent === true,
    devUnlockAll: ctx.devUnlockAll,
  };

  const rarity = rollRarity(rng, unlockCtx, {
    freshAxes: changedAxes,
    affinityEqualsFamily: affinity === family.id,
    sizeRoleTension: isSizeRoleTension(size, role),
    rareArchetype: family.archetypes.findIndex((a) => a.id === archetype) >= 4,
    dataConfidence: ctx.input.dataConfidence,
    signalSpread: signalSpread(signals),
    heritageCount: heritage.length,
    heritageTranslated: heritage.filter((h) => h.transformed !== h.origin).length,
    voiceDeviations: voice.deviations?.length ?? 0,
    freshEyewear:
      markers.eyewear === null ||
      !ctx.input.novelty.recentEyewear.includes(markers.eyewear.category),
    freshSilhouette: !ctx.input.novelty.recentArchetypes.includes(`${family.id}/${archetype}`),
    hiddenEvent: ctx.hiddenEvent === true,
  });

  steps.push({
    step: 15,
    stage: 'RARITY SCORE',
    outcome: `${rarity.score}/100 → tetto ${rarity.cap}`,
  });
  steps.push({
    step: 16,
    stage: 'RARITY ROLL',
    outcome: rarity.rarity,
    note: rarity.eligiblePool.map((p) => `${p.rarity} ${p.chance.toFixed(1)}%`).join(' · '),
  });

  /* 17 — NOME (§24 step 17) */
  const name = generateMonName(rng, ctx.lineageNames);
  steps.push({ step: 17, stage: 'NAME', outcome: name });

  /* 18 — CHARACTER_DATA.json, senza che serva alcuna immagine */
  const data: CharacterData = {
    name,
    family: family.id,
    family_archetype: archetype,
    affinity,
    size,
    role,
    fashion,
    mood_primary: moodPrimary,
    mood_secondary: moodSecondary,
    appearance,
    rarity: rarity.rarity,
    rarity_score: rarity.score,
    season: ctx.input.season ?? null,
    palette_dna: paletteDna,
    eyewear: markers.eyewear,
    hair_state: markers.hairState,
    haircut: markers.haircut,
    character_dna: characterDna,
    voice_preset: voicePreset,
    voice_dna: voice,
    cultural_affinities: Object.keys(ctx.input.cultural),
    heritage_traits: heritage,
    mindline_node: ctx.mindlineNodeId,
    origin_node: ctx.originNodeId,
    bond: ctx.input.bond,
    data_confidence: ctx.input.dataConfidence,
    generation_reason_summary: buildReasonSummary(family, affinity, role, moodPrimary, ctx),
    asset_manifest_status: emptyAssetStatus(),
    seed: ctx.seed,
    generation_config_version: GENERATION_CONFIG_VERSION,
    generated_at_day: ctx.input.day,
  };

  steps.push({ step: 18, stage: 'CHARACTER DATA', outcome: 'esportabile, nessuna immagine richiesta' });

  if (prev && ctx.continuity && ctx.continuity.length > 0) {
    steps.push({
      step: 19,
      stage: 'CONTINUITÀ',
      outcome: ctx.continuity.map((a) => AXIS_LABELS[a]).join(' · '),
      note: `assi tenuti fermi da ${displayName(prev.name)}: la stessa entità che si trasforma`,
    });
  }

  const trace: GenerationTrace = {
    seed: ctx.seed,
    generation_config_version: GENERATION_CONFIG_VERSION,
    steps,
    rarity: {
      score: rarity.score,
      breakdown: rarity.breakdown,
      cap: rarity.cap,
      unlockedPool: rarity.unlockedPool,
      eligiblePool: rarity.eligiblePool,
      rolled: rarity.rarity,
    },
  };

  return {
    record: {
      data,
      bio: generateBio(data, ctx),
      sigil: generateSigil(rng, data),
      reactions: generateReactions(rng, moodPrimary),
      bornOnDay: ctx.input.day,
      retiredOnDay: null,
    },
    trace,
  };
}

/* ============================================================================
   PRIMO NODO

   🔶 Scostamento voluto dalla GENERATION BIBLE v2.1: non esiste più una radice
   canonica. La bibbia fissava `Vz.mon`, SLIME // ROOT, uguale per tutti; adesso
   il primo .mon si estrae come qualunque altro, quindi due partite non
   cominciano dalla stessa creatura.

   Resta una funzione a sé perché il primo nodo è l'unico senza eredità e senza
   .mon precedente: chiamarla dice al lettore che quei due campi sono vuoti per
   ragioni di posizione, non per un caso limite.
   ========================================================================= */

export function generateFirstMon(
  ctx: Omit<GenerationContext, 'heritageOrigins' | 'previous'>,
): GenerationResult {
  return generateMon({ ...ctx, heritageOrigins: [], previous: null });
}

/* ============================================================================
   §17 — SELEZIONE DELLA FAMILY
   ========================================================================= */

function resolveFamily(
  rng: Rng,
  ctx: GenerationContext,
  signals: ReturnType<typeof buildSignalVector>,
): { family: FamilyDef; candidates: TraceCandidate[] } {
  const w = ENGINE_WEIGHTS.family;
  const recent = ctx.input.novelty.recentFamilies;

  // Step 2–5: fit, penalità di novità, modificatore culturale, rumore.
  const scored = SELECTABLE_FAMILIES.map((f) => {
    const fit = evaluateFit(f.fit, signals);

    let noveltyPenalty = 0;
    if (recent[0] === f.id) noveltyPenalty = w.noveltyPenaltyImmediate;
    else if (recent.slice(0, 3).includes(f.id)) noveltyPenalty = w.noveltyPenaltyLast3;
    else if (recent.slice(0, 6).includes(f.id)) noveltyPenalty = w.noveltyPenaltyLast6;

    const culturalModifier = (rng() * 2 - 1) * w.culturalModifierRange;
    const noise = (rng() * 2 - 1) * w.noiseRange;

    return {
      def: f,
      fit,
      noveltyPenalty,
      culturalModifier,
      noise,
      total: fit + noveltyPenalty + culturalModifier + noise,
    };
  });

  // Step 6: estrazione pesata fra le prime 6.
  scored.sort((a, b) => b.total - a.total);
  const top = scored.slice(0, w.topN);

  // Softmax con i punteggi riportati sopra lo zero, così un totale negativo
  // non produce un peso negativo.
  const floor = Math.min(...top.map((t) => t.total), 0);
  const weights = top.map((t) => Math.max(0.001, t.total - floor + 1));
  const sum = weights.reduce((s, x) => s + x, 0);

  let r = rng() * sum;
  let chosen = top[top.length - 1]!;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i]!;
    if (r <= 0) {
      chosen = top[i]!;
      break;
    }
  }

  const candidates: TraceCandidate[] = top.map((t) => ({
    id: t.def.id,
    fit: round1(t.fit),
    noveltyPenalty: round1(t.noveltyPenalty),
    culturalModifier: round1(t.culturalModifier),
    noise: round1(t.noise),
    total: round1(t.total),
    chosen: t.def.id === chosen.def.id,
  }));

  return { family: chosen.def, candidates };
}

/* ============================================================================
   §18 — ARCHETIPO
   ========================================================================= */

function resolveArchetype(rng: Rng, family: FamilyDef, ctx: GenerationContext): string {
  const w = ENGINE_WEIGHTS.archetype;
  const recent = ctx.input.novelty.recentArchetypes;

  const scored = family.archetypes.map((a, index) => {
    // Il fit morfologico dell'archetipo dipende dalla sua posizione nella
    // Family: le voci più avanti sono strutturalmente più insolite (§18).
    const fit = 70 - index * 6 + rng() * 20;
    const key = `${family.id}/${a.id}`;
    const noveltyPenalty = recent[0] === key ? w.immediateRepeatPenalty : recent.includes(key) ? -10 : 0;

    return {
      id: a.id,
      total: fit * w.fit + (100 + noveltyPenalty) * w.novelty + rng() * 100 * w.randomness,
    };
  });

  scored.sort((a, b) => b.total - a.total);
  return scored[0]!.id;
}

/* ============================================================================
   §19 — AFFINITY
   ========================================================================= */

function resolveAffinity(rng: Rng, family: FamilyDef, ctx: GenerationContext): string {
  const w = ENGINE_WEIGHTS.affinity;
  const recent = ctx.input.novelty.recentAffinities;

  const scored = AFFINITIES.map((a) => {
    const healthMood = rng() * 100;
    const personality = rng() * 100;
    const novelty = recent.includes(a.id) ? 30 : 100;
    // §19 — la coincidenza esatta con la Family è ridondanza, non divieto:
    // resta possibile quando produce intensificazione.
    const redundancy = a.id === family.id ? w.sameAsFamilyPenalty : 0;

    return {
      id: a.id,
      total:
        healthMood * w.healthMood +
        personality * w.personalityCultural +
        novelty * w.novelty +
        rng() * 100 * w.randomness +
        redundancy,
    };
  });

  scored.sort((a, b) => b.total - a.total);
  return scored[0]!.id;
}

/* ============================================================================
   §21 — TAGLIA
   ========================================================================= */

function resolveSize(
  rng: Rng,
  signals: ReturnType<typeof buildSignalVector>,
  family: FamilyDef,
  archetype: string,
): { size: Size; score: number } {
  // §21 — i cinque segnali danno il punteggio di base 0–100 (i pesi del
  // documento sono già normalizzati nel config, così segnali a metà scala
  // producono 50: §6 chiama MEDIUM «default center state»).
  const base = evaluateFit(SIZE_SCORE_WEIGHTS, signals);

  // §21 — «Archetype morphology modifier ranges -25 to +25 before
  // normalization»: si somma al punteggio, non lo si pesa una seconda volta.
  // La posizione dell'archetipo nella Family ne dà il verso — le voci più
  // avanti nell'elenco sono strutturalmente più massicce o più compresse — e
  // un po' di rumore evita che l'archetipo determini la taglia da solo.
  const index = family.archetypes.findIndex((a) => a.id === archetype);
  const spread = family.archetypes.length > 1 ? index / (family.archetypes.length - 1) : 0.5;
  const morphology = (spread * 2 - 1) * SIZE_ARCHETYPE_MODIFIER_RANGE * 0.7 + (rng() * 2 - 1) * 12;

  const score =
    base +
    Math.max(-SIZE_ARCHETYPE_MODIFIER_RANGE, Math.min(SIZE_ARCHETYPE_MODIFIER_RANGE, morphology));

  const size: Size =
    score < SIZE_THRESHOLDS.tinyBelow
      ? 'TINY'
      : score >= SIZE_THRESHOLDS.giantAtOrAbove
        ? 'GIANT'
        : 'MEDIUM';

  return { size, score };
}

/* ============================================================================
   §20 — ROLE E FASHION
   ========================================================================= */

function resolveRole(rng: Rng): string {
  const w = ENGINE_WEIGHTS.role;
  const scored = ROLES.map((r) => ({
    id: r.id,
    total: rng() * 100 * w.personality + rng() * 100 * w.cultural + rng() * 100 * w.mood + rng() * 100 * w.randomness,
  }));
  scored.sort((a, b) => b.total - a.total);
  return scored[0]!.id;
}

function resolveFashion(rng: Rng, ctx: GenerationContext): string {
  const w = ENGINE_WEIGHTS.fashion;
  const recent = ctx.input.novelty.recentFashion;
  const scored = FASHIONS.map((f) => ({
    id: f.id,
    total:
      rng() * 100 * w.tasteSeason +
      rng() * 100 * w.roleCompat +
      rng() * 100 * w.familyCompat +
      (recent.includes(f.id) ? 20 : 100) * w.novelty,
  }));
  scored.sort((a, b) => b.total - a.total);
  return scored[0]!.id;
}

/* ============================================================================
   §9 — MARCATORI PERSONALI VINZ
   «Eyewear is mandatory whenever anatomically possible.»
   «Do not repeat the same eyewear silhouette in a recent lineage window.»
   ========================================================================= */

function resolveMarkers(rng: Rng, family: FamilyDef, ctx: GenerationContext) {
  const recent = ctx.input.novelty.recentEyewear;

  const eyewear = family.supportsEyewear
    ? (() => {
        const fresh = EYEWEAR_CATEGORIES.filter((c) => !recent.includes(c.id));
        const cat = pick(rng, fresh.length > 0 ? fresh : EYEWEAR_CATEGORIES);
        return {
          category: cat.id,
          description: `${cat.it}, costruite sul cranio di questa creatura invece che appoggiate sopra`,
        };
      })()
    : null;

  // §9 — capelli solo dove l'anatomia li supporta; altrove la decolorazione si
  // traduce in pelo, criniera, piume o fibre, e non si forza una parrucca.
  const hair = family.supportsHair
    ? { state: pick(rng, HAIR_STATES).id, cut: pick(rng, HAIRCUTS).id }
    : null;

  return { eyewear, hairState: hair?.state ?? null, haircut: hair?.cut ?? null };
}

/* ============================================================================
   §22 — MOOD
   ========================================================================= */

function resolveMood(
  rng: Rng,
  ctx: GenerationContext,
  signals: ReturnType<typeof buildSignalVector>,
): { primary: string; secondary: string | null } {
  // §22 — sotto la soglia di confidenza non si fabbrica uno stato emotivo
  // forte: si usa un mood neutro a bassa intensità.
  if (ctx.input.dataConfidence < MOOD_CONFIDENCE_FLOOR) {
    return { primary: pick(rng, NEUTRAL_MOODS), secondary: null };
  }

  // I latenti orientano il mood; §11 vieta che un singolo giorno lo assegni.
  const affinityByMood: Record<string, number> = {
    CUTE: signals.warmth * 0.6 + signals.affection * 0.4,
    GOOFY: signals.playfulness * 0.7 + signals.absurdity * 0.3,
    BRIGHT: signals.energy * 0.6 + signals.confidence * 0.4,
    AGGRESSIVE: signals.irritability * 0.6 + signals.intensity * 0.4,
    CHAOTIC: signals.playfulness * 0.5 + signals.impulsivity * 0.5,
    SAD: signals.melancholy * 0.7 + (100 - signals.energy) * 0.3,
    MYSTERIOUS: signals.mystery * 0.6 + signals.distance * 0.4,
    WATCHFUL: signals.vigilance * 0.7 + signals.stress * 0.3,
    SEDUCTIVE: signals.arousal * 0.5 + signals.confidence * 0.5,
    FLIRTY: signals.arousal * 0.5 + signals.playfulness * 0.5,
    FERAL: signals.arousal * 0.4 + signals.energy * 0.6,
    AFFECTIONATE: signals.affection * 0.7 + signals.warmth * 0.3,
    ALLURING: signals.vanity * 0.5 + signals.confidence * 0.5,
    STOIC: signals.stoicism * 0.6 + signals.calm * 0.4,
    CALM: signals.calm * 0.7 + (100 - signals.stress) * 0.3,
    CREEPY: signals.weirdness * 0.6 + signals.distance * 0.4,
  };

  const ranked = MOODS.map((m) => ({
    id: m.id,
    score: (affinityByMood[m.id] ?? 50) + (rng() * 2 - 1) * 15,
  })).sort((a, b) => b.score - a.score);

  // §22 — un primario e una sfumatura secondaria facoltativa.
  return {
    primary: ranked[0]!.id,
    secondary: chance(rng, 0.45) ? ranked[1]!.id : null,
  };
}

/* ============================================================================
   §40 — CHARACTER DNA
   ========================================================================= */

const SILHOUETTE_QUIRKS = [
  'una spalla più alta dell’altra',
  'un arto visibilmente più lungo',
  'una massa che pende da un lato',
  'la testa inclinata in modo permanente',
  'una zona del corpo che non chiude',
  'un’asimmetria netta fra i due lati',
  'una struttura che continua oltre il corpo',
];

const FACE_LOGIC = [
  'due occhi, ma di dimensioni diverse',
  'nessun occhio visibile, solo un organo sensoriale',
  'occhi disposti in verticale',
  'un occhio dominante e altri minori',
  'il volto è una superficie continua senza tratti',
  'la bocca è una struttura, non una fessura',
];

const BODY_LANGUAGE = [
  'sta sempre leggermente rivolto altrove',
  'occupa più spazio di quanto serva',
  'si muove poco e con precisione',
  'non resta mai fermo del tutto',
  'si posiziona sempre fra te e qualcos’altro',
  'tiene le estremità raccolte',
];

const TRAITS = [
  'ostinato', 'ironico', 'protettivo', 'vanitoso', 'curioso', 'diffidente',
  'generoso', 'impaziente', 'metodico', 'teatrale', 'schivo', 'competitivo',
  'nostalgico', 'pragmatico', 'permaloso', 'affettuoso', 'sarcastico', 'leale',
  'tecnico',
];

const DRIVES = [
  'essere visto', 'non deludere', 'capire come funziona', 'arrivare primo',
  'proteggere qualcosa', 'lasciare un segno', 'restare libero', 'appartenere',
  'migliorare il corpo', 'finire quello che ha iniziato', 'avere ragione',
  'non fermarsi mai',
];

const CONTRADICTIONS = [
  { a: 'sicurezza', b: 'insicurezza' },
  { a: 'disciplina', b: 'caos' },
  { a: 'ossessione per la bellezza', b: 'umorismo grottesco' },
  { a: 'ambizione', b: 'evitamento' },
  { a: 'bisogno di vicinanza', b: 'bisogno di distanza' },
  { a: 'ironia costante', b: 'serietà assoluta' },
  { a: 'nostalgia', b: 'fretta di andare avanti' },
  { a: 'controllo', b: 'impulso' },
];

function generateCharacterDna(
  rng: Rng,
  family: FamilyDef,
  archetype: string,
  affinity: string,
): CharacterDna {
  return {
    silhouette_quirk: pick(rng, SILHOUETTE_QUIRKS),
    anatomical_gimmick: `una zona ${affinity} innestata su anatomia ${family.id} / ${archetype}`,
    face_logic: pick(rng, FACE_LOGIC),
    body_language: pick(rng, BODY_LANGUAGE),
    recurring_motif: pick(rng, [
      'un piccolo segno ripetuto tre volte',
      'una forma a occhio che torna ovunque',
      'una fascia che attraversa il corpo',
      'un nodo, sempre nello stesso punto',
      'una serie di fori allineati',
    ]),
    contradictions: pickMany(rng, CONTRADICTIONS, pickInt(rng, 1, 3)),
    traits: pickMany(rng, TRAITS, 3),
    drives: pickMany(rng, DRIVES, 2),
  };
}

/* ============================================================================
   BIO E SIGILLO
   ========================================================================= */

function generateBio(data: CharacterData, ctx: GenerationContext): BioFile {
  const { contradictions, drives, traits } = data.character_dna;
  const c = contradictions[0];

  const story = [
    `È comparso al giorno ${ctx.input.day}, mentre ${describeMoment(ctx)}.`,
    c
      ? `Non sceglie fra ${c.a} e ${c.b}: le porta tutte e due.`
      : `Tiene insieme cose che non stanno insieme.`,
    `Quello che vuole davvero è ${drives[0]}.`,
  ].join(' ');

  return {
    story,
    annotations: [
      `${traits[0]} più di quanto ammetta.`,
      data.eyewear ? `sugli occhi, sempre: ${data.eyewear.description}` : 'niente lenti: guarda diretto',
      `nel corpo: ${data.character_dna.anatomical_gimmick}`,
    ],
    rememberedDetails: [
      `sagoma: ${data.character_dna.silhouette_quirk}`,
      `modo di stare: ${data.character_dna.body_language}`,
      data.heritage_traits.length > 0
        ? `viene da ${displayName(data.heritage_traits[0]!.from_mon)}`
        : 'primo nodo, nessun prima',
    ],
    tags: [`#${data.family}`, `#${data.affinity}`, `#${data.role}`, `#${displayName(data.name)}`],
  };
}

function describeMoment(ctx: GenerationContext): string {
  const known = STAT_KEYS.filter((k) => isKnown(ctx.input.health.stats[k].value));
  if (known.length === 0) return 'il sistema non aveva ancora nessun dato su di te';

  const val = (k: (typeof STAT_KEYS)[number]) => ctx.input.health.stats[k].value as number;
  const best = known.reduce((a, b) => (val(a) >= val(b) ? a : b));
  const worst = known.reduce((a, b) => (val(a) <= val(b) ? a : b));

  if (best === worst) return `${best} era l'unico segnale leggibile`;
  return `${best} saliva e ${worst} restava indietro`;
}

function generateSigil(rng: Rng, data: CharacterData): SigilSeed {
  const strong = ['RARE', 'EPIC', 'MYTHIC', 'SINGULAR'].includes(data.rarity);
  return {
    arms: pickInt(rng, 3, 8),
    rotation: pickInt(rng, 0, 359),
    ring: chance(rng, 0.55),
    solidCore: strong,
  };
}

/* ============================================================================
   §27 — generation_reason_summary
   Una riga leggibile sul perché è uscito così. §29 vieta di esporre in
   produzione le probabilità: questa è una spiegazione, non una traccia.
   ========================================================================= */

function buildReasonSummary(
  family: FamilyDef,
  affinity: string,
  role: string,
  mood: string,
  ctx: GenerationContext,
): string {
  const parts = [`${family.id} per ${family.drivers.split(',')[0]!.trim()}`];
  if (affinity === family.id) parts.push(`affinity ${affinity} come intensificazione`);
  else parts.push(`contaminato ${affinity}`);
  parts.push(`ruolo ${role}`);
  parts.push(`umore ${mood} dalla finestra recente`);
  if (ctx.heritageOrigins.length > 0) parts.push(`${ctx.heritageOrigins.length} tratti in eredità`);
  return parts.join(' · ');
}

/* ============================================================================
   EVOLUZIONE (§25 CONTINUE / EVOLVE)
   La STESSA identità avanza: restano nome, Family, Archetipo, Affinity, Size,
   Role e Character DNA. Cambiano stato, mood, palette e styling.
   ========================================================================= */

const EVOLUTION_LABELS = ['BASIC FORM', 'POWER FORM', 'HYPER FORM', 'OVERDRIVE FORM', 'TERMINAL FORM'];

export function evolveMon(
  record: MonRecord,
  ctx: GenerationContext,
  newNodeId: string,
): GenerationResult {
  const rng = makeRng(ctx.seed);
  const prev = record.data;
  const stage = (prev.evolution_state?.stage ?? 0) + 1;
  const label = EVOLUTION_LABELS[Math.min(stage, EVOLUTION_LABELS.length - 1)]!;

  const signals = buildSignalVector(ctx.input);
  const { primary, secondary } = resolveMood(rng, ctx, signals);
  const family = familyDef(prev.family);
  const markers = resolveMarkers(rng, family, ctx);

  const data: CharacterData = {
    ...prev,
    mood_primary: primary,
    mood_secondary: secondary,
    palette_dna: generatePaletteDna(rng, prev.family, prev.affinity, primary),
    // §9 — i capelli crescono: lo stato di decolorazione avanza, il taglio resta.
    hair_state: prev.hair_state ? pick(rng, HAIR_STATES).id : null,
    eyewear: markers.eyewear ?? prev.eyewear,
    mindline_node: newNodeId,
    origin_node: prev.mindline_node,
    evolution_state: {
      label,
      stage,
      previous_labels: [
        ...(prev.evolution_state?.previous_labels ?? []),
        prev.evolution_state?.label ?? EVOLUTION_LABELS[0]!,
      ],
    },
    // §21.2 MASTER SPEC — la forma è cambiata: gli asset vanno rigenerati.
    asset_manifest_status: emptyAssetStatus(),
    seed: ctx.seed,
    generation_config_version: GENERATION_CONFIG_VERSION,
    generated_at_day: ctx.input.day,
    generation_reason_summary: `${label}: stessa identità, stadio ${stage}`,
  };

  return {
    record: {
      ...record,
      data,
      bio: {
        ...record.bio,
        annotations: [
          ...record.bio.annotations,
          `${label} — giorno ${ctx.input.day}. Stessa identità, forma nuova.`,
        ],
      },
    },
    trace: {
      seed: ctx.seed,
      generation_config_version: GENERATION_CONFIG_VERSION,
      steps: [
        { step: 0, stage: 'EVOLVE', outcome: `${prev.name} → ${label}` },
        { step: 10, stage: 'MOOD', outcome: primary },
      ],
      rarity: {
        score: prev.rarity_score,
        breakdown: [],
        cap: prev.rarity,
        unlockedPool: [],
        eligiblePool: [],
        rolled: prev.rarity,
      },
    },
  };
}

/* --- Utilità --------------------------------------------------------------- */

function isSizeRoleTension(size: Size, role: string): boolean {
  if (size === 'TINY') return ['GUARDIAN', 'KING', 'KNIGHT'].includes(role);
  if (size === 'GIANT') return ['SCOUT', 'TRICKSTER', 'DANCER', 'RACER'].includes(role);
  return false;
}

/** Deviazione standard dei segnali: un profilo piatto non è distintivo (§16). */
function signalSpread(signals: Record<string, number>): number {
  const values = Object.values(signals);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
