/* ============================================================================
   SECONDO STADIO — IL PROMPT, SCRITTO DA CODICE

   🔒 QUI DENTRO NON C'È NESSUNA DECISIONE. Ogni pezzo creativo arriva già
   deciso dal resolver; questo file mette i pezzi in ORDINE e ci aggiunge le
   parti che non cambiano mai — la gerarchia di lettura, le prove (silhouette,
   memoria, appeal), il blocco della presentazione.

   È il motivo per cui questo stadio è deterministico: l'ordine delle sezioni È
   il prodotto. Il documento lo dice in una riga — «se l'immagine è un bel
   reperto tassonomico senza personalità, il compilatore ha fallito» — e
   l'unico modo di garantirlo è che il personaggio venga PRIMA nel testo,
   sempre, senza che un modello possa decidere altrimenti in una brutta serata.
   ========================================================================= */

import { APPEARANCE_RULES, DESIGN_DNA } from '../../engine/generation-config';
import { numericGrammarFor, inputWarnings } from './grammar';
import type { CompiledPrompt, CreativeResolution, NumericGrammar, ResolverInput } from './types';

const mult = (v?: number) => (v ? `${v.toFixed(2)}×` : 'mapped to body plan');
const pct = (v?: [number, number]) => (v ? `${v[0]}–${v[1]}%` : 'not fixed');
const range = (v?: [number, number]) => (v ? `${v[0]}–${v[1]}` : 'mapped to body plan');
const list = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n');
const numbered = (xs: string[]) => xs.map((x, i) => `${i + 1}. ${x}`).join('\n');

