import type { CharacterData, NumericGrammar } from "./types.js";
import { DESIGN_DNA_RULES } from "./rules.js";

export function buildCreativeResolverPrompt(data: CharacterData, numeric: NumericGrammar): string {
  const dna = DESIGN_DNA_RULES[data.characterDesignDNA];
  return `
You are the VINZ.MON Creative Resolver.

Your job is NOT to write the final image prompt.
Your job is to resolve raw Character Data into a coherent CHARACTER DESIGN plan.

SOURCE-OF-TRUTH PRINCIPLES:
- CHARACTER FIRST.
- VINZ.MON is one entity; this Form is a fresh manifestation, never lineage or evolution.
- Vinz Identity: dark-blond natural hair, FULL or PARTIAL bleach; fashion-driven eyewear.
- Family determines body ontology.
- Archetype changes body plan.
- Affinity transforms only 1–3 selected zones.
- Role becomes behavior + at most 1–2 strong structural motifs.
- Cultural DNA is conceptual contamination, never easter eggs.
- Character Design DNA controls construction only.
- Appearance is rendering only.
- Use measurable visual constraints.
- No Heritage / previous-mindline logic.

RAW CHARACTER DATA:
${JSON.stringify(data, null, 2)}

CHARACTER DESIGN DNA:
${data.characterDesignDNA}
Territory: ${dna.territory}
Detail density target: ${data.detailDensity}/5
Visual rules:
${dna.visualRules.map(x => `- ${x}`).join("\n")}

NUMERIC GRAMMAR:
${JSON.stringify(numeric, null, 2)}

Resolve this Form into JSON with EXACTLY these keys:
{
  "corePersonality": ["3–7 mundane social/behavioral sentences"],
  "dominantIdentityMass": "one concrete mass",
  "silhouetteLandmarks": ["3–4 concrete landmarks"],
  "proportionalExaggeration": "one concrete exaggeration, quantified when useful",
  "ridiculousSpecificFeature": "one specific feature, not a joke prop",
  "facialAttitude": "one immediate attitude",
  "familySystems": ["2–4 primary anatomical systems"],
  "archetypeBodyPlan": "one concise body-plan decision",
  "affinityZones": ["1–3 transformed zones only"],
  "roleBehavior": ["2–5 visible behaviors"],
  "roleStructuralMotif": "zero or one dominant role-derived structural motif",
  "fashionMasses": ["2–6 large masses depending on density/humanoidity"],
  "hairConstruction": "include mass count and bleach logic",
  "eyewearConstruction": "include geometry and face occupancy when relevant",
  "culturalTranslation": ["translate only ACTIVE references into attitude/movement/shape/color/transform logic"],
  "asymmetryBudget": ["3–6 controlled asymmetries"],
  "negativeSpaces": ["2–4 empty shapes that must remain open"],
  "detailBudget": ["literal inventory of surviving design systems, ending with STOP for low density"],
  "memorySentence": "one sentence a viewer should remember",
  "appealBehaviors": ["4–8 mundane expressions/actions the design must support"],
  "visualDNALock": ["final concrete anatomy/clothing/identity inventory"]
}

IMPORTANT:
- Do not invent extra taxonomy.
- Do not add a new object for every input field.
- If Family/Affinity/Role/Fashion all want separate gimmicks, MERGE or DROP weaker ones.
- Preserve only 3–4 primary silhouette landmarks.
- Keep the character socially imaginable.
- Output JSON only.
`.trim();
}
