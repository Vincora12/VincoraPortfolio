/* ============================================================================
   VINZ.MON — CONFIGURAZIONE CANONICA DI GENERAZIONE
   Fonte: GENERATION BIBLE v2.1 (§2–§26). Numeri di sezione citati voce per voce.

   §29 CLAUDE IMPLEMENTATION CONTRACT — vincolante:
   «Claude must implement the values in this document as data/config, not
    hardcoded scattered logic. All probabilities and thresholds must be
    editable from ONE canonical generation-config file.»

   Questo è quel file. Nessuna probabilità, soglia o voce di catalogo vive
   altrove. Il motore (`characterGenerator.ts`) legge da qui e non contiene
   numeri propri.

   §29 — versionamento: quando cambi tassonomie o pesi, incrementa
   GENERATION_CONFIG_VERSION. I .mon già generati restano immutabili e
   conservano la versione con cui sono nati.

   Bilingue per scelta: le descrizioni lunghe in inglese finiscono nei prompt
   di generazione immagini (§30–§46); le rese brevi in italiano compaiono in
   UI. Le rese italiane sono SINTAGMI NOMINALI: si introducono con i due punti
   e non ne contengono al loro interno.
   ========================================================================= */

export const GENERATION_CONFIG_VERSION = '2.1.0';

/* ============================================================================
   §2 — SEGNALI IN INGRESSO
   Chiavi usate dalle formule di fit di §17. Tutte normalizzate 0–100.
   ========================================================================= */

export const SIGNAL_KEYS = [
  // Salute (§2) — motore neutro sotto la finzione
  'FORM', 'ATK', 'SPD', 'DEF', 'REC', 'CARE', 'DISC',
  // Derivato: andamento di recupero basso, usato da UNDEAD
  'lowREC',
  // Personality Seed (§2)
  'curiosity', 'confidence', 'playfulness', 'social', 'discipline', 'vanity',
  'mystery', 'theatricality', 'impulsivity', 'novelty', 'patience', 'control',
  'precision', 'stoicism', 'adaptability', 'weirdness',
  // Mood Latents (§2, §11)
  'warmth', 'stress', 'irritability', 'melancholy', 'introspection', 'arousal',
  'vigilance', 'distance', 'energy', 'calm', 'affection', 'intensity',
  // Affinità culturali pesate (§2)
  'technical', 'darkCulture', 'weirdCulture', 'sensoryCamp', 'fashionCamp',
  'absurdity',
] as const;

export type SignalKey = (typeof SIGNAL_KEYS)[number];

/** Vettore dei segnali che alimenta le formule di fit. */
export type SignalVector = Record<SignalKey, number>;

/** Una formula di fit è una somma pesata di segnali (§17). */
export type FitFormula = Partial<Record<SignalKey, number>>;

/* ============================================================================
   §3 + §4 + §17 — CATALOGO DELLE FAMILY
   19 voci. SLIME è riservata al nodo radice: §3 «Family SLIME is exclusive to
   Vz.mon», §17 step 1 «exclude SLIME except root/reset».
   ========================================================================= */

export interface FamilyDef {
  id: string;
  /** §3 CORE ANATOMY — va nei prompt. */
  coreAnatomy: string;
  /** Resa breve per la UI italiana. */
  it: string;
  /** §3 INTERNAL DRIVERS — leggibile, non usato dal motore. */
  drivers: string;
  /** §3 ABSOLUTE RULE — diventa il negative_prompt del frammento (§32). */
  absoluteRule: string;
  /** §17 FIT FORMULA. */
  fit: FitFormula;
  /** §4 archetipi/sottofamiglie. */
  archetypes: { id: string; structure: string }[];
  /** §9 — i capelli esistono solo dove l'anatomia li supporta. */
  supportsHair: boolean;
  /** §9 — «eyewear is mandatory whenever anatomically possible». */
  supportsEyewear: boolean;
  /** §3 — esclusa dall'estrazione normale; solo radice o reset esplicito. */
  rootOnly?: boolean;
}

