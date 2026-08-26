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

import { del, get, keys, set } from 'idb-keyval';
import type { AssetType, MonRecord } from '../engine/types';
import { ASSET_TYPES, assetTypeDef } from '../engine/assets';
import { buildManifest, resolveAssetIdFromFileName } from './manifest';

/** Chiave di storage: un .mon può avere un solo file per slot. */
function storageKey(monName: string, assetId: string): string {
  return `asset:${monName}:${assetId}`;
}

async function uploadRemote(monName: string, assetId: string, blob: Blob): Promise<void> {
  const { savedToken } = await import('../brain/stream');
  const token = savedToken();
  if (!token) return;
  try {
    await fetch(`/api/assets?monName=${encodeURIComponent(monName)}&assetId=${encodeURIComponent(assetId)}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': blob.type || 'image/png' },
      body: blob,
    });
  } catch { /* IndexedDB resta la copia offline. */ }
}

/* ============================================================================
   LA TECA (§21.3)

   🔷 «E se mi affeziono a un .mon che poi non vedrò più? Posso salvarlo
   comunque prima di ricominciare, come ricordo.»

   Le immagini di un .mon conservato devono sopravvivere a tutto: al reset
   della partita, e anche allo svuotamento degli asset. Ma non serve un secondo
   magazzino con le sue funzioni — basta uno SPAZIO DI NOMI riservato dentro
   quello che c'è già.

   Conservare `VAZIEL.mon` copia le sue immagini sotto `kept/VAZIEL.mon`. Da
   quel momento sono file di un altro .mon per tutto il resto del codice, e la
   UI li mostra con gli stessi componenti senza sapere che sono un ricordo.

   🔒 L'unica regola in più sta in `clearAllAssets`, che salta questo prefisso.
   Se non lo facesse, il pulsante «cancella tutti gli asset» del pannello DEV
   butterebbe via anche i ricordi — ed è esattamente il pulsante che si preme
   quando si vuole fare pulizia PRIMA di ricominciare.
   ========================================================================= */

export const KEPT_PREFIX = 'kept/';

/** Il nome sotto cui vivono le immagini conservate di un .mon. */
export function keptAssetName(monName: string): string {
  return `${KEPT_PREFIX}${monName}`;
}

/**
 * Copia le immagini di un .mon nello spazio dei ricordi.
 * Restituisce il nome da usare per mostrarle. Idempotente: riconservare lo
 * stesso .mon riscrive le stesse chiavi.
 */
export async function keepAssetsOf(monName: string): Promise<string> {
  const target = keptAssetName(monName);
  const all = await keys();
  const prefix = `asset:${monName}:`;

  for (const k of all) {
    if (typeof k !== 'string' || !k.startsWith(prefix)) continue;
    const blob = await get<Blob>(k);
    if (!blob) continue;
    const assetId = k.slice(prefix.length);
    await set(`asset:${target}:${assetId}`, blob);
    // La teca deve sopravvivere anche al cambio dispositivo/reinstallazione:
    // la copia archiviata non puo' restare soltanto nell'IndexedDB locale.
    await uploadRemote(target, assetId, blob);
  }

  await preloadMonAssets(target);
  return target;
}

/** Riporta le immagini di un ricordo nello spazio del MON tornato attivo. */
export async function restoreKeptAssets(keptName: string, monName: string): Promise<void> {
  const all = await keys();
  const prefix = `asset:${keptName}:`;

  for (const k of all) {
    if (typeof k !== 'string' || !k.startsWith(prefix)) continue;
    const blob = await get<Blob>(k);
    if (!blob) continue;
    const assetId = k.slice(prefix.length);
    await set(storageKey(monName, assetId), blob);
    await uploadRemote(monName, assetId, blob);
  }

  await preloadMonAssets(monName);
}

/** Toglie dalla teca le immagini di un .mon conservato. */
export async function dropKeptAssets(keptName: string): Promise<void> {
  const all = await keys();
  const prefix = `asset:${keptName}:`;

  for (const k of all) {
    if (typeof k !== 'string' || !k.startsWith(prefix)) continue;
    const url = urlCache.get(k);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(k);
    await del(k);
  }

  notify();
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

/* ============================================================================
   L'IMMAGINE DA ALLEGARE

   ⚠️ IL PROMPT LO PROMETTEVA E NESSUNO LO MANTENEVA.

   Dal Profile Portrait in poi, ogni prompt contiene: «allega il CHARACTER
   MASTER e trattalo come l'unica fonte di verità visiva; dove testo e immagine
   non concordano, vince l'immagine». La condizione era pure giusta — la riga
   compare solo quando il master risulta risolto.

   🔴 Ma la richiesta partiva su `/v1/images/generations`, che accetta SOLO
   TESTO. Nessuna immagine è mai stata allegata. Il modello leggeva
   un'istruzione a consultare un riferimento che non riceveva, e insieme una
   riga che declassava il testo — cioè il peggio dei due mondi: nessuna
   immagine, e le parole dichiarate non autorevoli.

   È il motivo per cui le sei immagini non si somigliavano, e non era il
   modello a sbagliare.
   ========================================================================= */

/** Il PNG di un asset in base64, senza prefisso, o `null` se non c'è. */
export async function assetBase64(monName: string, type: AssetType): Promise<string | null> {
  const blob = await get<Blob>(storageKey(monName, assetTypeDef(type).assetId));
  if (!blob) return null;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  /* A pezzi: `String.fromCharCode(...bytes)` su un PNG da qualche centinaio di
     kB sfonda lo stack degli argomenti, e lo fa solo sulle immagini grandi —
     cioè si scoprirebbe in produzione e non in prova. */
  let bin = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    bin += String.fromCharCode(...bytes.subarray(i, i + passo));
  }
  return btoa(bin);
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
  void uploadRemote(record.data.name, assetId, file);

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

/* ============================================================================
   🔴 LA SECONDA META' DELLO STESSO GUASTO

   Qui mancava `idle_01`, come mancava nella tabella dei nomi file. L'effetto è
   piu' subdolo del primo: l'import RIUSCIVA — il file finiva in magazzino e
   l'immagine compariva — ma tornava `type: null`, e la schermata segna lo slot
   come pieno solo se le arriva un tipo. Quindi l'idle si vedeva e insieme
   risultava WAITING, e il contatore «x/6 slot risolti» non si muoveva.

   🔒 ADESSO LA TABELLA SI COSTRUISCE DA `ASSET_TYPES`, che è dove i sei slot
   sono gia' dichiarati con il loro `assetId`. Una tabella scritta a mano
   accanto a un catalogo e' una lista che qualcuno deve ricordarsi di
   aggiornare — e nessuno se l'e' ricordata per due versioni.

   🔷 v1.15 §23.5 — `sigil_01` non c'e' piu': il sigillo e' un disegno del
   sito, non un file da importare. Un pacchetto vecchio che lo contiene non e'
   nel catalogo, quindi torna `null`, cioe' «non so cosa farmene» — che e' la
   verita'.
   ========================================================================= */
function assetTypeFromId(assetId: string): AssetType | null {
  return ASSET_TYPES.find((a) => a.assetId === assetId)?.type ?? null;
}

/* --- Rimozione ------------------------------------------------------------- */

export async function removeAsset(monName: string, type: AssetType): Promise<void> {
  const key = storageKey(monName, assetTypeDef(type).assetId);
  const url = urlCache.get(key);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(key);
  await del(key);
  const { savedToken } = await import('../brain/stream');
  const token = savedToken();
  if (token) void fetch(`/api/assets?monName=${encodeURIComponent(monName)}&assetId=${encodeURIComponent(assetTypeDef(type).assetId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
  notify();
}

/** Porta le immagini locali sul server e ripristina quelle mancanti sul dispositivo. */
export async function syncAssetsWithServer(token: string): Promise<void> {
  const all = await keys();
  for (const key of all) {
    if (typeof key !== 'string' || !key.startsWith('asset:')) continue;
    const match = key.match(/^asset:(.+):([^:]+)$/);
    if (!match) continue;
    const blob = await get<Blob>(key);
    if (blob) await uploadRemote(match[1], match[2], blob);
  }

  try {
    const listResponse = await fetch('/api/assets', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!listResponse.ok) return;
    const { assets } = await listResponse.json() as { assets: { monName: string; assetId: string }[] };
    for (const remote of assets) {
      const key = storageKey(remote.monName, remote.assetId);
      if (await get(key)) continue;
      const response = await fetch(`/api/assets?monName=${encodeURIComponent(remote.monName)}&assetId=${encodeURIComponent(remote.assetId)}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) continue;
      await set(key, await response.blob());
    }
    for (const remote of assets) await preloadMonAssets(remote.monName);
  } catch { /* Il ripristino riproverà al prossimo avvio. */ }
}

/**
 * Cancella gli asset importati. Usata dal reset del pannello DEV.
 *
 * 🔒 Salta i ricordi (`kept/`). È il pulsante che si preme per fare pulizia
 * prima di ricominciare, e un ricordo che sparisce proprio lì non sarebbe un
 * ricordo.
 */
export async function clearAllAssets(): Promise<void> {
  const all = await keys();

  for (const k of all) {
    if (typeof k !== 'string') continue;
    if (k.startsWith(`asset:${KEPT_PREFIX}`)) continue;

    const url = urlCache.get(k);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(k);
    await del(k);
  }

  notify();
}
