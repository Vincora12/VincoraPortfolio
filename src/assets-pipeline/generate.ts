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

   2. 🔶 IL MASTER PER PRIMO. Qui c'era scritto «il ritratto per primo, è
      l'unico che si vede subito». Era impazienza travestita da architettura:
      il master è la fonte di verità visiva, e ogni altro asset si genera
      allegando la SUA immagine. Generarne un altro prima vuol dire produrre
      la faccia canonica senza la faccia canonica. L'ordine adesso lo decidono
      le dipendenze dichiarate, non una lista di preferenze.

   3. QUELLO CHE C'È NON SI RIGENERA MAI. Stessa regola dei ricordi e dei post:
      una faccia che cambia a ogni apertura non è una faccia.

   4. FALLIRE È PREVISTO E SILENZIOSO. Senza chiave, offline, o col tetto di
      spesa raggiunto non succede niente e non si urla: il sigillo copre, e
      l'app resta intera. §26 — «missing assets never block the product flow».
   ════════════════════════════════════════════════════════════════════════════

   💶 QUATTRO immagini per creatura — master, toy, doodle, sticker. I tre
   asset storici stanno in `LEGACY_ASSET_TYPES` e non si generano più.
   Da quando `assets.ts` dichiara la qualità per asset costano ~12 centesimi:
   doodle e sticker in bozza perché si vedono piccoli, master e toy pieni.
   Resta la voce di spesa più grossa di una nascita.
   ========================================================================= */

import { askImage } from '../ai/backend';
import type { BackendFailure } from '../ai/backend';
import { generationOrder as ordineCanonico } from '../engine/assets';
import type { AssetType, MonRecord } from '../engine/types';
import { promptFor } from './promptFor';
import { assetBase64, getAssetUrlSync, importAssetFile } from './assetStore';
import { assetTypeDef } from '../engine/assets';

/**
 * L'ordine in cui si chiedono.
 *
 * 🔴 QUI C'ERA IL RITRATTO PER PRIMO, E ROMPEVA LA CONSISTENZA.
 *
 * La ragione scritta allora era «è l'unico che si vede subito: generarlo per
 * ultimo vuol dire aspettare tutti gli altri per vedere la cosa che guardi».
 * Vera come impazienza, sbagliata come architettura: ogni asset derivato porta
 * l'ordine «allega il CHARACTER MASTER e trattalo come l'unica verità visiva»,
 * e quella riga compare solo se il master ESISTE. Con il ritratto per primo la
 * prima immagine nasceva senza riferimento — e siccome era la prima che
 * vedevi, diventava lei la faccia; poi arrivava il master, che era un'altra
 * creatura.
 *
 * 🔒 Adesso l'ordine è UNO SOLO e viene dalle dipendenze dichiarate in
 * `assets.ts`. Non c'è più una seconda lista che può contraddire la prima.
 */
export function generationOrder(): AssetType[] {
  return ordineCanonico().map((a) => a.type);
}

export interface GenerateOptions {
  /** Solo questi tipi. Assente = tutti quelli che mancano. */
  only?: readonly AssetType[];
  /**
   * Rifà anche quello che c'è già.
   *
   * ⚠️ È l'eccezione dichiarata alla regola «quello che c'è non si rigenera
   * mai». Quella regola vieta le rigenerazioni AUTOMATICHE — una faccia che
   * cambia da sola a ogni apertura non è una faccia. Ma «rifallo», premuto da
   * te guardando il risultato, è una cosa diversa: è una richiesta, e il
   * prompt resta identico. Si rifà perché a volte l'immagine esce storta, non
   * perché si cerca un personaggio diverso.
   */
  replace?: boolean;
  /**
   * 🔷 Quanto devono venire bene queste immagini.
   *
   * ⚠️ QUESTO È IL LIVELLO DEL LAVORO, e vince su quello dichiarato dal
   * singolo asset: è la BOZZA di DEV, che abbassa tutto per le prove —
   * compresi master e toy, che in produzione restano pieni.
   *
   * Assente = decide ogni asset per conto suo (`AssetTypeDef.quality`), che
   * è il comportamento normale: la qualità si paga dove si vede.
   *
   * 🔒 Lo accende DEV, non il prodotto: l'immagine che l'utente TIENE deve
   * restare quella buona.
   */
  quality?: 'low' | 'medium' | 'high';
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
  opts: GenerateOptions = {},
  /** Chi disegna, se hai scelto. Il server accetta solo modelli che conosce. */
  imageModel?: string | null,
): Promise<{ made: AssetType[]; failure: BackendFailure | null; detail?: string }> {
  const name = record.data.name;
  const wanted = generationOrder()
    .filter((t) => (opts.only ? opts.only.includes(t) : true))
    .filter((t) => opts.replace || getAssetUrlSync(name, t) === null);
  const made: AssetType[] = [];

  for (const type of wanted) {
    /* 🔷 v1.2 §10 — se il compilatore AI ha già scritto il prompt di questo
       asset si usa quello; altrimenti quello deterministico, che resta sempre
       valido. La pipeline non compila da sé: chiedere una riscrittura a metà
       di una generazione di immagini vorrebbe dire due chiamate in fila con
       due modi diversi di fallire. */
    const text = promptFor(record, type).text;
    /* 🔒 La misura viene da `assetTypeDef`, cioè dal posto che SA cos'è questo
       asset. Prima era un quadrato deciso dentro l'adattatore del fornitore,
       uguale per tutti e sei — e per due di loro era la forma sbagliata. */
    /* ════════════════════════════════════════════════════════════════════
       IL RIFERIMENTO, FINALMENTE ALLEGATO DAVVERO

       ⚠️ `dependsOn` lo dichiarava dal primo giorno — «asset la cui immagine
       va allegata al prompt» — e nessuno lo allegava. Dal Profile Portrait in
       poi il prompt diceva già «allega il CHARACTER MASTER, dove testo e
       immagine non concordano vince l'immagine», e partiva su un indirizzo che
       accetta solo testo.

       🔒 Si allega quello che `dependsOn` dichiara, non «il master» scritto a
       mano qui: il giorno che un asset dipenderà anche dal ritratto, questa
       riga non cambia.
       ════════════════════════════════════════════════════════════════════ */
    const dipende = assetTypeDef(type).dependsOn[0] ?? null;
    const reference = dipende ? await assetBase64(name, dipende) : null;

    const res = await askImage(
      token,
      text,
      imageModel,
      assetTypeDef(type).size,
      reference,
      /* 🔷 La qualità la dichiara IL TIPO DI ASSET — è l'unico posto che sa a
         che dimensione finisce sotto gli occhi. `opts.quality` vince solo
         quando c'è: è la bozza di DEV, che abbassa tutto per le prove. */
      opts.quality ?? assetTypeDef(type).quality,
    );

    if (!res.data) {
      /* 🔒 Ci si ferma al primo no. Senza chiave falliranno tutte allo stesso
         modo, e col tetto raggiunto insistere significherebbe solo sei
         rifiuti invece di uno. */
      onProgress?.({ type, done: made.length, total: wanted.length, failure: res.failure });
      return { made, failure: res.failure, detail: res.detail };
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