export const FAMILIES: FamilyDef[] = [
  {
    id: 'ANGEL',
    coreAnatomy: 'Celestial / feathered / ritual anatomy',
    it: 'anatomia celeste, piumata e rituale',
    drivers: 'REC, CARE, warmth, introspection',
    absoluteRule: 'Wings/rings/feathers are anatomy. Never generic angel costume.',
    fit: { REC: 0.22, CARE: 0.18, warmth: 0.16, introspection: 0.14, discipline: 0.12, mystery: 0.1, social: 0.08 },
    supportsHair: true,
    supportsEyewear: true,
    archetypes: [
      { id: 'HUMANOID', structure: 'Male-presenting celestial humanoid with anatomical wings.' },
      { id: 'MANY-WING', structure: 'Several genuine wing masses; wing architecture dominates.' },
      { id: 'RINGED', structure: 'Rings/halo structures are integrated into skeletal/body logic.' },
      { id: 'THRONE', structure: 'Dense radial wing/eye/ritual mass with little conventional human anatomy.' },
      { id: 'MESSENGER', structure: 'Lean mobile angel with reduced wing count and strong directional anatomy.' },
    ],
  },
  {
    id: 'BEAST',
    coreAnatomy: 'Feral mammalian/animal-derived organism',
    it: 'organismo animale ferino',
    drivers: 'ATK, SPD, impulsivity, affection',
    absoluteRule: 'Animal-first, not cat-boy/dog-boy.',
    fit: { ATK: 0.22, SPD: 0.2, impulsivity: 0.16, affection: 0.14, energy: 0.12, confidence: 0.08, playfulness: 0.08 },
    supportsHair: true,
    supportsEyewear: true,
    archetypes: [
      { id: 'FELINE', structure: 'Cat-derived head/paws/tail/legs/fur.' },
      { id: 'CANINE', structure: 'Dog/wolf-derived anatomy; social/pack body language.' },
      { id: 'URSINE', structure: 'Bear-derived mass, paws and heavy torso.' },
      { id: 'PRIMATE', structure: 'Primate-derived hands/shoulders/face while remaining creature-first.' },
      { id: 'HORNED MAMMAL', structure: 'Goat/deer/bovine-derived horns/hooves/body grammar.' },
      { id: 'CHIMERIC', structure: 'Two mammalian grammars fused into one coherent Beast.' },
    ],
  },
  {
    id: 'DRAGON',
    coreAnatomy: 'Draconic/reptilian organism',
    it: 'organismo draconico',
    drivers: 'ATK, FORM, confidence, intensity',
    absoluteRule: 'Scales/crest/horns/tail/membranes; not automatically giant.',
    fit: { ATK: 0.24, FORM: 0.18, confidence: 0.18, intensity: 0.14, discipline: 0.1, vanity: 0.08, mystery: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'HUMANOID', structure: 'Upright torso/limbs with true draconic head, scales, claws, tail.' },
      { id: 'SERPENTINE', structure: 'Long body, reduced limbs, coils and axial silhouette.' },
      { id: 'WYRM', structure: 'Heavy low dragon with reduced/absent wings.' },
      { id: 'WYVERN', structure: 'Two hind legs + wing/forelimb logic.' },
      { id: 'CRESTED', structure: 'Head/crest/horn identity mass dominates.' },
      { id: 'TINY DRAKE', structure: 'Compressed compact dragon anatomy, never plush mascot.' },
    ],
  },
  {
    id: 'REPTILE',
    coreAnatomy: 'Non-dragon reptilian/dinosaurian organism',
    it: 'organismo rettiliano o dinosauriano',
    drivers: 'ATK, DEF, stoicism, vigilance',
    absoluteRule: 'Biological reptile/dinosaur identity before styling.',
    fit: { DEF: 0.22, ATK: 0.18, vigilance: 0.18, stoicism: 0.16, discipline: 0.1, FORM: 0.08, distance: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'CERATOPSIAN', structure: 'Frill + horn + beaked quadruped grammar.' },
      { id: 'THEROPOD', structure: 'Biped predator anatomy, tail-led balance.' },
      { id: 'SAURIAN', structure: 'General lizard/iguana/gecko-derived body.' },
      { id: 'TURTLE', structure: 'Shell-dominant reptilian body.' },
      { id: 'CROCODILIAN', structure: 'Long jaw, armored back, heavy tail.' },
      { id: 'SERPENT', structure: 'Snake-derived body distinct from Dragon serpentine via no draconic grammar.' },
    ],
  },
  {
    id: 'MACHINE',
    coreAnatomy: 'Constructed mechanical organism',
    it: 'organismo meccanico costruito',
    drivers: 'DISC, ATK, technical affinity, control',
    absoluteRule: 'Not a vehicle/robot prop with a face; machine is anatomy.',
    fit: { DISC: 0.22, ATK: 0.16, discipline: 0.16, technical: 0.16, control: 0.12, curiosity: 0.1, distance: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'VEHICLE', structure: 'Wheels/tracks/cabin/locomotion structures become anatomy.' },
      { id: 'TRASH', structure: 'Discarded/utility mechanical material organism.' },
      { id: 'INDUSTRIAL', structure: 'Hydraulic, hinge, plate and tool-like anatomy.' },
      { id: 'DEVICE', structure: 'Compact appliance/electronic-derived body without copying a real product.' },
      { id: 'SWARM', structure: 'Multiple linked machine modules acting as one organism.' },
      { id: 'SYNTHETIC HUMANOID', structure: 'Humanoid mechanical body with non-human head/core logic.' },
    ],
  },
  {
    id: 'AQUA',
    coreAnatomy: 'Aquatic organism',
    it: 'organismo acquatico',
    drivers: 'REC, SPD, adaptability, calm',
    absoluteRule: 'Aquatic anatomy, not just blue color.',
    fit: { REC: 0.22, SPD: 0.18, calm: 0.16, adaptability: 0.16, introspection: 0.1, warmth: 0.1, playfulness: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'FISH', structure: 'Fin/gill/tail-first aquatic anatomy.' },
      { id: 'CEPHALOPOD', structure: 'Tentacle/mantle/siphon logic.' },
      { id: 'CRUSTACEAN', structure: 'Shell/claw/segmented aquatic body.' },
      { id: 'JELLY', structure: 'Bell/membrane/tentacle body, not Slime.' },
      { id: 'AQUATIC MAMMAL', structure: 'Seal/whale/otter-derived organism.' },
      { id: 'DEEPSEA', structure: 'Bioluminescent/pressure-adapted strange anatomy.' },
    ],
  },
  {
    id: 'PLANT',
    coreAnatomy: 'Botanical organism',
    it: 'organismo botanico',
    drivers: 'CARE, REC, patience, warmth',
    absoluteRule: 'Roots/leaves/stems/flowers/thorns are body.',
    fit: { CARE: 0.24, REC: 0.2, patience: 0.16, warmth: 0.14, discipline: 0.1, calm: 0.08, introspection: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'FLOWER', structure: 'Bloom is primary identity mass.' },
      { id: 'VINE', structure: 'Tendril/coil/creeping anatomy.' },
      { id: 'TREE', structure: 'Trunk/branch/root mass.' },
      { id: 'SUCCULENT', structure: 'Thick water-storing forms.' },
      { id: 'CARNIVOROUS', structure: 'Trap/jaw/feeding botanical structure.' },
      { id: 'MOSS/LICHEN', structure: 'Distributed low clustered botanical body.' },
    ],
  },
  {
    id: 'DEMON',
    coreAnatomy: 'Infernal / oni / threatening organism',
    it: 'organismo infernale',
    drivers: 'ATK, irritability, confidence, arousal',
    absoluteRule: 'No generic red devil requirement.',
    fit: { ATK: 0.2, confidence: 0.16, irritability: 0.16, arousal: 0.14, intensity: 0.12, theatricality: 0.12, impulsivity: 0.1 },
    supportsHair: true,
    supportsEyewear: true,
    archetypes: [
      { id: 'HUMANOID', structure: 'Infernal humanoid but demon-first face/body.' },
      { id: 'ONI', structure: 'Heavy horned mask/head mass and powerful build.' },
      { id: 'IMP', structure: 'Compressed mischievous demon anatomy.' },
      { id: 'BAT', structure: 'Wing/ear/membrane dominant demon.' },
      { id: 'HORNED BEAST', structure: 'Quadrupedal/animal-derived infernal anatomy.' },
      { id: 'VOID DEMON', structure: 'Body organized around holes/shadow membranes/negative-space organs.' },
    ],
  },
  {
    id: 'UNDEAD',
    coreAnatomy: 'Spectral / dead / incomplete organism',
    it: 'organismo spettrale e incompleto',
    drivers: 'low REC trend, melancholy, introspection, distance',
    absoluteRule: 'Never frames low recovery as moral failure.',
    fit: { melancholy: 0.18, introspection: 0.18, distance: 0.16, mystery: 0.14, lowREC: 0.12, vigilance: 0.12, darkCulture: 0.1 },
    supportsHair: true,
    supportsEyewear: true,
    archetypes: [
      { id: 'GHOST', structure: 'Incomplete spectral floating body.' },
      { id: 'SKELETON', structure: 'Bone architecture is primary body.' },
      { id: 'MUMMY', structure: 'Wrapped/dried/sealed anatomical logic.' },
      { id: 'REVENANT', structure: 'Partially intact dead body with missing/stitched zones.' },
      { id: 'WRAITH', structure: 'Elongated shadow/membrane spectral form.' },
      { id: 'RELIC', structure: 'Object-remnant/funerary structure animated as organism.' },
    ],
  },
  {
    id: 'PSYCHIC',
    coreAnatomy: 'Perception/spatial organism',
    it: 'organismo percettivo e spaziale',
    drivers: 'vigilance, introspection, curiosity, mystery',
    absoluteRule: 'Floating/sensory/impossible anatomy.',
    fit: { vigilance: 0.2, introspection: 0.18, curiosity: 0.18, mystery: 0.16, technical: 0.12, stress: 0.08, discipline: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'MANY-EYED', structure: 'Sensory structures dominate anatomy.' },
      { id: 'DETACHED', structure: 'Body parts separated by impossible spacing.' },
      { id: 'ORBITAL', structure: 'Satellite-like organs orbit a core body.' },
      { id: 'FOLDED SPACE', structure: 'Anatomy intersects/loops impossible geometry.' },
      { id: 'SENSORIAL HUMANOID', structure: 'Humanoid psychic with controlled impossible organs.' },
      { id: 'TOTEM', structure: 'Static stacked sensory organism.' },
    ],
  },
  {
    id: 'MINERAL',
    coreAnatomy: 'Stone/crystal/mineral organism',
    it: 'organismo di pietra o cristallo',
    drivers: 'DEF, FORM, discipline, stoicism',
    absoluteRule: 'Facets/plates/raw mineral mass are anatomy.',
    fit: { DEF: 0.22, FORM: 0.18, discipline: 0.18, stoicism: 0.16, control: 0.1, ATK: 0.08, mystery: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'CRYSTAL', structure: 'Faceted translucent/crystalline body.' },
      { id: 'STONE', structure: 'Monolithic rock/plate body.' },
      { id: 'GEODE', structure: 'Outer shell + visible internal mineral cavity.' },
      { id: 'METAL ORE', structure: 'Raw metal/mineral mass, not Machine.' },
      { id: 'SAND', structure: 'Granular/distributed mineral organism.' },
      { id: 'FOSSIL', structure: 'Mineralized ancient anatomy/remains.' },
    ],
  },
  {
    id: 'ALIEN',
    coreAnatomy: 'Non-terrestrial organism',
    it: 'organismo non terrestre',
    drivers: 'curiosity, novelty, mystery, technical/strange affinity',
    absoluteRule: 'Avoid generic grey-alien convergence.',
    fit: { curiosity: 0.24, mystery: 0.18, novelty: 0.16, technical: 0.14, distance: 0.1, playfulness: 0.1, weirdCulture: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'GREY', structure: 'Cranial/eye-focused grey-adjacent grammar, aggressively varied.' },
      { id: 'MULTI-LIMB', structure: 'Unfamiliar limb count and symmetry.' },
      { id: 'BIOMORPH', structure: 'Soft non-terrestrial organ structures.' },
      { id: 'EXOSPACE', structure: 'Pressure/space-adapted biological architecture.' },
      { id: 'SYMMETRIC', structure: 'Alien symmetry impossible in Earth animals.' },
      { id: 'PARASITIC', structure: 'Attached/host-like modular organism, non-gory by default.' },
    ],
  },
  {
    id: 'FOOD',
    coreAnatomy: 'Edible-material organism',
    it: 'organismo di materia commestibile',
    drivers: 'CARE, playfulness, sensory/camp affinity',
    absoluteRule: 'Food itself is body; never mascot holding food.',
    fit: { CARE: 0.24, playfulness: 0.2, warmth: 0.14, sensoryCamp: 0.12, social: 0.1, absurdity: 0.1, curiosity: 0.1 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'FRUIT', structure: 'Peel/rind/seed/stem/leaf anatomy.' },
      { id: 'NOODLE', structure: 'Noodle mass is edible anatomy, never hair.' },
      { id: 'PASTRY', structure: 'Dough/layer/crust architecture.' },
      { id: 'CANDY', structure: 'Confection/gum/gel sugar body distinct from Slime.' },
      { id: 'SAVORY', structure: 'Bread/cheese/meat/vegetable dish-derived body.' },
      { id: 'FERMENTED', structure: 'Bubble/culture/rind/fermentation anatomy.' },
    ],
  },
  {
    id: 'INSECT',
    coreAnatomy: 'Arthropod/insect organism',
    it: 'organismo artropode',
    drivers: 'SPD, DEF, vigilance, precision',
    absoluteRule: 'Segmentation/exoskeleton/antennae/specialized limbs.',
    fit: { SPD: 0.22, DEF: 0.2, vigilance: 0.18, precision: 0.14, curiosity: 0.1, intensity: 0.08, technical: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'MANTIS', structure: 'Folded predatory forelimbs, triangular head.' },
      { id: 'BEETLE', structure: 'Shell/elytra/horned exoskeleton.' },
      { id: 'MOTH', structure: 'Wing/powder/antenna silhouette.' },
      { id: 'WASP', structure: 'Narrow segmented body, stinger/wing logic.' },
      { id: 'SPIDER', structure: 'Arachnid eight-leg grammar; still under broad arthropod family for prototype.' },
      { id: 'LARVAL', structure: 'Larva/caterpillar/grub body with transformation potential.' },
    ],
  },
  {
    id: 'AMPHIBIA',
    coreAnatomy: 'Amphibian organism',
    it: 'organismo anfibio',
    drivers: 'REC, adaptability, playfulness, calm',
    absoluteRule: 'Moist skin/gills/fins/salamander/frog/axolotl grammar.',
    fit: { REC: 0.2, adaptability: 0.18, playfulness: 0.16, calm: 0.14, warmth: 0.12, curiosity: 0.1, SPD: 0.1 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'TRI-EYED', structure: 'Integrated third eye/sensory structure.' },
      { id: 'AXOLOTL', structure: 'External gills/frills and salamander body.' },
      { id: 'FROG', structure: 'Compressed torso, hind-leg identity.' },
      { id: 'SALAMANDER', structure: 'Long body/tail and smooth limbs.' },
      { id: 'TOAD', structure: 'Dense squat body and textured skin masses.' },
      { id: 'TADPOLE', structure: 'Tail-led transitional anatomy.' },
    ],
  },
  {
    id: 'FAIRY',
    coreAnatomy: 'Magical lightweight supernatural organism',
    it: 'organismo magico leggero',
    drivers: 'social energy, vanity, playfulness, arousal',
    absoluteRule: 'Non-feathered wings; must not collapse into Angel.',
    fit: { social: 0.2, vanity: 0.18, playfulness: 0.16, arousal: 0.14, fashionCamp: 0.12, warmth: 0.1, theatricality: 0.1 },
    supportsHair: true,
    supportsEyewear: true,
    archetypes: [
      { id: 'HUMANOID', structure: 'Slender supernatural humanoid with non-feathered wings.' },
      { id: 'PIXIE', structure: 'Compressed winged body, not automatically cute.' },
      { id: 'MOTH-FAIRY', structure: 'Broad magical membrane wings, still Fairy not Insect.' },
      { id: 'SPRITE', structure: 'Small energy-like supernatural body with wing/appendage logic.' },
      { id: 'GLAMOUR', structure: 'Elegant body with illusionary/surface-shifting anatomy.' },
      { id: 'THORN FAIRY', structure: 'Sharper botanical-like magical structures without becoming Plant.' },
    ],
  },
  {
    id: 'FUNGUS',
    coreAnatomy: 'Mycelial/cap/stalk organism',
    it: 'organismo fungino',
    drivers: 'CARE, REC, introspection, weirdness',
    absoluteRule: 'Cluster/root/cap logic; fungus-first.',
    fit: { CARE: 0.22, REC: 0.18, introspection: 0.18, weirdness: 0.14, patience: 0.1, melancholy: 0.1, curiosity: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'CLUSTER', structure: 'Multiple caps/stalks/roots forming one organism.' },
      { id: 'CAP', structure: 'One dominant mushroom-cap identity mass.' },
      { id: 'MYCELIUM', structure: 'Network/root filament organism.' },
      { id: 'SPORE', structure: 'Spore sacs/cloud-producing body structures.' },
      { id: 'BRACKET', structure: 'Layered shelf-fungus masses.' },
      { id: 'MOLD', structure: 'Distributed fuzzy/patchy fungal organism, kept graphic not gross.' },
    ],
  },
  {
    id: 'MICROBE',
    coreAnatomy: 'Microscopic/cellular colony organism',
    it: 'organismo cellulare microscopico',
    drivers: 'CARE, REC, technical curiosity, weirdness',
    absoluteRule: 'Cells/membranes/nuclei/cilia; non-humanoid by default.',
    fit: { CARE: 0.2, REC: 0.18, technical: 0.18, weirdness: 0.16, adaptability: 0.12, vigilance: 0.08, discipline: 0.08 },
    supportsHair: false,
    supportsEyewear: true,
    archetypes: [
      { id: 'COLONY', structure: 'Several cellular units cooperating as one creature.' },
      { id: 'BACTERIA', structure: 'Rod/coccus/spiral cellular grammar.' },
      { id: 'PROTOZOA', structure: 'Single-cell body with organelles/flagella.' },
      { id: 'VIRAL', structure: 'Capsid/spike structural grammar, stylized not medical diagram.' },
      { id: 'BIOFILM', structure: 'Layered connected colony mass.' },
      { id: 'ORGANELLE', structure: 'One exaggerated intracellular structure becomes identity mass.' },
    ],
  },
  {
    id: 'SLIME',
    coreAnatomy: 'Gelatinous root organism',
    it: 'organismo gelatinoso primordiale',
    drivers: 'First node / explicit reset only',
    absoluteRule:
      'Family SLIME is exclusive to Vz.mon. Later slime influence is AFFINITY only.',
    // Nessuna formula di fit: SLIME non entra mai nell'estrazione pesata (§17).
    fit: {},
    supportsHair: false,
    supportsEyewear: true,
    rootOnly: true,
    archetypes: [
      { id: 'ROOT', structure: 'Canonical Vz.mon root state.' },
      { id: 'SPLIT', structure: 'Several partially separated masses as one organism.' },
      { id: 'HOLLOW', structure: 'Strong cavity/negative-space anatomy.' },
      { id: 'MELTED', structure: 'Low flowing body.' },
      { id: 'VERTICAL', structure: 'Tall unstable columnar body.' },
      { id: 'MULTI-LOBE', structure: 'Several connected lobes with one identity.' },
    ],
  },
];

