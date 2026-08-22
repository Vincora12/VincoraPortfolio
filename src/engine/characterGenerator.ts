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
  CULTURAL_ACTIVE_RANGE,
  humanoidityLevel,
  CULTURAL_REFERENCES,
  culturalReference,
  DESIGN_DNA,
  designDnaDef,
  ENGINE_WEIGHTS,
  EYEWEAR_CATEGORIES,
  FASHIONS,
  GENERATION_CONFIG_VERSION,
  HAIRCUTS,
  HAIR_STATES,
  MOODS,
  MASS_OFFSET,
  MOOD_CONFIDENCE_FLOOR,
  NEUTRAL_MOODS,
  ROLES,
  SELECTABLE_FAMILIES,
  SIZES,
  SIZE_ARCHETYPE_MODIFIER_RANGE,
  SIZE_MASS_WEIGHT,
  SIZE_NOISE_RANGE,
  SIZE_SCORE_WEIGHTS,
  SIZE_THRESHOLDS,
  AFFINITIES,
  familyDef,
  type Appearance,
  type FamilyDef,
  type Size,
} from './generation-config';
import { keepEnabled } from './catalogTuning';
import { locked } from './generation-config';
import { makeRng, pick, pickInt, pickMany, pickWeighted, type Rng } from './rng';
import { buildSignalVector, evaluateFit, type GeneratorInput } from './signals';
import { generatePaletteDna } from './colorDna';
import { buildSigil } from './sigil';
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
  /**
   * ⚠️ QUESTA CHIAMATA STA FUORI DALLA TEST PHASE, e lo dichiara.
   *
   * 🔷 La fase ferma Family, taglia e disegnatore per ogni forma nuova. Ma
   * due chiamanti esistono APPOSTA per esplorare quello spazio:
   *
   *   DEV → PROVE     il protocollo §12 confronta i disegnatori a Family
   *                   fissata. Con la fase attiva restava incollato ad ANGEL
   *                   e non confrontava più niente.
   *   verify:batch    misura l'equità delle distribuzioni del motore. Tre
   *                   assi fermi le azzerano, e quei controlli servono a
   *                   provare che il motore è giusto, non la fase.
   *
   * 🔒 Un'eccezione DICHIARATA da chi chiama, non dedotta qui: se il
   * generatore provasse a indovinare chi ha diritto di uscire dalla fase,
   * la fase non sarebbe più una garanzia.
   */
  ignoreTestPhase?: boolean;
  /** §16 — traguardo o ricorrenza, alimenta l'ultima componente del punteggio. */
  hiddenEvent?: boolean;
  /** Limita gli archetipi quando lo stadio della Forma ha una grammatica
   * propria. Se nessun ID appartiene alla Family estratta, il catalogo resta
   * invariato (serve quando la Family non è ANGEL). */
  allowedArchetypes?: readonly string[];
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
  /* 🔒 TEST PHASE 01 — l'ancora della fase di prova viene PRIMA di quella di
     continuità: è più forte perché è temporanea e dichiarata, mentre la
     continuità è una proprietà della partita. */
  const fuoriFase = ctx.ignoreTestPhase === true;
  const lockedFamily = fuoriFase ? null : locked('family');
  const family = lockedFamily
    ? familyDef(lockedFamily)
    : anchored('family')
      ? familyDef(prev!.family)
      : drawnFamily;
  steps.push({
    step: 4,
    stage: 'FAMILY',
    outcome: family.id,
    candidates: familyCandidates,
    /* ⚠️ La traccia dice che è FERMA, non che è stata estratta. Una traccia
       che mostra dei candidati e non dice che il risultato era già deciso
       racconta un sorteggio che non è avvenuto. */
    note: lockedFamily
      ? 'ferma dalla TEST PHASE 01 · gli altri candidati restano a catalogo'
      : anchored('family')
        ? 'tenuta ferma dall’ancora di continuità'
        : `softmax su tutte e ${SELECTABLE_FAMILIES.length} (temperatura ${ENGINE_WEIGHTS.family.temperature}); qui i primi ${ENGINE_WEIGHTS.family.topN}`,
  });

  /* 05 — ARCHETIPO (§18). Si può ancorare solo insieme alla Family: un
     archetipo appartiene a una Family sola e da solo non significa niente. */
  const drawnArchetype = resolveArchetype(rng, family, ctx);
  let archetype =
    anchored('family') && anchored('family_archetype') ? prev!.family_archetype : drawnArchetype;
  steps.push({ step: 5, stage: 'ARCHETYPE', outcome: `${family.id} / ${archetype}` });

  /* 06 — AFFINITY (§19) */
  const drawnAffinity = resolveAffinity(rng, family, ctx);
  let affinity = anchored('affinity') ? prev!.affinity : drawnAffinity;
  steps.push({
    step: 6,
    stage: 'AFFINITY',
    outcome: affinity,
    note: affinity === family.id ? 'coincide con la Family: intensificazione, non ridondanza' : undefined,
  });

  /* 07 — SIZE (§21) */
  const { size: drawnSize, score: sizeScore } = resolveSize(rng, signals, family, archetype);
  const lockedSize = fuoriFase ? null : locked('size');
  let size = lockedSize ?? (anchored('size') ? prev!.size : drawnSize);
  steps.push({
    step: 7,
    stage: 'SIZE',
    outcome: `${size} (score ${sizeScore.toFixed(1)})`,
    /* Il punteggio si continua a calcolare e a mostrare anche da fermi: è
       l'unico modo di vedere, quando la fase finisce, che taglia sarebbe
       uscita. */
    ...(lockedSize ? { note: 'ferma dalla TEST PHASE 01 · il punteggio resta quello vero' } : {}),
  });

  /* 08 — ROLE (§20) */
  const drawnRole = resolveRole(rng);
  let role = anchored('role') ? prev!.role : drawnRole;
  steps.push({ step: 8, stage: 'ROLE', outcome: role });

  /* 09 — FASHION (§20) + marcatori personali (§9) */
  const drawnFashion = resolveFashion(rng, ctx);
  let fashion = anchored('fashion') ? prev!.fashion : drawnFashion;
  const markers = resolveMarkers(rng, family, ctx);
  steps.push({
    step: 9,
    stage: 'FASHION',
    outcome: `${fashion} · ottica ${markers.eyewear?.category ?? 'non plausibile'}`,
  });

  /* 10 — MOOD (§22) */
  const { primary: drawnMood, secondary: moodSecondary } = resolveMood(rng, ctx, signals);
  let moodPrimary = anchored('mood_primary') ? prev!.mood_primary : drawnMood;
  steps.push({
    step: 10,
    stage: 'MOOD',
    outcome: moodSecondary ? `${moodPrimary} + ${moodSecondary}` : moodPrimary,
    note:
      ctx.input.dataConfidence < MOOD_CONFIDENCE_FLOOR
        ? `confidence sotto ${MOOD_CONFIDENCE_FLOOR}: mood neutro invece di inventarne uno forte`
        : undefined,
  });

  /* 🔒 §9.1 — «Forbidden: all axes unchanged.»

     Con un'ancora stretta (MINIMAL tiene fermi sei assi su sette) l'unico asse
     libero può benissimo riestrarre il valore che aveva già: catalogo piccolo,
     stessi segnali in ingresso. Il risultato sarebbe una «forma nuova»
     identica alla precedente — vietata dalla spec, e giustamente: sarebbe una
     presa in giro dopo 28 giorni di attesa.

     Quindi si controlla, e se serve si forza. Prima gli assi indipendenti
     (mood, fashion, role, size, affinity, archetipo dentro la stessa Family);
     MAI la Family, perché archetipo e affinità sono già stati risolti sopra e
     dipendono da lei. */
  if (prev && ctx.continuity) {
    const free = (axis: ContinuityAxis) => !ctx.continuity!.includes(axis);
    const unchanged =
      family.id === prev.family &&
      archetype === prev.family_archetype &&
      affinity === prev.affinity &&
      size === prev.size &&
      role === prev.role &&
      fashion === prev.fashion &&
      moodPrimary === prev.mood_primary;

    if (unchanged) {
      const other = <T>(pool: readonly T[], current: T): T | null => {
        const alt = pool.filter((v) => v !== current);
        return alt.length > 0 ? pick(rng, alt) : null;
      };

      let forced: string | null = null;

      if (free('mood_primary')) {
        const v = other(MOODS.map((m) => m.id), moodPrimary);
        if (v) ((moodPrimary = v), (forced = 'MOOD'));
      }
      if (!forced && free('fashion')) {
        const v = other(FASHIONS.map((f) => f.id), fashion);
        if (v) ((fashion = v), (forced = 'FASHION'));
      }
      if (!forced && free('role')) {
        const v = other(ROLES.map((r) => r.id), role);
        if (v) ((role = v), (forced = 'ROLE'));
      }
      if (!forced && free('size')) {
        const v = other(SIZES, size);
        if (v) ((size = v), (forced = 'SIZE'));
      }
      if (!forced && free('affinity')) {
        const v = other(AFFINITIES.map((a) => a.id), affinity);
        if (v) ((affinity = v), (forced = 'AFFINITY'));
      }
      if (!forced && free('family_archetype')) {
        const v = other(archetypePool(family, ctx).map((a) => a.id), archetype);
        if (v) ((archetype = v), (forced = 'ARCHETYPE'));
      }

      steps.push({
        step: 10,
        stage: 'CONTINUITÀ — VINCOLO',
        outcome: forced ?? 'nessun asse libero disponibile',
        note: forced
          ? `l'estrazione aveva riprodotto la forma precedente: ${forced} forzato a cambiare (§9.1)`
          : 'ancora troppo stretta perché qualcosa possa cambiare',
      });
    }
  }

  /* 11 — APPEARANCE (§12), indipendente dall'anatomia */
  const appearance = pick(rng, keepEnabled('appearance', APPEARANCES, (a) => a)) as Appearance;
  steps.push({ step: 11, stage: 'APPEARANCE', outcome: appearance });

  /* 🔷 MASTER CHARACTER SYSTEM v1.1 §8 — CHARACTER DESIGN DNA.
     Si estrae a sorte fra quelli in libreria, e NON dipende da niente: non
     dalla Family, non dai segnali, non dall'umore. È una scelta di come
     DISEGNARE, non una conseguenza di chi è la creatura — legarla ai segnali
     produrrebbe «i .mon tristi si disegnano alla McCracken», che è una regola
     che nessuno ha deciso e che si vedrebbe dopo dieci creature. */
  /* 🔷 §5 — QUANTO RESTA UMANO. Si estrae dentro l'intervallo dichiarato dalla
     Family, spostato dall'archetipo quando quell'archetipo è chiaramente più o
     meno umano degli altri della sua specie.

     🔒 L'intervallo è della FAMILY e lo scostamento è DICHIARATO: non si legge
     mai dal nome dell'archetipo. «HUMANOID» dentro un id è una coincidenza di
     catalogo, e dedurne un valore sarebbe la stessa classe di difetto della
     taglia dedotta dalla posizione in elenco — già corretta una volta. */
  const archDef = family.archetypes.find((a) => a.id === archetype);
  const [hLo, hHi] = family.humanoidity;
  const humanoidity = Math.max(
    1,
    Math.min(5, pickInt(rng, hLo, hHi) + (archDef?.humanShift ?? 0)),
  );
  steps.push({
    step: 5.5,
    stage: 'HUMANOIDITY',
    outcome: `${humanoidity}/5 — ${humanoidityLevel(humanoidity).it}`,
    note: `${family.id} vive fra ${hLo} e ${hHi}${archDef?.humanShift ? `, ${archetype} sposta di ${archDef.humanShift}` : ''}`,
  });

  /* 🔒 TEST PHASE 01 — il disegnatore resta KEN, e gli altri sei restano nel
     catalogo: `DESIGN_DNA` non viene toccato, il sorteggio riparte da solo
     quando la fase si spegne. */
  const lockedDesigner = fuoriFase ? null : locked('characterDesigner');
  /* ⚠️ L'ESTRAZIONE SI FA COMUNQUE, anche da fermi, e poi si sovrascrive.

     Saltarla sembrerebbe più pulito e invece sposterebbe la sequenza casuale
     di tutto quello che viene dopo — Cultural DNA compreso. Lo stesso seme
     darebbe creature diverse a fase accesa e a fase spenta, e il giorno che
     la spegni non potresti più confrontare niente con quello che avevi
     visto. */
  const drawnDesigner = pick(rng, keepEnabled('design', DESIGN_DNA, (d) => d.id)).id;
  const designDna = lockedDesigner ?? drawnDesigner;
  const culturalDna = resolveCulturalDna(rng, ctx);
  steps.push({
    step: 11.5,
    stage: 'CHARACTER DESIGN DNA',
    outcome: `${designDna} · densità ${designDnaDef(designDna).density}/5`,
    note: lockedDesigner
      ? 'fermo dalla TEST PHASE 01 · definisce la lingua, non una soluzione ricorrente'
      : 'costruzione, non resa: l’Appearance sopra decide la superficie',
  });

  steps.push({
    step: 11.7,
    stage: 'CULTURAL DNA',
    outcome: culturalDna.map((id) => culturalReference(id)?.it ?? id).join(' + '),
    note: `${culturalDna.length} riferimenti, uno per cluster: il master li vuole distanti`,
  });

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
    massSizeTension: isMassSizeTension(family, archetype, size),
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
    humanoidity,
    character_design_dna: designDna,
    cultural_dna: culturalDna,
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
      sigil: generateSigil(data, ctx.previous),
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
  /* 🔷 §20.3 — solo le Family accese in DEV → CATALOGHI. Il filtro sta QUI,
     prima del punteggio, non dopo: filtrare i vincitori vorrebbe dire far
     vincere una Family spenta e poi ripescare il secondo, che non è la stessa
     cosa — il softmax lavorerebbe su una distribuzione che non esiste. */
  const scored = keepEnabled('family', SELECTABLE_FAMILIES, (f) => f.id).map((f) => {
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

  // Step 6: softmax su TUTTE le Family. Il punteggio più alto si sottrae prima
  // dell'esponenziale — è la forma numericamente stabile, e non cambia i pesi
  // relativi perché è un fattore comune che si semplifica nella divisione.
  scored.sort((a, b) => b.total - a.total);
  const best = scored[0]!.total;
  const chosen = pickWeighted(
    rng,
    scored.map((t) => ({ item: t, weight: Math.exp((t.total - best) / w.temperature) })),
  );

  const candidates: TraceCandidate[] = scored.slice(0, w.topN).map((t) => ({
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

  /* Tutti gli archetipi della Family partono uguali: l'unica cosa che li
     separa è quanto di recente sono stati usati. Poi si ESTRAE — non si prende
     il massimo — perché con l'argmax la voce con il punteggio medio più alto
     vince quasi sempre, e «quasi sempre» ripetuto per anni vuol dire «sempre». */
  const pool = archetypePool(family, ctx);
  const entries = pool.map((a) => {
    const key = `${family.id}/${a.id}`;
    const noveltyPenalty =
      recent[0] === key ? w.immediateRepeatPenalty : recent.includes(key) ? w.recentPenalty : 0;

    return {
      item: a.id,
      weight: Math.max(1, (100 + noveltyPenalty) * w.novelty + 100 * w.randomness),
    };
  });

  return pickWeighted(rng, entries);
}

function archetypePool(family: FamilyDef, ctx: GenerationContext): FamilyDef['archetypes'] {
  const limited = ctx.allowedArchetypes
    ? family.archetypes.filter((a) => ctx.allowedArchetypes!.includes(a.id))
    : [];
  return limited.length > 0 ? limited : family.archetypes;
}

/* ============================================================================
   §19 — AFFINITY
   ========================================================================= */

function resolveAffinity(rng: Rng, family: FamilyDef, ctx: GenerationContext): string {
  const w = ENGINE_WEIGHTS.affinity;
  const recent = ctx.input.novelty.recentAffinities;

  const scored = keepEnabled('affinity', AFFINITIES, (a) => a.id).map((a) => {
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
  // Il verso lo dà la MASSA DICHIARATA dell'archetipo, non la sua posizione
  // nell'elenco; il rumore evita che l'archetipo decida la taglia da solo.
  const def = family.archetypes.find((a) => a.id === archetype);
  const mass = def ? MASS_OFFSET[def.mass] : 0;
  const morphology =
    mass * SIZE_ARCHETYPE_MODIFIER_RANGE * SIZE_MASS_WEIGHT + (rng() * 2 - 1) * SIZE_NOISE_RANGE;

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
  const scored = keepEnabled('role', ROLES, (r) => r.id).map((r) => ({
    id: r.id,
    total: rng() * 100 * w.personality + rng() * 100 * w.cultural + rng() * 100 * w.mood + rng() * 100 * w.randomness,
  }));
  scored.sort((a, b) => b.total - a.total);
  return scored[0]!.id;
}

function resolveFashion(rng: Rng, ctx: GenerationContext): string {
  const w = ENGINE_WEIGHTS.fashion;
  const recent = ctx.input.novelty.recentFashion;
  const scored = keepEnabled('fashion', FASHIONS, (f) => f.id).map((f) => ({
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
   §7 (MASTER CHARACTER SYSTEM v1.1) — I RIFERIMENTI ATTIVI DI QUESTA FORMA

   🔷 «Il sito dovrebbe prima ESTRARRE, per questa singola Form, qualcosa tipo
   ACTIVE CULTURAL DNA: Neapolitan superstition + Y2K digital optimism +
   botanical transformation — e poi il prompt dovrebbe contenere solo quei 2–4
   elementi. La libreria completa può stare nel generatore, non nel prompt.»

   🔒 DUE VINCOLI, E IL SECONDO È QUELLO CHE FA LA DIFFERENZA.

   1. POCHI: da due a quattro. «A small number», dice il master.
   2. DISTANTI: mai due dallo stesso cluster. Senza questo uscirebbe
      «Final Fantasy + Kingdom Hearts + magical girl», che non sono tre
      riferimenti combinati: è un riferimento solo, ripetuto tre volte. È
      esattamente la convergenza che rende una creatura generica.

   E i TUOI interessi pesano: un riferimento che risuona con una cosa che hai
   dichiarato esce più facilmente. Pesa, non decide — se decidesse, ogni forma
   pescherebbe dagli stessi due mondi e in sei mesi si assomiglierebbero tutte.
   ========================================================================= */

function resolveCulturalDna(rng: Rng, ctx: GenerationContext): string[] {
  const mine = ctx.input.cultural;
  const wanted = pickInt(rng, CULTURAL_ACTIVE_RANGE.min, CULTURAL_ACTIVE_RANGE.max);

  const scored = CULTURAL_REFERENCES.map((r) => ({
    ref: r,
    /* Il peso dei tuoi interessi resta MINORITARIO rispetto al caso: 40 punti
       contro 100. Serve a inclinare, non a scegliere. */
    weight: rng() * 100 + (mine[r.signal] ? 40 : 0),
  })).sort((a, b) => b.weight - a.weight);

  const out: string[] = [];
  const usedClusters = new Set<string>();
  for (const { ref } of scored) {
    if (out.length >= wanted) break;
    if (usedClusters.has(ref.cluster)) continue;
    usedClusters.add(ref.cluster);
    out.push(ref.id);
  }
  return out;
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

  const ranked = keepEnabled('mood', MOODS, (m) => m.id).map((m) => ({
    id: m.id,
    score: (affinityByMood[m.id] ?? 50) + (rng() * 2 - 1) * 15,
  })).sort((a, b) => b.score - a.score);

  /* ⚠️ UN TEMPERAMENTO SOLO. 🔷 «Perché i temperamenti sono 2? Deve essere 1.»

     🔶 Qui c'era `chance(rng, 0.45)`: il 45% delle creature nasceva con una
     sfumatura secondaria, citando §22 «un primario e una sfumatura secondaria
     facoltativa».

     ⚠️ E LAVORAVA CONTRO IL RESTO DEL SISTEMA. La memoria del resolver chiede
     di ridurre la personalità a UNA contraddizione sociale riconoscibile e a
     UN'idea dominante; il contratto strutturale vieta che un elemento faccia
     più mestieri. Due temperamenti danno al modello due direzioni emotive da
     servire insieme, e quello che esce non è più ricco: è meno deciso. Il
     documento dice anche che «quando una regola nuova è in conflitto con una
     preferenza vecchia, vince la decisione esplicita più recente».

     🔒 IL CAMPO RESTA, sempre `null`: §27 conta ventisette campi e
     `verify:package` lo verifica, e i salvataggi vecchi che una sfumatura ce
     l'hanno continuano a leggersi. Tutto quello che lo usa — voce, bio,
     stanza, profilo, compilatore — già lo salta quando è vuoto.

     Per rimetterlo: `secondary: chance(rng, 0.45) ? ranked[1]!.id : null`. */
  return {
    primary: ranked[0]!.id,
    secondary: null,
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

const ANGEL_FACE_LOGIC = [
  'esattamente due occhi simmetrici e molto leggibili',
  'esattamente due occhi, leggermente diversi per forma ma non per numero',
  'esattamente due occhi disposti sullo stesso volto umanoide',
  'esattamente due occhi grandi; nessun occhio aggiuntivo sul corpo o sulle ali',
];

const CHERUB_FACE_LOGIC = [
  'più teste chiaramente separate, ognuna con esattamente due occhi',
  'tre teste espressive sullo stesso corpo umanoide, ciascuna con esattamente due occhi',
  'una testa principale e teste secondarie più piccole, tutte con esattamente due occhi',
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
    face_logic: pick(
      rng,
      family.id === 'ANGEL'
        ? archetype === 'CHERUB' ? CHERUB_FACE_LOGIC : ANGEL_FACE_LOGIC
        : FACE_LOGIC,
    ),
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

/* ============================================================================
   BIO / FILE PERSONALE (MASTER SPEC v1.9 §8.1)

   🔶 Riscritta in PRIMA PERSONA. Prima diceva «È comparso al giorno 8, mentre
   REC saliva e CARE restava indietro»: una scheda tecnica in terza persona,
   scritta dal sistema su una creatura. Ma la BIO è il quaderno del .mon, non
   il referto di un esame — e chi lo tiene è lui.

   Adesso dice «Sono arrivato l'ottavo giorno. Avevi dormito troppo e mangiato
   poco, e io sono venuto fuori da lì.» Stessa informazione, con dentro un
   soggetto.

   La regola che tiene onesto il racconto: **le frasi nascono dai segnali veri
   che erano in campo alla generazione.** Non è colore aggiunto sopra — è la
   traduzione romanzata di `describeMoment`, che legge le stat che il motore
   aveva davanti. Se dice «avevi dormito troppo» è perché REC era alto.

   §2.4 — tutto al maschile: è lui che scrive.
   ========================================================================= */

/** Come si dice, in italiano vivo, che una stat era alta o bassa quel giorno. */
const STAT_STORY: Record<string, { high: string; low: string }> = {
  FORM: { high: 'il tuo corpo teneva', low: 'il tuo corpo era una domanda aperta' },
  ATK: { high: 'avevi forza da buttare via', low: 'la forza non era la tua priorità' },
  SPD: { high: 'non stavi mai fermo', low: 'ti muovevi poco e lento' },
  DEF: { high: 'stavi dritto', low: 'eri tutto storto' },
  REC: { high: 'avevi dormito bene, forse troppo', low: 'non stavi recuperando niente' },
  CARE: { high: 'ti stavi trattando bene', low: 'non ti stavi trattando bene' },
};

function generateBio(data: CharacterData, ctx: GenerationContext): BioFile {
  const { contradictions, drives, traits } = data.character_dna;
  const c = contradictions[0];
  const day = ctx.input.day;

  const known = STAT_KEYS.filter((k) => isKnown(ctx.input.health.stats[k].value));
  const val = (k: (typeof STAT_KEYS)[number]) => ctx.input.health.stats[k].value as number;

  /* Da dove vengo: il segnale più alto e il più basso di quel giorno, detti
     come li direbbe uno che c'era. È la parte che l'utente deve riconoscere —
     «sono nato perché avevo dormito troppo» — quindi cita cose vere. */
  let origin: string;
  if (known.length === 0) {
    origin = 'Non sapevi ancora dirmi niente di te, e sono venuto fuori lo stesso.';
  } else {
    const best = known.reduce((a, b) => (val(a) >= val(b) ? a : b));
    const worst = known.reduce((a, b) => (val(a) <= val(b) ? a : b));
    origin =
      best === worst
        ? `${STAT_STORY[best]!.high.replace(/^./, (m) => m.toUpperCase())}, ed era l’unica cosa che sapevo di te.`
        : `${STAT_STORY[best]!.high.replace(/^./, (m) => m.toUpperCase())} e ${STAT_STORY[worst]!.low}. Io sono venuto fuori da lì in mezzo.`;
  }

  const story = [
    `Sono arrivato il giorno ${day}.`,
    origin,
    c
      ? `Non ho scelto fra ${c.a} e ${c.b}. Me le porto dietro tutte e due, e non ho intenzione di risolverlo.`
      : 'Tengo insieme cose che non stanno insieme. Funziona.',
    `Quello che voglio davvero, se me lo chiedi, è ${drives[0]}.`,
    data.heritage_traits.length > 0
      ? `Qualcosa di me viene da prima: ${data.heritage_traits[0]!.transformed}. Non ricordo dove l’ho preso.`
      : 'Prima di me non c’era nessuno. Sono il primo nodo.',
  ].join(' ');

  return {
    story,
    /* Annotazioni: righe brevi, come appunti a margine. Sempre sue. */
    annotations: [
      `Sono ${traits[0]} più di quanto ammetta.`,
      data.eyewear
        ? `Sugli occhi, sempre: ${data.eyewear.description}.`
        : 'Niente lenti. Guardo diretto e a volte dà fastidio.',
      `Nel corpo mi porto ${data.character_dna.anatomical_gimmick}.`,
      `Quando non so cosa fare, ${data.character_dna.body_language}.`,
    ],
    rememberedDetails: [
      `La mia sagoma: ${data.character_dna.silhouette_quirk}`,
      `Torna sempre: ${data.character_dna.recurring_motif}`,
      data.heritage_traits.length > 0
        ? `Vengo anche da ${displayName(data.heritage_traits[0]!.from_mon)}`
        : 'Primo nodo, nessun prima',
    ],
    tags: [`#${data.family}`, `#${data.affinity}`, `#${data.role}`, `#${displayName(data.name)}`],
  };
}

/**
 * 🔷 v1.15 §23.5 — il sigillo non si tira più a sorte.
 *
 * Qui c'erano quattro `rng`: braccia, rotazione, anello, e la rarità. Tre su
 * quattro erano il caso, quindi due `.mon` opposti potevano avere lo stesso
 * segno. Adesso ogni parte ha un padre dichiarato, e `rng` non compare più —
 * il sigillo è una FUNZIONE della creatura, non un accessorio estratto
 * insieme a lei.
 *
 * L'angolo si eredita quando c'è una stirpe: i sigilli di una linea
 * condividono l'inclinazione, e si riconoscono senza che sia scritto da
 * nessuna parte.
 */
function generateSigil(data: CharacterData, previous: MonRecord | null): SigilSeed {
  return buildSigil({
    family: data.family,
    affinity: data.affinity,
    rarity: data.rarity,
    recurringMotif: data.character_dna.recurring_motif,
    /* `previous?.sigil` e non `previous.sigil`: un record senza sigillo non
       deve far cadere una generazione. Succede con un salvataggio piu vecchio
       di questo file, e la risposta giusta e «non eredita l'angolo», non un
       errore che blocca la nascita di una creatura. */
    ...(data.heritage_traits.length > 0 && previous?.sigil
      ? { inheritedRotation: previous.sigil.rotation }
      : {}),
  });
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
  if (ctx.heritageOrigins.length > 0) {
    const n = ctx.heritageOrigins.length;
    parts.push(`${n} ${n === 1 ? 'tratto' : 'tratti'} in eredità`);
  }
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

/**
 * §16 — una creatura la cui stazza dichiarata contraddice la taglia uscita.
 *
 * È una tensione VERA fra due assi: l'archetipo dice «occupo molto» e la
 * taglia dice «sono minuscolo». Un ORSO minuscolo o un MICELIO gigantesco sono
 * le due cose che un disegnatore ricorderebbe di aver disegnato.
 */
function isMassSizeTension(family: FamilyDef, archetype: string, size: Size): boolean {
  const mass = family.archetypes.find((a) => a.id === archetype)?.mass;
  if (!mass || mass === 'BALANCED') return false;
  return (mass === 'MASSIVE' && size === 'TINY') || (mass === 'COMPACT' && size === 'GIANT');
}

function isSizeRoleTension(size: Size, role: string): boolean {
  if (size === 'TINY') return ['GUARDIAN', 'KING', 'KNIGHT'].includes(role);
  if (size === 'GIANT') return ['SCOUT', 'TRICKSTER', 'DANCER', 'RACER'].includes(role);
  return false;
}

/* ⚠️ Misurava la deviazione su TUTTE E QUARANTA le chiavi del vettore, ma
   trenta di quelle sono riempite con 50 quando il Personality Seed è neutro e
   le affinità culturali non sono state scelte. Trenta valori identici
   schiacciano la deviazione a prescindere da come stai: il risultato diceva
   «profilo piatto» anche a chi aveva REC a 25 e ATK a 80.

   Non era un difetto isolato. `dataSpecificity` vale 15 punti su 100 del
   punteggio di rarità e ne perdeva stabilmente 5, che è esattamente il motivo
   per cui il punteggio non arrivava mai a 94 e SINGULAR non poteva uscire.

   🔒 Adesso guarda i SEGNALI VERI: le sei stat di salute e DISC. Sono quelli
   che §16 intende con «recent user signals» — il seme di personalità e i tag
   culturali sono impostazioni, non segnali, e non devono diluire la misura. */
function signalSpread(signals: Record<string, number>): number {
  const values = [...STAT_KEYS.map((k) => signals[k]!), signals.DISC!];
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
