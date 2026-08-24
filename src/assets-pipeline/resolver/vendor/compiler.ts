import type { CharacterData, CreativeResolution, CompiledPrompt } from "./types.js";
import { numericGrammarFor, DESIGN_DNA_RULES } from "./rules.js";

const mult = (v?: number) => v ? `${v.toFixed(2)}×` : "mapped to body plan";
const pct = (v?: [number, number]) => v ? `${v[0]}–${v[1]}%` : "not fixed";

export function validateCharacterData(data: CharacterData): string[] {
  const warnings: string[] = [];
  if (data.detailDensity < 1 || data.detailDensity > 5) throw new Error("detailDensity must be between 1 and 5.");
  const expected = DESIGN_DNA_RULES[data.characterDesignDNA].detailRange;
  if (data.detailDensity < expected[0] || data.detailDensity > expected[1]) warnings.push(`${data.characterDesignDNA} normally sits around ${expected[0]}–${expected[1]}/5; received ${data.detailDensity}/5.`);
  if (!data.activeCulturalDNA?.length) warnings.push("No activeCulturalDNA supplied. Select 2–5 items from Cultural Memory before final compilation.");
  if ((data.activeCulturalDNA?.length ?? 0) > 5) warnings.push("Active Cultural DNA contains more than 5 references; reduce before compilation.");
  return warnings;
}

