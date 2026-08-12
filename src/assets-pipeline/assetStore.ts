/* ============================================================================
   ASSET STORE (§22.3)

   🔒 §22.3 — comportamento di import:
   • I file restituiti si risolvono contro gli `asset_id` di ASSET_MANIFEST.json.
   • Dopo l'import il prototipo sostituisce i segnaposto WAITING FOR IMAGE
     SENZA richiedere modifiche ai Character Data.
   • Se solo alcuni asset sono disponibili, il prototipo resta usabile e
     mostra chiaramente gli slot non risolti.

   Le immagini stanno in IndexedDB, non in localStorage: un PNG da 8192×1024
   supererebbe la quota di localStorage al primo import.

   §25 — questo modulo sta al posto della futura ingestione automatica degli
   asset. La firma resta la stessa quando arriverà uno storage vero.
   ========================================================================= */

import { clear, del, get, keys, set } from 'idb-keyval';
import type { AssetType, MonRecord } from '../engine/types';
import { assetTypeDef } from '../engine/assets';
import { buildManifest, resolveAssetIdFromFileName } from './manifest';

/** Chiave di storage: un .mon può avere un solo file per slot. */
function storageKey(monName: string, assetId: string): string {
  return `asset:${monName}:${assetId}`;
}

/* --- Cache degli object URL ------------------------------------------------
   Creare un object URL a ogni render perderebbe memoria e farebbe sfarfallare
   le immagini. La cache vive quanto la sessione.
   -------------------------------------------------------------------------- */

const urlCache = new Map<string, string>();

/** Notifica ai componenti che un asset è cambiato. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToAssets(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((l) => l());
}

/* --- Lettura --------------------------------------------------------------- */

/** URL dell'asset già caricato in cache, o `null` se non risolto. */
export function getAssetUrlSync(monName: string, type: AssetType): string | null {
  return urlCache.get(storageKey(monName, assetTypeDef(type).assetId)) ?? null;
}

/** Carica dal database e popola la cache. Idempotente. */
export async function loadAsset(monName: string, type: AssetType): Promise<string | null> {
  const key = storageKey(monName, assetTypeDef(type).assetId);
  const cached = urlCache.get(key);
  if (cached) return cached;

  const blob = await get<Blob>(key);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/** Carica tutti gli asset di un .mon in cache. Chiamata all'avvio. */
export async function preloadMonAssets(monName: string): Promise<void> {
  const all = await keys();
  const prefix = `asset:${monName}:`;

  await Promise.all(
    all
      .filter((k): k is string => typeof k === 'string' && k.startsWith(prefix))
      .map(async (k) => {
        if (urlCache.has(k)) return;
        const blob = await get<Blob>(k);
        if (blob) urlCache.set(k, URL.createObjectURL(blob));
      }),
  );

  notify();
}

/* --- Import ---------------------------------------------------------------- */

export interface ImportResult {
  file: string;
  assetId: string | null;
  type: AssetType | null;
  status: 'resolved' | 'unmatched' | 'rejected';
  message: string;
}

/**
 * Importa un file contro il manifest del .mon indicato.
 * Non tocca MAI i Character Data: restituisce quale slot è stato risolto e
 * lascia allo store il compito di aggiornare solo `assetStatus` (§22.3).
 */
export async function importAssetFile(
  record: MonRecord,
  file: File,
  forcedAssetId?: string,
): Promise<ImportResult> {
  if (!file.type.startsWith('image/')) {
    return {
      file: file.name,
      assetId: null,
      type: null,
      status: 'rejected',
      message: 'Non è un file immagine.',
    };
  }

  const manifest = buildManifest(record);
  const assetId = forcedAssetId ?? resolveAssetIdFromFileName(manifest, file.name);

  if (!assetId) {
    return {
      file: file.name,
      assetId: null,
      type: null,
      status: 'unmatched',
      message: 'Nome non riconosciuto. Assegna lo slot a mano.',
    };
  }

  const entry = manifest.assets.find((a) => a.asset_id === assetId);
  if (!entry) {
    return {
      file: file.name,
      assetId,
      type: null,
      status: 'unmatched',
      message: `asset_id "${assetId}" non presente nel manifest di questo .mon.`,
    };
  }

  const type = assetTypeFromId(assetId);
  const key = storageKey(record.data.name, assetId);

  await set(key, file);

  // Sostituisce l'eventuale URL precedente, così la UI aggiorna subito.
  const old = urlCache.get(key);
  if (old) URL.revokeObjectURL(old);
  urlCache.set(key, URL.createObjectURL(file));
  notify();

  return {
    file: file.name,
    assetId,
    type,
    status: 'resolved',
    message: `Slot ${assetId} risolto.`,
  };
}

function assetTypeFromId(assetId: string): AssetType | null {
  const map: Record<string, AssetType> = {
    master_01: 'character_master',
    rotation_01: 'rotation_sprite',
    portrait_01: 'profile_portrait',
    doodle_01: 'bio_doodle',
    reactions_01: 'reaction_pack',
    hero_01: 'encounter_hero',
    sigil_01: 'sigil',
  };
  return map[assetId] ?? null;
}

/* --- Rimozione ------------------------------------------------------------- */

export async function removeAsset(monName: string, type: AssetType): Promise<void> {
  const key = storageKey(monName, assetTypeDef(type).assetId);
  const url = urlCache.get(key);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(key);
  await del(key);
  notify();
}

/** Cancella ogni asset importato. Usata dal reset del pannello DEV. */
export async function clearAllAssets(): Promise<void> {
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
  await clear();
  notify();
}
