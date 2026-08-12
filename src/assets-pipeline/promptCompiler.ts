/* ============================================================================
   PROMPT COMPILER (§15, §22, §24.3)

   🔒 LOCKED (§22): per il prototipo la generazione manuale via ChatGPT
   sostituisce la futura image-generation API, MANTENENDO l'architettura di
   servizio prevista. Il prototipo si comporta come se l'API esistesse: invece
   di chiamarla, esporta un pacchetto completo di Asset Request.

   🔒 §22.1 — vincoli sui prompt:
   • Devono essere PROMPT COMPLETI, non brief creativi.
   • Compilati da Character Data canonico + regole dell'Appearance scelto +
     requisiti esatti di implementazione.
   • Ogni prompt specifica perché l'asset esiste, dove verrà usato, aspect
     ratio, crop, safe area, trattamento dello sfondo, posa, numero di
     frame/stati, requisiti di consistenza e vincoli tecnici.
   • Non si chiede MAI a ChatGPT di ridisegnare il .mon fra un asset e
     l'altro: il Character Master resta la fonte di verità visiva.

   I prompt sono in inglese perché è la lingua del generatore di immagini;
   la UI del prototipo resta in italiano.
   ========================================================================= */

import {
  APPEARANCE_LABELS,
  APPEARANCE_SPEC,
  HAIR_BLEACH_STATES,
  SIZE_GRAMMAR,
  SEASON_INFLUENCE,
  affinityDef,
  familyDef,
  moodDef,
  fashionDef,
  roleDef,
} from '../engine/taxonomy';
import { ROTATION_SPEC, type AssetTypeDef } from '../engine/assets';
import type { AssetType, MonRecord } from '../engine/types';
import { displayName } from '../engine/types';

/* ============================================================================
   BLOCCO CANONICO DEL PERSONAGGIO
   Identico in ogni prompt del pacchetto. È il meccanismo che impedisce la
   deriva di design fra un asset e l'altro (§22.1, §24.2).
   ========================================================================= */

export function compileCharacterBlock(record: MonRecord): string {
  const d = record.data;
  const fam = familyDef(d.family);
  const aff = affinityDef(d.affinity);
  const short = displayName(d.name);

  const hair = d.fashion.hair
    ? `HAIR: ${d.fashion.hair.cut}; bleach state — ${
        HAIR_BLEACH_STATES.find((h) => h.id === d.fashion.hair!.bleach)!.description
      }. The blonde is REGROWTH after a previous full bleach, never a deliberate ombré or dyed tips.`
    : 'HAIR: none — this anatomy does not support hair. Do not add any.';

  const eyewear = d.fashion.eyewear
    ? `EYEWEAR (MANDATORY, part of the character identity): ${d.fashion.eyewear}. It is always present and must be identical in every asset.`
    : 'EYEWEAR: none — not anatomically plausible on this body. Do not add any.';

  return [
    `CHARACTER NAME: ${short} (canonical id: ${d.name})`,
    ``,
    `FAMILY — primary anatomy, read this FIRST and let it dominate the silhouette:`,
    `  ${d.family} / ${d.familyArchetype}`,
    `  ${fam.anatomy}.`,
    ``,
    `AFFINITY — transforms the actual anatomy and material logic. This is NOT a costume or a colour filter:`,
    `  ${d.affinity} — ${aff.transform}.`,
    ``,
    `SIZE — proportional grammar, never uniform scaling:`,
    `  ${d.size} — ${SIZE_GRAMMAR[d.size]}`,
    ``,
    `ROLE — narrative direction expressed through anatomy and behaviour:`,
    `  ${d.role} — ${roleDef(d.role).behavior}.`,
    ``,
    `FASHION — outfit logic. It must NEVER obscure the readability of the FAMILY anatomy:`,
    `  attitude: ${d.fashion.attitude} — ${fashionDef(d.fashion.attitude).logic}.`,
    `  footwear: ${d.fashion.footwear}.`,
    `  accessories: ${d.fashion.accessories.join('; ') || 'none'}.`,
    `  ${eyewear}`,
    `  ${hair}`,
    `  Fashion references are broad stylistic shorthand only. Never reproduce a real product, logo or brand.`,
    ``,
    `MOOD — current emotional and visual presence:`,
    `  ${d.mood} — ${moodDef(d.mood).presence}.`,
    ``,
    d.season
      ? `SEASON — contextual styling/material influence:\n  ${d.season} — ${SEASON_INFLUENCE[d.season]}.\n`
      : `SEASON: not applicable to this character. Do not add seasonal styling.\n`,
    `COLOUR DNA — the character is the only source of colour. Use exactly this palette:`,
    ...d.colorDna.palette.map((hex, i) => `  ${hex} — ${d.colorDna.paletteNames[i]}`),
    ``,
    `CHARACTER DNA — read this to inform pose, expression and attitude, not to add props:`,
    `  traits: ${d.characterDna.traits.join(', ')}.`,
    `  drives: ${d.characterDna.drives.join(', ')}.`,
    `  it embodies a contradiction and does not resolve it: ${d.characterDna.contradiction.a} together with ${d.characterDna.contradiction.b}.`,
    ``,
    d.evolutionState
      ? `CURRENT STATE: ${d.evolutionState.label} (evolution stage ${d.evolutionState.stage}). Previous states: ${d.evolutionState.previousLabels.join(' → ')}. This is the SAME identity at a later stage, not a different character.`
      : `CURRENT STATE: initial form.`,
    ``,
    d.heritage.length > 0
      ? [
          `HERITAGE — ${d.heritage.length} trait(s) inherited from ${displayName(d.heritage[0]!.fromMon)} and TRANSLATED into this Family, never copied literally:`,
          ...d.heritage.map((h) => `  • [${h.kind}] was: ${h.origin}\n    now: ${h.transformed}`),
        ].join('\n')
      : `HERITAGE: none — this is an origin node.`,
    ``,
    `RARITY: ${d.rarity}. Rarity describes how unusual this configuration is; it must not add glow, effects or decoration.`,
  ].join('\n');
}

