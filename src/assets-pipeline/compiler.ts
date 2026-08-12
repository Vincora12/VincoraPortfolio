/* ============================================================================
   PROMPT COMPILER (§30, §46, §47, §48)

   §30 — «The website must not ask an image model to invent a VINZ.MON from a
   short label. It must compile one deterministic image-generation prompt from
   modular fragments.»

   §48 — «prompt generation is a pure function of Character Data + asset type +
   compiler version.» Questo modulo è quella funzione pura: stessi dati in
   ingresso, stesso prompt in uscita, sempre.

   §48 — ogni compilazione registra anche gli id dei frammenti usati, in
   ordine: è il contenuto di `fragment_ids.json`.
   ========================================================================= */

import { GENERATION_CONFIG_VERSION } from '../engine/generation-config';
import {
  ASSET_FRAGMENTS,
  COMPILER_VERSION,
  DOODLE_FRAGMENT,
  FRAGMENT_LIBRARY,
  getFragment,
  slug,
  type PromptFragment,
} from './fragments';
import type { AssetType, CharacterData, MonRecord } from '../engine/types';
import { displayName } from '../engine/types';

export { COMPILER_VERSION };

/* --- Risultato ------------------------------------------------------------- */

export interface CompiledPrompt {
  /** Il testo finale, pronto da incollare nel generatore di immagini. */
  text: string;
  /** §48 — gli id atomici usati, nell'ordine di assemblaggio. */
  fragmentIds: string[];
  compilerVersion: string;
  generationConfigVersion: string;
  assetType: AssetType;
  /** §48 — provenienza espandibile per la schermata DEV. */
  provenance: { id: string; axis: string; priority: number; excerpt: string }[];
  /** Conflitti risolti dal resolver, mostrati in DEV. */
  resolved: string[];
}

/* ============================================================================
   §30.2 — RESOLVER DI PRIORITÀ E CONFLITTI

   «If a lower-priority fragment weakens the read of a higher-priority axis,
    rewrite or remove the lower-priority instruction.»

   L'esempio del documento è FAMILY=INSECT + FASHION=FORMAL: non un umano in
   completo con le antenne, ma piastre simmetriche pulite e ottica precisa
   sull'anatomia dell'insetto. Il resolver non cancella la Fashion: la riscrive
   perché passi attraverso l'anatomia.
   ========================================================================= */

/** Famiglie la cui anatomia non regge un capo di abbigliamento convenzionale. */
const NON_GARMENT_FAMILIES = [
  'MICROBE', 'SLIME', 'FUNGUS', 'MINERAL', 'PSYCHIC', 'PLANT', 'FOOD', 'INSECT',
];

/** Fashion che presuppongono un corpo vestibile in modo convenzionale. */
const GARMENT_HEAVY_FASHION = ['FORMAL', 'TAILORED AVANT', 'PREPPY', 'ROMANTIC', 'MOTO'];

function resolveConflicts(
  fragments: PromptFragment[],
  data: CharacterData,
): { fragments: PromptFragment[]; resolved: string[] } {
  const resolved: string[] = [];

  const out = fragments.map((f) => {
    if (
      f.axis === 'fashion' &&
      NON_GARMENT_FAMILIES.includes(data.family) &&
      GARMENT_HEAVY_FASHION.includes(data.fashion)
    ) {
      resolved.push(
        `FASHION=${data.fashion} su FAMILY=${data.family}: riscritta come logica di superficie e di ottica, per non creare un umano vestito con tratti da ${data.family}.`,
      );
      return {
        ...f,
        positive_prompt: [
          f.positive_prompt,
          '',
          'CONFLICT RESOLUTION — FAMILY WINS:',
          `${data.family} anatomy does not support conventional garments.`,
          `Translate ${data.fashion} into surface logic instead of clothing:`,
          'clean symmetrical plates, polished accessory hardware, precise optical hardware,',
          'disciplined silhouette and material finish — while fully preserving the Family anatomy.',
          'Do NOT create a human wearing an outfit with creature features.',
        ].join('\n'),
      };
    }

    // §21 — una taglia GIANT non deve far tagliare il corpo: la regola di
    // inquadratura è più forte della grammatica di taglia.
    if (f.axis === 'size' && data.size === 'GIANT') {
      return {
        ...f,
        positive_prompt: `${f.positive_prompt}\nEven at GIANT grammar, the entire creature must remain inside the frame: reduce presentation scale rather than cropping.`,
      };
    }

    return f;
  });

  return { fragments: out, resolved };
}

/* ============================================================================
   Selezione dei frammenti per un dato Character Data
   ========================================================================= */