export type FamilyId = string;

export function familyDef(id: FamilyId): FamilyDef {
  const f = FAMILIES.find((x) => x.id === id);
  if (!f) throw new Error(`Family sconosciuta: ${id}`);
  return f;
}

/** §17 step 1 — le Family estraibili escludono sempre SLIME. */
export const SELECTABLE_FAMILIES = FAMILIES.filter((f) => !f.rootOnly);

/** §3 — il nodo radice è canonico, non generato. */
export const ROOT_MON = {
  name: 'Vz.mon',
  family: 'SLIME',
  archetype: 'ROOT',
} as const;

/* ============================================================================
   §5 — CATALOGO DELLE AFFINITY
   16 voci. L'Affinity è CONTAMINAZIONE ANATOMICA cross-family, non un
   materiale e non un colore: molti id coincidono con quelli delle Family, ed
   è voluto. §19 penalizza di −12 la coincidenza esatta con la Family.
   ========================================================================= */

export interface AffinityDef {
  id: string;
  /** §5 ANATOMICAL EFFECT — va nei prompt. */
  effect: string;
  it: string;
}

export const AFFINITIES: AffinityDef[] = [
  { id: 'ANGEL', effect: 'Secondary wings, rings, feathers, multiple eyes, luminous/ritual symmetry.', it: 'ali secondarie, anelli, piume, occhi multipli' },
  { id: 'DEMON', effect: 'Horns, sharp protrusions, infernal appendages, oni-like structures.', it: 'corna, protuberanze acuminate, appendici infernali' },
  { id: 'MACHINE', effect: 'Panels, cables, apertures, hinges, mechanical replacement zones.', it: 'pannelli, cavi, cerniere, zone sostituite da meccanica' },
  { id: 'PLANT', effect: 'Roots, leaves, sprouts, flowers, thorns, botanical growth.', it: 'radici, foglie, germogli, fiori, spine' },
  { id: 'AQUA', effect: 'Gills, fins, membranes, aquatic appendages.', it: 'branchie, pinne, membrane, appendici acquatiche' },
  { id: 'PSYCHIC', effect: 'Extra eyes, floating components, symbols, spatial distortion, impossible spacing.', it: 'occhi in più, parti fluttuanti, spaziature impossibili' },
  { id: 'MINERAL', effect: 'Crystal growth, stone plates, ore/metallic raw structures.', it: 'cristalli, placche di pietra, minerale grezzo' },
  { id: 'SLIME', effect: 'Gelatinous zones, droplets, deformable membranes, bubbles, flowing parts.', it: 'zone gelatinose, gocce, membrane deformabili, bolle' },
  { id: 'BEAST', effect: 'Fur-like structures, claws, teeth, instinctive patterning.', it: 'strutture simili a pelo, artigli, zanne' },
  { id: 'DRAGON', effect: 'Scales, crests, horns, reptilian membranes, draconic structures.', it: 'scaglie, creste, corna, membrane rettiliane' },
  { id: 'UNDEAD', effect: 'Bones, missing structures, seams, spectral/dead motifs.', it: 'ossa, strutture mancanti, suture, motivi spettrali' },
  { id: 'ALIEN', effect: 'Unknown organs, alien symmetry, non-terrestrial appendages.', it: 'organi ignoti, simmetrie aliene, appendici non terrestri' },
  { id: 'ELECTRIC', effect: 'Charged fur/edges, lightning interruptions, conductive organs, glowing charge structures.', it: 'pelo carico, interruzioni di fulmine, organi conduttivi' },
  { id: 'FIRE', effect: 'Heat vents, flame-like anatomy, charred/hot structures; not just orange palette.', it: 'sfiati di calore, anatomia di fiamma, strutture carbonizzate' },
  { id: 'POISON', effect: 'Glands, toxic sacs, dripping/bulbous structures, warning markings.', it: 'ghiandole, sacche tossiche, strutture gocciolanti' },
  { id: 'FISH', effect: 'Fins, gills, fish-bone/hollow aquatic structures applied to non-Aqua family.', it: 'pinne, branchie, lische applicate a un corpo non acquatico' },
];

