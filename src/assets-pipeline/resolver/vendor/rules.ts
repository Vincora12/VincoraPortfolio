import type { CharacterData, CharacterDesignDNA, NumericGrammar } from "./types.js";

export const DESIGN_DNA_RULES: Record<CharacterDesignDNA, {
  detailRange: [number, number];
  territory: string;
  visualRules: string[];
  numeric: NumericGrammar;
}> = {
  "KEN SUGIMORI": {
    detailRange: [2.5, 3.0],
    territory: "Iconic species-character clarity",
    visualRules: [
      "Compact coherent masses; rounded wedges, soft triangles, clean cylinders.",
      "Every retained feature communicates identity, function or behavior.",
      "Keep roughly 65–75% of surfaces visually clean.",
      "Reduce secondary anatomy to one readable shape per function."
    ],
    numeric: { headScale: 1.15, handScale: 1.2, footScale: 1.35, torsoLength: 0.9, hairMassCount: [5, 7], silhouetteLandmarkCount: [3, 4], clothingMassCount: [2, 4], accessorySystemCount: [0, 3] }
  },
  "GENNDY TARTAKOVSKY": {
    detailRange: [1.5, 2.5],
    territory: "Extreme graphic proportion and motion",
    visualRules: [
      "Use opposing masses, directional geometry and aggressive proportional contrast.",
      "Negative space is part of the design.",
      "Pose must imply motion before animation.",
      "Avoid evenly distributed anatomy and detail."
    ],
    numeric: { headScale: 1.22, torsoLength: 0.7, armLength: 1.25, legLength: 1.25, handScale: 1.4, footScale: 1.5, hairMassCount: [4, 6], silhouetteLandmarkCount: [3, 4], clothingMassCount: [2, 4], accessorySystemCount: [0, 2] }
  },
  "AKIRA TORIYAMA": {
    detailRange: [2.5, 3.5],
    territory: "Friendly functional adventure",
    visualRules: [
      "Friendly sturdy construction with rounded functional forms and selective sharp accents.",
      "Mechanical or alien complexity becomes a few large toy-like modules.",
      "Keep the face highly expressive and readable.",
      "Clothing and equipment should look usable rather than ornamental."
    ],
    numeric: { headScale: 1.2, torsoLength: 0.87, handScale: 1.25, footScale: 1.45, armLength: 1.05, legLength: 0.95, hairMassCount: [5, 7], silhouetteLandmarkCount: [3, 4], clothingMassCount: [3, 4], accessorySystemCount: [1, 3] }
  },
  "CRAIG McCRACKEN": {
    detailRange: [1.0, 2.0],
    territory: "Radical graphic economy",
    visualRules: [
      "Reduce the character to a tiny vocabulary of primary shapes.",
      "Extreme proportion and facial economy are mandatory.",
      "Visual comedy comes from scale contrast, not props.",
      "If a feature does not serve identity, personality, function or silhouette, remove it."
    ],
    numeric: { headScale: 1.35, torsoLength: 0.7, handScale: 1.3, footScale: 1.65, armLength: 1.08, legLength: 1.0, dominantMassPercent: [30, 45], eyewearFaceOccupancyPercent: [35, 55], hairMassCount: [4, 6], silhouetteLandmarkCount: [3, 4], clothingMassCount: [2, 4], accessorySystemCount: [0, 3] }
  },
  "PENDLETON WARD": {
    detailRange: [1.0, 2.0],
    territory: "Elastic weird morphology",
    visualRules: [
      "Use very few soft masses and allow anatomy to behave elastically.",
      "Body parts may connect or bend in physically impossible but memorable ways.",
      "Awkward proportion is a feature, not a defect.",
      "Difference from Craig: anatomy itself may become impossible, not merely simplified."
    ],
    numeric: { headScale: 1.3, torsoLength: 0.75, handScale: 1.25, footScale: 1.55, hairMassCount: [4, 6], silhouetteLandmarkCount: [3, 4], clothingMassCount: [2, 4], accessorySystemCount: [0, 2] }
  },
  "TETSUYA NOMURA": {
    detailRange: [4.5, 5.0],
    territory: "Maximum layered youthful design",
    visualRules: [
      "High detail density must be hierarchical, never uniform.",
      "Keep youthful adventure proportions; do not default to an adult runway body.",
      "Use 3–4 localized high-detail zones and preserve large clean areas.",
      "Layer clothing, hardware, translucent elements and asymmetry over a strong primary silhouette."
    ],
    numeric: { headScale: 1.15, torsoLength: 0.88, handScale: 1.22, footScale: 1.38, armLength: 1.1, legLength: 1.1, hairMassCount: [7, 10], silhouetteLandmarkCount: [3, 5], clothingMassCount: [4, 6], accessorySystemCount: [3, 6] }
  },
  "JAMIE HEWLETT": {
    detailRange: [2.5, 3.5],
    territory: "Lanky street attitude",
    visualRules: [
      "Use irregular facial geometry, loose diagonal posture and strong attitude.",
      "Keep narrow torso, long limbs and oversized extremities when compatible.",
      "Clothing must respond to gravity and posture rather than sit like a mannequin.",
      "Use negative space and offbeat asymmetry to create personality."
    ],
    numeric: { headScale: 1.18, torsoLength: 0.9, handScale: 1.28, footScale: 1.45, armLength: 1.15, legLength: 1.12, hairMassCount: [5, 7], silhouetteLandmarkCount: [3, 4], clothingMassCount: [3, 5], accessorySystemCount: [1, 4] }
  }
};

export function numericGrammarFor(data: CharacterData): NumericGrammar {
  const base = structuredClone(DESIGN_DNA_RULES[data.characterDesignDNA].numeric);

  if ((data.size === "TINY" || data.size === "SMALL") && base.headScale) {
    base.headScale = Math.max(base.headScale, 1.15);
  }

  return base;
}