export function compilePrompt(data: CharacterData, resolved: CreativeResolution): CompiledPrompt {
  const warnings = validateCharacterData(data);
  const numeric = numericGrammarFor(data);
  const dna = DESIGN_DNA_RULES[data.characterDesignDNA];
  const prompt = `
NAME: ${data.name}
RARITY: ${data.rarity}

VINZ.MON — CHARACTER MASTER

Create one completely original Form of VINZ.MON from the canonical Character Data below.
VINZ.MON is one entity. This Form is another possible manifestation of the same VINZ.MON, unlocked through what VINZ.MON has learned about Vinz.
Treat this as a fresh character-generation task.
Do not inherit morphology, silhouette, proportions, facial construction, clothing solutions, gimmicks or anatomy from previous Forms.

READING ORDER:
1. CHARACTER — meet a memorable individual first.
2. VINZ.MON IDENTITY — hair/bleach, eyewear, attitude, acid color.
3. FAMILY / ARCHETYPE / ROLE — taxonomy follows construction.
4. ACTIVE CULTURAL DNA — discovered last, or never.

HOUSE CHARACTER DNA:
- ONE dominant identity mass.
- 3–4 silhouette landmarks.
- ONE decisive proportional exaggeration.
- ONE slightly ridiculous / over-specific feature.
- ONE facial attitude readable before lore.
- Approachable, energetic, socially imaginable.
- Secondary detail never overpowers character appeal.

CORE FORM:
FAMILY — ${data.family}
ARCHETYPE — ${data.archetype}
AFFINITY — ${data.affinity}
SIZE — ${data.size}
ROLE — ${data.role}
FASHION — ${data.fashion}
MOOD — ${data.mood.join(" / ")}
CHARACTER DESIGN DNA — ${data.characterDesignDNA}
DETAIL DENSITY — ${data.detailDensity} / 5
APPEARANCE — ${data.appearance}

CORE PERSONALITY:
${resolved.corePersonality.map(x => `- ${x}`).join("\n")}

DOMINANT IDENTITY MASS:
${resolved.dominantIdentityMass}

PRIMARY SILHOUETTE LANDMARKS:
${resolved.silhouetteLandmarks.map((x,i) => `${i+1}. ${x}`).join("\n")}

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
HAIR MASSES — ${numeric.hairMassCount ? `${numeric.hairMassCount[0]}–${numeric.hairMassCount[1]}` : "mapped to body plan"}

FAMILY / ARCHETYPE CONSTRUCTION:
${resolved.familySystems.map(x => `- ${x}`).join("\n")}
BODY PLAN:
${resolved.archetypeBodyPlan}
Family and Archetype are the only source of body-plan truth. Do not make the body more animalistic unless Family, Archetype or BEAST Affinity explicitly requires it.

AFFINITY — ONLY THESE ZONES:
${resolved.affinityZones.map(x => `- ${x}`).join("\n")}
Do not turn Affinity into a color filter, logo, held prop, costume or background effect.

ROLE — VISIBLE BEHAVIOR:
${resolved.roleBehavior.map(x => `- ${x}`).join("\n")}
${resolved.roleStructuralMotif ? `DOMINANT ROLE-DERIVED STRUCTURAL MOTIF:\n${resolved.roleStructuralMotif}` : "No additional role-derived prop/system."}

VINZ IDENTITY — HAIR:
Natural hair color is DARK BLOND.
Bleach mode: ${data.vinzIdentity.hairMode}.
${resolved.hairConstruction}
Never default to black hair.
If literal hair is impossible, translate it into native anatomy.

VINZ IDENTITY — EYEWEAR:
Category: ${data.vinzIdentity.eyewearCategory}
${data.vinzIdentity.eyewearSolution ? `Locked solution: ${data.vinzIdentity.eyewearSolution}` : ""}
${resolved.eyewearConstruction}
Eyewear must strengthen silhouette and character identity.

FASHION — MAJOR MASSES ONLY:
${resolved.fashionMasses.map(x => `- ${x}`).join("\n")}
Do not humanize the body merely to make clothing easier.

ACTIVE CULTURAL DNA:
${(data.activeCulturalDNA ?? []).map(x => `- ${x}`).join("\n")}
TRANSLATION:
${resolved.culturalTranslation.map(x => `- ${x}`).join("\n")}
Never reproduce recognizable franchise iconography.

CHARACTER DESIGN DNA — ${data.characterDesignDNA}:
Territory: ${dna.territory}
${dna.visualRules.map(x => `- ${x}`).join("\n")}
This controls construction only, never rendering medium.

ASYMMETRY BUDGET:
${resolved.asymmetryBudget.map(x => `- ${x}`).join("\n")}

NEGATIVE SPACE:
${resolved.negativeSpaces.map(x => `- ${x}`).join("\n")}

DETAIL BUDGET:
${resolved.detailBudget.map(x => `- ${x}`).join("\n")}

HOUSE COLOR DNA:
DOMINANT BASE — ${data.palette.dominantBase.hex} ${data.palette.dominantBase.name}
ACID HERO — ${data.palette.acidHero.hex} ${data.palette.acidHero.name}
CONTRAST — ${data.palette.contrast.hex} ${data.palette.contrast.name}
${data.palette.microAccent ? `MICRO ACCENT — ${data.palette.microAccent.hex} ${data.palette.microAccent.name}` : ""}
${data.palette.neutrals?.length ? `NEUTRALS — ${data.palette.neutrals.map(n => `${n.hex} ${n.name}`).join(" / ")}` : ""}
Use large graphic color fields. Acid Hero identifies one major signature zone. Do not scatter acid color.

SILHOUETTE TEST:
Fill the character completely in black. It must remain identifiable in under one second through the named landmarks.

MEMORY TEST:
The viewer should remember: "${resolved.memorySentence}"
If remembering the design requires small details or lore, simplify.

HOUSE-DNA APPEAL CHECK:
The design must visibly support:
${resolved.appealBehaviors.map(x => `- ${x}`).join("\n")}
If it cannot, increase facial attitude / gesture and simplify anatomy.

VISUAL DNA — LOCK BEFORE RENDERING:
${resolved.visualDNALock.map(x => `- ${x}`).join("\n")}
Do not add new major systems after this point.

APPEARANCE — ${data.appearance}:
${appearanceBlock(data.appearance)}

PRESENTATION:
- ONE character only.
- Full body 100% visible.
- Neutral readable 3/4 or near-front canonical pose.
- Generous safety margin.
- SOLID CLEAN WARM-WHITE BACKGROUND.
- No transparency.
- No environment.
- No typography.
- No UI.
- No labels.
- No franchise iconography.

FINAL HIERARCHY:
FIRST — memorable CHARACTER.
SECOND — VINZ.MON identity.
THIRD — ${data.family} / ${data.archetype} / ${data.role}.
LAST — cultural contamination.

CHARACTER FIRST.
Return only the requested visual asset.
`.trim();
  return { masterVersion: "1.2", prompt, warnings, numericGrammar: numeric };
}

function appearanceBlock(a: CharacterData["appearance"]): string {
  if (a === "CEL") return "Use clean decisive 2D outlines, large flat color fields, crisp separation, restrained internal lines and one hard-edged shadow tier where useful. No painterly rendering, photorealism, 3D materials, soft gradients, sketch lines or generic anime redesign.";
  if (a === "INK") return "Use bold irregular black contours, large solid black masses, deliberate white negative space and one dominant acid spot color. Street / skate / zine / bootleg energy. No gradients, gray concept-art shading or realistic materials.";
  return "Translate the locked design into a premium contemporary collectible using intentional vinyl/resin/metal/translucent materials. Preserve proportions. No automatic chibi/Funko compression, videogame realism or realistic skin/hair/fur microtexture.";
}
