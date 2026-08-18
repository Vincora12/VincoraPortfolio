/* ============================================================================
   PRIMO STADIO — QUELLO CHE SI CHIEDE AL RESOLVER

   🔒 NON gli si chiede di scrivere il prompt. Gli si chiede di DECIDERE, e di
   consegnare le decisioni come oggetto. La differenza è tutta qui: un testo si
   può solo rileggere, un oggetto si può controllare.

   🔒 E gli si chiede esplicitamente di TOGLIERE. Il difetto che questo stadio
   esiste per curare non è la povertà, è l'accumulo: Family, Affinity, Role e
   Fashion vogliono ognuno il proprio espediente, il concatenatore li metteva
   tutti e quattro, e il risultato era un ammasso. «Se ne vogliono quattro,
   fondili o buttane i più deboli» è l'istruzione che nessuna regola fissa
   poteva dare.
   ========================================================================= */

import { DESIGN_DNA, type NumericGrammar } from '../../engine/generation-config';
import type { ResolverInput } from './types';

/** Le regole del designer, come prosa: è la parte che i numeri non dicono. */
function designerRules(id: string): string {
  const d = DESIGN_DNA.find((x) => x.id === id);
  if (!d) return '(design DNA sconosciuto)';
  return [
    `Territory: ${d.it}`,
    `- Proportion: ${d.proportion}`,
    `- Shapes: ${d.shapes}`,
    `- Face: ${d.face}`,
    `- Anatomy: ${d.anatomy}`,
    `- Clothing: ${d.clothing}`,
    `- Posture: ${d.posture}`,
    `- Detail at ${d.density}/5: ${d.detail}`,
    `- Counted masses: ${d.proportions}`,
    `- The proportional contradiction: ${d.counts}`,
  ].join('\n');
}

export function buildResolverPrompt(input: ResolverInput, numeric: NumericGrammar): string {
  return `You are the VINZ.MON Creative Resolver.

Your job is NOT to write the final image prompt.
Your job is to resolve raw Character Data into a coherent CHARACTER DESIGN plan.

SOURCE-OF-TRUTH PRINCIPLES:
- CHARACTER FIRST.
- VINZ.MON is one entity; this Form is a fresh manifestation, never lineage or evolution.
- Vinz Identity: dark-blond natural hair, bleached; fashion-driven eyewear.
- Family determines body ontology.
- Archetype changes body plan.
- Affinity transforms only 1-3 selected zones.
- Role becomes behaviour plus at most one strong structural motif.
- Cultural DNA is conceptual contamination, never easter eggs.
- Character Design DNA controls construction only, never rendering.
- Use measurable visual constraints.
- No heritage, no lineage, no previous form.

RAW CHARACTER DATA:
${JSON.stringify(input, null, 2)}

CHARACTER DESIGN DNA — ${input.characterDesignDNA}
${designerRules(input.characterDesignDNA)}

NUMERIC GRAMMAR ALREADY DECIDED (do not restate, design within it):
${JSON.stringify(numeric, null, 2)}

Resolve this Form into JSON with EXACTLY these keys:
{
  "corePersonality": ["3-7 mundane social or behavioural sentences"],
  "dominantIdentityMass": "one concrete mass",
  "silhouetteLandmarks": ["3-4 concrete landmarks"],
  "proportionalExaggeration": "one concrete exaggeration, quantified when useful",
  "ridiculousSpecificFeature": "one specific feature, not a joke prop",
  "facialAttitude": "one immediate attitude",
  "familySystems": ["2-4 primary anatomical systems"],
  "archetypeBodyPlan": "one concise body-plan decision",
  "affinityZones": ["1-3 transformed zones only"],
  "roleBehavior": ["2-5 visible behaviours"],
  "roleStructuralMotif": "zero or one dominant role-derived structural motif",
  "fashionMasses": ["2-6 large masses depending on density and humanoidity"],
  "hairConstruction": "include mass count and bleach logic",
  "eyewearConstruction": "include geometry and face occupancy when relevant",
  "culturalTranslation": ["translate ACTIVE references into attitude, movement, shape or colour logic"],
  "asymmetryBudget": ["3-6 controlled asymmetries"],
  "negativeSpaces": ["2-4 empty shapes that must remain open"],
  "detailBudget": ["literal inventory of surviving design systems, ending with STOP for low density"],
  "memorySentence": "one sentence a viewer should remember",
  "appealBehaviors": ["4-8 mundane expressions or actions the design must support"],
  "visualDNALock": ["final concrete anatomy, clothing and identity inventory"]
}

IMPORTANT:
- Do not invent extra taxonomy.
- Do not add a new object for every input field.
- If Family, Affinity, Role and Fashion all want separate gimmicks, MERGE them or DROP the weaker ones.
- Preserve only 3-4 primary silhouette landmarks.
- Keep the character socially imaginable.
- Output JSON only. No preamble, no commentary, no code fences.`;
}
