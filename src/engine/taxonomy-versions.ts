/* Versioni descrittive sperimentali del catalogo.

   La V1 resta qui letteralmente: non è affidata soltanto alla cronologia Git.
   La V2 può quindi essere provata nel generatore e rimossa senza ricostruire
   a memoria le descrizioni che producevano già risultati interessanti. */

export const ALIEN_FAMILY_V1 = {
  coreAnatomy: 'Non-terrestrial organism',
  absoluteRule: 'Avoid generic grey-alien convergence.',
  archetypes: [
    { id: 'GREY', structure: 'Cranial/eye-focused grey-adjacent grammar, aggressively varied.', mass: 'BALANCED' },
    { id: 'MULTI-LIMB', structure: 'Unfamiliar limb count and symmetry.', mass: 'MASSIVE' },
    { id: 'BIOMORPH', structure: 'Soft non-terrestrial organ structures.', mass: 'BALANCED' },
    { id: 'EXOSPACE', structure: 'Pressure/space-adapted biological architecture.', mass: 'BALANCED' },
    { id: 'SYMMETRIC', structure: 'Alien symmetry impossible in Earth animals.', mass: 'BALANCED' },
    { id: 'PARASITIC', structure: 'Attached/host-like modular organism, non-gory by default.', mass: 'COMPACT' },
  ],
} as const;

export const ALIEN_FAMILY_V2 = {
  coreAnatomy: 'A biological organism whose body plan is visibly non-terrestrial: unfamiliar cranial construction, joints, sensory organs, symmetry or pressure-adapted tissues must shape the silhouette rather than appear as decoration.',
  absoluteRule: 'ALIEN identity must come from a coherent biological body plan, never from random extra eyes, holes, floating ornaments, green skin alone, a space suit or generic sci-fi props. Use only the anatomical signatures authorized by the selected Archetype. Do not borrow another Alien Archetype primary signature. Preserve one readable face or sensory focal point and a memorable complete silhouette.',
  archetypes: [
    {
      id: 'GREY',
      structure: 'A slender upright extraterrestrial with an enlarged smooth cranium, reduced nose and mouth, long fine limbs and two dominant dark almond-shaped eyes. Exposed biological skin is obligatorily neutral grey, pearl grey, blue-grey or warm stone grey; green is forbidden as the dominant skin colour. Bright palette colours may appear only on clothing, eyewear, technology or small markings. No extra limbs, random holes, reptilian scales or insect exoskeleton.',
      mass: 'BALANCED',
      humanShift: 1,
    },
    {
      id: 'MULTI-LIMB',
      structure: 'A coherent extraterrestrial body organized around one explicit unfamiliar limb system: four to six functional limbs attached through a readable shoulder, pelvic or radial structure. Limb repetition must change stance and silhouette. Keep one clear head or sensory core. No decorative duplicate arms, random eyes or Grey-style oversized cranium unless structurally necessary.',
      mass: 'MASSIVE',
    },
    {
      id: 'BIOMORPH',
      structure: 'A soft-bodied extraterrestrial built from continuous membranes, inflatable lobes, translucent tissue or unfamiliar muscular sacs. Its silhouette is governed by one dominant organic mass and two or three named appendages. No mechanical plates, terrestrial animal cosplay, arbitrary perforations or shapeless slime body.',
      mass: 'BALANCED',
    },
    {
      id: 'EXOSPACE',
      structure: 'A biological organism evolved for vacuum, radiation or extreme pressure: sealed skin, recessed sensory organs, protective body folds and compact extremities are anatomy rather than a worn astronaut suit. Show one specific environmental adaptation as the identity mass. No helmet costume, vehicle parts, generic robot construction or Grey shorthand.',
      mass: 'BALANCED',
    },
    {
      id: 'SYMMETRIC',
      structure: 'An extraterrestrial whose primary body plan follows a clearly non-terrestrial symmetry—radial, bilateral-with-mirrored-secondary-axis, or rotational—applied consistently to torso, limbs and sensory organs. Keep a readable orientation and focal face/core. No random kaleidoscopic detail, floating decoration or unrelated extra limbs.',
      mass: 'BALANCED',
    },
    {
      id: 'PARASITIC',
      structure: 'A compact modular extraterrestrial built to attach, clasp or exchange nutrients through one clearly visible biological interface. The attachment organ is the identity mass; the creature remains complete and readable without depicting a victim or host. Non-gory by default. No exposed wounds, horror gore, random tentacle clutter or wearable-backpack appearance.',
      mass: 'COMPACT',
    },
  ],
} as const;

export type TaxonomyDescriptionVersion = 'v1' | 'v2';
const VERSION_KEY = 'vinzmon.taxonomyDescriptions.catalog';

