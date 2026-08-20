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

/* ============================================================================
   🔴 IL SUFFISSO MANCANTE CHE MANGIAVA TUTTI GLI IMPORT

   🔷 «Ne carico uno e me lo mette automaticamente in idle, e poi basta, non ne
   posso caricare altri.»

   `idle_01` NON era in questa tabella. Nessun errore, nessun crollo: il `??`
   in fondo faceva da rete e il nome atteso diventava `nome_idle_01.png`
   invece di `nome_idle.png`. Una lettera fuori posto in un nome di file —
   sembra niente.

   Ma il riconoscimento in fondo a questo file ricava il suffisso tagliando
   TUTTO fino all'ultimo trattino basso. Su `nome_idle_01.png` l'ultimo
   trattino è quello prima di `01`, quindi il suffisso di IDLE diventava la
   stringa `01`. E a quel punto ogni file il cui nome contiene «01» — una data,
   un orario, `ChatGPT Image ... 01_10.png`, il numero di versione — finiva in
   IDLE. Il primo ci finiva, il secondo ci ricadeva sopra, e sembrava che
   l'import si fosse rotto: in realtà scriveva sei volte nella stessa casella.

   🔒 La tabella adesso è completa E il riconoscimento non si fida più di
   ricavare il suffisso a mano (vedi `suffixOf`). Due difese, perché la prima
   è già saltata una volta senza fare rumore.

   🔶 `rotation_01` è uscito: quell'asset non esiste più da v1.11. Una riga per
   uno slot che nessuno genera è un suffisso in più che può agganciare per
   sbaglio, cioè esattamente il guasto qui sopra.
   ========================================================================= */

/** Nome file atteso per un asset. L'import lo usa per il match automatico. */
export function expectedFileName(record: MonRecord, assetId: string): string {
  return `${SLUG(record.data.name)}_${SUFFIXES[assetId] ?? assetId}.png`;
}

const SUFFIXES: Record<string, string> = {
  master_01: 'master',
  portrait_01: 'portrait',
  doodle_01: 'doodle',
  reactions_01: 'reactions',
  idle_01: 'idle',
  hero_01: 'hero',
};

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

    if (def.type === 'profile_portrait') {
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
    const suffix = suffixOf(a.file, `${SLUG(manifest.mon)}_`);
    /* 🔒 UN SUFFISSO CORTO O NUMERICO NON AGGANCIA MAI.

       È la seconda difesa contro il guasto descritto in testa al file: se
       domani una voce del manifest tornasse a chiamarsi `..._01.png`, questa
       riga la lascia semplicemente non riconosciuta — che manda alla
       mappatura manuale, cioè al posto giusto — invece di farla diventare la
       calamita di ogni file con un numero nel nome. */
    if (suffix.length < 3 || /^\d+$/.test(suffix)) return false;
    return lower.includes(suffix);
  });
  if (bySuffix) return bySuffix.asset_id;

  return null;
}

/**
 * Il suffisso di un nome atteso: `vaziel_master.png` → `master`.
 *
 * ⚠️ Toglie il PREFISSO NOTO, non «tutto fino all'ultimo trattino». Il taglio
 * a partire dal fondo sembra equivalente e non lo è: basta un suffisso che
 * contenga un trattino perché legga solo l'ultimo pezzo, ed è così che
 * `idle_01` diventava `01`.
 */
function suffixOf(file: string, prefix: string): string {
  const base = file.toLowerCase().replace(/\.png$/, '');
  return base.startsWith(prefix) ? base.slice(prefix.length) : base;
}
