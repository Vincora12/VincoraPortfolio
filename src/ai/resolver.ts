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
     questo    ~1.600 in ingresso, ~800 di JSON — PIÙ il ragionamento

   L'uscita è quella che costa tempo — si genera un token alla volta. Il conto
   qui sopra era incompleto la prima volta che l'ho scritto: contava il JSON e
   basta, e i token di ragionamento sono anch'essi uscita. Per questo la
   chiamata chiede `thinking: false` (vedi sotto). Se anche così non basta, il
   messaggio adesso dice `timeout` con parole sue, e la strada a mano resta lì
   accanto.

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
  /**
   * Quanto ha impiegato LA CHIAMATA, in millisecondi.
   *
   * 🔒 Non è il tempo che vedi sul pulsante: quello comprende il caricamento
   * del codice, la costruzione del prompt e il salvataggio. Questo è il solo
   * numero confrontabile col tetto della piattaforma.
   */
  ms: number | null;
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
  const { data, failure, detail, ms } = await ask<{ text: string }>(token, {
    capability: 'prompt-compile',
    voiceModel: compilerModel,
    user: buildCreativeResolverPrompt(input, numeric),
    /* ⚠️ RAGIONAMENTO BASSO, DI PROPOSITO — ed è la correzione di un mio errore.
       Avevo scritto qui sopra «~800 token in uscita» contando solo il JSON: i
       token di RAGIONAMENTO sono anch'essi token in uscita, e sono quelli che
       fanno il tempo. A ragionamento predefinito questa chiamata non poteva
       stare nei dieci secondi, e infatti non ci stava.

       Chiedere `low` non è un risparmio a caso: questo lavoro è VINCOLATO —
       i fatti arrivano dati, il formato è dettato riga per riga dal prompt del
       pacchetto, la grammatica numerica è già calcolata. Non c'è niente da
       scoprire, solo da scegliere. È la VOCE che deve pensare davvero, e
       infatti quella chiede `thinking` e riceve `medium`. */
    thinking: false,
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
      ms: ms ?? null,
    };
  }

  const { resolution, problems, repaired } = parseResolution(data.text);
  return { resolution, failure: null, problems, repaired, ms: ms ?? null };
}
