/* ============================================================================
   TIPI DI ASSET CANONICI (§23)
   🔒 LOCKED — "The asset system distinguishes canonical character art,
   UI-derived crops and prototype-specific implementation assets."

   Qui vivono solo le DEFINIZIONI degli slot. La compilazione dei prompt sta
   in assets-pipeline/promptCompiler.ts, il manifest in
   assets-pipeline/manifest.ts, i file importati in assets-pipeline/assetStore.ts.
   ========================================================================= */

import type { AssetStatusMap, AssetType } from './types';

export interface AssetTypeDef {
  type: AssetType;
  /** `asset_id` usato nel manifest (§24.4) e nel nome del file di prompt. */
  assetId: string;
  /** Indice del file di prompt nel pacchetto (§22.2). */
  promptFile: string;
  label: string;
  /** A cosa serve, in italiano, per la UI del prototipo. */
  purpose: string;
  /** Dove viene usato nel prodotto: alimenta `usage` nel manifest. */
  usage: string[];
}

/**
 * I sette tipi canonici di §23, nell'ordine dei file di §22.2.
 * UI NODE PORTRAIT non è uno slot separato: §23 dice esplicitamente di
 * derivarlo dal Profile Portrait e di non creare asset ridondanti.
 */
export const ASSET_TYPES: readonly AssetTypeDef[] = [
  {
    type: 'character_master',
    assetId: 'master_01',
    promptFile: '01_CHARACTER_MASTER_PROMPT.txt',
    label: 'CHARACTER MASTER',
    purpose: 'Fonte di verità visiva. Riferimento di consistenza per ogni altro asset.',
    usage: ['companion-home', 'consistency-reference'],
  },
  {
    type: 'rotation_sprite',
    assetId: 'rotation_01',
    promptFile: '02_ROTATION_SPRITE_PROMPT.txt',
    label: 'ROTATION SPRITE SHEET',
    purpose: 'Rotazione pseudo-3D a trascinamento orizzontale nel Specimen Profile.',
    usage: ['specimen-profile', 'character-inspection'],
  },
  {
    type: 'profile_portrait',
    assetId: 'portrait_01',
    promptFile: '03_PROFILE_PORTRAIT_PROMPT.txt',
    label: 'PROFILE PORTRAIT',
    purpose: 'Ritratto generato apposta per profilo, memorie, notifiche e nodi. Mai un ritaglio.',
    usage: ['specimen-profile', 'memories', 'mindline-node', 'notifications'],
  },
  {
    type: 'bio_doodle',
    assetId: 'doodle_01',
    promptFile: '04_BIO_DOODLE_PROMPT.txt',
    label: 'BIO DOODLE',
    purpose: 'Interpretazione da quaderno, usata SOLO in BIO / PERSONAL FILE. Non è un Appearance.',
    usage: ['bio-personal-file'],
  },
  {
    type: 'reaction_pack',
    assetId: 'reactions_01',
    promptFile: '05_REACTION_PACK_PROMPT.txt',
    label: 'REACTION PACK',
    purpose: 'Espressioni e pose trasparenti derivate da Voice DNA e Character DNA.',
    usage: ['companion-home', 'chat', 'memories'],
  },
  {
    type: 'encounter_hero',
    assetId: 'hero_01',
    promptFile: '06_ENCOUNTER_HERO_PROMPT.txt',
    label: 'ENCOUNTER HERO',
    purpose: 'Asset di rivelazione per FIRST ENCOUNTER / NEW ENCOUNTER.',
    usage: ['first-encounter', 'new-encounter'],
  },
  {
    type: 'sigil',
    assetId: 'sigil_01',
    promptFile: '07_SIGIL_PROMPT.txt',
    label: 'SIGIL',
    purpose: 'Marchio monocromo derivato dal Character DNA, usabile dentro la UI.',
    usage: ['specimen-profile', 'mindline', 'history'],
  },
];

export function assetTypeDef(type: AssetType): AssetTypeDef {
  const d = ASSET_TYPES.find((a) => a.type === type);
  if (!d) throw new Error(`Tipo di asset sconosciuto: ${type}`);
  return d;
}

/**
 * Mappa stato iniziale: ogni slot parte da `waiting`.
 * §21.2 — "A generated .mon is immediately valid as structured data even when
 * all visual asset slots are still empty."
 */
export function emptyAssetStatus(): AssetStatusMap {
  return ASSET_TYPES.reduce((acc, a) => {
    acc[a.type] = 'waiting';
    return acc;
  }, {} as AssetStatusMap);
}

/** Etichetta del segnaposto mostrata nella UI (§21.2). */
export function placeholderLabel(type: AssetType): string {
  const index = ASSET_TYPES.findIndex((a) => a.type === type) + 1;
  return `ASSET_${String(index).padStart(2, '0')} // WAITING FOR IMAGE`;
}

/* --- ROTATION SPRITE — parametri 🔒 LOCKED (§24.1) -------------------------- */

export const ROTATION_SPEC = {
  frames: 8,
  columns: 8,
  rows: 1,
  /** Ordine orario per default, salvo diversa indicazione del manifest (§24.1). */
  sequenceDegrees: [0, 45, 90, 135, 180, 225, 270, 315],
  anchor: 'bottom-center',
  background: 'transparent',
  interaction: 'horizontal-drag',
} as const;