export function compileFromResolution(
  input: ResolverInput,
  resolved: CreativeResolution,
): CompiledPrompt {
  const numeric: NumericGrammar = numericGrammarFor(input);
  const designer = DESIGN_DNA.find((d) => d.id === input.characterDesignDNA);

  const prompt = `NAME: ${input.name}
RARITY: ${input.rarity}

VINZ.MON — CHARACTER MASTER

Create one completely original Form of VINZ.MON from the canonical Character Data below.
VINZ.MON is one entity. This Form is another possible manifestation of the same VINZ.MON.
Treat this as a fresh character-generation task.
Do not inherit morphology, silhouette, proportions, facial construction, clothing solutions or anatomy from any previous Form.

READING ORDER:
1. CHARACTER — meet a memorable individual first.
2. VINZ.MON IDENTITY — hair and bleach, eyewear, attitude, acid colour.
3. FAMILY / ARCHETYPE / ROLE — taxonomy follows construction.
4. ACTIVE CULTURAL DNA — discovered last, or never.

HOUSE CHARACTER DNA:
- ONE dominant identity mass.
- 3–4 silhouette landmarks.
- ONE decisive proportional exaggeration.
- ONE slightly ridiculous, over-specific feature.
- ONE facial attitude readable before any lore.
- Approachable, energetic, socially imaginable.
- Secondary detail never overpowers character appeal.

CORE FORM:
FAMILY — ${input.family}
ARCHETYPE — ${input.archetype}
AFFINITY — ${input.affinity}
SIZE — ${input.size}
HUMANOIDITY — ${input.humanoidity} / 5
ROLE — ${input.role}
FASHION — ${input.fashion}
MOOD — ${input.mood.join(' / ')}
CHARACTER DESIGN DNA — ${input.characterDesignDNA}
DETAIL DENSITY — ${input.detailDensity} / 5
APPEARANCE — ${input.appearance}

CORE PERSONALITY:
${list(resolved.corePersonality)}

DOMINANT IDENTITY MASS:
${resolved.dominantIdentityMass}

PRIMARY SILHOUETTE LANDMARKS:
${numbered(resolved.silhouetteLandmarks)}

PROPORTIONAL EXAGGERATION:
${resolved.proportionalExaggeration}

SLIGHTLY RIDICULOUS / OVER-SPECIFIC FEATURE:
${resolved.ridiculousSpecificFeature}

FACIAL ATTITUDE:
${resolved.facialAttitude}

NUMERIC VISUAL GRAMMAR:
HEAD SCALE — ${mult(numeric.headScale)}
TORSO LENGTH — ${mult(numeric.torsoLength)}
SHOULDER WIDTH — ${mult(numeric.shoulderWidth)}
ARM LENGTH — ${mult(numeric.armLength)}
HAND SCALE — ${mult(numeric.handScale)}
LEG LENGTH — ${mult(numeric.legLength)}
FOOT SCALE — ${mult(numeric.footScale)}
DOMINANT MASS — ${pct(numeric.dominantMassPercent)} of silhouette when relevant
EYEWEAR OCCUPANCY — ${pct(numeric.eyewearFaceOccupancyPercent)} of visible face when relevant
HAIR MASSES — ${range(numeric.hairMassCount)}
SILHOUETTE LANDMARKS — ${range(numeric.silhouetteLandmarkCount)}
CLOTHING MASSES — ${range(numeric.clothingMassCount)}
ACCESSORY SYSTEMS — ${range(numeric.accessorySystemCount)}

HUMANOIDITY:
Humanoidity controls BODY PLAN, not realism.
At ${input.humanoidity}/5, preserve the intended human-read level and map the numeric rules onto that body plan.
Never solve non-human anatomy by pasting creature parts onto a normal human body.

FAMILY / ARCHETYPE CONSTRUCTION:
${list(resolved.familySystems)}
BODY PLAN:
${resolved.archetypeBodyPlan}

AFFINITY — ONLY THESE ZONES:
${list(resolved.affinityZones)}
Do not turn Affinity into a colour filter, a logo, a held prop, a costume or a background effect.

ROLE — VISIBLE BEHAVIOUR:
${list(resolved.roleBehavior)}
${
  resolved.roleStructuralMotif
    ? `DOMINANT ROLE-DERIVED STRUCTURAL MOTIF:\n${resolved.roleStructuralMotif}`
    : 'No additional role-derived prop or system.'
}

VINZ IDENTITY — HAIR:
Natural hair colour is DARK BLOND.
Bleach state: ${input.vinzIdentity.hairMode}.
${resolved.hairConstruction}
Never default to black hair.
If literal hair is impossible for this anatomy, translate it into a native equivalent.

VINZ IDENTITY — EYEWEAR:
Category: ${input.vinzIdentity.eyewearCategory}
${input.vinzIdentity.eyewearSolution ? `Locked solution: ${input.vinzIdentity.eyewearSolution}` : ''}
${resolved.eyewearConstruction}
Eyewear must strengthen the silhouette and the character identity.

FASHION — MAJOR MASSES ONLY:
${list(resolved.fashionMasses)}
Do not humanise the body merely to make clothing easier.

ACTIVE CULTURAL DNA:
${list(input.activeCulturalDNA)}
TRANSLATION:
${list(resolved.culturalTranslation)}
Never reproduce recognisable franchise iconography.

CHARACTER DESIGN DNA — ${input.characterDesignDNA}:
${designer ? `Proportion: ${designer.proportion}` : ''}
${designer ? `Shapes: ${designer.shapes}` : ''}
${designer ? `Face: ${designer.face}` : ''}
${designer ? `Anatomy: ${designer.anatomy}` : ''}
${designer ? `Clothing: ${designer.clothing}` : ''}
${designer ? `Posture: ${designer.posture}` : ''}
${designer ? `Detail: ${designer.detail}` : ''}
This controls construction only, never the rendering medium.

ASYMMETRY BUDGET:
${list(resolved.asymmetryBudget)}

NEGATIVE SPACE:
${list(resolved.negativeSpaces)}

DETAIL BUDGET:
${list(resolved.detailBudget)}

HOUSE COLOUR DNA:
DOMINANT BASE — ${input.palette.dominantBase.hex} ${input.palette.dominantBase.name}
ACID HERO — ${input.palette.acidHero.hex} ${input.palette.acidHero.name}
CONTRAST — ${input.palette.contrast.hex} ${input.palette.contrast.name}
${input.palette.microAccent ? `MICRO ACCENT — ${input.palette.microAccent.hex} ${input.palette.microAccent.name}` : ''}
${input.palette.neutrals?.length ? `NEUTRALS — ${input.palette.neutrals.map((n) => `${n.hex} ${n.name}`).join(' / ')}` : ''}
Use large graphic colour fields. The Acid Hero identifies ONE major signature zone. Do not scatter the acid colour.

SILHOUETTE TEST:
Fill the character completely in black. It must stay identifiable in under one second through the named landmarks.

MEMORY TEST:
The viewer should remember: "${resolved.memorySentence}"
If remembering the design requires small details or lore, simplify.

APPEAL CHECK:
The design must visibly support:
${list(resolved.appealBehaviors)}
If it cannot, increase facial attitude and gesture, and simplify the anatomy.

VISUAL DNA — LOCK BEFORE RENDERING:
${list(resolved.visualDNALock)}
Do not add new major systems after this point.

APPEARANCE — ${input.appearance}:
${APPEARANCE_RULES[input.appearance] ?? ''}

PRESENTATION:
- ONE character only.
- Full body, 100% visible.
- Neutral readable three-quarter or near-front canonical pose.
- Generous safety margin.
- Solid clean warm-white background.
- No transparency, no environment, no typography, no UI, no labels.
- No franchise iconography.

FINAL HIERARCHY:
FIRST — a memorable CHARACTER.
SECOND — VINZ.MON identity.
THIRD — ${input.family} / ${input.archetype} / ${input.role}.
LAST — cultural contamination.

CHARACTER FIRST.
Return only the requested visual asset.`;

  return {
    masterVersion: '1.2',
    prompt: prompt.replace(/\n{3,}/g, '\n\n'),
    warnings: inputWarnings(input),
    numericGrammar: numeric,
  };
}