function selectFragmentIds(data: CharacterData, assetType: AssetType): string[] {
  const ids: string[] = ['global.identity'];

  ids.push(`family.${slug(data.family)}`);
  ids.push(`archetype.${slug(data.family)}.${slug(data.family_archetype)}`);
  ids.push(`affinity.${slug(data.affinity)}`);
  ids.push(`size.${slug(data.size)}`);
  ids.push(`role.${slug(data.role)}`);
  ids.push(`fashion.${slug(data.fashion)}`);

  // §9 — i marcatori entrano solo quando l'anatomia li consente.
  if (data.eyewear) ids.push('marker.eyewear');
  if (data.hair_state) ids.push(`marker.${slug(data.hair_state)}`);
  else ids.push('marker.no_human_hair');

  ids.push(`mood.${slug(data.mood_primary)}`);
  ids.push('character_dna.compile');
  if (data.heritage_traits.length > 0) ids.push('heritage.compile');

  // §42 — la BIO DOODLE non usa l'Appearance canonico: usa il doodle.
  ids.push(
    assetType === 'bio_doodle' ? DOODLE_FRAGMENT.id : `appearance.${slug(data.appearance)}`,
  );

  ids.push(`rarity.${slug(data.rarity)}`);
  ids.push(ASSET_FRAGMENTS[assetType]!.id);
  ids.push('global.full_body', 'global.novelty');

  return ids;
}

/* ============================================================================
   §46 — MASTER COMPILER TEMPLATE
   ========================================================================= */

export function compilePrompt(record: MonRecord, assetType: AssetType): CompiledPrompt {
  const data = record.data;
  const ids = selectFragmentIds(data, assetType);

  const raw = ids.map(getFragment);
  const { fragments, resolved } = resolveConflicts(raw, data);

  // §30.2 — ordinamento per priorità, stabile: a parità di priorità resta
  // l'ordine di §46, che è l'ordine in cui il documento li elenca.
  const ordered = fragments
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.priority - b.f.priority || a.i - b.i)
    .map((x) => x.f);

  const blocks: string[] = [];

  blocks.push(`NAME: ${data.name}`);
  blocks.push(`RARITY: ${data.rarity}`);
  blocks.push('');

  for (const f of ordered) {
    let text = f.positive_prompt;

    // I due moduli con segnaposto ricevono qui i dati veri.
    if (f.id === 'character_dna.compile') {
      text = text.replace('{{CHARACTER_DNA}}', renderCharacterDna(data));
    }
    if (f.id === 'heritage.compile') {
      text = text.replace('{{HERITAGE}}', renderHeritage(data));
    }

    blocks.push(text);

    // I marcatori portano con sé la soluzione esatta generata (§40).
    if (f.id === 'marker.eyewear' && data.eyewear) {
      blocks.push(
        `EYEWEAR CATEGORY: ${data.eyewear.category}\nEYEWEAR SOLUTION: ${data.eyewear.description}`,
      );
    }
    if (f.id.startsWith('marker.') && data.haircut) {
      blocks.push(`HAIRCUT / EQUIVALENT: ${data.haircut}`);
    }
    if (f.id.startsWith('mood.') && data.mood_secondary) {
      blocks.push(`SECONDARY MOOD NUANCE: ${data.mood_secondary}`);
    }

    if (f.negative_prompt) blocks.push(f.negative_prompt);
    blocks.push('');
  }

  blocks.push('FINAL RESOLVER:');
  blocks.push('Remove contradictions according to canonical priority.');
  blocks.push('Do not add unrequested taxonomy, costume, anatomy or props.');
  blocks.push('Return only the requested visual asset.');
  blocks.push('CREATURE FIRST. STYLING SECOND.');

  return {
    text: blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n',
    fragmentIds: ordered.map((f) => f.id),
    compilerVersion: COMPILER_VERSION,
    generationConfigVersion: data.generation_config_version ?? GENERATION_CONFIG_VERSION,
    assetType,
    provenance: ordered.map((f) => ({
      id: f.id,
      axis: f.axis,
      priority: f.priority,
      excerpt: f.positive_prompt.split('\n')[0]!.slice(0, 90),
    })),
    resolved,
  };
}

/* --- Rendering dei blocchi con dati reali ---------------------------------- */

function renderCharacterDna(data: CharacterData): string {
  const d = data.character_dna;
  const lines = [
    `silhouette quirk: ${d.silhouette_quirk}`,
    `anatomical gimmick: ${d.anatomical_gimmick}`,
    `face / eye logic: ${d.face_logic}`,
    `body-language default: ${d.body_language}`,
    `recurring motif: ${d.recurring_motif}`,
    `palette DNA: ${data.palette_dna.swatches
      .map((hex, i) => `${hex} (${data.palette_dna.swatch_names[i]})`)
      .join(' · ')}`,
    `behavioral contradictions: ${d.contradictions
      .map((c) => `${c.a} together with ${c.b}`)
      .join('; ')}`,
  ];
  if (data.eyewear) lines.push(`exact eyewear solution: ${data.eyewear.description}`);
  if (data.haircut && data.hair_state) {
    lines.push(`exact haircut / bleach solution: ${data.haircut}, ${data.hair_state}`);
  }
  return lines.join('\n');
}

function renderHeritage(data: CharacterData): string {
  if (data.heritage_traits.length === 0) return 'none — this is an origin node.';
  return data.heritage_traits
    .map(
      (h) =>
        `• [${h.category}] from ${displayName(h.from_mon)}\n  was: ${h.origin}\n  now: ${h.transformed}`,
    )
    .join('\n');
}

/* --- Verifica di integrità della libreria (§48) ----------------------------- */

/** Ogni id emesso deve esistere nel registro: lo controlliamo, non lo speriamo. */
export function validateFragmentIds(ids: readonly string[]): string[] {
  return ids.filter((id) => !FRAGMENT_LIBRARY.has(id));
}