export function affinityDef(id: string): AffinityDef {
  const a = AFFINITIES.find((x) => x.id === id);
  if (!a) throw new Error(`Affinity sconosciuta: ${id}`);
  return a;
}

/* ============================================================================
   §6 + §21 — SISTEMA DELLE TAGLIE
   ========================================================================= */

export const SIZES = ['TINY', 'MEDIUM', 'GIANT'] as const;
export type Size = (typeof SIZES)[number];

export const SIZE_GRAMMAR: Record<Size, { rule: string; it: string }> = {
  TINY: {
    rule: 'Compressed anatomy; dominant identity mass; shortened secondary structures.',
    it: 'anatomia compressa, massa identitaria dominante',
  },
  MEDIUM: {
    rule: 'Balanced canonical Family proportions.',
    it: 'proporzioni canoniche bilanciate',
  },
  GIANT: {
    rule: 'One or more anatomical structures become dramatically dominant; NEVER simple image scaling.',
    it: 'una o più strutture diventano dominanti, mai una scalatura',
  },
};

/**
 * §21 — «Size Score = 0.30 FORM + 0.20 ATK + 0.15 DEF + 0.10 current energy
 * + 0.10 confidence + 0.15 archetype morphology modifier».
 *
 * I cinque pesi dei segnali sono qui normalizzati a 1.00 (0.30/0.85 e così
 * via) perché §6 dichiara MEDIUM «default center state»: con segnali a metà
 * scala il punteggio deve valere 50, non 42. Il modificatore di morfologia si
 * somma dopo, come scostamento −25…+25 («before normalization»), portando
 * l'intervallo utile a 25–75 e rendendo raggiungibili sia TINY sia GIANT.
 */
export const SIZE_SCORE_WEIGHTS: FitFormula = {
  FORM: 0.3 / 0.85,
  ATK: 0.2 / 0.85,
  DEF: 0.15 / 0.85,
  energy: 0.1 / 0.85,
  confidence: 0.1 / 0.85,
};
export const SIZE_ARCHETYPE_MODIFIER_RANGE = 25;
export const SIZE_THRESHOLDS = { tinyBelow: 38, giantAtOrAbove: 68 } as const;

/* ============================================================================
   §7 — CATALOGO DEI ROLE (24)
   ========================================================================= */

export interface RoleDef {
  id: string;
  translation: string;
  it: string;
}

