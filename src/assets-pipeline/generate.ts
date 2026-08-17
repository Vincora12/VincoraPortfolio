/* ============================================================================
   GENERARE LE IMMAGINI DI UN .MON (§22.4)

   🔷 «Ma aspetta, quando generi un personaggio automaticamente generi tutte le
   immagini no?»

   No — e aveva ragione lui che dovrebbe. La pipeline sapeva fare due cose:
   comporre il prompt di ogni asset, e IMPORTARE le immagini generate altrove.
   In mezzo mancava il pezzo che le chiede davvero: `askImage` esisteva e non
   la chiamava nessuno. Lavoro fatto a metà che da fuori sembrava finito.

   ════════════════════════════════════════════════════════════════════════════
   🔒 QUATTRO REGOLE, E TUTTE NASCONO DALLA STESSA COSA: UNA NASCITA NON PUÒ
   DIPENDERE DA UNA RETE.

   1. NON BLOCCA NIENTE. La creatura nasce subito. Le facce arrivano dopo, una
      alla volta, e nel frattempo c'è il sigillo. Aspettare sei immagini davanti
      a una schermata vuota trasformerebbe il momento della nascita in una
      barra di caricamento.

   2. IL RITRATTO PER PRIMO. È l'unico che si vede subito — home, social,
      scaffale. Generarlo per ultimo vorrebbe dire aspettare tutti gli altri
      per vedere la cosa che guardi.

   3. QUELLO CHE C'È NON SI RIGENERA MAI. Stessa regola dei ricordi e dei post:
      una faccia che cambia a ogni apertura non è una faccia.

   4. FALLIRE È PREVISTO E SILENZIOSO. Senza chiave, offline, o col tetto di
      spesa raggiunto non succede niente e non si urla: il sigillo copre, e
      l'app resta intera. §26 — «missing assets never block the product flow».
   ════════════════════════════════════════════════════════════════════════════

   💶 Sei immagini per creatura, circa 21 centesimi. È la voce di spesa più
   grossa del progetto — una creatura di immagini costa quanto una settimana di
   conversazioni — ma succede una volta ogni ventotto giorni.
   ========================================================================= */

import { askImage } from '../ai/backend';
import type { BackendFailure } from '../ai/backend';
import { ASSET_TYPES } from '../engine/assets';
import type { AssetType, MonRecord } from '../engine/types';
import { compilePrompt } from './compiler';
import { getAssetUrlSync, importAssetFile } from './assetStore';
import { assetTypeDef } from '../engine/assets';

/**
 * L'ordine in cui si chiedono.
 *
 * 🔒 Il ritratto per primo, poi il master. Il resto nell'ordine del catalogo.
 * Non è un dettaglio di comodità: decide quanti secondi passano fra la nascita
 * e la prima faccia che vedi.
 */
export function generationOrder(): AssetType[] {
  const first: AssetType[] = ['profile_portrait', 'character_master'];
  const rest = ASSET_TYPES.map((a) => a.type).filter((t) => !first.includes(t));
  return [...first, ...rest];
}

export interface GenerationProgress {
  type: AssetType;
  done: number;
  total: number;
  failure: BackendFailure | null;
}

/**
 * Chiede le immagini che mancano, una alla volta.
 *
 * ⚠️ In SERIE, non in parallelo. Sei richieste insieme arriverebbero tutte
 * insieme anche al controllo del tetto di spesa, che le vedrebbe come sei
 * chiamate da zero: il tetto verrebbe superato di sei immagini invece che di
 * una. In serie, la prima che sbatte contro il tetto ferma le altre.
 */
export async function generateMissingAssets(
  token: string | null,
  record: MonRecord,
  onProgress?: (p: GenerationProgress) => void,
): Promise<{ made: AssetType[]; failure: BackendFailure | null }> {
  const name = record.data.name;
  const wanted = generationOrder().filter((t) => getAssetUrlSync(name, t) === null);
  const made: AssetType[] = [];

  for (const type of wanted) {
    const { text } = compilePrompt(record, type);
    const res = await askImage(token, text);

    if (!res.data) {
      /* 🔒 Ci si ferma al primo no. Senza chiave falliranno tutte allo stesso
         modo, e col tetto raggiunto insistere significherebbe solo sei
         rifiuti invece di uno. */
      onProgress?.({ type, done: made.length, total: wanted.length, failure: res.failure });
      return { made, failure: res.failure };
    }

    const file = pngFileFor(type, res.data.image);
    await importAssetFile(record, file, assetTypeDef(type).assetId);

    made.push(type);
    onProgress?.({ type, done: made.length, total: wanted.length, failure: null });
  }

  return { made, failure: null };
}

/**
 * Il PNG che arriva in base64, impacchettato come se l'avessi importato a mano.
 *
 * 🔒 Passa dalla STESSA porta dell'import (`importAssetFile`) invece di
 * scrivere diretto nel magazzino. Due strade per far entrare un'immagine
 * vorrebbero dire due posti dove sbagliare il nome dello slot, e la seconda
 * strada non sarebbe coperta da nessuno dei controlli che già esistono.
 */
function pngFileFor(type: AssetType, base64: string): File {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const def = assetTypeDef(type);
  return new File([bytes], `${def.assetId}.png`, { type: 'image/png' });
}