/* --- Blocco dell'Appearance (§5) -------------------------------------------- */

export function compileAppearanceBlock(record: MonRecord): string {
  const a = record.data.appearance;
  return [
    `APPEARANCE — rendering grammar. This is independent from the Family and must be followed exactly:`,
    `  ${APPEARANCE_LABELS[a]}`,
    `  ${APPEARANCE_SPEC[a]}`,
  ].join('\n');
}

/* --- Divieti globali di art direction (§10.5, §18A) ------------------------ */

const GLOBAL_DONTS = [
  `DO NOT redesign the character. DO NOT reinterpret the anatomy, palette, fashion, eyewear, hair or heritage markers.`,
  `DO NOT add lore, props, environments, text, logos, watermarks or signatures that are not requested here.`,
  `DO NOT replace the character with pixel art.`,
  `DO NOT default to generic Pixar, Funko, glossy videogame, generic manga or polished vector-lineart styling.`,
  `DO NOT add neon glow, lens flare, gradient backgrounds or luxury sci-fi treatment.`,
].join('\n');

/* ============================================================================
   PROMPT PER SINGOLO ASSET
   ========================================================================= */

function header(def: AssetTypeDef, record: MonRecord): string {
  return [
    `ASSET TYPE: ${def.label}`,
    `ASSET ID: ${def.assetId}`,
    `CHARACTER: ${displayName(record.data.name)}`,
    `WHY THIS ASSET EXISTS: ${def.purpose}`,
    `WHERE IT WILL BE USED IN THE PRODUCT: ${def.usage.join(', ')}`,
  ].join('\n');
}

function assemble(parts: string[]): string {
  return parts.filter(Boolean).join('\n\n') + '\n';
}

export function compileCharacterMasterPrompt(record: MonRecord, def: AssetTypeDef): string {
  return assemble([
    header(def, record),
    `IMPLEMENTATION PURPOSE: this is the CANONICAL VISUAL SOURCE OF TRUTH for this character. Every other asset in this package is derived from it and must match it exactly. Generate this asset FIRST and keep it open as reference for all the others.`,
    compileCharacterBlock(record),
    compileAppearanceBlock(record),
    [
      `COMPOSITION AND TECHNICAL CONSTRAINTS:`,
      `  view: full body, front three-quarter view, character facing slightly to its left.`,
      `  pose: neutral standing reference pose, weight settled, arms clear of the torso so the silhouette reads.`,
      `  framing: entire body visible including wings, tail, horns, appendages, footwear and accessories. Nothing crops.`,
      `  safe area: keep a margin of at least 8% of the image height on every side. No part of the character touches an edge.`,
      `  aspect ratio: 3:4 portrait.`,
      `  output size: 1536 × 2048 px minimum.`,
      `  background: fully transparent (PNG with alpha). No ground shadow, no floor plane, no environment.`,
      `  lighting: even, neutral studio lighting. No dramatic rim light, no coloured light sources.`,
      `  the character occupies roughly 88% of the image height, standing on the bottom-centre registration point.`,
      `  file format: PNG with alpha.`,
    ].join('\n'),
    GLOBAL_DONTS,
  ]);
}

