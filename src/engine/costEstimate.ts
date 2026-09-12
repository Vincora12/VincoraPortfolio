/* ============================================================================
   QUANTO SPENDI AL MESE, DATE LE SCELTE DI ADESSO

   🔷 «In alto con quelle scelte metti una media mensile di spesa pensando
   che io lo uso ogni giorno e faccio evoluzioni ogni 2 giorni.»

   Non è un contatore — nessuna chiamata vera passa da qui, e non registra
   niente. È una STIMA: quanto costerebbe un mese con le premesse dette
   sopra, ricalcolata ogni volta che cambi un modello in AI/MODELLI o in
   VINZ.LAB → AI, perché è esattamente lì che serve vederla.

   🔷 «La stima mensile falla meglio, vedi quanto sto lavorando ultimamente
   così sarà ogni giorno.» Le due premesse sotto (evoluzioni ogni 2 giorni,
   dieci messaggi al giorno) erano indovinate una volta e mai più corrette.
   Ora, appena ci sono almeno sette giorni veri nel registro spese
   (`/api/usage`, `last7DaysByCapability`), il ritmo reale li sostituisce —
   quanti messaggi mandi davvero, quanti token pesano davvero — e SOLO il
   prezzo resta calcolato con il modello scelto adesso in AI/MODELLI: cambi
   modello, il totale cambia; cambi ritmo d'uso, il totale segue da solo il
   giorno dopo, senza dover tornare qui a correggere un numero a mano.
   Nessuna cronologia ancora? Si torna alle premesse dichiarate sotto — mai
   uno zero silenzioso per chi non ha ancora usato l'app.

   🔒 I TOKEN PER CHIAMATA SONO STIME, NON MISURE — quando non c'è ancora
   storia vera. Dove il codice già dichiara un numero vero altrove (il
   prompt compilato, il tetto d'uscita del compilatore) uso quello; il resto
   è una stima onesta, arrotondata per restare leggibile, non un'invenzione
   a caso — vedi i commenti riga per riga.
   ========================================================================= */

import {
  modelForStep,
  type AiStepId,
} from '../../netlify/functions/_shared/routing';
import { priceFor } from '../ai/usage';

