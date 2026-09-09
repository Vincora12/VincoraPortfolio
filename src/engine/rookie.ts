import type { CharacterData, MonRecord } from './types';
export const ROOKIE_GRAMMAR = `ROOKIE — BINDING STAGE CONSTRUCTION, BEFORE DESIGNER AND FASHION.
A young creature with a developed but very compact body, about 2.5–3 heads tall. Large head, short torso, short thick limbs; no elongated human teen, adult fashion model or mature heroic proportions.
Family anatomy is simple: at most two recognizable systems, miniature wings rather than full spreading layered wings. At most one small affinity zone, no floating particles or extra material systems.
One simple clothing mass maximum, no layered outfit. Eyewear, if present, is the ONLY accessory system. No chains, jewelry, belts, buckles, hanging charms, gloves or elaborate shoes. Hair uses at most three broad masses, never many spikes or strands.
Keep 85% of surfaces broad and clean. Two or three silhouette landmarks. Preserve VINZ.MON palette, facial temperament and rendering; simplify construction, not image quality.
BABY is a merged head-body creature; ROOKIE has a short distinct torso and limbs; BASIC may develop mature proportions and equipment. Do not use BASIC construction for ROOKIE.`;
export function rookieGrammar(record: MonRecord): string { return record.data.evolution_state?.label === 'ROOKIE' ? ROOKIE_GRAMMAR : ''; }
export function rookieData(data: CharacterData): CharacterData {
  if(data.evolution_state?.label !== 'ROOKIE') return data;
  return {...data,size:'TINY',character_dna:{...data.character_dna,
    silhouette_quirk:'Young compact creature, 2.5–3 heads tall, short torso and short limbs; two or three silhouette landmarks.',
    anatomical_gimmick:`Simplified ${data.family} anatomy: at most two small systems; no large layered wings or adult equipment.`,
    body_language:'Expressive whole-body gestures on short limbs; no mature fashion-model pose.',
  },haircut:data.haircut ? 'At most three broad hair masses, no layered spikes or fine strands.' : null};
}
