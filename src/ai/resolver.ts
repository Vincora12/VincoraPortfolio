/* ============================================================================
   IL PRIMO STADIO, CHIESTO A UN MODELLO

   🔷 «Proviamo con un'API. Facciamogli fare solo il prompt finale, quello lo do
   a ChatGPT.»

   È il modo giusto di dividere il lavoro: la parte che si può automatizzare
   (decidere) la fa l'API, la parte che oggi non si può (disegnare, per via del
   muro dei dieci secondi) la fai tu portando il prompt dove vuoi.

   ⚠️ E HA UNA POSSIBILITÀ CONCRETA DI STARE NEI DIECI SECONDI, che il vecchio
   compilatore non aveva nemmeno in teoria:

     vecchio   ~4.000 token in ingresso, fino a 8.000 in USCITA
     questo    ~1.600 in ingresso, ~800 in uscita

   L'uscita è quella che costa tempo — si genera un token alla volta — e qui è
   un decimo. Se anche così non basta, il messaggio adesso dice `timeout` con
   parole sue, e la strada a mano resta lì accanto.

   🔒 La validazione è la STESSA di quella incollata a mano: `parseResolution`.
   Due controlli diversi vorrebbero dire che la strada automatica accetta cose
   che l'altra rifiuta.
   ========================================================================= */

import { ask } from './backend';
import type { BackendFailure } from './backend';
import type { MonRecord } from '../engine/types';
import { characterDataFor } from '../assets-pipeline/resolver/adapter';
import { numericGrammarFor } from '../assets-pipeline/resolver/vendor/rules';
import { buildCreativeResolverPrompt } from '../assets-pipeline/resolver/vendor/resolver';
import { parseResolution } from '../assets-pipeline/resolver/parse';
import type { CreativeResolution } from '../assets-pipeline/resolver/vendor/types';

export interface ResolveOutcome {
  resolution: CreativeResolution | null;
  failure: BackendFailure | null;
  /** Perché è stata scartata, o perché la chiamata non è andata. */
  problems: string[];
  /** Cosa è stato aggiustato per leggerla. */
  repaired: string[];
}

export async function resolveWithAi(
  token: string | null,
  record: MonRecord,
  compilerModel?: string | null,
): Promise<ResolveOutcome> {
  const input = characterDataFor(record);
  const numeric = numericGrammarFor(input);

  /* 🔒 Il prompt è quello del pacchetto, parola per parola. Non viene diviso
     fra sistema e utente per guadagnare la cache: spezzarlo vorrebbe dire
     modificarlo, e il testo che gira dev'essere identico a quello che si
     copia a mano — altrimenti i due percorsi danno risultati diversi e non si
     capisce più quale sia il metodo che stiamo giudicando. */
  const { data, failure, detail } = await ask<{ text: string }>(token, {
    capability: 'prompt-compile',
    voiceModel: compilerModel,
    user: buildCreativeResolverPrompt(input, numeric),
    thinking: true,
    /* La risoluzione d'esempio sta in ~800 token. Tremila è largo e non
       rallenta: un modello si ferma quando ha finito, non quando riempie. */
    maxTokens: 3000,
  });

  if (!data?.text) {
    return {
      resolution: null,
      failure,
      problems: [detail ?? (failure ? `chiamata fallita (${failure})` : 'nessuna risposta')],
      repaired: [],
    };
  }

  const { resolution, problems, repaired } = parseResolution(data.text);
  return { resolution, failure: null, problems, repaired };
}
