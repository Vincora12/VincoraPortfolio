/* ============================================================================
   QUAL È IL PROMPT DI QUESTO ASSET, ADESSO

   🔒 UNA PORTA SOLA. Le sorgenti sono quattro, e i posti che chiedono un
   prompt sono quattro — la generazione delle immagini, l'export del pacchetto,
   la schermata dei prompt, l'importazione a mano. Se ognuno avesse la sua
   catena di ripieghi sarebbero sedici combinazioni scritte in quattro punti,
   cioè sedici occasioni di consegnare il testo sbagliato senza che niente
   fallisca. È già successo: l'export ignorava le riscritture e nessuno se
   n'era accorto.

   L'ORDINE, e perché:

     1. il TEMPLATE DERIVATO — per gli altri cinque asset di una creatura NUOVA
        il cui master esiste già. Il personaggio è deciso e l'immagine viene
        allegata: al testo resta solo la trasformazione di produzione.
     2. la RISOLUZIONE (v1, due stadi) — il CHARACTER MASTER, l'unico posto in
        cui un modello ha davvero DECISO chi è la creatura invece di riformulare;
     3. il prompt RISCRITTO alla vecchia maniera — resta valido per le creature
        nate prima, e §29 dice che una creatura tiene la versione con cui è
        nata;
     4. la CONCATENAZIONE — sempre presente, sempre valida, non costa niente.

   ⚠️ PERCHÉ IL TEMPLATE DERIVATO STA PRIMA DI TUTTO, ANCHE DI UN PROMPT GIÀ
   RISCRITTO. Sembra scortese verso il lavoro già pagato, e invece è la regola
   §29 applicata bene: una creatura tiene la versione con cui è NATA. Una
   creatura nata con il Resolver è nata con il master come fonte di verità, e i
   suoi asset derivati non hanno mai avuto altro compito che conservarlo. Un
   prompt riscritto per lei sarebbe un residuo dell'architettura di prima, non
   la sua storia.

   🔒 E LE CREATURE VECCHIE NON SI TOCCANO. Senza `resolution` — cioè nate
   prima del Resolver — la prima riga non scatta mai e restano esattamente sulla
   strada di sempre: prima il loro prompt riscritto, poi la concatenazione.
   ========================================================================= */

import type { AssetType, MonRecord } from '../engine/types';
import { compilePrompt } from './compiler';
import { derivedPrompt } from './derived';
import { characterDataFor } from './resolver/adapter';
import { compilePrompt as compileFromResolution } from './resolver/vendor/compiler';

export type PromptSource = 'derivato' | 'risoluzione' | 'riscritto' | 'concatenato';

export interface PromptChoice {
  text: string;
  source: PromptSource;
}

/** Il compilatore a due stadi copre solo questo asset, ed è giusto così. */
export const RESOLVER_COVERS: AssetType[] = ['character_master'];

/**
 * Vero se questa creatura può usare i template tecnici per i derivati.
 *
 * Due condizioni, e servono tutte e due:
 * • è nata dal Resolver (`resolution`), quindi il master è la sua verità;
 * • il master ESISTE come immagine, altrimenti non c'è niente da allegare e un
 *   template che dice «guarda il riferimento» punterebbe al vuoto — che è
 *   esattamente l'errore da cui veniamo.
 */
export function usaTemplateDerivati(record: MonRecord): boolean {
  return (
    record.resolution != null && record.data.asset_manifest_status.character_master === 'resolved'
  );
}

export function promptFor(record: MonRecord, assetType: AssetType): PromptChoice {
  if (usaTemplateDerivati(record)) {
    const tecnico = derivedPrompt(assetType);
    if (tecnico) return { text: tecnico, source: 'derivato' };
  }

  if (record.resolution && RESOLVER_COVERS.includes(assetType)) {
    return {
      text: compileFromResolution(characterDataFor(record), record.resolution).prompt,
      source: 'risoluzione',
    };
  }

  const written = record.compiledPrompts?.[assetType];
  if (written) return { text: written, source: 'riscritto' };

  return { text: compilePrompt(record, assetType).text, source: 'concatenato' };
}