const ASSUNZIONI = {
  /** «Faccio evoluzioni ogni 2 giorni.» Detto da te, preso alla lettera —
      usato solo finché non ci sono ancora sette giorni veri da guardare. */
  evoluzioniAlMese: 30 / 2,
  /** «Lo uso ogni giorno.» Idem: il predefinito prima che il ritmo vero
      prenda il suo posto. */
  messaggiAlGiorno: 10,
  /**
   * Quota di messaggi «di tutti i giorni» contro quelli che meritano il
   * modello pieno. Lo stesso rapporto che `store.ts` dichiara altrove per
   * il routing a due velocità: circa uno su cinque si alza. Solo per la
   * stima SENZA dati veri — questi non distinguono i due livelli, sono
   * semplicemente tutto quello che hai mandato davvero.
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

/* Token per UN messaggio di chat, per le due velocità — solo per la stima
   SENZA dati veri.

   🟡 Stime, non misure: la cache tagliuzza il prezzo reale del briefing
   ripetuto (verify:batch misura ~3629 token di sistema, di cui la gran
   parte va in cache dal secondo messaggio in poi), quindi questi numeri
   tendono a SOVRASTIMARE un po' — meglio un totale un filo alto che uno
   che sorprende in bolletta. */
const MESSAGGIO_QUOTIDIANO = { input: 1200, output: 250 };
const MESSAGGIO_CHE_MERITA_PENSIERO = { input: 3800, output: 900 };

/* 🔷 RIFLESSIONE — settimanale, non mensile: «la lettura settimanale e gli
   appunti». ~4,3 volte al mese, non un numero tondo scelto a caso. Solo per
   la stima SENZA dati veri. */
const RIFLESSIONE_TOKEN = { input: 3000, output: 500 };
const RIFLESSIONI_AL_MESE = 30 / 7;

/** Un giorno vero vale trenta: proietta un campione di sette giorni su un mese. */
const SCALA_SETTIMANA_MESE = 30 / 7;

/** Lo stesso `UsageSummary` di `ai/backend.ts`, ridotto ai campi che qui contano. */
export interface RealUsageBucket {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Il ritmo vero degli ultimi sette giorni, per categoria — da
 * `UsageDashboard.last7DaysByCapability` (`ai/backend.ts`). Chiave uguale
 * a quella che il registro spese usa già (`action` di `recordSpend`):
 * `'character-voice'` per la chat, `'image_generation'` per le immagini di
 * un'evoluzione, `'reflection'` per la riflessione settimanale.
 */
export type RealUsageSnapshot = Partial<Record<'character-voice' | 'image_generation' | 'reflection', RealUsageBucket>>;

export interface MonthlyEstimate {
  totalUsd: number;
  byCategory: { label: string; usd: number }[];
  assunzioni: typeof ASSUNZIONI;
  /** Vero se almeno una categoria qui sotto usa il ritmo vero invece del
      dichiarato — per dirlo in chiaro nella schermata, non solo calcolarlo. */
  usaDatiVeri: boolean;
}

/**
 * Quanto costerebbe un mese con le scelte di adesso — ricalcolata ogni
 * volta che cambi un modello, e (da quando c'è una settimana vera nel
 * registro spese) anche ogni volta che il tuo ritmo d'uso cambia davvero.
 */
export function estimateMonthlyCost(
  stepModels: Partial<Record<AiStepId, string>>,
  real?: RealUsageSnapshot,
): MonthlyEstimate {
  /* Solo il testo (character/bio/narratore/prompt): prezzato SEMPRE al
     modello scelto adesso, reale o assunta che sia la frequenza. */
  const perEvoluzioneUsdSoloTesto = Object.entries(PER_EVOLUZIONE).reduce((sum, [id, tok]) => {
    const model = modelForStep(id as AiStepId, stepModels[id as AiStepId]);
    return sum + costoChiamata(model, tok.input, tok.output);
  }, 0);

  /* EVOLUZIONI — `image_generation` con subsystem "evolution" registra UNA
     chiamata per OGNI immagine salvata (verificato leggendo
     `evolution-background.ts`: `recordSpend` sta dentro il giro per
     asset, non dopo tutti e quattro) — non una per evoluzione. Il numero
     vero di evoluzioni è quindi le chiamate diviso quattro (le stesse
     quattro immagini di `COSTO_IMMAGINI_PER_EVOLUZIONE`), proiettato su un
     mese. Il costo delle immagini stesse è già in dollari veri nel
     registro (dipende da modello e qualità usati per davvero, non da una
     costante): si proietta quel dollaro, non lo si ricalcola da un prezzo
     per pezzo. */
  const chiamateImmaginiReali = real?.image_generation?.calls;
  const evoluzioniReali = chiamateImmaginiReali ? chiamateImmaginiReali / 4 : undefined;
  const evoluzioniAlMese = evoluzioniReali ? evoluzioniReali * SCALA_SETTIMANA_MESE : ASSUNZIONI.evoluzioniAlMese;
  const immaginiEvoluzioniUsd = evoluzioniReali
    ? real!.image_generation!.costUsd * SCALA_SETTIMANA_MESE
    : COSTO_IMMAGINI_PER_EVOLUZIONE * evoluzioniAlMese;
  const evoluzioniUsd = perEvoluzioneUsdSoloTesto * evoluzioniAlMese + immaginiEvoluzioniUsd;

  /* CHAT — con una settimana vera, tokens osservati per davvero, proiettati
     su un mese e prezzati al modello che hai scelto ORA in AI/MODELLI: cambi
     modello, il totale cambia; cambi quanto scrivi, lo fa da solo. */
  const modelloPieno = modelForStep('voice', stepModels.voice, 'full');
  const chatReale = real?.['character-voice'];
  let chatUsd: number;
  let messaggiAlMese: number;
  if (chatReale && (chatReale.inputTokens || chatReale.outputTokens || chatReale.calls)) {
    chatUsd = costoChiamata(
      modelloPieno,
      chatReale.inputTokens * SCALA_SETTIMANA_MESE,
      chatReale.outputTokens * SCALA_SETTIMANA_MESE,
    );
    messaggiAlMese = Math.round(chatReale.calls * SCALA_SETTIMANA_MESE);
  } else {
    const modelloQuotidiano = modelForStep('voice', stepModels.voice, 'everyday');
    messaggiAlMese = ASSUNZIONI.messaggiAlGiorno * 30;
    const messaggiPieni = Math.round(messaggiAlMese * ASSUNZIONI.quotaMessaggiPieni);
    const messaggiQuotidiani = messaggiAlMese - messaggiPieni;
    chatUsd =
      costoChiamata(modelloQuotidiano, MESSAGGIO_QUOTIDIANO.input, MESSAGGIO_QUOTIDIANO.output) * messaggiQuotidiani +
      costoChiamata(modelloPieno, MESSAGGIO_CHE_MERITA_PENSIERO.input, MESSAGGIO_CHE_MERITA_PENSIERO.output) * messaggiPieni;
  }

  /* RIFLESSIONE — stesso principio: token veri se ci sono, altrimenti la
     cadenza settimanale dichiarata. */
  const modelloRiflessione = modelForStep('reflection', stepModels.reflection);
  const riflessioneReale = real?.reflection;
  const riflessioneUsd = riflessioneReale && (riflessioneReale.inputTokens || riflessioneReale.outputTokens)
    ? costoChiamata(modelloRiflessione, riflessioneReale.inputTokens * SCALA_SETTIMANA_MESE, riflessioneReale.outputTokens * SCALA_SETTIMANA_MESE)
    : costoChiamata(modelloRiflessione, RIFLESSIONE_TOKEN.input, RIFLESSIONE_TOKEN.output) * RIFLESSIONI_AL_MESE;

  const usaDatiVeri = Boolean(evoluzioniReali || chatReale || riflessioneReale);

  return {
    totalUsd: evoluzioniUsd + chatUsd + riflessioneUsd,
    byCategory: [
      { label: `${Math.round(evoluzioniAlMese)} evoluzioni (character, bio, narratore, prompt, immagini)${evoluzioniReali ? ' · ritmo vero' : ''}`, usd: evoluzioniUsd },
      { label: `chat (~${messaggiAlMese} messaggi)${chatReale ? ' · ritmo vero' : ''}`, usd: chatUsd },
      { label: `riflessione settimanale${riflessioneReale ? ' · ritmo vero' : ''}`, usd: riflessioneUsd },
    ],
    assunzioni: ASSUNZIONI,
    usaDatiVeri,
  };
}
