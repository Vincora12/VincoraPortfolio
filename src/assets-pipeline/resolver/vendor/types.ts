export type CharacterDesignDNA =
  | "KEN SUGIMORI"
  | "GENNDY TARTAKOVSKY"
  | "AKIRA TORIYAMA"
  | "CRAIG McCRACKEN"
  | "PENDLETON WARD"
  | "TETSUYA NOMURA"
  | "JAMIE HEWLETT";

export type Appearance = "CEL" | "INK" | "DESIGNER TOY 3D";

export interface PaletteDNA {
  dominantBase: { hex: string; name: string };
  acidHero: { hex: string; name: string };
  contrast: { hex: string; name: string };
  microAccent?: { hex: string; name: string };
  neutrals?: { hex: string; name: string }[];
}

export interface VinzIdentityInput {
  hairMode: "FULL BLEACH" | "PARTIAL BLEACH";
  eyewearCategory: string;
  eyewearSolution?: string;
}

export interface CharacterData {
  name: string;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC";
  family: string;
  archetype: string;
  affinity: string;
  size: "TINY" | "SMALL" | "MEDIUM" | "GIANT";
  humanoidity: 1 | 2 | 3 | 4 | 5;
  role: string;
  fashion: string;
  mood: string[];
  characterDesignDNA: CharacterDesignDNA;
  detailDensity: number;
  appearance: Appearance;
  palette: PaletteDNA;
  vinzIdentity: VinzIdentityInput;
  culturalMemoryPool?: string[];
  activeCulturalDNA?: string[];
  characterDNA?: {
    silhouetteQuirk?: string;
    anatomicalGimmick?: string;
    faceEyeLogic?: string;
    bodyLanguageDefault?: string;
    recurringMotif?: string;
    contradictions?: string[];
  };
}

export interface NumericGrammar {
  headScale?: number;
  torsoLength?: number;
  shoulderWidth?: number;
  armLength?: number;
  handScale?: number;
  legLength?: number;
  footScale?: number;
  dominantMassPercent?: [number, number];
  eyewearFaceOccupancyPercent?: [number, number];
  signatureMassVsTorsoPercent?: [number, number];
  hairMassCount?: [number, number];
  silhouetteLandmarkCount: [number, number];
  clothingMassCount?: [number, number];
  accessorySystemCount?: [number, number];
}

export interface CreativeResolution {
  corePersonality: string[];
  dominantIdentityMass: string;
  silhouetteLandmarks: string[];
  proportionalExaggeration: string;
  ridiculousSpecificFeature: string;
  facialAttitude: string;
  familySystems: string[];
  archetypeBodyPlan: string;
  affinityZones: string[];
  roleBehavior: string[];
  roleStructuralMotif?: string;
  fashionMasses: string[];
  hairConstruction: string;
  eyewearConstruction: string;
  culturalTranslation: string[];
  asymmetryBudget: string[];
  negativeSpaces: string[];
  detailBudget: string[];
  memorySentence: string;
  appealBehaviors: string[];
  visualDNALock: string[];
}

export interface CompiledPrompt {
  masterVersion: "1.2";
  prompt: string;
  warnings: string[];
  numericGrammar: NumericGrammar;
}
