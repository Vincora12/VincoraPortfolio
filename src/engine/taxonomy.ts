/* ============================================================================
   VINZ.VERCE — ASSI DI GENERAZIONE (§4)

   ┌───────────────────────────────────────────────────────────────────────┐
   │  PROVISIONAL — NOT CANONICAL                                          │
   │  §18 marca 🟡 "Final complete Family and Affinity taxonomies and      │
   │  rarity weighting". Le liste FAMILY / FAMILY ARCHETYPE / AFFINITY /   │
   │  ROLE / FASHION / MOOD e i pesi di rarità qui sotto sono una          │
   │  proposta operativa per far girare il prototipo, NON il canone.       │
   │  Vanno approvate da Vincenzo prima di essere congelate.               │
   │  Vedi docs/OPEN_ITEMS.md.                                             │
   └───────────────────────────────────────────────────────────────────────┘

   Sono invece 🔒 LOCKED e non modificabili senza cambio di spec:
   • APPEARANCE — esattamente QUATTRO stili (§5). DOODLE non è un Appearance.
   • SIZE — TINY / MEDIUM / GIANT (§4).
   • Priorità di lettura FAMILY → ARCHETYPE → AFFINITY → SIZE → ROLE →
     FASHION → MOOD → marcatori di styling VINZ (§4).
   ========================================================================= */

/* --- APPEARANCE 🔒 LOCKED (§5) ---------------------------------------------
   "Canonical APPEARANCE catalog currently contains FOUR styles, not five."
   DOODLE è il linguaggio della BIO, non un Appearance.
   -------------------------------------------------------------------------- */

export const APPEARANCES = ['TOY', 'INK', 'CEL', 'ELASTIC'] as const;
export type Appearance = (typeof APPEARANCES)[number];

export const APPEARANCE_LABELS: Record<Appearance, string> = {
  TOY: 'DESIGNER TOY 3D',
  INK: 'INK',
  CEL: 'CEL',
  ELASTIC: 'ELASTIC CARTOON',
};

/** Descrizioni usate testualmente nei prompt asset (§22.1), da §5. */
export const APPEARANCE_SPEC: Record<Appearance, string> = {
  TOY: 'Premium collectible designer-toy rendering. Tactile materials, strong silhouette, clean studio-like presentation, stylized proportions, fashion-object credibility. Must NOT become generic Pixar, Funko or glossy videogame character art.',
  INK: 'High-contrast black-ink illustration. Expressive, graphic, imperfect but intentional. Strong silhouette and fashion readability. Not generic manga, not polished vector lineart.',
  CEL: 'Graphic cel-illustration language with flat controlled colour, decisive linework and animation-design clarity. No painterly rendering, no realistic light, no generic anime face system.',
  ELASTIC:
    'Highly expressive cartoon grammar with stretch, compression and exaggerated pose/silhouette while preserving canonical anatomy. Energetic and funny without automatically becoming cute.',
};

/* --- SIZE 🔒 LOCKED (§4) ---------------------------------------------------
   "TINY / MEDIUM / GIANT proportional grammar; never simple scaling."
   -------------------------------------------------------------------------- */

export const SIZES = ['TINY', 'MEDIUM', 'GIANT'] as const;
export type Size = (typeof SIZES)[number];

export const SIZE_GRAMMAR: Record<Size, string> = {
  TINY: 'Compressed proportional grammar: oversized head and hands relative to body, short limbs, low centre of gravity, dense silhouette. NOT the medium body scaled down.',
  MEDIUM:
    'Balanced proportional grammar: readable head-to-body ratio, articulate limbs, the reference build for the Family.',
  GIANT:
    'Expanded proportional grammar: small head relative to mass, heavy shoulder and limb volume, weight-bearing stance, slow-reading silhouette. NOT the medium body scaled up.',
};

