/* ============================================================================
   ASSET MANIFEST (§22.1, §24.4)

   🔒 §24.4 fissa la forma esatta della voce dello sprite di rotazione. Le
   altre voci seguono la stessa grammatica, così l'import può risolvere ogni
   file contro il suo `asset_id` (§22.3).

   Il manifest è la parte MACCHINA del pacchetto: dice a Claude esattamente
   come va usato ogni file restituito.
   ========================================================================= */

import { ASSET_TYPES, IDLE_SPEC } from '../engine/assets';
import type { MonRecord } from '../engine/types';
import { displayName } from '../engine/types';

export interface ManifestEntry {
  asset_id: string;
  type: string;
  file: string;
  usage: string[];
  background: string;
  /* Campi presenti solo dove hanno senso (§24.4 li definisce per lo sprite). */
  frames?: number;
  columns?: number;
  rows?: number;
  sequence_degrees?: number[];
  anchor?: string;
  interaction?: string;
  aspect_ratio?: string;
}

export interface AssetManifest {
  /** Nome canonico del .mon a cui il pacchetto appartiene. */
  mon: string;
  /** Nodo Mindline di appartenenza: il pacchetto non è ambiguo. */
  mindline_node: string;
  appearance: string;
  generated_at_day: number;
  /** Versione del contratto di manifest, per gli import futuri. */
  manifest_version: string;
  assets: ManifestEntry[];
}

const SLUG = (name: string) => displayName(name).toLowerCase();

/** Nome file atteso per un asset. L'import lo usa per il match automatico. */
export function expectedFileName(record: MonRecord, assetId: string): string {
  const suffixes: Record<string, string> = {
    master_01: 'master',
    rotation_01: 'rotation',
    portrait_01: 'portrait',
    doodle_01: 'doodle',
    reactions_01: 'reactions',
    hero_01: 'hero',
    sigil_01: 'sigil',
  };
  return `${SLUG(record.data.name)}_${suffixes[assetId] ?? assetId}.png`;
}

export function buildManifest(record: MonRecord): AssetManifest {
  const assets: ManifestEntry[] = ASSET_TYPES.map((def) => {
    const base: ManifestEntry = {
      asset_id: def.assetId,
      type: manifestType(def.type),
      file: expectedFileName(record, def.assetId),
      usage: def.usage,
      background: def.type === 'bio_doodle' || def.type === 'encounter_hero' ? 'opaque' : 'transparent',
    };

    if (def.type === 'reaction_pack') {
      return { ...base, frames: 6, columns: 3, rows: 2, anchor: 'center', aspect_ratio: '3:2' };
    }

    /* 🔷 v1.11 §23.3 — l'IDLE non dichiarava frame né griglia: il manifest lo
       trattava come un'immagine singola. Chi lo genera non poteva sapere che è
       una striscia da quattro, e l'app che lo indicizza per posizione avrebbe
       letto un foglio sbagliato senza accorgersene. Era un buco rimasto
       scoperto da quando l'asset è stato aggiunto (v1.9). */
    if (def.type === 'idle_animation') {
      return {
        ...base,
        frames: IDLE_SPEC.frames,
        columns: IDLE_SPEC.columns,
        rows: IDLE_SPEC.rows,
        anchor: IDLE_SPEC.anchor,
        playback: IDLE_SPEC.playback,
      };
    }

    if (def.type === 'profile_portrait' || def.type === 'sigil') {
      return { ...base, aspect_ratio: '1:1' };
    }

    if (def.type === 'encounter_hero') {
      return { ...base, aspect_ratio: '9:16' };
    }

    return { ...base, aspect_ratio: '3:4' };
  });

  return {
    mon: record.data.name,
    mindline_node: record.data.mindline_node,
    appearance: record.data.appearance,
    generated_at_day: record.data.generated_at_day,
    manifest_version: '1.2',
    assets,
  };
}

/** Nome del tipo nel manifest: `sprite_rotation` è fissato da §24.4. */
function manifestType(type: string): string {
  return type;
}

/**
 * Risolve un file restituito contro le voci del manifest (§22.3).
 * Prima prova il nome atteso, poi cerca l'`asset_id` o il suffisso nel nome
 * del file: chi rinomina i file da ChatGPT non deve restare bloccato.
 * Restituisce `null` quando il match non è sicuro: in quel caso la UI chiede
 * una mappatura manuale dello slot.
 */
export function resolveAssetIdFromFileName(
  manifest: AssetManifest,
  fileName: string,
): string | null {
  const lower = fileName.toLowerCase();

  const exact = manifest.assets.find((a) => a.file.toLowerCase() === lower);
  if (exact) return exact.asset_id;

  const byId = manifest.assets.find((a) => lower.includes(a.asset_id.toLowerCase()));
  if (byId) return byId.asset_id;

  const bySuffix = manifest.assets.find((a) => {
    const suffix = a.file.replace(/^.*_/, '').replace(/\.png$/, '');
    return lower.includes(suffix);
  });
  if (bySuffix) return bySuffix.asset_id;

  return null;
}