export const ROLES: RoleDef[] = [
  { id: 'ORACLE', translation: 'Symbolic sensing/prophetic behavior, controlled stillness.', it: 'percezione simbolica, immobilità controllata' },
  { id: 'BARD', translation: 'Rhythm/resonance/sound-producing anatomy; performative.', it: 'anatomia che produce ritmo e risonanza' },
  { id: 'PIRATE', translation: 'Asymmetry/swagger/rope-hook cues translated minimally.', it: 'asimmetria e spavalderia, appena accennate' },
  { id: 'KING', translation: 'Commanding symmetry/elevated mass/crown-like anatomy.', it: 'simmetria imperiosa, massa elevata' },
  { id: 'SAMURAI', translation: 'Controlled stance; anatomical limb/blade discipline.', it: 'postura controllata, disciplina degli arti' },
  { id: 'JESTER', translation: 'Asymmetry, unstable rhythm, playful dangling structures.', it: 'ritmo instabile, strutture penzolanti' },
  { id: 'WANDERER', translation: 'Travel-ready utility, curiosity, carried system/object.', it: 'attrezzatura da viaggio, curiosità, un oggetto portato' },
  { id: 'WIZARD', translation: 'Controlled impossible gesture, floating focus, intelligence; no robe/hat cliché.', it: 'gesto impossibile controllato, fuoco fluttuante' },
  { id: 'SUPERHERO', translation: 'Heroic orientation, emblematic readable silhouette; no cape default.', it: 'orientamento eroico, sagoma emblematica' },
  { id: 'COWBOY', translation: 'Wide silhouette/rope/boot logic translated through anatomy.', it: 'sagoma larga, logica di corda e stivale' },
  { id: 'KNIGHT', translation: 'Defense/shield/plate logic built from creature anatomy.', it: 'logica di scudo e piastra ricavata dal corpo' },
  { id: 'VILLAIN', translation: 'Theatrical confidence, scheming posture, arrogance; no evil costume.', it: 'sicurezza teatrale, postura che trama' },
  { id: 'ASTRONAUT', translation: 'Pressure/orbital/life-support logic translated biologically.', it: 'logica di pressione e supporto vitale, ma biologica' },
  { id: 'SCOUT', translation: 'Alert/lightweight/navigation behavior.', it: 'allerta, leggerezza, orientamento' },
  { id: 'GUARDIAN', translation: 'Protective mass/stance/containment behavior.', it: 'massa protettiva, postura di contenimento' },
  { id: 'TRICKSTER', translation: 'Misdirection, asymmetry, playful rule-breaking.', it: 'depistaggio, asimmetria, regole infrante per gioco' },
  { id: 'HACKER', translation: 'Interface/cable/signal logic; indirect, technical behavior.', it: 'logica di interfaccia e segnale, comportamento obliquo' },
  { id: 'DANCER', translation: 'Rhythmic body line, weight shift, gesture-led silhouette.', it: 'linea ritmica, spostamento di peso' },
  { id: 'RACER', translation: 'Forward aerodynamic stance, speed/readiness.', it: 'postura aerodinamica in avanti, prontezza' },
  { id: 'CHEF', translation: 'Transformation/mixing/serving anatomy, especially Food but not exclusive.', it: 'anatomia che trasforma, mescola e serve' },
  { id: 'ALCHEMIST', translation: 'Combination/conversion/material experimentation.', it: 'combinazione e conversione di materia' },
  { id: 'ARCHIVIST', translation: 'Storage, labels, memory-bearing anatomy/behavior.', it: 'immagazzinamento, etichette, memoria portata addosso' },
  { id: 'IDOL', translation: 'Performance, gaze-awareness, stylized confidence.', it: 'performance, consapevolezza dello sguardo' },
  { id: 'HERMIT', translation: 'Self-contained posture, reduced social display, internal-focus behavior.', it: 'postura raccolta, poca esposizione sociale' },
];

export function roleDef(id: string): RoleDef {
  const r = ROLES.find((x) => x.id === id);
  if (!r) throw new Error(`Role sconosciuto: ${id}`);
  return r;
}

/* ============================================================================
   §8 — CATALOGO FASHION (18)
   ========================================================================= */

export interface FashionDef {
  id: string;
  language: string;
  it: string;
}

export const FASHIONS: FashionDef[] = [
  { id: 'MINIMAL', language: 'Reduced clothing/exposure, clean negative space, one decisive form.', it: 'poco addosso, spazio negativo pulito, una forma decisa' },
  { id: 'FORMAL', language: 'Tailored/symmetrical cues, precise footwear/optics, controlled polish.', it: 'taglio sartoriale simmetrico, ottica precisa' },
  { id: 'GOTH', language: 'Narrow dark garments, straps/chains, severe silhouette; not Halloween.', it: 'capi scuri stretti, cinghie e catene, sagoma severa' },
  { id: 'WORKWEAR', language: 'Durable utility panels, pockets, straps, tools, robust footwear.', it: 'pannelli da lavoro, tasche, cinghie, calzature robuste' },
  { id: 'TECHWEAR', language: 'Modular segmentation, technical fabrics, utility geometry.', it: 'segmentazione modulare, tessuti tecnici' },
  { id: 'PUNK', language: 'Piercing/studs/DIY asymmetry/aggressive graphic mark.', it: 'borchie, asimmetria fai-da-te, segno grafico aggressivo' },
  { id: 'UTILITY', language: 'Practical bags/pockets/robust adaptable garments.', it: 'borse e tasche pratiche, capi adattabili' },
  { id: 'STREET', language: 'Contemporary streetwear/skate logic, sneakers, graphic attitude.', it: 'streetwear contemporaneo, sneaker, attitudine grafica' },
  { id: 'PREPPY', language: 'Knit/cardigan/polo/clean shirt, cropped tailoring, refined shoes.', it: 'maglia, polo, camicia pulita, scarpa raffinata' },
  { id: 'SPORT', language: 'Performance shorts/technical straps/sport footwear/athletic optics.', it: 'shorts da performance, ottica sportiva' },
  { id: 'GRUNGE', language: 'Worn irregular layers, rough textile cue, messy styling.', it: 'strati consumati e irregolari, styling disordinato' },
  { id: 'RAVER', language: 'Loose technical trousers, mesh/club top, body exposure, experimental footwear.', it: 'pantaloni tecnici larghi, rete, calzature sperimentali' },
  { id: 'Y2K', language: 'Early-2000s proportions, technical/club/surf accents, playful futurism.', it: 'proporzioni primi Duemila, futurismo giocoso' },
  { id: 'TAILORED AVANT', language: 'Structured exaggerated tailoring, editorial optics, sculptural shoes.', it: 'sartoria strutturata ed esagerata, scarpe scultoree' },
  { id: 'OUTDOOR', language: 'Trail/functional layers, protective shell, hiking-derived footwear.', it: 'strati funzionali da sentiero, guscio protettivo' },
  { id: 'ROMANTIC', language: 'Soft volume, exposed zones, elegant drape, delicate-but-masculine styling.', it: 'volumi morbidi, drappeggio elegante' },
  { id: 'MOTO', language: 'Protective fitted panels, boot/strap logic, speed/road attitude.', it: 'pannelli protettivi aderenti, logica di stivale e cinghia' },
  { id: 'CLUB', language: 'Nightlife body exposure, compact tops, strong eyewear, statement footwear.', it: 'esposizione da nightlife, top compatti, ottica forte' },
];

export function fashionDef(id: string): FashionDef {
  const f = FASHIONS.find((x) => x.id === id);
  if (!f) throw new Error(`Fashion sconosciuta: ${id}`);
  return f;
}

/* ============================================================================
   §9 — MARCATORI PERSONALI VINZ
   «Eyewear is mandatory whenever anatomically possible. It must adapt to the
   creature rather than humanize the creature.»
   ========================================================================= */

export const EYEWEAR_CATEGORIES = [
  { id: 'SHIELD', it: 'a scudo' },
  { id: 'WRAPAROUND', it: 'avvolgenti' },
  { id: 'VISOR', it: 'a visiera' },
  { id: 'ULTRA-NARROW', it: 'ultra strette' },
  { id: 'HIGH-FRAME', it: 'a montatura alta' },
  { id: 'OVERSIZED', it: 'oversize' },
  { id: 'MASK', it: 'a maschera' },
  { id: 'RIMLESS', it: 'senza montatura' },
  { id: 'SCULPTURAL', it: 'scultoree' },
  { id: 'SPORT PERFORMANCE', it: 'sportive da performance' },
  { id: 'OPTICAL EDITORIAL', it: 'ottiche da editoriale' },
  { id: 'TRANSPARENT/CRYSTAL', it: 'trasparenti o di cristallo' },
  { id: 'MIRRORED', it: 'a specchio' },
  { id: 'TINTED', it: 'colorate' },
  { id: 'ASYMMETRIC/MONO', it: 'asimmetriche o mono-lente' },
  { id: 'INTEGRATED OPTICS', it: 'ottiche integrate nel corpo' },
] as const;

