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
const VERSION_KEY = 'vinzmon.taxonomyDescriptions.alien';

export function alienDescriptionVersion(): TaxonomyDescriptionVersion {
  if (typeof localStorage === 'undefined') return 'v1';
  return localStorage.getItem(VERSION_KEY) === 'v2' ? 'v2' : 'v1';
}

export function setAlienDescriptionVersion(version: TaxonomyDescriptionVersion): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(VERSION_KEY, version);
}

/** Risolto una volta all'avvio. Il LAB ricarica la pagina dopo il cambio. */
export const ACTIVE_ALIEN_FAMILY = alienDescriptionVersion() === 'v2'
  ? ALIEN_FAMILY_V2
  : ALIEN_FAMILY_V1;
