/* ============================================================================
   QUAL È IL PROMPT DI QUESTO ASSET, ADESSO

   🔒 UNA PORTA SOLA. Le sorgenti sono diventate tre, e i posti che chiedevano
   un prompt erano quattro — la generazione delle immagini, l'export del
   pacchetto, la schermata dei prompt, l'importazione a mano. Ognuno aveva la
   sua catena di ripieghi: dodici combinazioni scritte in quattro punti, cioè
   dodici occasioni di consegnare il testo sbagliato senza che niente fallisca.
   È già successo: l'export ignorava le riscritture e nessuno se n'era accorto.

   L'ORDINE, e perché:

     1. la RISOLUZIONE (v1, due stadi) — è l'unica sorgente in cui un modello
        ha davvero DECISO chi è la creatura invece di riformulare;
     2. il prompt RISCRITTO alla vecchia maniera — resta valido per le creature
        nate prima, e §29 dice che una creatura tiene la versione con cui è
        nata;
     3. la CONCATENAZIONE — sempre presente, sempre valida, non costa niente.

   ⚠️ LIMITE DICHIARATO DI v1: il compilatore a due stadi scrive UN prompt, il
   CHARACTER MASTER. Gli altri cinque asset — ritratto, doodle, espressioni,
   idle, hero — non hanno ancora una forma nel pacchetto e restano sulla
   concatenazione. Non è una svista: è quanto arriva v1, ed è giusto che si
   veda invece di essere nascosto da un ripiego silenzioso.
   ========================================================================= */

import type { AssetType, MonRecord } from '../engine/types';
import { compilePrompt } from './compiler';
import { characterDataFor } from './resolver/adapter';
import { compilePrompt as compileFromResolution } from './resolver/vendor/compiler';

export type PromptSource = 'risoluzione' | 'riscritto' | 'concatenato';

export interface PromptChoice {
  text: string;
  source: PromptSource;
}

/** Il compilatore a due stadi copre solo questo asset, per ora. */
export const RESOLVER_COVERS: AssetType[] = ['character_master'];

export function promptFor(record: MonRecord, assetType: AssetType): PromptChoice {
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