/* --- FAMILY 🟡 PROVISIONAL (§4) --------------------------------------------
   "Primary anatomy / what the creature fundamentally is."
   Ogni Family porta con sé quali marcatori di styling VINZ sono
   anatomicamente plausibili (§6): capelli e occhiali non si applicano a tutti.
   -------------------------------------------------------------------------- */

export interface FamilyDef {
  id: string;
  /** Anatomia primaria, descritta per il prompt compiler. */
  anatomy: string;
  archetypes: readonly string[];
  /** §6: i capelli esistono solo dove l'anatomia li supporta. */
  supportsHair: boolean;
  /** §6: "Eyewear is mandatory whenever anatomically plausible". */
  supportsEyewear: boolean;
}

export const FAMILIES = [
  {
    id: 'ANGEL',
    anatomy:
      'winged upright body; the wings are structural anatomy attached to the shoulder girdle, not an accessory; visible feather or membrane logic consistent with the Affinity',
    archetypes: ['HUMANOID', 'BEAST-FORM', 'MASKED', 'MULTI-WING'],
    supportsHair: true,
    supportsEyewear: true,
  },
  {
    id: 'BEAST',
    anatomy:
      'quadruped-derived body that may stand bipedally; muzzle, ears and tail carry the expression; digitigrade limb construction',
    archetypes: ['CANID', 'FELID', 'URSINE', 'LEPORID', 'HOOFED'],
    supportsHair: true,
    supportsEyewear: true,
  },
  {
    id: 'INSECT',
    anatomy:
      'segmented exoskeletal body, three-part thorax logic, more than two limbs, antennae or compound optical organs',
    archetypes: ['CARAPACE', 'WINGED', 'MANTID', 'COLONIAL'],
    supportsHair: false,
    supportsEyewear: true,
  },
  {
    id: 'AQUATIC',
    anatomy:
      'body built around fins, gills or siphon logic; surface reads as wet, membranous or scaled; movement implies suspension rather than ground contact',
    archetypes: ['FINNED', 'CEPHALOPOD', 'SHELLED', 'DEEP-FORM'],
    supportsHair: false,
    supportsEyewear: true,
  },
  {
    id: 'REPTILE',
    anatomy:
      'scaled or plated body, long tail as counterweight, low wide skull, slit or lidless optical organs',
    archetypes: ['SAURIAN', 'SERPENTINE', 'PLATED', 'CRESTED'],
    supportsHair: false,
    supportsEyewear: true,
  },
  {
    id: 'AVIAN',
    anatomy:
      'beaked skull, hollow-boned lightness, feather groups as clothing-adjacent structure, scaled clawed feet',
    archetypes: ['CORVID', 'RAPTOR', 'WADER', 'FLIGHTLESS'],
    supportsHair: false,
    supportsEyewear: true,
  },
  {
    id: 'CONSTRUCT',
    anatomy:
      'assembled body with visible joints, panels, fasteners and seams; the construction is honest and legible, never a seamless robot shell',
    archetypes: ['ARTICULATED', 'MODULAR', 'CASED', 'PUPPET'],
    supportsHair: false,
    supportsEyewear: true,
  },
  {
    id: 'PLANT',
    anatomy:
      'growth-driven body: stem or trunk axis, leaf/petal/root structures acting as limbs and silhouette, seasonal decay and regrowth legible on the surface',
    archetypes: ['BLOOMING', 'ROOTED', 'FUNGAL', 'THORNED'],
    supportsHair: false,
    supportsEyewear: true,
  },
  {
    id: 'SPECTRE',
    anatomy:
      'incompletely resolved body: parts of the anatomy fade, repeat or fail to close; a stable core silhouette anchors the unstable extremities',
    archetypes: ['DRAPED', 'AFTERIMAGE', 'HOLLOW', 'DOUBLED'],
    supportsHair: true,
    supportsEyewear: true,
  },
  {
    id: 'AMORPHOUS',
    anatomy:
      'body without fixed skeleton: mass redistributes, surface tension defines the silhouette, features float in the volume rather than attaching to bone',
    archetypes: ['BLOB', 'SWARM', 'VAPOUR', 'CRYSTALLINE'],
    supportsHair: false,
    supportsEyewear: true,
  },
] as const satisfies readonly FamilyDef[];