export const HAIRCUTS = [
  { id: 'SHORT TEXTURED CROP', en: 'short textured crop', it: 'corto scalato' },
  { id: 'MOD CUT', en: 'mod cut', it: 'taglio mod' },
  { id: 'CONTEMPORARY MULLET', en: 'contemporary mullet', it: 'mullet contemporaneo' },
  { id: 'MESSY MEDIUM-SHORT', en: 'messy medium-short', it: 'medio-corto spettinato' },
  { id: 'SHORT SIDES LONG TOP', en: 'short sides + longer textured top', it: 'lati corti, sopra lungo e scalato' },
  { id: 'GENERIC SHORT', en: 'generic short masculine cut', it: 'corto maschile essenziale' },
] as const;

export const HAIR_STATES = [
  {
    id: 'FULL BLEACH',
    prompt: 'Hair/hair-equivalent is almost entirely platinum or white-blonde. Preserve natural texture; avoid metallic silver unless Character DNA requests it.',
    it: 'decolorazione piena, platino o biondo bianco',
  },
  {
    id: 'VISIBLE ROOTS',
    prompt: 'Show darker natural roots with previously bleached blonde lengths. The root transition must read as real regrowth, not two-tone intentional dye.',
    it: 'radici scure con lunghezze decolorate',
  },
  {
    id: 'GROWN-OUT BLEACH',
    prompt: 'Hair/hair-equivalent is now mostly natural darker color; only older outer lengths/tips remain blonde from a previous full bleach. NOT ombré. NOT intentionally dyed tips.',
    it: 'ricrescita naturale con punte biondo vecchio',
  },
] as const;

/** §9 — anatomie senza capelli: la decolorazione si traduce, non si forza. */
export const NO_HUMAN_HAIR_RULE =
  'If the Family has no plausible hair anatomy, do not force a wig or human scalp hair. Translate bleach DNA only through a believable fur/mane/feather/fiber/crest/strand equivalent, or omit it when impossible.';

/* ============================================================================
   §10 — MOOD DNA (16)
   ========================================================================= */

export interface MoodDef {
  id: string;
  presence: string;
  it: string;
}

export const MOODS: MoodDef[] = [
  { id: 'CUTE', presence: 'Friendly/eager/social softness; may coexist with huge/aggressive anatomy.', it: 'morbidezza socievole ed entusiasta' },
  { id: 'GOOFY', presence: 'Awkward, badly coordinated, unserious timing.', it: 'goffaggine, tempi mai seri' },
  { id: 'BRIGHT', presence: 'Open, alert, energetic, optimistic presence.', it: 'presenza aperta, sveglia, ottimista' },
  { id: 'AGGRESSIVE', presence: 'Forward tension, confrontational gaze, sharp body readiness.', it: 'tensione in avanti, sguardo di sfida' },
  { id: 'CHAOTIC', presence: 'Conflicting directions, unstable asymmetry, playful disorder.', it: 'direzioni in conflitto, disordine giocoso' },
  { id: 'SAD', presence: 'Collapsed posture, low head, drooping anatomy.', it: 'postura crollata, testa bassa' },
  { id: 'MYSTERIOUS', presence: 'Withholding gaze, obscured face, controlled stillness.', it: 'sguardo che trattiene, volto in ombra' },
  { id: 'WATCHFUL', presence: 'Scanning posture, multiple sightlines, head tilt, vigilance.', it: 'postura che scandaglia, vigilanza' },
  { id: 'SEDUCTIVE', presence: 'Controlled allure, confidence, lower-energy attraction.', it: 'fascino controllato, energia bassa' },
  { id: 'FLIRTY', presence: 'Cheeky angle, teasing social confidence.', it: 'angolo sfacciato, sicurezza che provoca' },
  { id: 'FERAL', presence: 'Instinctive, high-energy, low social restraint.', it: 'istinto, energia alta, poco freno' },
  { id: 'AFFECTIONATE', presence: 'Warm proximity, protective/soft relational signals.', it: 'vicinanza calda, segnali protettivi' },
  { id: 'ALLURING', presence: 'Elegant magnetic presence, self-aware but not overtly sexual.', it: 'presenza magnetica ed elegante' },
  { id: 'STOIC', presence: 'Emotionally economical, rigid calm, minimal reaction.', it: 'calma rigida, reazione minima' },
  { id: 'CALM', presence: 'Relaxed balance, low tension, steady openness.', it: 'equilibrio rilassato, tensione bassa' },
  { id: 'CREEPY', presence: 'Uncanny timing/gaze/spacing; allowed as generated descriptor, never automatically tied to Undead.', it: 'tempi e spaziature perturbanti' },
];

export function moodDef(id: string): MoodDef {
  const m = MOODS.find((x) => x.id === id);
  if (!m) throw new Error(`Mood sconosciuto: ${id}`);
  return m;
}

/** §22 — sotto Data Confidence 35 si usa un mood neutro, non se ne inventa uno forte. */
export const NEUTRAL_MOODS = ['CALM', 'STOIC', 'MYSTERIOUS'] as const;
export const MOOD_CONFIDENCE_FLOOR = 35;

/* ============================================================================
   §11 — INPUT MOOD DELL'UTENTE → LATENTI
   13 voci selezionabili, fino a 3 al giorno. Un solo giorno non assegna mai
   direttamente il Mood della creatura.
   ========================================================================= */

export const MOOD_INPUTS = [
  { id: 'SERENO', latents: { warmth: 60, calm: 85, stress: 10 } },
  { id: 'AFFETTUOSO', latents: { warmth: 90, affection: 90, social: 65 } },
  { id: 'ARRAPATO', latents: { arousal: 95, confidence: 60, energy: 65 } },
  { id: 'ENERGICO', latents: { energy: 90, playfulness: 60, confidence: 60 } },
  { id: 'EUFORICO', latents: { energy: 95, playfulness: 85, social: 80, confidence: 75 } },
  { id: 'IRRITATO', latents: { irritability: 90, intensity: 65, distance: 45 } },
  { id: 'STRESSATO', latents: { stress: 90, vigilance: 70, irritability: 55 } },
  { id: 'PARANOIATO', latents: { vigilance: 95, stress: 70, distance: 60, mystery: 55 } },
  { id: 'SCARICO', latents: { energy: 10, melancholy: 55, calm: 40 } },
  { id: 'MALINCONICO', latents: { melancholy: 90, introspection: 80, distance: 50 } },
  { id: 'CAZZARO', latents: { playfulness: 95, absurdity: 80, social: 70, theatricality: 60 } },
  { id: 'SICURO', latents: { confidence: 90, control: 65, vanity: 50 } },
  { id: 'DISTACCATO', latents: { distance: 90, introspection: 60, calm: 50 } },
] as const;

export type MoodInputId = (typeof MOOD_INPUTS)[number]['id'];

export const MOOD_INPUT_RULES = {
  maxPerDay: 3,
  /** §22 — finestra di default. */
  windowDays: 14,
  /** §22 — gli ultimi 3 giorni pesano il doppio. */
  recentDays: 3,
  recentMultiplier: 2,
  /** §22 — nessun giorno può contribuire oltre il 18%. */
  maxDayShare: 0.18,
} as const;

/* ============================================================================
   §12 — APPEARANCE
   Quattro canoniche + DOODLE, che NON è un Appearance ed è riservato alla BIO.
   ========================================================================= */

export const APPEARANCES = ['DESIGNER TOY 3D', 'INK', 'CEL', 'ELASTIC CARTOON'] as const;
export type Appearance = (typeof APPEARANCES)[number];

