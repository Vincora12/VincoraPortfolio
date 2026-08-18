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

/* 2.3.0 — riequilibrio delle estrazioni. Gli archetipi non dipendono più dalla
   posizione nel catalogo, la taglia legge una massa dichiarata, la Family si
   estrae con un softmax a temperatura invece che sul punteggio grezzo, e i due
   livelli di rarità in cima si guadagnano col punteggio invece di essere tirati
   una seconda volta. Misurato su 30.000 nascite prima e dopo.

   2.2.0 — via la Family SLIME e via la radice canonica: il primo .mon si
   estrae. §29 impone di incrementare la versione quando cambiano tassonomie o
   pesi, e i .mon già generati restano immutabili con la versione con cui sono
   nati. */
export const GENERATION_CONFIG_VERSION = '3.0.0';

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
   18 voci, tutte estraibili.

   🔶 SCOSTAMENTO VOLUTO DALLA GENERATION BIBLE v2.1 — decisione di prodotto.
   La bibbia ne elenca 19 e riserva SLIME al nodo radice: §3 «Family SLIME is
   exclusive to Vz.mon», §17 step 1 «exclude SLIME except root/reset». La
   radice fissa è stata tolta dal gioco — il primo .mon si estrae come tutti
   gli altri — e con essa cade l'unico motivo per cui SLIME esisteva come
   Family: non aveva formula di fit e non entrava mai nell'estrazione.

   La materia gelatinosa non sparisce dal mondo: sopravvive come AFFINITY, che
   è esattamente quello che la regola assoluta di SLIME già prescriveva —
   «Later slime influence is AFFINITY only».
   ========================================================================= */

/* ----------------------------------------------------------------------------
   MASSA DELL'ARCHETIPO (§21)

   ⚠️ La taglia leggeva la POSIZIONE dell'archetipo nell'elenco come se fosse
   morfologia: `spread = index / (n - 1)`, cioè «più stai in fondo al catalogo,
   più sei massiccio». Non è mai stato vero — l'ordine è quello in cui gli
   archetipi sono stati scritti, non una scala di stazza. TURTLE («shell-
   dominant») era in quarta posizione e finiva medio; MESSENGER («lean, reduced
   wing count») era in quinta e finiva grande.

   🔒 Adesso la stazza è DICHIARATA, una volta, accanto alla struttura che la
   giustifica. Ogni archetipo dice quanto occupa, e la frase inglese sopra è la
   prova: se un giorno qualcuno vuole cambiare una massa, deve prima cambiare
   la struttura che la contraddice.
   -------------------------------------------------------------------------- */

export const ARCHETYPE_MASSES = ['COMPACT', 'BALANCED', 'MASSIVE'] as const;
export type ArchetypeMass = (typeof ARCHETYPE_MASSES)[number];

/** Scostamento sul punteggio di taglia (§21). Simmetrico attorno a MEDIUM. */
export const MASS_OFFSET: Record<ArchetypeMass, number> = {
  COMPACT: -1,
  BALANCED: 0,
  MASSIVE: 1,
};