export type Family = (typeof FAMILIES)[number]['id'];
export type FamilyArchetype = string;

export function familyDef(id: Family): FamilyDef {
  const f = FAMILIES.find((x) => x.id === id);
  if (!f) throw new Error(`Family sconosciuta: ${id}`);
  return f;
}

/* --- AFFINITY 🟡 PROVISIONAL (§4) ------------------------------------------
   "Transforms actual anatomy/material logic; never a costume toggle."
   Ogni voce descrive che cosa succede al CORPO, non quale colore indossa.
   -------------------------------------------------------------------------- */

export interface AffinityDef {
  id: string;
  /** Trasformazione anatomica/materica, per il prompt compiler. */
  transform: string;
  /** Tinte tipiche, punto di partenza del Color DNA. */
  hues: number[];
}

export const AFFINITIES = [
  {
    id: 'ELECTRIC',
    transform:
      'conductive anatomy: charge paths run visibly under the surface, extremities terminate in contact points, hair or membranes stand under static load',
    hues: [188, 52, 205],
  },
  {
    id: 'CHROME',
    transform:
      'the outer anatomy is polished metal: forms simplify into machined volumes, edges take a hard specular line, soft tissue becomes cast surface',
    hues: [210, 0, 195],
  },
  {
    id: 'GLASS',
    transform:
      'partially transparent anatomy: internal structure is visible through the outer body, edges refract, thin sections read as fragile',
    hues: [175, 200, 285],
  },
  {
    id: 'PAPER',
    transform:
      'the body is folded and layered sheet: creases replace joints, silhouettes read as cut edges, thickness collapses in profile',
    hues: [38, 20, 0],
  },
  {
    id: 'SMOKE',
    transform:
      'the outer anatomy dissolves into drift: limbs terminate without hard edges, the core stays dense while extremities disperse',
    hues: [250, 220, 0],
  },
  {
    id: 'MAGNETIC',
    transform:
      'the body organises debris: small fragments orbit and cling along field lines, the anatomy holds itself together by attraction rather than by joints',
    hues: [268, 0, 340],
  },
  {
    id: 'CERAMIC',
    transform:
      'glazed fired anatomy: surfaces are hard and slightly uneven, repaired cracks are visible and deliberate, edges chip rather than deform',
    hues: [18, 200, 350],
  },
  {
    id: 'LIQUID',
    transform:
      'the anatomy holds a moving volume: surfaces bead and run, silhouette sags and recovers, contact points flatten',
    hues: [200, 165, 232],
  },
  {
    id: 'STATIC',
    transform:
      'the anatomy is imperfectly resolved: parts of the body break into scanline and interference, silhouette tears and reassembles at the edges',
    hues: [0, 300, 120],
  },
  {
    id: 'VELVET',
    transform:
      'dense pile covers the anatomy: light falls off sharply across every curve, silhouette softens, surface direction is visible',
    hues: [330, 275, 355],
  },
  {
    id: 'BONE',
    transform:
      'the skeleton migrates outward: plates, ridges and joint caps sit on the outside of the body, load paths are legible on the surface',
    hues: [42, 30, 0],
  },
  {
    id: 'NEON',
    transform:
      'the anatomy carries sealed luminous tubing along its structural lines: the light is a physical component with terminations and fixings, not a glow effect',
    hues: [320, 155, 25],
  },
] as const satisfies readonly AffinityDef[];

export type Affinity = (typeof AFFINITIES)[number]['id'];

export function affinityDef(id: Affinity): AffinityDef {
  const a = AFFINITIES.find((x) => x.id === id);
  if (!a) throw new Error(`Affinity sconosciuta: ${id}`);
  return a;
}