export const APPEARANCE_RULES: Record<string, string> = {
  'DESIGNER TOY 3D':
    'Premium collectible toy sculpture; smooth simplified forms; matte vinyl/painted resin/translucent zones; 3–5 bold colors; full-body studio presentation.',
  INK: 'Street-ink / skate / DIY zine language; thick irregular black contours, large black masses, white negative space + acid spot color.',
  CEL: 'Flat graphic 2D cel language; controlled hard color blocks, decisive linework, readable anatomy/fashion.',
  'ELASTIC CARTOON':
    'Expressive stretch/compression and exaggerated pose while preserving creature anatomy.',
  DOODLE:
    'Sketchbook/personal-file representation with visible construction/corrections/notes; not a canonical Appearance.',
};

/* ============================================================================
   §13 + §14 — VOICE DNA
   12 assi parametrici e 16 preset. §14: «Presets are not classes; two .mon
   with the same preset must still speak differently.»
   ========================================================================= */

export const VOICE_AXES = [
  { id: 'temperament', params: 'energy, confidence, patience, competitiveness, impulsivity, curiosity, theatricality, mystery, vanity, discipline' },
  { id: 'relationship', params: 'affection, protectiveness, provocation, complicity, independence, respect, roast tendency, nickname behavior' },
  { id: 'humor', params: 'deadpan, camp, absurd, dark, intentional cringe, sarcasm, nonsense, anti-humor' },
  { id: 'writing', params: 'verbosity, sentence length, fragments, lowercase/CAPS tendency, punctuation, ellipses, parentheses, repetition' },
  { id: 'lexicon', params: 'simple, sophisticated, technical, internet, Gen-Z, archaic, poetic, corporate, gamer, scientific' },
  { id: 'language', params: 'English rate, code-switching, Italianized English, invented words, real/invented dialect tendency' },
  { id: 'digitalArtifacts', params: 'glitch text, error codes, percentages, terminal language, ASCII/file-name jokes' },
  { id: 'emotion', params: 'enthusiasm, irritability, dramaticity, vulnerability, coldness, suppressed excitement' },
  { id: 'rituals', params: 'greeting style, celebration style, complaint style, catchphrase/pet-name behavior' },
  { id: 'boundaries', params: 'forbidden phrases/emojis/registers; body/food/illness/health shame prohibited' },
  { id: 'evolution', params: 'linguistic maturity, self-awareness, memory/callback sophistication' },
  { id: 'bond', params: 'familiarity, inside jokes, callbacks, contradiction, affection expression' },
] as const;

export type VoiceAxisId = (typeof VOICE_AXES)[number]['id'];

export interface VoicePresetDef {
  id: string;
  tone: string;
  it: string;
}

export const VOICE_PRESETS: VoicePresetDef[] = [
  { id: 'DEADPAN FILE', tone: 'Low energy, high intelligence, dry/short, technical metadata jokes, almost no emoji.', it: 'energia bassa, secco, battute da metadato' },
  { id: 'CAMP ICON', tone: 'Theatrical, fashion-aware, affectionate roast, queer/camp rhythm, dramatic punctuation used selectively.', it: 'teatrale, sfottò affettuoso, ritmo camp' },
  { id: 'CHAOTIC GEN-Z', tone: 'Fast fragments, internet slang, nonsense turns, playful CAPS bursts, unpredictable but coherent.', it: 'frammenti veloci, slang, MAIUSCOLE improvvise' },
  { id: 'SOFT PROTECTOR', tone: 'Warm, concise, protective, low roast, remembers details, never baby-talks.', it: 'caldo e conciso, protettivo, mai infantile' },
  { id: 'COCKY RIVAL', tone: 'Competitive, provocative, confident, short challenges, respects effort more than reassurance.', it: 'competitivo, provocatorio, sfide brevi' },
  { id: 'MYSTERY SIGNAL', tone: 'Sparse, cryptic, slightly poetic/technical, delayed reveals, minimal direct explanation.', it: 'rado, criptico, rivelazioni ritardate' },
  { id: 'NERD TERMINAL', tone: 'Technical, curious, file/error metaphors, percentages, code-switching, low theatricality.', it: 'tecnico, metafore da file ed errore, percentuali' },
  { id: 'ART SNOB', tone: 'Sophisticated visual vocabulary, deadpan critique, occasional art/design references, can be hilariously picky.', it: 'lessico visivo sofisticato, critica impassibile' },
  { id: 'STREET FLIRT', tone: 'Confident, teasing, Gen-Z, fashion/street vocabulary, low verbosity, playful masculine flirt.', it: 'sicuro, stuzzicante, lessico street' },
  { id: 'GOTH POET', tone: 'Low-energy poetic fragments, dark humor, melancholy, elegant rather than melodramatic.', it: 'frammenti poetici, umorismo nero, malinconia' },
  { id: 'SPORT HYPE', tone: 'High energy, competitive, direct, short celebration, no generic wellness-coach clichés.', it: 'energia alta, diretto, esultanze brevi' },
  { id: 'ABSURD LITTLE FREAK', tone: 'Nonsense logic, unexpected observations, weird rituals, affectionate chaos.', it: 'logica assurda, rituali strani, caos affettuoso' },
  { id: 'OLD-SOUL ORACLE', tone: 'Measured, symbolic, calm, slightly archaic/poetic without fantasy exposition.', it: 'misurato, simbolico, lievemente arcaico' },
  { id: 'CORPORATE DEMON', tone: 'Deadpan fake-corporate language, KPI/file jokes, passive-aggressive formality as comedy.', it: 'aziendalese finto, formalità passivo-aggressiva' },
  { id: 'SWEET MENACE', tone: 'Affectionate and cute on surface, casually threatening/feral jokes, never cruel.', it: 'dolce in superficie, battute vagamente minacciose' },
  { id: 'SILENT STOIC', tone: 'Very low verbosity, restrained affection, precise responses, rare but meaningful callbacks.', it: 'pochissime parole, affetto trattenuto, risposte precise' },
];

export function voicePresetDef(id: string): VoicePresetDef {
  const v = VOICE_PRESETS.find((x) => x.id === id);
  if (!v) throw new Error(`Voice preset sconosciuto: ${id}`);
  return v;
}

/* ============================================================================
   §15 + §16 + §26 — SISTEMA DI RARITÀ
   ========================================================================= */

export const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'MYTHIC', 'SINGULAR'] as const;
export type Rarity = (typeof RARITIES)[number];

export interface RarityTierDef {
  id: Rarity;
  /** §15 — probabilità base, valida SOLO dopo lo sblocco del livello. */
  baseChance: number;
  /** §15/§25 — cancelli di sblocco. `null` = sempre sbloccato. */
  unlock: {
    minDepth?: number;
    minBond?: number;
    minDataConfidence?: number;
    minActiveDays?: number;
    minBranches?: number;
    hiddenTrigger?: boolean;
  } | null;
  /** §16 — banda di punteggio che consente questo livello. */
  scoreMin: number;
  meaning: string;
  it: string;
  /** §43 — che cosa la rarità concede al compilatore del prompt. */
  promptConsequence: string;
}