/**
 * §24.3 — template del compilatore di rotazione, seguito alla lettera, più la
 * lista di consistenza assoluta di §24.2.
 */
export function compileRotationPrompt(record: MonRecord, def: AssetTypeDef): string {
  return assemble([
    header(def, record),
    `IMPLEMENTATION PURPOSE: interactive horizontal-drag rotation inside the VINZ.VERCE Specimen Profile. The prototype changes the visible frame index as the user drags; there is no 3D model. The strip must therefore be mechanically exact.`,
    `Create a perfectly consistent multi-view turnaround of the SAME canonical character already defined by the CHARACTER MASTER asset (${'master_01'}). Use the Character Master as the reference image. DO NOT redesign anything between frames.`,
    [
      `GRID: ${ROTATION_SPEC.columns} columns × ${ROTATION_SPEC.rows} row, ${ROTATION_SPEC.frames} frames in one horizontal strip.`,
      `ANGLES, left to right: ${ROTATION_SPEC.sequenceDegrees.join(' / ')} degrees.`,
      `FRAME ORDER: clockwise, starting from the front view at 0°.`,
    ].join('\n'),
    [
      `ABSOLUTE CONSISTENCY — these must be identical in all ${ROTATION_SPEC.frames} frames:`,
      `  • same anatomy and proportions`,
      `  • same facial identity`,
      `  • same haircut and bleach state`,
      `  • same eyewear`,
      `  • same outfit / fashion solution`,
      `  • same accessories`,
      `  • same wings / tail / horns / appendages`,
      `  • same Colour DNA`,
      `  • same materials / Appearance`,
      `  • same neutral reference pose`,
      `  • same image scale and anchor`,
      `  • same camera height, focal length and lighting — no drift between frames`,
    ].join('\n'),
    compileCharacterBlock(record),
    compileAppearanceBlock(record),
    [
      `OUTPUT REQUIREMENTS:`,
      `  background: transparent.`,
      `  every frame has identical dimensions.`,
      `  identical bottom-centre registration point in every frame: the character's feet sit on the same baseline and the body is centred on the same vertical axis.`,
      `  full body visible in every frame. No wings, tails, horns, giant anatomy, eyewear or accessories may crop.`,
      `  equal safety margin in every frame.`,
      `  no text, no labels, no frame numbers, no decorative environment inside the asset.`,
      `  no perspective change, no camera-height drift, no focal-length drift, no presentation-scale drift.`,
      `  recommended output: 8192 × 1024 px (8 frames of 1024 × 1024), PNG with alpha.`,
    ].join('\n'),
    GLOBAL_DONTS,
  ]);
}

export function compilePortraitPrompt(record: MonRecord, def: AssetTypeDef): string {
  return assemble([
    header(def, record),
    `IMPLEMENTATION PURPOSE: compact portrait used in the Specimen Profile header, memory entries, Mindline node markers and notifications. This is a PURPOSE-GENERATED portrait — it must NOT be a crop of the Character Master. Compose it as a portrait from the start.`,
    `Match the character already defined by the CHARACTER MASTER asset (master_01) exactly.`,
    compileCharacterBlock(record),
    compileAppearanceBlock(record),
    [
      `COMPOSITION AND TECHNICAL CONSTRAINTS:`,
      `  view: head and upper body, front three-quarter, looking toward the viewer.`,
      `  the eyewear and the head silhouette are the identifying elements: both must be fully visible and uncropped.`,
      `  framing: shoulders included; ears, horns, antennae or head appendages fully inside the frame.`,
      `  safe area: 10% margin on every side. The portrait will also be displayed inside a small circular mask of 64 px — keep the head centred and clear of the corners so the circular crop never cuts it.`,
      `  aspect ratio: 1:1 square.`,
      `  output size: 1024 × 1024 px.`,
      `  background: transparent.`,
      `  lighting: even and neutral, matching the Character Master.`,
      `  file format: PNG with alpha.`,
    ].join('\n'),
    GLOBAL_DONTS,
  ]);
}