/* --- ROLE 🟡 PROVISIONAL (§4) ----------------------------------------------
   "Narrative/cultural direction translated through anatomy and behavior."
   -------------------------------------------------------------------------- */

export const ROLES = [
  { id: 'SCOUT', behavior: 'moves first, reports back, never settles in one posture for long' },
  { id: 'ARCHIVIST', behavior: 'collects, labels and refuses to discard; carries what it catalogues' },
  { id: 'PERFORMER', behavior: 'plays to an audience that may not exist; poses even when alone' },
  { id: 'GUARD', behavior: 'positions itself between things; stance is always load-bearing' },
  { id: 'TRICKSTER', behavior: 'destabilises on purpose; timing and misdirection over force' },
  { id: 'MEDIC', behavior: 'reads damage before identity; hands are the most articulate part' },
  { id: 'BUILDER', behavior: 'cannot leave a structure unfinished; measures before moving' },
  { id: 'WANDERER', behavior: 'attached to no node; carries its whole context on the body' },
  { id: 'CRITIC', behavior: 'evaluates before participating; posture is withheld and precise' },
  { id: 'HOST', behavior: 'organises the space around others; makes room, offers, insists' },
] as const;

export type Role = (typeof ROLES)[number]['id'];

export function roleDef(id: Role) {
  const r = ROLES.find((x) => x.id === id);
  if (!r) throw new Error(`Role sconosciuto: ${id}`);
  return r;
}

/* --- FASHION 🟡 PROVISIONAL (§4, §6) ---------------------------------------
   L'asse FASHION copre "Outfit logic, eyewear, haircut, footwear, accessories,
   material/styling attitude" (§4): per questo occhiali e capelli vivono qui e
   non come campi inventati fuori dagli assi canonici (§13).
   Vincolo 🔒: la moda non deve MAI oscurare la leggibilità della Family (§6),
   e i riferimenti sono scorciatoie stilistiche, mai copie di prodotti reali.
   -------------------------------------------------------------------------- */

export const FASHION_ATTITUDES = [
  { id: 'TECHWEAR', logic: 'layered technical shells, harness and strap systems, sealed seams' },
  { id: 'WORKWEAR', logic: 'heavy utility cloth, reinforced panels, pockets that are actually used' },
  { id: 'CLUBWEAR', logic: 'body-conscious cut, reflective and transparent materials, night dressing' },
  { id: 'SPORTS', logic: 'performance panelling, mesh venting, team-graphic logic without real brands' },
  { id: 'TAILORING', logic: 'constructed shoulder, deliberate break and drape, formal grammar worn wrong' },
  { id: 'VINTAGE-SPORT', logic: 'worn-in retro athletic shapes, faded graphic prints, tube-sock era proportions' },
  { id: 'UNIFORM', logic: 'issued-garment logic, insignia placement, repetition and rank markers' },
  { id: 'LAYERED-STREET', logic: 'stacked lengths, oversized over fitted, deliberate proportion collision' },
  { id: 'MINIMAL', logic: 'reduced garment count, single material family, silhouette does the work' },
  { id: 'COSTUME', logic: 'character dressing worn sincerely, theatrical construction, camp precision' },
] as const;

export type FashionAttitude = (typeof FASHION_ATTITUDES)[number]['id'];

export function fashionDef(id: FashionAttitude) {
  const f = FASHION_ATTITUDES.find((x) => x.id === id);
  if (!f) throw new Error(`Fashion sconosciuta: ${id}`);
  return f;
}

/** §6: gli occhiali sono obbligatori quando l'anatomia lo consente, e devono
    variare molto da personaggio a personaggio. */
