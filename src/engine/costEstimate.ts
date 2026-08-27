/* ============================================================================
   QUANTO SPENDI AL MESE, DATE LE SCELTE DI ADESSO

   🔷 «In alto con quelle scelte metti una media mensile di spesa pensando
   che io lo uso ogni giorno e faccio evoluzioni ogni 2 giorni.»

   Non è un contatore — nessuna chiamata vera passa da qui, e non registra
   niente. È una STIMA: quanto costerebbe un mese con le premesse dette
   sopra, ricalcolata ogni volta che cambi un modello in AI/MODELLI o in
   VINZ.LAB → AI, perché è esattamente lì che serve vederla.

   🟡 Le due premesse (evoluzioni ogni 2 giorni, quanti messaggi al giorno)
   sono dichiarate qui sotto, non nascoste in un calcolo. La seconda non
   l'hai data: è assunta a un numero ragionevole e tondo — cambiala qui se
   il tuo uso vero è diverso, il totale segue.

   🔒 I TOKEN PER CHIAMATA SONO STIME, NON MISURE. Dove il codice già
   dichiara un numero vero altrove (il prompt compilato, il tetto d'uscita
   del compilatore) uso quello; il resto è una stima onesta, arrotondata per
   restare leggibile, non un'invenzione a caso — vedi i commenti riga per
   riga.
   ========================================================================= */

import {
  modelForStep,
  type AiStepId,
} from '../../netlify/functions/_shared/routing';
import { priceFor } from '../ai/usage';

const ASSUNZIONI = {
  /** «Faccio evoluzioni ogni 2 giorni.» Detto da te, preso alla lettera. */
  evoluzioniAlMese: 30 / 2,
  /** «Lo uso ogni giorno.» Il QUANTO non l'hai detto: dieci scambi al
      giorno è un uso attivo e quotidiano senza essere un caso estremo.
      Cambia questo numero se il tuo è diverso — il totale lo segue. */
  messaggiAlGiorno: 10,
  /**
   * Quota di messaggi «di tutti i giorni» contro quelli che meritano il
   * modello pieno. Lo stesso rapporto che `store.ts` dichiara altrove per
   * il routing a due velocità: circa uno su cinque si alza.
   */
  quotaMessaggiPieni: 0.2,
};

/** Dollari per milione di token in ingresso/uscita, per una chiamata. */
function costoChiamata(model: string, inputTok: number, outputTok: number): number {
  const p = priceFor(model);
  return (inputTok / 1e6) * p.input + (outputTok / 1e6) * p.output;
}

/* Token per chiamata, per step che accadono UNA VOLTA PER EVOLUZIONE.

   🔷 CHARACTER MASTER — l'ingresso è il prompt compilato: `verify:package`
   misura il più corto a 16406 caratteri, cioè circa 4100 token. L'uscita è
   una JSON di risoluzione, non tutto il tetto di 8000 che il modello ha a
   disposizione per pensare: 1500 è una stima a metà strada.
   🔷 IMAGE PROMPT — «un prompt riscritto è quasi tutta uscita — otto o
   novemila token», già scritto in COMPILER_CHOICES: uso quel numero, non
   uno mio.
   🟡 BIO e NARRATORE non hanno un numero dichiarato altrove: «testo corto»
   lo sono per davvero, stimati di conseguenza. */
const PER_EVOLUZIONE: Partial<Record<AiStepId, { input: number; output: number }>> = {
  characterMaster: { input: 4200, output: 1500 },
  bio: { input: 1500, output: 300 },
  narrator: { input: 1000, output: 150 },
  imagePrompt: { input: 4200, output: 8500 },
};

/* 🔷 Quattro immagini per creatura, la stessa cifra di
   `ModelsSection.tsx`/`COSTO_IMMAGINI.normale`: doodle e sticker in bozza
   (`assets.ts` li dichiara `low`), master e toy pieni. Non calcolata due
   volte — vive lì e qui insieme perché sono la stessa cosa vista da due
   schermate, come il catalogo dei modelli. */
const COSTO_IMMAGINI_PER_EVOLUZIONE = 2 * 0.053 + 2 * 0.006;

/* Token per UN messaggio di chat, per le due velocità.

   🟡 Stime, non misure: la cache tagliuzza il prezzo reale del briefing
   ripetuto (verify:batch misura ~3629 token di sistema, di cui la gran
   parte va in cache dal secondo messaggio in poi), quindi questi numeri
   tendono a SOVRASTIMARE un po' — meglio un totale un filo alto che uno
   che sorprende in bolletta. */
const MESSAGGIO_QUOTIDIANO = { input: 1200, output: 250 };
const MESSAGGIO_CHE_MERITA_PENSIERO = { input: 3800, output: 900 };

/* 🔷 RIFLESSIONE — settimanale, non mensile: «la lettura settimanale e gli
   appunti». ~4,3 volte al mese, non un numero tondo scelto a caso. */
const RIFLESSIONE_TOKEN = { input: 3000, output: 500 };
const RIFLESSIONI_AL_MESE = 30 / 7;

export interface MonthlyEstimate {
  totalUsd: number;
  byCategory: { label: string; usd: number }[];
  assunzioni: typeof ASSUNZIONI;
}

/**
 * Quanto costerebbe un mese con le scelte di adesso — ricalcolata ogni
 * volta che cambi un modello, non una fotografia presa una volta sola.
 */
export function estimateMonthlyCost(
  stepModels: Partial<Record<AiStepId, string>>,
): MonthlyEstimate {
  const perEvoluzioneUsd =
    Object.entries(PER_EVOLUZIONE).reduce((sum, [id, tok]) => {
      const model = modelForStep(id as AiStepId, stepModels[id as AiStepId]);
      return sum + costoChiamata(model, tok.input, tok.output);
    }, 0) + COSTO_IMMAGINI_PER_EVOLUZIONE;
  const evoluzioniUsd = perEvoluzioneUsd * ASSUNZIONI.evoluzioniAlMese;

  const messaggiAlMese = ASSUNZIONI.messaggiAlGiorno * 30;
  const messaggiPieni = Math.round(messaggiAlMese * ASSUNZIONI.quotaMessaggiPieni);
  const messaggiQuotidiani = messaggiAlMese - messaggiPieni;

  const modelloQuotidiano = modelForStep('voice', stepModels.voice, 'everyday');
  const modelloPieno = modelForStep('voice', stepModels.voice, 'full');
  const chatUsd =
    costoChiamata(modelloQuotidiano, MESSAGGIO_QUOTIDIANO.input, MESSAGGIO_QUOTIDIANO.output) *
      messaggiQuotidiani +
    costoChiamata(
      modelloPieno,
      MESSAGGIO_CHE_MERITA_PENSIERO.input,
      MESSAGGIO_CHE_MERITA_PENSIERO.output,
    ) * messaggiPieni;

  const modelloRiflessione = modelForStep('reflection', stepModels.reflection);
  const riflessioneUsd =
    costoChiamata(modelloRiflessione, RIFLESSIONE_TOKEN.input, RIFLESSIONE_TOKEN.output) *
    RIFLESSIONI_AL_MESE;

  return {
    totalUsd: evoluzioniUsd + chatUsd + riflessioneUsd,
    byCategory: [
      { label: `${Math.round(ASSUNZIONI.evoluzioniAlMese)} evoluzioni (character, bio, narratore, prompt, immagini)`, usd: evoluzioniUsd },
      { label: `chat quotidiana (~${messaggiAlMese} messaggi)`, usd: chatUsd },
      { label: 'riflessione settimanale', usd: riflessioneUsd },
    ],
    assunzioni: ASSUNZIONI,
  };
}