export function compileBioDoodlePrompt(record: MonRecord, def: AssetTypeDef): string {
  return assemble([
    header(def, record),
    `IMPLEMENTATION PURPOSE: the BIO / PERSONAL FILE screen. This is how VINZ mentally remembers and understands the creature — NOT how the creature is rendered in the world.`,
    `IMPORTANT: DOODLE IS NOT AN APPEARANCE. Ignore the character's canonical Appearance for this asset ONLY, and draw in sketchbook language. The canonical ANATOMY and IDENTITY must still be preserved exactly: this is the same creature, drawn roughly, not a redesign.`,
    `Use the CHARACTER MASTER asset (master_01) as the anatomical reference. What changes here is the drawing technique, nothing else: same body plan, same proportions, same eyewear, same hair, same accessories, same heritage markers.`,
    compileCharacterBlock(record),
    [
      `DOODLE LANGUAGE — required:`,
      `  loose sketchbook drawing on paper, visible construction lines, ballpoint or pencil quality.`,
      `  visible corrections, crossed-out lines, arrows pointing at details, handwritten annotations.`,
      `  partial scribbled colour on one or two areas only — the drawing stays mostly monochrome line.`,
      `  intimate and personal, as if drawn quickly in the margin of a notebook.`,
      `  it must read as an honest attempt to remember the creature, imperfect but affectionate.`,
    ].join('\n'),
    [
      `ANNOTATIONS TO INCLUDE, handwritten, in Italian, exactly as written here:`,
      ...record.bio.annotations.map((a) => `  "${a}"`),
      ...record.bio.tags.map((t) => `  "${t}"`),
    ].join('\n'),
    [
      `COMPOSITION AND TECHNICAL CONSTRAINTS:`,
      `  view: full body, loose three-quarter, plus one or two small detail studies in the margin.`,
      `  aspect ratio: 3:4 portrait.`,
      `  output size: 1536 × 2048 px.`,
      `  background: plain off-white paper (#F4F4F6). Paper grain is allowed; no photographic notebook mockup, no binding, no shadows of a real book.`,
      `  safe area: 8% margin on every side.`,
      `  file format: PNG.`,
    ].join('\n'),
    `DO NOT redesign the character. DO NOT render this in the character's canonical Appearance. DO NOT clean up the linework into finished illustration. DO NOT change the anatomy, eyewear, hair or heritage markers.`,
  ]);
}

export function compileReactionPackPrompt(record: MonRecord, def: AssetTypeDef): string {
  const states = record.reactions.slice(0, 6);
  return assemble([
    header(def, record),
    `IMPLEMENTATION PURPOSE: transparent reaction stickers shown in the Companion Home, in chat and next to memory entries. They are the character's non-verbal vocabulary.`,
    `Match the character already defined by the CHARACTER MASTER asset (master_01) exactly.`,
    compileCharacterBlock(record),
    compileAppearanceBlock(record),
    [
      `NUMBER OF STATES: 6, laid out as a 3 columns × 2 rows grid.`,
      `THE SIX STATES, in reading order — these come from this character's Voice DNA and Character DNA, so play them as THIS character would, not generically:`,
      ...states.map((s, i) => `  ${i + 1}. ${s}`),
    ].join('\n'),
    [
      `VOICE DNA — informs how each reaction is performed:`,
      `  register: ${record.data.voiceDna.register}.`,
      `  verbal habits: ${record.data.voiceDna.quirks.join('; ')}.`,
      `  it addresses VINZ ${record.data.voiceDna.addressesVinzAs}. It knows him and treats him as a peer — never as an owner, a god or a chosen hero.`,
    ].join('\n'),
    [
      `COMPOSITION AND TECHNICAL CONSTRAINTS:`,
      `  view: upper body or full body, consistent across all six states.`,
      `  every cell has identical dimensions and the same character scale.`,
      `  each state is a distinct pose and expression; the identity, outfit, eyewear and palette never change between cells.`,
      `  aspect ratio: 3:2 overall.`,
      `  output size: 3072 × 2048 px (six cells of 1024 × 1024).`,
      `  background: transparent.`,
      `  safe area: 12% margin inside each cell so the sticker can be cut out cleanly.`,
      `  no text, no labels, no speech bubbles, no cell borders inside the asset.`,
      `  file format: PNG with alpha.`,
    ].join('\n'),
    GLOBAL_DONTS,
  ]);
}