export const EYEWEAR = [
  'wraparound blade shades',
  'oversized square frames',
  'thin oval wire frames',
  'sports goggles with strap',
  'half-rim rectangular frames',
  'tinted round frames',
  'shield visor across the optical area',
  'thick rectangular acetate frames',
  'clip-on flip-up lenses',
  'narrow micro-lens frames',
  'safety goggles with side vents',
  'single-lens monocle rig',
] as const;

/** §6: stati di decolorazione. Le punte bionde sono ricrescita dopo una
    decolorazione completa, NON un ombré o delle punte tinte di proposito. */
export const HAIR_BLEACH_STATES = [
  {
    id: 'FULL-BLEACH',
    description: 'fully bleached, uniform pale tone from root to end',
  },
  {
    id: 'VISIBLE-ROOTS',
    description: 'bleached lengths with the natural dark root clearly grown in at the scalp',
  },
  {
    id: 'GROWN-OUT-BLEACH',
    description:
      'mostly natural dark hair with pale bleached ends surviving at the tips — this is REGROWTH after a previous full bleach, never a deliberate ombré or dyed tips',
  },
] as const;

export type HairBleachState = (typeof HAIR_BLEACH_STATES)[number]['id'];

export const HAIR_CUTS = [
  'short textured crop',
  'grown-out shag with a centre part',
  'slicked-back medium length',
  'cropped sides with volume on top',
  'chin-length waves tucked behind the ears',
  'buzzed with a longer fringe',
] as const;

export const FOOTWEAR = [
  'chunky technical sneakers',
  'worn high-top trainers',
  'heavy lug-sole boots',
  'thin retro running shoes',
  'moulded slip-on shells',
  'strapped sport sandals over socks',
  'bare structural feet, no footwear',
] as const;

export const ACCESSORIES = [
  'crossbody utility pouch',
  'stacked wrist bands',
  'oversized ear cuff',
  'clip-on data tag',
  'wrapped scarf at the throat',
  'chain with a small pendant',
  'gloves with cut fingertips',
  'shoulder-mounted small speaker',
  'folded map tucked into a strap',
  'enamel pin cluster',
] as const;

/* --- MOOD 🟡 PROVISIONAL (§4) ----------------------------------------------
   "Current emotional/visual presence." È lo stato del momento, non identità.
   -------------------------------------------------------------------------- */

export const MOODS = [
  { id: 'FOCUSED', presence: 'contained posture, weight forward, attention narrowed' },
  { id: 'RESTLESS', presence: 'weight shifting, unfinished gestures, gaze off-axis' },
  { id: 'WARM', presence: 'open shoulders, body angled toward the viewer, relaxed hands' },
  { id: 'GUARDED', presence: 'closed line, one shoulder rotated away, hands occupied' },
  { id: 'ELATED', presence: 'raised centre of gravity, extended silhouette, momentum upward' },
  { id: 'FLAT', presence: 'neutral weight, minimal expression, energy withheld' },
  { id: 'WIRED', presence: 'over-alert stance, raised extremities, tension held at the neck' },
  { id: 'TENDER', presence: 'lowered head, softened joints, contact-seeking hands' },
  { id: 'SARCASTIC', presence: 'asymmetric weight, one raised feature, deliberate slack' },
  { id: 'DEPLETED', presence: 'collapsed line, low shoulders, weight on the supporting side' },
] as const;

export type Mood = (typeof MOODS)[number]['id'];

export function moodDef(id: Mood) {
  const m = MOODS.find((x) => x.id === id);
  if (!m) throw new Error(`Mood sconosciuto: ${id}`);
  return m;
}

/* --- SEASON 🟡 PROVISIONAL (§4) --------------------------------------------
   "Contextual styling/material influence when relevant." Non sempre presente.
   -------------------------------------------------------------------------- */

export const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_INFLUENCE: Record<Season, string> = {
  SPRING: 'lighter layer count, transitional materials, unfinished weather logic',
  SUMMER: 'exposed construction, minimal layering, heat-adapted materials',
  AUTUMN: 'mid-weight layering, worn surfaces, muted material saturation',
  WINTER: 'insulated volume, sealed closures, heavy outer layer dominating the silhouette',
};

