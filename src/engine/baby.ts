import type { MonRecord } from './types';
import { generateCharacterBio } from './characterBio';

/** A stage restriction on the existing generator, not a second generator.
 * Affinity/Role/Fashion remain latent data for future forms, never active BABY layers. */
export function asBaby(record: MonRecord, parents: MonRecord[] = []): MonRecord {
  const data = { ...record.data, lifeStage: 'BABY' as const,
    evolution_state: { label: 'BABY', stage: 0, previous_labels: [] as string[] },
    size: 'TINY' as const, humanoidity: 1,
    character_dna: { ...record.data.character_dna,
      silhouette_quirk: 'One compact head-body mass, wider than tall; no separate neck, torso or waist.',
      anatomical_gimmick: `Only one or two miniature anatomical signs of ${record.data.family}; no developed limbs or accessory systems.`,
      face_logic: 'Expressive eyes and a small mouth on the main body mass; preserve temperament through expression.',
      body_language: 'Small tilts, hops and shifts of the whole body; no human standing pose.',
    },
    eyewear: null, hair_state: null, haircut: null };
  const bio = generateCharacterBio(data);
  return { ...record, data, bio,
    transition: { kind: parents.length ? 'BREED' : 'BABY', parentNodeIds: parents.map(p => p.data.mindline_node) },
    writtenBio: undefined, narratorLine: undefined, culturalDiscovery: undefined,
  };
}

export function babyGrammar(record: MonRecord): string {
  if (record.data.lifeStage !== 'BABY') return '';
  return [
    'BABY STAGE — BINDING OVERRIDE OF MATURE DESIGN LAYERS',
    `A complete, expressive VINZ.MON of Family ${record.data.family}, in its simplest recognizable manifestation.`,
    'A palm-sized creature built around ONE merged head-body mass: round, seed-like, droplet or soft wedge. No separate torso, neck, waist, shoulders or long limbs. Face occupies the main mass.',
    'At most tiny nubs for feet or minimal family appendages. One or two iconic signs such as miniature ears, horns, fins, leaves or wing buds. No developed arms, hands, legs or layered feather wings.',
    'NO hairstyle, mane, fringe, sunglasses, eyewear, clothes or equipment. Never a miniature humanoid, standing mascot or chibi teen: those proportions belong to ROOKIE or later.',
    'One dominant material, broad clean surfaces; preserve VINZ.MON palette and rendering style. A complete expressive creature, not an egg or placeholder.',
    'Affinity is latent: NO active affinity contamination, powers or extra material systems. Role and fashion are latent: NO evolved equipment, outfits or unnecessary accessories.',
    'Reduce family anatomy to the minimum that makes the Family unmistakable. Cultural DNA informs attitude and shape, never adds objects.',
    'Resolver JSON: affinityZones=[], fashionMasses=[], familySystems at most 2, silhouetteLandmarks at most 2. Keep temperament and expressive range. BABY is a visual life stage, not an infant intelligence or baby talk.',
    ...record.data.heritage_traits.slice(0, 2).map(h => `Simplified family-compatible inherited feature from ${h.from_mon}: ${h.transformed}. Translate into the same dominant material, never a collage.`),
  ].join('\n');
}