export function taxonomyDescriptionVersion(): TaxonomyDescriptionVersion {
  if (typeof localStorage === 'undefined') return 'v1';
  return localStorage.getItem(VERSION_KEY) === 'v2' ? 'v2' : 'v1';
}

export function setTaxonomyDescriptionVersion(version: TaxonomyDescriptionVersion): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(VERSION_KEY, version);
}

/** Risolto una volta all'avvio. Il LAB ricarica la pagina dopo il cambio. */
type VersionableFamily = {
  id: string;
  coreAnatomy: string;
  absoluteRule: string;
  archetypes: readonly { id: string; structure: string; mass: string; humanShift?: number }[];
};

/* Contratti V2 per ogni Family. Non sostituiscono i sottotipi: aggiungono il
   pavimento visivo che oggi manca a quasi tutto il catalogo. Ogni contratto
   dichiara corpo, lettura primaria, confini e le Family con cui non deve
   confondersi. */
const FAMILY_V2: Record<string, { core: string; rule: string }> = {
  ANGEL: {
    core: 'A recognizably humanoid celestial organism whose wings, feathers, rings and ritual structures are integrated anatomy with an explicit count controlled by its Archetype.',
    rule: 'Keep a readable humanoid body and two primary facial eyes. Extra heads, eyes, arms, wings or floating anatomy appear only when the selected Archetype authorizes them. Never borrow another Angel Archetype signature or solve Angel through costume, halo prop or white-and-gold colour alone.',
  },
  BEAST: {
    core: 'A mammalian animal-first organism whose skull, spine, locomotion, paws or hooves, fur distribution and tail visibly derive from its selected species grammar.',
    rule: 'The selected mammal must control the body plan and silhouette. Do not borrow reptile scales, dragon horns or random hybrid anatomy unless CHIMERIC explicitly permits two named mammalian grammars.',
  },
  DRAGON: {
    core: 'A true draconic organism built from a coherent combination of scaled skull, axial spine, claws, tail, crest, horns and membranes according to its selected draconic body plan.',
    rule: 'Dragon anatomy must determine locomotion and silhouette. Do not reduce it to a reptile wearing horns, a human with dragon accessories, or an automatically giant creature. Wing and limb counts follow the Archetype; do not borrow dinosaur, serpent or wyvern grammar indiscriminately.',
  },
  REPTILE: {
    core: 'A biological non-draconic reptile or dinosaur organism whose skull, jaw, scale type, stance, tail balance and limbs follow one selected terrestrial reptilian grammar.',
    rule: 'The selected reptile or dinosaur must be identifiable through construction before colour or styling. No draconic horns, magical membranes or generic dragon convergence. Do not combine unrelated dinosaur and reptile features unless the subtype explicitly asks for them.',
  },
  MACHINE: {
    core: 'A manufactured organism whose chassis, joints, locomotion, sensors and functional modules form one coherent mechanical anatomy rather than equipment attached to a biological body.',
    rule: 'Every major mechanical part must serve locomotion, perception, protection or manipulation. Never make a vehicle or appliance with a face pasted on, a human in armour, or random obsolete-electronics clutter. The selected Archetype controls construction method and module count.',
  },
  AQUA: {
    core: 'A genuinely aquatic organism whose propulsion, breathing, pressure adaptation, fins, gills, mantle, shell or tail construct a body designed to live in water.',
    rule: 'Aquatic identity must come from anatomy and locomotion, never blue colour, bubbles or nautical props. Keep the selected aquatic lineage coherent. Do not drift into amphibian land limbs, dragon anatomy or generic fish-person styling unless the subtype requires it.',
  },
  PLANT: {
    core: 'A botanical organism in which roots, stems, trunks, leaves, blooms, thorns or water-storing tissue perform the jobs of skeleton, limbs, skin and sensory organs.',
    rule: 'Plant matter is the body, not decoration growing on a person. The selected growth strategy must control silhouette and mass. No generic flower crown, green human, fungal caps or random vines added as accessories.',
  },
  DEMON: {
    core: 'An infernal organism whose threatening identity comes from coherent facial construction, horns, mask logic, musculature, membranes, void tissue or compressed proportions selected by its Archetype.',
    rule: 'Demon identity must be anatomical and characterful, not red skin, fire background, pentagrams or devil costume. Do not add horns, bat wings, holes and claws all at once. Use only the selected Archetype primary infernal system.',
  },
  UNDEAD: {
    core: 'A dead, spectral or physically incomplete organism whose missing tissue, bone architecture, preservation method, spectral membrane or funerary remnant visibly determines its body plan.',
    rule: 'The selected state of death must alter anatomy, silhouette and material. Never solve UNDEAD with pale colour, torn clothes or gloomy mood alone. Do not mix bones, bandages, stitches, ghost trails and random holes unless the Archetype explicitly contains them; keep it non-gory by default.',
  },
  PSYCHIC: {
    core: 'A perception-and-space organism whose sensory system or impossible spatial relationship is the single organizing principle of its anatomy.',
    rule: 'Choose one controlled impossibility—sensory multiplication, detachment, orbit, folding or stacking—and make it structurally legible. Never add random eyes, holes, rings or floating parts merely to signal psychic power. Do not collapse into Alien, Angel or decorative magic effects.',
  },
  MINERAL: {
    core: 'A mineral organism whose facets, strata, plates, granular flow, cavity or ore mass form its skeleton, joints, surfaces and identity mass.',
    rule: 'Mineral matter is anatomy, not armour or crystal jewellery on a person. Use one selected geological formation consistently. Do not mix crystal, stone, geode, metal ore, sand and fossil signals, and never become a Machine simply because metal is present.',
  },
  ALIEN: { core: ALIEN_FAMILY_V2.coreAnatomy, rule: ALIEN_FAMILY_V2.absoluteRule },
  FOOD: {
    core: 'An edible-material organism whose peel, dough, layers, noodles, confection, rind or fermentation structure performs real anatomical functions.',
    rule: 'Food is the body, never a mascot holding or wearing food. Preserve recognisable edible material while building a stable creature silhouette. Use only the selected culinary construction; avoid mixing an entire meal into random ingredient clutter.',
  },
  INSECT: {
    core: 'An arthropod-first organism whose exoskeleton, segmentation, antennae, specialized limbs and wing cases follow one selected insect or arachnid construction.',
    rule: 'Segment count, limb logic and exoskeleton must control the body before fashion. Never make a human with antennae, generic bug wings or random extra legs. Do not mix mantis, beetle, moth, wasp, spider and larval signatures.',
  },
  AMPHIBIA: {
    core: 'An amphibian organism whose moist skin, external gills, compressed torso, jumping hind legs, long salamander body or transitional tail follows its selected life strategy.',
    rule: 'Amphibian identity must be anatomical, not green colour or water effects. Preserve the selected frog, toad, salamander, axolotl or tadpole grammar. Do not drift into fish, reptile, dragon or generic cute mascot anatomy.',
  },
  FAIRY: {
    core: 'A lightweight supernatural organism with a coherent magical body and non-feathered flight or energy structures integrated into its silhouette.',
    rule: 'Fairy must not collapse into a small human with decorative wings, an Angel, Plant or Insect. The selected Archetype controls wing material, scale and supernatural construction. Never use feathered wings or generic sparkle effects as the only identity.',
  },
  FUNGUS: {
    core: 'A fungal organism whose cap, stalk, mycelium, brackets, spores or mold colony construct one coherent body and growth pattern.',
    rule: 'Fungus anatomy must grow through one selected strategy; it is not mushroom accessories on a humanoid. Do not mix every cap type, become a Plant, or use random holes and spots to imply spores. Keep decay graphic and non-gory.',
  },
  MICROBE: {
    core: 'A stylized microscopic organism whose membrane, colony arrangement, capsid, nucleus, organelles, cilia or flagella define a readable enlarged cellular body.',
    rule: 'The selected microscopic structure must be biologically coherent enough to read and simplified enough to remain a character. Never create a human in a microbe costume, random floating blobs, medical gore or a generic Slime. Do not combine cellular, bacterial and viral grammars.',
  },
};

const UNIVERSAL_ARCHETYPE_RULE = 'Make this subtype readable through silhouette, body plan and one dominant identity mass. Preserve 2–4 subtype-specific landmarks; do not communicate it through colour, costume, props or labels alone, and do not borrow the primary signature of a sibling Archetype.';

export function applyTaxonomyV2<T extends VersionableFamily>(family: T): T {
  if (family.id === 'ALIEN') {
    return {
      ...family,
      coreAnatomy: ALIEN_FAMILY_V2.coreAnatomy,
      absoluteRule: ALIEN_FAMILY_V2.absoluteRule,
      archetypes: ALIEN_FAMILY_V2.archetypes.map((a) => ({ ...a })),
    } as T;
  }
  const contract = FAMILY_V2[family.id];
  if (!contract) return family;
  return {
    ...family,
    coreAnatomy: contract.core,
    absoluteRule: contract.rule,
    archetypes: family.archetypes.map((a) => ({
      ...a,
      structure: `${a.structure} ${UNIVERSAL_ARCHETYPE_RULE}`,
    })),
  } as T;
}