/* --- RARITY 🟡 PROVISIONAL (§4, §18) ---------------------------------------
   "Rarity of the specific generated configuration/outcome."
   I PESI SOTTO SONO PROVVISORI: §18 marca 🟡 "rarity weighting".
   Modificabili a runtime dal pannello DEV.
   -------------------------------------------------------------------------- */

export const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'ANOMALOUS', 'SINGULAR'] as const;
export type Rarity = (typeof RARITIES)[number];

/**
 * Soglie sul punteggio di rarità 0–1 calcolato da rarity.ts.
 * Tarate sulle percentili misurate con `node scripts/batch-check.mjs 3000`,
 * per ottenere una scala decrescente invece di due gradini appiattiti:
 * ≈55% COMMON · 28% UNCOMMON · 12% RARE · 4% ANOMALOUS · 1% SINGULAR.
 * Rimisurare con lo stesso comando dopo ogni modifica ai pesi di rarity.ts.
 */
export const RARITY_THRESHOLDS: { rarity: Rarity; min: number }[] = [
  { rarity: 'SINGULAR', min: 0.84 },
  { rarity: 'ANOMALOUS', min: 0.72 },
  { rarity: 'RARE', min: 0.6 },
  { rarity: 'UNCOMMON', min: 0.45 },
  { rarity: 'COMMON', min: 0 },
];

/* --- DOMINI CULTURALI (§16) ------------------------------------------------
   Approvati in v0.9 e confermati. Ogni .mon ne campiona solo un sottoinsieme;
   i riferimenti sono impliciti, mai un namedrop continuo. Un .mon può anche
   non avere affinità con alcuni di questi domini.
   -------------------------------------------------------------------------- */

export const CULTURAL_DOMAINS = [
  'cultura supereroistica / X-Men',
  'fantasy',
  'videogiochi / JRPG / sistemi di mostri',
  'cultura informatica / AI / internet',
  'arte contemporanea e cultura visiva',
  'art direction / branding / tipografia / packaging',
  'cinema e TV',
  'cultura queer / drag / camp',
  'moda e styling',
  'nostalgia Y2K',
  'viaggi / città / stranezze locali',
  'immaginario creaturale più scuro e strano',
] as const;

/* --- TRATTI DI PERSONALITÀ 🟡 PROVISIONAL (§4 CHARACTER DNA) --------------- */

export const TRAITS = [
  'ostinato', 'ironico', 'protettivo', 'vanitoso', 'curioso', 'diffidente',
  'generoso', 'impaziente', 'metodico', 'teatrale', 'schivo', 'competitivo',
  'nostalgico', 'pragmatico', 'permaloso', 'affettuoso', 'sarcastico', 'leale',
] as const;

export const DRIVES = [
  'essere visto', 'non deludere', 'capire come funziona', 'arrivare primo',
  'proteggere qualcosa', 'lasciare un segno', 'restare libero', 'appartenere',
  'migliorare il corpo', 'finire quello che ha iniziato', 'avere ragione',
  'non fermarsi mai',
] as const;

/** §2.2: un .mon può incarnare una contraddizione. Le coppie sono canoniche
    per costruzione: due poli che convivono nello stesso personaggio. */
export const CONTRADICTIONS = [
  { a: 'sicurezza', b: 'insicurezza' },
  { a: 'disciplina', b: 'caos' },
  { a: 'ossessione per la bellezza', b: 'umorismo grottesco' },
  { a: 'ambizione', b: 'evitamento' },
  { a: 'bisogno di vicinanza', b: 'bisogno di distanza' },
  { a: 'ironia costante', b: 'serietà assoluta' },
  { a: 'nostalgia', b: 'fretta di andare avanti' },
  { a: 'controllo', b: 'impulso' },
] as const;