export const RARITY_TIERS: RarityTierDef[] = [
  {
    id: 'COMMON',
    baseChance: 48.0,
    unlock: null,
    scoreMin: 0,
    meaning: 'Coherent but relatively ordinary combination; no secret override.',
    it: 'combinazione coerente ma ordinaria',
    promptConsequence:
      'Use a clean coherent interpretation of the selected axes. One memorable design idea is enough. Do not intentionally make the result bland.',
  },
  {
    id: 'UNCOMMON',
    baseChance: 27.0,
    // §15: «Mindline Depth ≥ 2 OR 7 verified active days» — è un OR.
    unlock: { minDepth: 2, minActiveDays: 7 },
    scoreMin: 40,
    meaning: 'One strong unusual interaction between axes.',
    it: 'una interazione insolita forte fra due assi',
    promptConsequence:
      'Allow one stronger unusual interaction between two selected axes or one bolder silhouette decision.',
  },
  {
    id: 'RARE',
    baseChance: 15.0,
    unlock: { minDepth: 3, minBond: 30, minDataConfidence: 60 },
    scoreMin: 55,
    meaning: 'Distinct archetype/affinity/role interaction; stronger novelty.',
    it: 'interazione distintiva fra archetipo, affinity e ruolo',
    promptConsequence:
      'Allow a clearly distinctive cross-axis interaction and one more assertive structural/visual decision while preserving readability.',
  },
  {
    id: 'EPIC',
    baseChance: 7.0,
    unlock: { minDepth: 5, minBond: 50, minDataConfidence: 70 },
    scoreMin: 70,
    meaning: 'Unusual multi-axis synergy, stronger structural mutation, rarer archetype weighting.',
    it: 'sinergia multi-asse, mutazione strutturale più forte',
    promptConsequence:
      'Permit stronger structural mutation, rarer archetype emphasis and more unusual negative-space/silhouette logic. Do not add clutter.',
  },
  {
    id: 'MYTHIC',
    baseChance: 2.5,
    unlock: { minDepth: 8, minBond: 70, minDataConfidence: 75 },
    scoreMin: 83,
    meaning: 'Hidden combination of long-term patterns + lineage + rare synergy; cannot be directly chosen.',
    it: 'combinazione nascosta di pattern lunghi e lineage',
    promptConsequence:
      'Push the selected combination toward a highly specific, lineage-defining design. Use sophisticated Heritage transformation and unusual but coherent anatomy.',
  },
  {
    id: 'SINGULAR',
    baseChance: 0.5,
    unlock: { minDepth: 10, minBond: 85, minBranches: 3, hiddenTrigger: true },
    scoreMin: 94,
    meaning: 'One-off lineage event. Hidden trigger required; not guaranteed even when eligible.',
    it: 'evento irripetibile della lineage',
    promptConsequence:
      'Treat as a one-off lineage event. Maximize specificity and conceptual integration across existing axes. Do not invent extra taxonomy or excessive ornament; singularity comes from synthesis, not decoration.',
  },
];

/** §16 — le sette componenti del punteggio di rarità, 0–100 complessivi. */
export const RARITY_SCORE_COMPONENTS = [
  { id: 'novelty', max: 25, description: 'How far the configuration is from recent lineage/benchmark repetition.', it: 'distanza dalle ripetizioni recenti' },
  { id: 'crossAxisSynergy', max: 20, description: 'How meaningfully Family + Archetype + Affinity + Role + Fashion reinforce or tension each other.', it: 'sinergia o tensione fra gli assi' },
  { id: 'dataSpecificity', max: 15, description: 'Whether recent user signals form a distinctive stable pattern rather than noise.', it: 'quanto i segnali recenti sono un pattern e non rumore' },
  { id: 'heritageTransformation', max: 15, description: 'How cleverly prior traits are translated rather than copied.', it: 'quanto l’eredità è tradotta invece che copiata' },
  { id: 'voiceDistinctiveness', max: 10, description: 'Strength and coherence of Voice DNA contradictions/preset deviations.', it: 'forza e coerenza delle contraddizioni di voce' },
  { id: 'visualDistinctiveness', max: 10, description: 'Silhouette/eyewear/hair/material novelty while remaining readable.', it: 'novità di sagoma, ottica e materiali' },
  { id: 'hiddenEvent', max: 5, description: 'Special milestone/anniversary/rare pattern trigger.', it: 'traguardo o ricorrenza speciale' },
] as const;

export type RarityScoreComponentId = (typeof RARITY_SCORE_COMPONENTS)[number]['id'];

/* ============================================================================
   §17–§23 — PESI E PENALITÀ DEL MOTORE
   Tutti qui, come impone §29. Il motore non contiene numeri propri.
   ========================================================================= */

export const ENGINE_WEIGHTS = {
  /** §17 — selezione della Family. */
  family: {
    noveltyPenaltyImmediate: -25,
    noveltyPenaltyLast3: -12,
    noveltyPenaltyLast6: -5,
    culturalModifierRange: 12,
    noiseRange: 8,
    /** «softmax/weighted draw among top 6 Families» */
    topN: 6,
  },
  /** §18 — selezione dell'archetipo. */
  archetype: { fit: 0.6, novelty: 0.25, randomness: 0.15, immediateRepeatPenalty: -30 },
  /** §19 — selezione dell'affinity. */
  affinity: {
    healthMood: 0.45,
    personalityCultural: 0.25,
    novelty: 0.2,
    randomness: 0.1,
    /** Coincidenza esatta con la Family: ridondanza, non vietata. */
    sameAsFamilyPenalty: -12,
  },
  /** §20 — role e fashion. */
  role: { personality: 0.5, cultural: 0.2, mood: 0.15, randomness: 0.15 },
  fashion: { tasteSeason: 0.55, roleCompat: 0.2, familyCompat: 0.15, novelty: 0.1 },
  /** §23 — finestra di novità. */
  novelty: { windowNodes: 6, strongWindowNodes: 3, heritageMin: 1, heritageMax: 3, minChangedAxes: 4 },
} as const;

/* ============================================================================
   §23 — CATEGORIE DI HERITAGE
   ========================================================================= */

export const HERITAGE_CATEGORIES = [
  { id: 'anatomy', it: 'ANATOMIA' },
  { id: 'palette', it: 'FRAMMENTO DI PALETTE' },
  { id: 'eyewear', it: 'LOGICA DELL’OTTICA' },
  { id: 'symbol', it: 'MOTIVO SIMBOLICO' },
  { id: 'contradiction', it: 'CONTRADDIZIONE' },
  { id: 'voiceRitual', it: 'RITUALE DI VOCE' },
  { id: 'memory', it: 'MEMORIA' },
  { id: 'relationship', it: 'ABITUDINE RELAZIONALE' },
] as const;

export type HeritageCategory = (typeof HERITAGE_CATEGORIES)[number]['id'];

/** §23/§41 — obiettivo visivo: ~20% ereditato, 80% libertà di progetto. */
export const HERITAGE_TARGET_RATIO = 0.2;

/* ============================================================================
   §2 — AFFINITÀ CULTURALI
   ========================================================================= */

export const CULTURAL_TAGS = [
  { id: 'artDesignFashion', it: 'arte, design, moda', signal: 'fashionCamp' },
  { id: 'techAI', it: 'tecnologia e AI', signal: 'technical' },
  { id: 'queerCamp', it: 'cultura queer e camp', signal: 'sensoryCamp' },
  { id: 'games', it: 'videogiochi', signal: 'technical' },
  { id: 'superhero', it: 'supereroi', signal: 'novelty' },
  { id: 'y2k', it: 'nostalgia Y2K', signal: 'fashionCamp' },
  { id: 'travel', it: 'viaggi e città', signal: 'novelty' },
  { id: 'horrorWeird', it: 'horror e immaginario strano', signal: 'darkCulture' },
] as const satisfies readonly { id: string; it: string; signal: SignalKey }[];

export type CulturalTagId = (typeof CULTURAL_TAGS)[number]['id'];

/* ============================================================================
   §28 — SICUREZZA E TONO, NON NEGOZIABILI
   Vincolano la generazione di testo e finiscono nei frammenti di voce (§44).
   ========================================================================= */

export const SAFETY_RULES = [
  'The .mon may tease behavior but must never shame body size, weight, food, illness, disability or health status.',
  'No emotion is framed as morally better/worse.',
  'No Family is framed as a reward for "good" health and no Family as punishment for "bad" health.',
  'UNDEAD/DEMON/POISON etc. are aesthetic/narrative outcomes, never diagnoses or negative health judgments.',
  'Generic motivational-assistant language is disallowed unless intentionally parodied by Voice DNA.',
] as const;