export interface ArchetypeDef {
  id: string;
  /** §4 — la struttura anatomica, che finisce nei prompt. */
  structure: string;
  /** §21 — quanto occupa. Deve essere coerente con `structure`. */
  mass: ArchetypeMass;
  /**
   * §5 (MASTER v1.1) — scostamento dalla umanoidità di Family, in gradini.
   *
   * 🔒 Si dichiara SOLO dove questo archetipo è chiaramente più o meno umano
   * degli altri della sua Family. Assente = quella della Family. Non si legge
   * mai dal NOME dell'archetipo: «HUMANOID» nell'id è una coincidenza di
   * catalogo, e leggerla sarebbe la stessa classe di difetto della taglia
   * dedotta dalla posizione in elenco.
   */
  humanShift?: number;
}

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
  archetypes: ArchetypeDef[];
  /** §9 — i capelli esistono solo dove l'anatomia li supporta. */
  supportsHair: boolean;
  /** §9 — «eyewear is mandatory whenever anatomically possible». */
  supportsEyewear: boolean;
  /**
   * §5 (MASTER CHARACTER SYSTEM v1.1) — QUANTO PUÒ ALLONTANARSI DALL'UMANO.
   *
   * ════════════════════════════════════════════════════════════════════════
   * 🔷 «I prompt del gioco creano sempre personaggi deformi.»
   *
   * ⚠️ QUESTA ERA LA CAUSA PRINCIPALE, E MANCAVA DEL TUTTO.
   *
   * Senza un livello dichiarato, il prompt diceva al modello che tipo di
   * creatura fare e non gli diceva MAI quanto doveva restare leggibile come
   * corpo. Una MACHINE // TRASH contaminata AQUA, senza un'ancora di
   * umanoidità, non ha una forma di riferimento: il modello ne inventa una, e
   * quello che inventa quando non ha un bersaglio è precisamente un ammasso.
   *
   * Il master la definisce come parametro 1–5, INDIPENDENTE dall'Appearance:
   *   1  fondamentalmente non umano
   *   2  creatura prima di tutto, con pochi appigli umani
   *   3  ibrido: umano e non umano pesano uguale
   *   4  chiaramente umanoide, il 25–35% può discostarsi
   *   5  leggibilissimo come umano, la trasformazione sta in zone scelte
   *
   * 🔒 «Humanoidity does not equal realism»: un 4/5 può avere proporzioni da
   * cartone estreme. Dice quanto è UMANO, non quanto è REALISTICO — e sono i
   * due assi che questo progetto confondeva.
   * ════════════════════════════════════════════════════════════════════════
   */
  humanoidity: [number, number];
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
    humanoidity: [3, 5],
    archetypes: [
      { id: 'HUMANOID', structure: 'Male-presenting celestial humanoid with anatomical wings.', mass: 'BALANCED' },
      { id: 'MANY-WING', structure: 'Several genuine wing masses; wing architecture dominates.', mass: 'MASSIVE' },
      { id: 'RINGED', structure: 'Rings/halo structures are integrated into skeletal/body logic.', mass: 'BALANCED' },
      { id: 'THRONE', structure: 'Dense radial wing/eye/ritual mass with little conventional human anatomy.', mass: 'MASSIVE' },
      { id: 'MESSENGER', structure: 'Lean mobile angel with reduced wing count and strong directional anatomy.', mass: 'COMPACT' },
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
    humanoidity: [2, 4],
    archetypes: [
      { id: 'FELINE', structure: 'Cat-derived head/paws/tail/legs/fur.', mass: 'BALANCED' },
      { id: 'CANINE', structure: 'Dog/wolf-derived anatomy; social/pack body language.', mass: 'BALANCED' },
      { id: 'URSINE', structure: 'Bear-derived mass, paws and heavy torso.', mass: 'MASSIVE' },
      { id: 'PRIMATE', structure: 'Primate-derived hands/shoulders/face while remaining creature-first.', mass: 'BALANCED' },
      { id: 'HORNED MAMMAL', structure: 'Goat/deer/bovine-derived horns/hooves/body grammar.', mass: 'MASSIVE' },
      { id: 'CHIMERIC', structure: 'Two mammalian grammars fused into one coherent Beast.', mass: 'MASSIVE' },
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
    humanoidity: [2, 4],
    archetypes: [
      { id: 'HUMANOID', structure: 'Upright torso/limbs with true draconic head, scales, claws, tail.', mass: 'BALANCED' },
      { id: 'SERPENTINE', structure: 'Long body, reduced limbs, coils and axial silhouette.', mass: 'BALANCED' },
      { id: 'WYRM', structure: 'Heavy low dragon with reduced/absent wings.', mass: 'MASSIVE' },
      { id: 'WYVERN', structure: 'Two hind legs + wing/forelimb logic.', mass: 'BALANCED' },
      { id: 'CRESTED', structure: 'Head/crest/horn identity mass dominates.', mass: 'MASSIVE' },
      { id: 'TINY DRAKE', structure: 'Compressed compact dragon anatomy, never plush mascot.', mass: 'COMPACT' },
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
    humanoidity: [2, 4],
    archetypes: [
      { id: 'CERATOPSIAN', structure: 'Frill + horn + beaked quadruped grammar.', mass: 'MASSIVE' },
      { id: 'THEROPOD', structure: 'Biped predator anatomy, tail-led balance.', mass: 'BALANCED' },
      { id: 'SAURIAN', structure: 'General lizard/iguana/gecko-derived body.', mass: 'BALANCED' },
      { id: 'TURTLE', structure: 'Shell-dominant reptilian body.', mass: 'MASSIVE' },
      { id: 'CROCODILIAN', structure: 'Long jaw, armored back, heavy tail.', mass: 'MASSIVE' },
      { id: 'SERPENT', structure: 'Snake-derived body distinct from Dragon serpentine via no draconic grammar.', mass: 'COMPACT' },
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
    humanoidity: [1, 4],
    archetypes: [
      { id: 'VEHICLE', structure: 'Wheels/tracks/cabin/locomotion structures become anatomy.', mass: 'MASSIVE' },
      { id: 'TRASH', structure: 'Discarded/utility mechanical material organism.', mass: 'BALANCED' },
      { id: 'INDUSTRIAL', structure: 'Hydraulic, hinge, plate and tool-like anatomy.', mass: 'MASSIVE' },
      { id: 'DEVICE', structure: 'Compact appliance/electronic-derived body without copying a real product.', mass: 'COMPACT' },
      { id: 'SWARM', structure: 'Multiple linked machine modules acting as one organism.', mass: 'BALANCED' },
      { id: 'SYNTHETIC HUMANOID', structure: 'Humanoid mechanical body with non-human head/core logic.', mass: 'BALANCED' },
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
    humanoidity: [1, 4],
    archetypes: [
      { id: 'FISH', structure: 'Fin/gill/tail-first aquatic anatomy.', mass: 'BALANCED' },
      { id: 'CEPHALOPOD', structure: 'Tentacle/mantle/siphon logic.', mass: 'BALANCED' },
      { id: 'CRUSTACEAN', structure: 'Shell/claw/segmented aquatic body.', mass: 'BALANCED' },
      { id: 'JELLY', structure: 'Bell/membrane/tentacle body, not Slime.', mass: 'COMPACT' },
      { id: 'AQUATIC MAMMAL', structure: 'Seal/whale/otter-derived organism.', mass: 'MASSIVE' },
      { id: 'DEEPSEA', structure: 'Bioluminescent/pressure-adapted strange anatomy.', mass: 'BALANCED' },
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
    humanoidity: [1, 3],
    archetypes: [
      { id: 'FLOWER', structure: 'Bloom is primary identity mass.', mass: 'BALANCED' },
      { id: 'VINE', structure: 'Tendril/coil/creeping anatomy.', mass: 'COMPACT' },
      { id: 'TREE', structure: 'Trunk/branch/root mass.', mass: 'MASSIVE' },
      { id: 'SUCCULENT', structure: 'Thick water-storing forms.', mass: 'COMPACT' },
      { id: 'CARNIVOROUS', structure: 'Trap/jaw/feeding botanical structure.', mass: 'BALANCED' },
      { id: 'MOSS/LICHEN', structure: 'Distributed low clustered botanical body.', mass: 'COMPACT' },
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
    humanoidity: [3, 5],
    archetypes: [
      { id: 'HUMANOID', structure: 'Infernal humanoid but demon-first face/body.', mass: 'BALANCED' },
      { id: 'ONI', structure: 'Heavy horned mask/head mass and powerful build.', mass: 'MASSIVE' },
      { id: 'IMP', structure: 'Compressed mischievous demon anatomy.', mass: 'COMPACT' },
      { id: 'BAT', structure: 'Wing/ear/membrane dominant demon.', mass: 'BALANCED' },
      { id: 'HORNED BEAST', structure: 'Quadrupedal/animal-derived infernal anatomy.', mass: 'MASSIVE' },
      { id: 'VOID DEMON', structure: 'Body organized around holes/shadow membranes/negative-space organs.', mass: 'BALANCED' },
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
    humanoidity: [3, 5],
    archetypes: [
      { id: 'GHOST', structure: 'Incomplete spectral floating body.', mass: 'COMPACT' },
      { id: 'SKELETON', structure: 'Bone architecture is primary body.', mass: 'BALANCED' },
      { id: 'MUMMY', structure: 'Wrapped/dried/sealed anatomical logic.', mass: 'BALANCED' },
      { id: 'REVENANT', structure: 'Partially intact dead body with missing/stitched zones.', mass: 'BALANCED' },
      { id: 'WRAITH', structure: 'Elongated shadow/membrane spectral form.', mass: 'MASSIVE' },
      { id: 'RELIC', structure: 'Object-remnant/funerary structure animated as organism.', mass: 'COMPACT' },
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
    humanoidity: [3, 5],
    archetypes: [
      { id: 'MANY-EYED', structure: 'Sensory structures dominate anatomy.', mass: 'BALANCED' },
      { id: 'DETACHED', structure: 'Body parts separated by impossible spacing.', mass: 'BALANCED' },
      { id: 'ORBITAL', structure: 'Satellite-like organs orbit a core body.', mass: 'MASSIVE' },
      { id: 'FOLDED SPACE', structure: 'Anatomy intersects/loops impossible geometry.', mass: 'BALANCED' },
      { id: 'SENSORIAL HUMANOID', structure: 'Humanoid psychic with controlled impossible organs.', mass: 'BALANCED' },
      { id: 'TOTEM', structure: 'Static stacked sensory organism.', mass: 'MASSIVE' },
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
    humanoidity: [1, 3],
    archetypes: [
      { id: 'CRYSTAL', structure: 'Faceted translucent/crystalline body.', mass: 'BALANCED' },
      { id: 'STONE', structure: 'Monolithic rock/plate body.', mass: 'MASSIVE' },
      { id: 'GEODE', structure: 'Outer shell + visible internal mineral cavity.', mass: 'BALANCED' },
      { id: 'METAL ORE', structure: 'Raw metal/mineral mass, not Machine.', mass: 'MASSIVE' },
      { id: 'SAND', structure: 'Granular/distributed mineral organism.', mass: 'COMPACT' },
      { id: 'FOSSIL', structure: 'Mineralized ancient anatomy/remains.', mass: 'BALANCED' },
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
    humanoidity: [1, 4],
    archetypes: [
      { id: 'GREY', structure: 'Cranial/eye-focused grey-adjacent grammar, aggressively varied.', mass: 'BALANCED' },
      { id: 'MULTI-LIMB', structure: 'Unfamiliar limb count and symmetry.', mass: 'MASSIVE' },
      { id: 'BIOMORPH', structure: 'Soft non-terrestrial organ structures.', mass: 'BALANCED' },
      { id: 'EXOSPACE', structure: 'Pressure/space-adapted biological architecture.', mass: 'BALANCED' },
      { id: 'SYMMETRIC', structure: 'Alien symmetry impossible in Earth animals.', mass: 'BALANCED' },
      { id: 'PARASITIC', structure: 'Attached/host-like modular organism, non-gory by default.', mass: 'COMPACT' },
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
    humanoidity: [1, 3],
    archetypes: [
      { id: 'FRUIT', structure: 'Peel/rind/seed/stem/leaf anatomy.', mass: 'COMPACT' },
      { id: 'NOODLE', structure: 'Noodle mass is edible anatomy, never hair.', mass: 'BALANCED' },
      { id: 'PASTRY', structure: 'Dough/layer/crust architecture.', mass: 'BALANCED' },
      { id: 'CANDY', structure: 'Confection/gum/gel sugar body distinct from Slime.', mass: 'COMPACT' },
      { id: 'SAVORY', structure: 'Bread/cheese/meat/vegetable dish-derived body.', mass: 'BALANCED' },
      { id: 'FERMENTED', structure: 'Bubble/culture/rind/fermentation anatomy.', mass: 'BALANCED' },
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
    humanoidity: [1, 3],
    archetypes: [
      { id: 'MANTIS', structure: 'Folded predatory forelimbs, triangular head.', mass: 'BALANCED' },
      { id: 'BEETLE', structure: 'Shell/elytra/horned exoskeleton.', mass: 'MASSIVE' },
      { id: 'MOTH', structure: 'Wing/powder/antenna silhouette.', mass: 'BALANCED' },
      { id: 'WASP', structure: 'Narrow segmented body, stinger/wing logic.', mass: 'COMPACT' },
      { id: 'SPIDER', structure: 'Arachnid eight-leg grammar; still under broad arthropod family for prototype.', mass: 'BALANCED' },
      { id: 'LARVAL', structure: 'Larva/caterpillar/grub body with transformation potential.', mass: 'COMPACT' },
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
    humanoidity: [2, 4],
    archetypes: [
      { id: 'TRI-EYED', structure: 'Integrated third eye/sensory structure.', mass: 'BALANCED' },
      { id: 'AXOLOTL', structure: 'External gills/frills and salamander body.', mass: 'BALANCED' },
      { id: 'FROG', structure: 'Compressed torso, hind-leg identity.', mass: 'COMPACT' },
      { id: 'SALAMANDER', structure: 'Long body/tail and smooth limbs.', mass: 'BALANCED' },
      { id: 'TOAD', structure: 'Dense squat body and textured skin masses.', mass: 'MASSIVE' },
      { id: 'TADPOLE', structure: 'Tail-led transitional anatomy.', mass: 'COMPACT' },
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
    humanoidity: [3, 5],
    archetypes: [
      { id: 'HUMANOID', structure: 'Slender supernatural humanoid with non-feathered wings.', mass: 'BALANCED' },
      { id: 'PIXIE', structure: 'Compressed winged body, not automatically cute.', mass: 'COMPACT' },
      { id: 'MOTH-FAIRY', structure: 'Broad magical membrane wings, still Fairy not Insect.', mass: 'MASSIVE' },
      { id: 'SPRITE', structure: 'Small energy-like supernatural body with wing/appendage logic.', mass: 'COMPACT' },
      { id: 'GLAMOUR', structure: 'Elegant body with illusionary/surface-shifting anatomy.', mass: 'BALANCED' },
      { id: 'THORN FAIRY', structure: 'Sharper botanical-like magical structures without becoming Plant.', mass: 'BALANCED' },
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
    humanoidity: [1, 3],
    archetypes: [
      { id: 'CLUSTER', structure: 'Multiple caps/stalks/roots forming one organism.', mass: 'MASSIVE' },
      { id: 'CAP', structure: 'One dominant mushroom-cap identity mass.', mass: 'BALANCED' },
      { id: 'MYCELIUM', structure: 'Network/root filament organism.', mass: 'COMPACT' },
      { id: 'SPORE', structure: 'Spore sacs/cloud-producing body structures.', mass: 'BALANCED' },
      { id: 'BRACKET', structure: 'Layered shelf-fungus masses.', mass: 'MASSIVE' },
      { id: 'MOLD', structure: 'Distributed fuzzy/patchy fungal organism, kept graphic not gross.', mass: 'COMPACT' },
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
    humanoidity: [1, 2],
    archetypes: [
      { id: 'COLONY', structure: 'Several cellular units cooperating as one creature.', mass: 'BALANCED' },
      { id: 'BACTERIA', structure: 'Rod/coccus/spiral cellular grammar.', mass: 'COMPACT' },
      { id: 'PROTOZOA', structure: 'Single-cell body with organelles/flagella.', mass: 'COMPACT' },
      { id: 'VIRAL', structure: 'Capsid/spike structural grammar, stylized not medical diagram.', mass: 'COMPACT' },
      { id: 'BIOFILM', structure: 'Layered connected colony mass.', mass: 'MASSIVE' },
      { id: 'ORGANELLE', structure: 'One exaggerated intracellular structure becomes identity mass.', mass: 'MASSIVE' },
    ],
  },
];

export type FamilyId = string;

export function familyDef(id: FamilyId): FamilyDef {
  const f = FAMILIES.find((x) => x.id === id);
  if (!f) throw new Error(`Family sconosciuta: ${id}`);
  return f;
}

/** Tutte le Family sono estraibili: non esiste più una radice riservata. */

/* ============================================================================
   §5 — I CINQUE GRADINI DI UMANOIDITÀ, COME LI SCRIVE IL MASTER

   🔒 Ogni gradino porta con sé i suoi DIVIETI, e sono la parte che conta.
   «Chiaramente umanoide» da solo non impedisce niente: quello che impedisce
   davvero un risultato deforme è dire cosa NON deve venire fuori — non uno
   squalo in piedi, non un umano con addosso gli accessori da squalo, non un
   furry. Sono le tre strade sbagliate che un modello prende quando gli chiedi
   un ibrido senza dirgli dove sta il confine.
   ========================================================================= */

export interface HumanoidityLevel {
  level: number;
  rule: string;
  avoid: string;
  it: string;
}

export const HUMANOIDITY: HumanoidityLevel[] = [
  {
    level: 1,
    rule: 'Fundamentally non-human. No requirement for a human skeleton or a human face. Bilateral symmetry is optional. The body plan may be organised around a function rather than around limbs.',
    avoid:
      'a human silhouette with the family texture painted on; a face arranged in the human eyes-nose-mouth order unless the anatomy genuinely produces it',
    it: 'per niente umano',
  },
  {
    level: 2,
    rule: 'Creature first, with a few human-readable relational cues: something that reads as a head, something that reads as a front. Posture may be quadruped, coiled, floating or seated.',
    avoid: 'an upright biped that is simply an animal standing on two legs; a furry-style anthropomorph',
    it: 'creatura prima di tutto',
  },
  {
    level: 3,
    rule: 'Hybrid balance: human and non-human anatomy carry comparable weight. Roughly half the body follows a human plan and half does not, and the boundary between them is a designed decision rather than a blend.',
    avoid: 'a human with attached animal parts; a costume read; an even smear between the two anatomies',
    it: 'ibrido in equilibrio',
  },
  {
    level: 4,
    rule: 'Clearly humanoid: head, readable face, torso, two arms, two legs, hands, feet and upright posture are all immediately recognisable. Approximately 25–35% of the anatomy may depart from ordinary human anatomy.',
    avoid:
      'a literal animal standing upright; a human wearing accessories of the family; a conventional furry anthropomorph; a superhero suit',
    it: 'chiaramente umanoide',
  },
  {
    level: 5,
    rule: 'Overwhelmingly human-readable. The transformation lives in selected anatomy, styling, material or supernatural systems rather than in the body plan. A viewer reads a person first and notices what is wrong second.',
    avoid: 'a plain human with a prop; a cosplay read; an unmodified person',
    it: 'quasi del tutto umano',
  },
];

export function humanoidityLevel(level: number): HumanoidityLevel {
  return HUMANOIDITY.find((h) => h.level === level) ?? HUMANOIDITY[2]!;
}

/**
 * ⚠️ «Humanoidity does not equal realism» — il master lo dice a chiare
 * lettere, e questa riga finisce nel prompt perché è la confusione più facile:
 * un 4/5 può avere proporzioni da cartone estreme. Dice quanto è UMANO, non
 * quanto è REALISTICO.
 */
export const HUMANOIDITY_NOT_REALISM =
  'HUMANOIDITY is not realism. A 4/5 character may still have extreme stylised cartoon proportions. This value controls how HUMAN the body plan reads, never how realistically it is drawn.';

export const SELECTABLE_FAMILIES = FAMILIES;

/**
 * Nome comune della specie. Ogni creatura ha il suo nome proprio — generato
 * col genoma di §24 step 17: inizia per V, contiene Z, finisce in `.mon` — ma
 * si può chiamare tutte così, come si dice «un gatto» di un gatto che ha già
 * un nome.
 */
export const SPECIES_NAME = 'vinz.mon';

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
  { id: 'ANGEL', effect: 'Secondary wings, rings, feathers, multiple eyes, luminous/ritual symmetry.', it: 'qualcosa di celeste gli è cresciuto addosso' },
  { id: 'DEMON', effect: 'Horns, sharp protrusions, infernal appendages, oni-like structures.', it: 'il corpo gli si è fatto appuntito dove non serviva' },
  { id: 'MACHINE', effect: 'Panels, cables, apertures, hinges, mechanical replacement zones.', it: 'pezzi di lui sono stati sostituiti da meccanica' },
  { id: 'PLANT', effect: 'Roots, leaves, sprouts, flowers, thorns, botanical growth.', it: 'gli sta crescendo addosso del verde, e non lo toglie' },
  { id: 'AQUA', effect: 'Gills, fins, membranes, aquatic appendages.', it: 'è fatto per un’acqua che qui non c’è' },
  { id: 'PSYCHIC', effect: 'Extra eyes, floating components, symbols, spatial distortion, impossible spacing.', it: 'certe sue parti non rispettano lo spazio' },
  { id: 'MINERAL', effect: 'Crystal growth, stone plates, ore/metallic raw structures.', it: 'in alcuni punti ha smesso di essere morbido' },
  { id: 'SLIME', effect: 'Gelatinous zones, droplets, deformable membranes, bubbles, flowing parts.', it: 'una parte di lui non tiene la forma' },
  { id: 'BEAST', effect: 'Fur-like structures, claws, teeth, instinctive patterning.', it: 'l’istinto gli è rimasto nel corpo' },
  { id: 'DRAGON', effect: 'Scales, crests, horns, reptilian membranes, draconic structures.', it: 'porta addosso un’armatura che gli è cresciuta da sola' },
  { id: 'UNDEAD', effect: 'Bones, missing structures, seams, spectral/dead motifs.', it: 'gli manca qualcosa e non sembra dargli fastidio' },
  { id: 'ALIEN', effect: 'Unknown organs, alien symmetry, non-terrestrial appendages.', it: 'ha organi che nessuno sa nominare' },
  { id: 'ELECTRIC', effect: 'Charged fur/edges, lightning interruptions, conductive organs, glowing charge structures.', it: 'è sempre un po’ sotto carica' },
  { id: 'FIRE', effect: 'Heat vents, flame-like anatomy, charred/hot structures; not just orange palette.', it: 'brucia piano anche da fermo' },
  { id: 'POISON', effect: 'Glands, toxic sacs, dripping/bulbous structures, warning markings.', it: 'produce qualcosa che è meglio non toccare' },
  { id: 'FISH', effect: 'Fins, gills, fish-bone/hollow aquatic structures applied to non-Aqua family.', it: 'ha pinne su un corpo che non nuota' },
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

/** §21 — quanto pesa la massa dichiarata dell'archetipo, dentro il ±25 di §21. */
export const SIZE_MASS_WEIGHT = 0.4;

/** §21 — quanto può scostarsi la taglia a parità di archetipo e di dati. */
export const SIZE_NOISE_RANGE = 16;

/* ⚠️ Le soglie erano 38 e 68: dodici punti sotto il centro e diciotto sopra.
   Insieme al fatto che gli archetipi in cima all'elenco vincevano quasi sempre
   (§18) e che quelli in cima contavano come «leggeri», producevano TINY nel 40%
   dei casi e GIANT nello 0,9% — in una vita intera di forme, sei sole creature
   grandi.

   🔒 §6 dichiara MEDIUM «default center state», e un centro ha due lati uguali:
   adesso le soglie sono simmetriche attorno a 50. Con segnali neutri TINY e
   GIANT sono ugualmente probabili; se i tuoi FORM/ATK/DEF stanno sopra la
   media escono più creature grandi, ed è esattamente quello che §21 vuole che
   la taglia significhi. */
export const SIZE_THRESHOLDS = { tinyBelow: 38, giantAtOrAbove: 64 } as const;

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

/* ============================================================================
   §8 (MASTER CHARACTER SYSTEM v1.1) — CHARACTER DESIGN DNA

   🔷 Dal master nuovo: «Character Design DNA determina COSA il personaggio
   sembra — proporzione, linguaggio delle forme, costruzione del viso,
   semplificazione anatomica, costruzione dei vestiti, silhouette, postura,
   densità di dettaglio. NON determina il mezzo di resa.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ QUESTO NON È L'APPEARANCE, ED È LA DISTINZIONE CHE IL LIVELLO INTERO
   ESISTE PER FARE.

   APPEARANCE dice COME è reso: cel, inchiostro, vinile. Cambia la superficie.
   CHARACTER DESIGN DNA dice COM'È COSTRUITO: quante masse, che proporzioni,
   come è fatta la faccia. Cambia il personaggio.

   Lo stesso .mon disegnato alla Ward e alla Nomura sono due creature diverse
   rese uguali; lo stesso .mon in CEL e in INK è una creatura sola resa in due
   modi. Confonderli produce prompt in cui «stile» significa due cose insieme e
   nessuna delle due si controlla.
   ════════════════════════════════════════════════════════════════════════════

   🔒 KAZUMA KANEKO NON È QUI, e non è una dimenticanza: il master lo dichiara
   «NOT ACTIVE / DO NOT SELECT». Sta scritto perché era attivo nelle versioni
   precedenti, e una libreria che non dice cosa ha tolto lo fa rientrare al
   primo che rilegge un documento vecchio.

   💡 Si accendono e si spengono da DEV → CREATURA → CATALOGHI. Il master §12
   lo prevede espressamente: «Approval means the designer remains in the active
   library; rejection removes it from active selection.»
   ========================================================================= */

/**
 * Le regole di costruzione di un designer, un asse per campo.
 *
 * ⚠️ CAMPI SEPARATI E NON UNA STRINGA SOLA, e non è pignoleria di struttura.
 * La prima versione era un paragrafo per designer, e il risultato l'ha detto
 * il feedback: «McCracken è ancora troppo corto, lascia molta più
 * interpretazione al modello». Con un campo unico la lunghezza dipende da
 * quanto avevo voglia di scrivere quel giorno; con gli assi dichiarati, un
 * designer a cui manca la faccia o la postura è visibile — e c'è un controllo
 * che lo fa fallire.
 *
 * 🔒 Gli assi sono quelli che il master §8 nomina: «proportion, shape
 * language, facial construction, anatomical simplification, clothing
 * construction, silhouette, gestural logic, posture, detail density». Servono
 * anche al protocollo §12: due designer si confrontano bene solo se sono
 * descritti sugli stessi assi.
 */
export interface DesignDnaDef {
  id: string;
  /** Densità di dettaglio dichiarata dal master, 1–5. */
  density: number;
  /** Rapporti fra le masse: cosa è grande, cosa è piccolo, quanto. */
  proportion: string;
  /** Il vocabolario di forme: da che solidi è fatto. */
  shapes: string;
  /** Come è costruita la faccia — occhi, bocca, cosa porta l'espressione. */
  face: string;
  /** Cosa si semplifica e cosa si butta: mani, giunture, appendici. */
  anatomy: string;
  /** Come si risolvono i vestiti, o cosa li sostituisce. */
  clothing: string;
  /** Posa e gesto: dove sta il peso, cosa fa il corpo a riposo. */
  posture: string;
  /** Cosa sopravvive alla densità dichiarata, e cosa no. */
  detail: string;
  /**
   * 🔷 QUANTE masse primarie, contate.
   *
   * ⚠️ È la differenza fra un prompt che funziona e uno che produce ammassi.
   * «Very few primary shapes» è un aggettivo e un modello non lo sa eseguire:
   * riempie. «Circa cinque masse: testa+capelli, torso, bacino, gambe, borsa»
   * lo sa eseguire, e la prova è che dove c'era un numero il risultato veniva
   * bene.
   */
  masses: string;
  /**
   * 🔷 LA contraddizione di proporzione, con le percentuali.
   *
   * Il master chiede «ONE strong proportional exaggeration» e non dice quale:
   * lasciarlo così significa che il modello se la inventa, e un'esagerazione
   * inventata senza bersaglio è esattamente una deformità. Qui si dice cosa
   * esagerare e di quanto.
   */
  exaggeration: string;
  it: string;
}

export const DESIGN_DNA: DesignDnaDef[] = [
  {
    id: 'KEN SUGIMORI',
    density: 2.75,
    proportion:
      'Compact. Head reads large against the body but never chibi. Limbs short and functional. Mass concentrates in the torso or in the single organ that identifies the species.',
    shapes:
      'Rounded primaries close to nameable solids — egg, teardrop, wedge — with one or two decisive angular accents. No compound forms that cannot be described in a word.',
    face:
      'Large simple high-contrast eyes; mouth small or merely implied; expression carried by eye shape and brow angle rather than by drawn features.',
    anatomy:
      'Every appendage is justified by species function. No decorative extra limbs. Digits reduced to two or three readable shapes.',
    clothing:
      'Rarely garments: surface markings, plates, fur or shell patterns do the work clothing would do.',
    posture:
      'Neutral three-quarter stance, weight even, alert. This is a portrait of a species, not an action pose.',
    detail:
      'Two or three secondary features at most. Texture is implied by silhouette, never by added linework.',
    masses:
      'Roughly SIX primary masses: head, torso, two limb pairs, one species organ, one tail or equivalent. Anything beyond six is a secondary feature and must attach to one of the six, never stand alone.',
    exaggeration:
      'The HEAD is about 25–30% larger than realistic proportion for the body; everything else stays close to natural. One species organ is then oversized against the head. The rest of the body must NOT be exaggerated: the contrast is the point.',
    it: 'chiarezza da icona, masse compatte, niente dettaglio che non dica qualcosa',
  },
  {
    id: 'GENNDY TARTAKOVSKY',
    density: 2,
    proportion:
      'Extreme contrast between adjacent masses: a tiny head on enormous shoulders, or the reverse. Limbs taper toward points. Nothing is average-sized.',
    shapes:
      'Hard geometry — parallelograms, wedges, trapezoids. Straight lines set against one single large curve.',
    face:
      'Minimal. Eyes as slits or dots, brow as one heavy shape, no rendered interior. The head is a shape before it is a face.',
    anatomy:
      'Joints implied, never drawn. Hands become mitts, blades or blocks. Necks are either absent or exaggerated.',
    clothing:
      'Flat graphic shapes read as one silhouette: a cape, a coat, a wrap — one garment, never two. No layering, no hems, no folds. The garment edge is a hard geometric cut, not cloth behaving like cloth.',
    posture:
      'Strong diagonal, weight thrown onto one side. The negative space between limbs is itself a designed shape.',
    detail:
      'Near zero. Every retained line is structural; if a line is decorative it is removed.',
    masses:
      'About FOUR primary masses only: one huge mass, one tiny mass, and two limb silhouettes. The whole figure must be describable as «a big X on top of a small Y».',
    exaggeration:
      'One mass is roughly TWICE the size it should be and the adjacent one roughly HALF. Shoulders vs head, or head vs body — pick one pair and push both directions at once. Limbs taper to about a third of their starting width.',
    it: 'contrasti di proporzione aggressivi, la posa contiene già il movimento',
  },
  {
    id: 'AKIRA TORIYAMA',
    density: 3,
    proportion:
      'Friendly and sturdy: large head, short strong limbs, small hands and feet with clear separated digits.',
    shapes:
      'Spheres and cylinders as primaries, with sharp accents reserved for hair, horns, spikes or antennae.',
    face:
      'Round eyes with visible whites, small nose, wide expressive mouth. Brows carry most of the emotion.',
    anatomy:
      'Mechanical or alien parts are simplified into toy-like modules with visible bolts, seams, dials and buttons — complexity becomes a thing you could hold.',
    clothing:
      'Simple garments with oversized collars, belts and boots. Fastenings are readable and few.',
    posture:
      'Bouncy, feet planted, slight forward lean. The hands are usually doing something.',
    detail:
      'Moderate. Hardware is drawn as a few large parts rather than many small ones: three big bolts instead of twenty rivets. Surfaces stay clean between the parts that matter, so each retained element still reads at a distance.',
    masses:
      'About SEVEN primary masses: the body core, two upper limbs, two lower limbs, one head mass and one crest or headgear mass. Hardware counts as ONE mass however many parts it appears to have.',
    exaggeration:
      'HEAD about 30% larger than realistic. Hands and feet about 20% larger. Torso compact and short. Limbs short and thick rather than long. No part of the body is thin.',
    it: 'costruzione amichevole e funzionale, idee complesse rese giocattoli',
  },
  {
    id: 'CRAIG McCRACKEN',
    density: 1.5,
    proportion:
      'Three to four primary masses in the whole character. The head or identity mass dominates and may occupy a third or more of the total. Limbs are thin simple appendages with no visible joints.',
    shapes:
      'Circles, ovals and rounded rectangles. Almost no compound forms: if a shape needs two words to describe, it is the wrong shape.',
    face:
      'Eyes as two large circles placed directly on the mass. Mouth is a single line. No nose. No ears unless the ears are the joke.',
    anatomy:
      'Hands and feet reduce to mitts or blobs. Fingers appear only when they carry the gag. No neck. No drawn musculature of any kind.',
    clothing:
      'A single flat colour block that reads as clothing, or nothing at all. No folds, no seams, no hems.',
    posture:
      'Front-facing or flat three-quarter. Stiff, symmetrical, deliberately doll-like — the stillness is the style.',
    detail:
      'Almost eliminated. Test every feature: if it can be removed and the character is still recognisable from across a room, remove it.',
    masses:
      'About FIVE primary masses and no more: head+hair as ONE mass, one compact torso, one lower-body mass, two limb silhouettes. Every other feature must live inside one of those five, not beside them.',
    exaggeration:
      'BIG GRAPHIC HEAD — about 30–35% larger than realistic — against a TINY COMPACT TORSO, LONG SIMPLE LIMBS and ABSURDLY LARGE hands and feet, roughly 50–70% wider than ordinary. This is a deliberate contradiction, not a chibi: the body must NOT shrink to match the head.',
    it: 'pochissime forme, proporzioni estreme, la comicità sta nella sagoma',
  },
  {
    id: 'PENDLETON WARD',
    density: 1.5,
    proportion:
      'Noodle limbs of impossible length against a simple bean or tube body. The head is barely distinct from the body it sits on.',
    shapes:
      'Single-stroke outlines. Forms that could be drawn without lifting the pen. Nothing is constructed from parts.',
    face:
      'Dot eyes and a small mouth, placed unusually high or low on the mass. The expression comes from WHERE the features sit, not from what they are.',
    anatomy:
      'No skeleton is implied. Limbs bend anywhere along their length. The scale of one part may openly contradict the rest of the body.',
    clothing:
      'Usually none: the body is the design. When something is worn it is a single accessory that appears to float rather than to be fitted — no straps, no fastenings, no logic about how it stays on. Clothing never explains itself.',
    posture:
      'Loose, off-balance, elastic. The pose is allowed to be physically impossible as long as it stays instantly drawable.',
    detail:
      'Minimal to the point of starkness: one bizarre specific instead of many small ones. If two odd features compete, keep the odder and delete the other. Surfaces are flat and empty between the few things that exist.',
    masses:
      'About FOUR primary masses: one body blob, one head barely distinct from it, and two noodle limbs. A fifth mass is allowed only if it is the single joke of the design.',
    exaggeration:
      'Limbs about THREE TIMES longer than the body is tall, and roughly a fifth of its width. The body stays small and simple. One feature — and only one — is at an openly impossible scale.',
    it: 'geometria ridotta all\'osso, anatomia elastica e impossibile',
  },
  {
    id: 'TETSUYA NOMURA',
    density: 5,
    proportion:
      'Tall, elongated, youthful heroic. Small head against the body, long legs, narrow waist, noticeably large hands.',
    shapes:
      'Layered planes. Belts, straps and zips act as structural lines that divide the masses. Left and right are deliberately not symmetrical.',
    face:
      'Fine features, large eyes with a detailed iris, sharp chin, long fringe crossing the face and breaking its outline.',
    anatomy:
      'Localised hardware: one shoulder armoured, one limb augmented or replaced. The rest stays anatomically plain so the intervention reads.',
    clothing:
      'Multiple layers with visible edges — hems, collars, straps and hanging elements that imply movement even at rest.',
    posture:
      'Dynamic contrapposto, weight on the back foot, one hand raised, holding or reaching.',
    detail:
      'High but strictly hierarchical: silhouette first, then primary masses, then hardware, then micro-detail. Detail that flattens the silhouette is removed.',
    masses:
      'About EIGHT primary masses: head, torso, two arms, two legs, one layered garment mass, one hardware mass. Detail lives INSIDE these eight and never adds a ninth.',
    exaggeration:
      'Body about EIGHT heads tall — head small against the figure — with long legs, a narrow waist and hands about 20% larger than realistic. One shoulder or one limb carries visibly more volume than its twin.',
    it: 'dettaglio fitto ma gerarchico, proporzioni eroiche allungate, asimmetria',
  },
  {
    id: 'JAMIE HEWLETT',
    density: 3,
    proportion:
      'Either lanky with a heavy head and a long neck, or short and thick with no neck — pick one and commit fully. Feet are large.',
    shapes:
      'Angular with flattened planes. Cheekbones and jaw read as straight cuts rather than curves.',
    face:
      'Heavy-lidded eyes, long nose, mouth set off-centre. The face is asymmetric on purpose.',
    anatomy:
      'Large expressive hands with visible knuckles and tendons; the hands carry as much character as the face. Slouched spine, uneven shoulders, one hip higher. The body always looks like it has been standing there a while.',
    clothing:
      'Real streetwear silhouettes — a specific identifiable garment rather than a generic outfit.',
    posture:
      'Off-beat: slouched, hip cocked, weight dumped on one leg. Attitude is established before anatomy.',
    detail:
      'Selective and uneven: a lot of information in the face and hands, almost none elsewhere.',
    masses:
      'About FIVE primary masses: head, torso, two limb pairs, one garment mass. Face and hands carry the detail; everything else stays a plain shape.',
    exaggeration:
      'Either a HEAVY HEAD on a long thin neck with narrow shoulders, or a thick compact body with almost no neck — commit to one. Feet about 30% larger than realistic. One shoulder sits visibly higher than the other.',
    it: 'allampanato o tracagnotto secondo il caso, faccia spigolosa, attitudine da strada',
  },
];

export function designDnaDef(id: string): DesignDnaDef {
  const d = DESIGN_DNA.find((x) => x.id === id);
  if (!d) throw new Error(`Character Design DNA sconosciuto: ${id}`);
  return d;
}

/**
 * 🔒 Tolti dalla libreria, e scritti qui perché non rientrino.
 *
 * Un nome cancellato da un elenco non lascia traccia: fra sei mesi qualcuno
 * rilegge un documento del 2025, lo trova, e lo rimette pensando che manchi
 * per sbaglio. Un controllo in `feature-check` verifica che non ricompaiano.
 */
export const DESIGN_DNA_RETIRED = ['KAZUMA KANEKO'] as const;

/* ⚠️ ELASTIC CARTOON È STATA CANCELLATA, non spenta.
   Il MASTER CHARACTER SYSTEM v1.1 §10 elenca tre Appearance — CEL, INK,
   DESIGNER TOY 3D — e quella era un residuo della spec precedente. Le altre
   tre restano nel catalogo anche quando sono spente, perché spegnere è una
   preferenza reversibile; questa non c'è più perché il documento non la
   prevede, ed è una cosa diversa. */
export const APPEARANCES = ['DESIGNER TOY 3D', 'INK', 'CEL'] as const;
export type Appearance = (typeof APPEARANCES)[number];

export const APPEARANCE_RULES: Record<string, string> = {
  'DESIGNER TOY 3D':
    'Premium collectible toy sculpture; smooth simplified forms; matte vinyl/painted resin/translucent zones; 3–5 bold colors; full-body studio presentation.',
  INK: 'Street-ink / skate / DIY zine language; thick irregular black contours, large black masses, white negative space + acid spot color.',
  CEL: 'Flat graphic 2D cel language; controlled hard color blocks, decisive linework, readable anatomy/fashion.',
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
    scoreMin: 63,
    meaning: 'One strong unusual interaction between axes.',
    it: 'una interazione insolita forte fra due assi',
    promptConsequence:
      'Allow one stronger unusual interaction between two selected axes or one bolder silhouette decision.',
  },
  {
    id: 'RARE',
    baseChance: 15.0,
    unlock: { minDepth: 3, minBond: 30, minDataConfidence: 60 },
    scoreMin: 68,
    meaning: 'Distinct archetype/affinity/role interaction; stronger novelty.',
    it: 'interazione distintiva fra archetipo, affinity e ruolo',
    promptConsequence:
      'Allow a clearly distinctive cross-axis interaction and one more assertive structural/visual decision while preserving readability.',
  },
  {
    id: 'EPIC',
    baseChance: 7.0,
    unlock: { minDepth: 5, minBond: 50, minDataConfidence: 70 },
    scoreMin: 73,
    meaning: 'Unusual multi-axis synergy, stronger structural mutation, rarer archetype weighting.',
    it: 'sinergia multi-asse, mutazione strutturale più forte',
    promptConsequence:
      'Permit stronger structural mutation, rarer archetype emphasis and more unusual negative-space/silhouette logic. Do not add clutter.',
  },
  {
    id: 'MYTHIC',
    baseChance: 2.5,
    unlock: { minDepth: 8, minBond: 70, minDataConfidence: 75 },
    scoreMin: 78,
    meaning: 'Hidden combination of long-term patterns + lineage + rare synergy; cannot be directly chosen.',
    it: 'combinazione nascosta di pattern lunghi e lineage',
    promptConsequence:
      'Push the selected combination toward a highly specific, lineage-defining design. Use sophisticated Heritage transformation and unusual but coherent anatomy.',
  },
  {
    id: 'SINGULAR',
    baseChance: 0.5,
    /* ⚠️ `hiddenTrigger` non è più un REQUISITO. Pretendeva che la nascita
       cadesse su un traguardo, e i traguardi capitano sei volte in una vita:
       moltiplicato per la probabilità di arrivare in banda faceva «mai».
       Il traguardo continua a contare — vale 5 punti su 100 nel punteggio, e
       su una nascita così SINGULAR diventa molto probabile — ma adesso è una
       spinta, non un cancello. I tre cancelli che restano bastano: profondità
       10, bond 85 e tre branch sono già anni. */
    unlock: { minDepth: 10, minBond: 85, minBranches: 3 },
    scoreMin: 81,
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
    /**
     * Quante Family compaiono nella traccia DEV. §17 dice «softmax/weighted
     * draw among top 6 Families», ma il taglio a sei era un secondo filtro
     * oltre al softmax: le Family con il fit più alto entravano nei sei più
     * spesso E pesavano di più una volta dentro, e il vantaggio si contava due
     * volte. Adesso l'estrazione è su tutte e diciotto; questo numero serve
     * solo a non stampare una tabella di diciotto righe nella traccia.
     */
    topN: 6,
    /**
     * Temperatura del softmax (§17). È il dislivello di punteggio che rende una
     * Family «e» volte più probabile di un'altra.
     *
     * ⚠️ Prima i pesi erano il punteggio grezzo riportato sopra lo zero, cioè
     * una temperatura implicita minuscola: bastavano dieci punti di fit per
     * essere tre volte e mezzo più probabile. Con DISC inchiodato a 100 (vedi
     * `health.ts`) MACHINE ne aveva undici gratis e usciva il 13% delle volte.
     *
     * 🔒 A 16 i tuoi dati contano ancora — una Family che ti somiglia resta la
     * più probabile — ma il divario fra la prima e l'ultima resta attorno al
     * doppio invece di quadruplicare. È la differenza fra «il motore ti legge»
     * e «il motore ha una preferita».
     */
    temperature: 16,
  },
  /**
   * §18 — selezione dell'archetipo.
   *
   * ⚠️ `fit` non c'è più. Valeva `70 - posizione * 6`, cioè un punteggio che
   * dipendeva SOLO da dove l'archetipo stava nell'elenco, e poi si prendeva il
   * massimo: il sesto archetipo di una Family non vinceva praticamente mai. Su
   * 30.000 nascite cinque archetipi non sono usciti nemmeno una volta —
   * REPTILE/SERPENT, AQUA/DEEPSEA, PLANT/MOSS-LICHEN, UNDEAD/RELIC,
   * FUNGUS/MOLD — ed erano tutti l'ultima voce del loro elenco.
   *
   * 🔒 Adesso gli archetipi di una Family partono pari e si estraggono a sorte
   * pesata. Quello che li separa è la NOVITÀ: quello appena usato pesa meno.
   * È l'unica differenza che si può difendere, perché è l'unica che riguarda
   * la creatura e non l'ordine in cui l'ho scritta.
   */
  archetype: { novelty: 0.35, randomness: 0.65, immediateRepeatPenalty: -70, recentPenalty: -30 },
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
   MASTER CHARACTER SYSTEM v1.1 §7 — IL SERBATOIO DEI RIFERIMENTI

   ⚠️ NON CONFONDERE CON `CULTURAL_TAGS` QUI SOPRA.

     CULTURAL_TAGS        cosa piace a TE. Otto voci, le dichiari tu, e
                          pesano su quale Family viene estratta.
     CULTURAL_REFERENCES  il serbatoio del master. Da cui si estraggono i 2–4
                          riferimenti ATTIVI di UNA forma, che finiscono nel
                          prompt.

   🔷 Dal feedback: «Stai passando all'immagine l'intero Available pool. Il
   CLEAN dice che va combinato un piccolo numero di riferimenti distanti, non
   semplicemente elencata tutta la libreria.»

   Aveva ragione, ed era un fraintendimento mio del capitolo: avevo messo nel
   prompt la LISTA DELLA SPESA invece della spesa. Un modello che riceve
   quindici mondi possibili non ne combina tre: ne prende il minimo comune,
   che è la creatura generica che §3 vieta.

   🔒 IL `cluster` NON È UNA CATEGORIA, È UN VINCOLO. Il master chiede
   riferimenti DISTANTI, e «distanti» va reso meccanico o non succede: due
   estratti non possono venire dallo stesso gruppo. Senza, uscirebbe
   «Final Fantasy + Kingdom Hearts + magical girl», che è un riferimento solo
   detto tre volte.
   ========================================================================= */

export interface CulturalReference {
  id: string;
  /** Come entra nel prompt. In inglese, come tutto il resto del compilatore. */
  en: string;
  /** 🔒 Due riferimenti dello stesso cluster non escono mai insieme. */
  cluster: 'PLAY' | 'SUBCULTURE' | 'FOLKLORE' | 'OBJECTS' | 'SACRED';
  /** Quale dei TUOI interessi lo rende più probabile. */
  signal: CulturalTagId;
  it: string;
}

export const CULTURAL_REFERENCES: CulturalReference[] = [
  { id: 'FF_KH', cluster: 'PLAY', signal: 'games', en: 'Final Fantasy / Kingdom Hearts character-design attitude', it: 'l’attitudine di Final Fantasy e Kingdom Hearts' },
  { id: 'SHAMAN_KING', cluster: 'PLAY', signal: 'games', en: 'Shaman King conceptual spirit-object relationships', it: 'il rapporto fra spirito e oggetto di Shaman King' },
  { id: 'MAGICAL_GIRL', cluster: 'PLAY', signal: 'queerCamp', en: 'magical-girl transformation logic', it: 'la logica di trasformazione delle maghette' },
  { id: 'RANGERS', cluster: 'PLAY', signal: 'superhero', en: 'Power Rangers transformation confidence', it: 'la sicurezza da trasformazione dei Power Rangers' },

  { id: 'Y2K', cluster: 'SUBCULTURE', signal: 'y2k', en: 'Y2K digital optimism', it: 'l’ottimismo digitale Y2K' },
  { id: 'RAVE', cluster: 'SUBCULTURE', signal: 'queerCamp', en: 'club and rave culture', it: 'la cultura da club e da rave' },
  { id: 'QUEER_FASHION', cluster: 'SUBCULTURE', signal: 'queerCamp', en: 'queer fashion image-making', it: 'la costruzione dell’immagine nella moda queer' },
  { id: 'STREET_BOOTLEG', cluster: 'SUBCULTURE', signal: 'artDesignFashion', en: 'street, skate and bootleg graphics', it: 'la grafica da strada, skate e bootleg' },

  { id: 'NAPOLI', cluster: 'FOLKLORE', signal: 'travel', en: 'Southern Italian and Neapolitan folklore and superstition', it: 'il folklore e la superstizione del sud e di Napoli' },
  { id: 'YOKAI', cluster: 'FOLKLORE', signal: 'horrorWeird', en: 'yokai', it: 'gli yokai' },
  { id: 'TAROT_MYTH', cluster: 'FOLKLORE', signal: 'horrorWeird', en: 'tarot, constellations and Greek myth', it: 'tarocchi, costellazioni e mito greco' },

  { id: 'OBSOLETE_TECH', cluster: 'OBJECTS', signal: 'techAI', en: 'robots and obsolete electronics', it: 'robot ed elettronica obsoleta' },
  { id: 'EYEWEAR_FASHION', cluster: 'OBJECTS', signal: 'artDesignFashion', en: 'contemporary fashion and eyewear', it: 'la moda contemporanea e l’occhialeria' },

  { id: 'SACRED_ANATOMY', cluster: 'SACRED', signal: 'horrorWeird', en: 'unfamiliar sacred anatomy', it: 'un’anatomia sacra che non si riconosce' },
  { id: 'COSMIC', cluster: 'SACRED', signal: 'horrorWeird', en: 'cosmic beings', it: 'creature cosmiche' },
];

export function culturalReference(id: string): CulturalReference | null {
  return CULTURAL_REFERENCES.find((r) => r.id === id) ?? null;
}

/** Quanti riferimenti attivi ha una forma. Il master dice «a small number». */
export const CULTURAL_ACTIVE_RANGE = { min: 2, max: 4 } as const;


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