export function compileEncounterHeroPrompt(record: MonRecord, def: AssetTypeDef): string {
  const isBranch = record.data.heritage.length > 0;
  return assemble([
    header(def, record),
    `IMPLEMENTATION PURPOSE: full-screen reveal artwork for the ${isBranch ? 'NEW ENCOUNTER' : 'FIRST ENCOUNTER'} event screen. This is the single most composed image of the character. It may be more staged than the Character Master, but the identity must be preserved exactly.`,
    `Match the character already defined by the CHARACTER MASTER asset (master_01) exactly.`,
    compileCharacterBlock(record),
    compileAppearanceBlock(record),
    [
      `COMPOSITION AND TECHNICAL CONSTRAINTS:`,
      `  view: full body, hero presentation, low camera angle so the character reads as arriving.`,
      `  pose: a composed signature pose that expresses ${record.data.mood} and the ${record.data.role} role. More dynamic than the neutral reference pose.`,
      `  framing: full body visible, nothing crops.`,
      `  aspect ratio: 9:16 vertical, for a full-screen mobile event surface.`,
      `  output size: 1242 × 2208 px.`,
      `  background: dark near-black field (#0B0B0C). A restrained abstract signal/scan graphic behind the character is allowed. NO landscape, NO fantasy environment, NO architecture, NO particles storm.`,
      `  safe area: keep the character inside the central 70% of the height — the screen overlays a title at the top and a button at the bottom.`,
      `  lighting: the character stays readable against the dark field; edge separation is allowed but must not become neon glow.`,
      `  file format: PNG.`,
    ].join('\n'),
    GLOBAL_DONTS,
  ]);
}

export function compileSigilPrompt(record: MonRecord, def: AssetTypeDef): string {
  const d = record.data;
  return assemble([
    header(def, record),
    `IMPLEMENTATION PURPOSE: a personal mark for this character, used at small size inside the VINZ.VERCE interface — Specimen Profile header, Mindline nodes, history timeline. It must stay legible at 24 px.`,
    `The CHARACTER MASTER asset (master_01) is the identity this mark belongs to. Read it for silhouette and structure, then ABSTRACT: the sigil must not depict the creature, and must not become a portrait, a mascot or a logo of the character.`,
    [
      `WHAT IT MUST BE DERIVED FROM — read these and abstract them into a mark. Do not draw the creature:`,
      `  family anatomy: ${d.family} / ${d.familyArchetype}.`,
      `  affinity material logic: ${d.affinity}.`,
      `  role: ${d.role}.`,
      `  the contradiction it carries: ${d.characterDna.contradiction.a} together with ${d.characterDna.contradiction.b}.`,
      d.heritage.length > 0
        ? `  one heritage trait should be legible in the construction: ${d.heritage[0]!.transformed}.`
        : `  this is an origin node: the mark has no inherited element.`,
    ].join('\n'),
    [
      `STYLE — VINZ.VERCE graphic identity:`,
      `  pure monochrome: solid black on transparent. No greys, no gradients, no colour.`,
      `  thick, confident, sticker-badge construction with strong outline logic.`,
      `  early-internet / system-pictogram grammar: geometric, symmetrical or deliberately near-symmetrical.`,
      `  it should feel stamped or engraved, like a system marker — not like an esports logo, not like a fantasy rune, not like a chrome 3D emblem.`,
    ].join('\n'),
    [
      `COMPOSITION AND TECHNICAL CONSTRAINTS:`,
      `  aspect ratio: 1:1 square.`,
      `  output size: 1024 × 1024 px.`,
      `  background: transparent.`,
      `  safe area: the mark occupies the central 76% of the canvas.`,
      `  line weight: nothing thinner than 3% of the canvas width, so it survives at 24 px.`,
      `  no text, no letters, no numbers.`,
      `  file format: PNG with alpha. An SVG version is welcome if available.`,
    ].join('\n'),
    GLOBAL_DONTS,
  ]);
}

/* --- Dispatcher ------------------------------------------------------------ */

const COMPILERS: Record<AssetType, (r: MonRecord, d: AssetTypeDef) => string> = {
  character_master: compileCharacterMasterPrompt,
  rotation_sprite: compileRotationPrompt,
  profile_portrait: compilePortraitPrompt,
  bio_doodle: compileBioDoodlePrompt,
  reaction_pack: compileReactionPackPrompt,
  encounter_hero: compileEncounterHeroPrompt,
  sigil: compileSigilPrompt,
};

export function compilePrompt(record: MonRecord, def: AssetTypeDef): string {
  return COMPILERS[def.type](record, def);
}
