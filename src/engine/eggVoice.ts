/* ============================================================================
   LA VOCE DELL'UOVO (MASTER SPEC v1.10 §7.2)

   🔶 «Nell'incubazione vorrei sempre una chat, ma l'uovo non parla: usa solo
   suoni.»

   È una richiesta di interfaccia con dentro una regola di racconto, e la regola
   è la parte importante: **durante l'incubazione non c'è ancora nessuno che
   possa parlare.** §12/01 vieta di anticipare la forma futura, e una creatura
   che ti risponde a parole prima di essere nata la anticipa nel modo peggiore —
   con la personalità, che è la cosa che stai ancora seminando.

   Quindi l'uovo reagisce, e basta. Suoni, non parole.

   🔒 QUATTRO REGOLE, verificate da `feature-check.mjs`:

   1. **Nessuna parola.** Il vocabolario qui sotto è chiuso e non contiene
      nessun termine di nessuna lingua. Se domani serve un suono nuovo, si
      aggiunge qui e resta un suono.
   2. **Nessuna AI.** Non c'è niente da far scrivere a un modello: la cosa non
      ha ancora una voce. L'incubazione, di conseguenza, non costa nulla — sette
      giorni di uso quotidiano a costo zero.
   3. **Il suono è presenza, l'etichetta è informazione.** Cosa è stato
      registrato lo dice la riga «registrato: CIBO · COME STO» sotto al messaggio,
      come in chat normale. Il suono non deve essere decifrato: deve solo far
      sentire che dall'altra parte c'è qualcosa.
   4. **Reagisce a quello che hai detto**, non a caso. Un giorno raccontato bene
      e un messaggio a vuoto non suonano uguale.

   In più l'uovo si sveglia piano: nei primi giorni fa un suono solo e sordo,
   verso la fine ne fa tre e più articolati. Non è decorazione — è l'unica
   misura di avvicinamento che l'utente sente addosso invece di leggerla in una
   barra.
   ========================================================================= */

import type { Extraction } from './chatExtract';
import type { Rng } from './rng';

/**
 * Come ha reagito. Serve anche all'interfaccia, che disegna l'onda in modo
 * diverso: un `alert` è stretto e un `warm` è largo.
 */
export type EggReaction = 'ACK' | 'WARM' | 'CURIOUS' | 'ALERT' | 'DORMANT';

export interface EggSound {
  reaction: EggReaction;
  /** Il suono, scritto. Solo lettere basse, punti medi e trattini. */
  text: string;
  /** 0–1: quanto l'onda si muove. */
  intensity: number;
}

/* --- Vocabolario chiuso ------------------------------------------------------
   Nessuna di queste stringhe è una parola. È il vincolo che tiene in piedi
   tutto il resto: se una diventasse leggibile, l'uovo avrebbe parlato.
   -------------------------------------------------------------------------- */

const SOUNDS: Record<EggReaction, readonly string[]> = {
  /** Ha registrato qualcosa. Battito doppio, sordo, come un colpo dall'interno. */
  ACK: ['tump', 'tump · tump', 'tk · tump', 'dum', 'tump—'],
  /** Qualcosa gli è piaciuto. Vibrazione lunga, bassa. */
  WARM: ['hhmm', 'hhhmmm', 'mmh—', 'hhh · mmm', 'mmmm'],
  /** Non ha capito, o hai detto poco. Ticchettio che sale. */
  CURIOUS: ['tk tk', 'tk · tk · tk', 'krr?', 'tk—tk', 'prr · tk'],
  /** Tensione: malattia, stress, un dato che stringe. Suono secco. */
  ALERT: ['krk', 'k—k', 'krrk', 'tsk', 'krk · krk'],
  /** All'inizio è quasi inerte: si sente solo che c'è. */
  DORMANT: ['·', '· ·', 'hh', '—', 'h ·'],
};

/** Umori che tirano il suono verso la tensione invece che verso il calore. */
const TENSE = new Set(['STRESSATO', 'PARANOIATO', 'IRRITATO', 'SCARICO', 'MALINCONICO']);

/**
 * Sceglie il suono. Deterministico dato l'rng: la stessa frase nello stesso
 * momento produce lo stesso suono, come tutto il resto del motore.
 *
 * @param progress 0–1 di incubazione: da quanto l'uovo ti sente.
 */
export function eggReply(rng: Rng, found: Extraction, progress: number): EggSound {
  const reaction = reactionFor(found, progress);
  const bank = SOUNDS[reaction];
  const one = bank[Math.floor(rng() * bank.length)] ?? bank[0]!;

  // Più l'incubazione è avanti, più il suono è articolato: all'inizio uno solo,
  // alla fine anche tre di fila. È l'unico modo in cui l'uovo «cresce» a
  // schermo senza mostrare niente di quello che sta diventando.
  const repeats = progress > 0.7 ? 3 : progress > 0.35 ? 2 : 1;
  const parts: string[] = [one];
  for (let i = 1; i < repeats; i++) {
    const next = bank[Math.floor(rng() * bank.length)] ?? one;
    if (next !== parts[parts.length - 1]) parts.push(next);
  }

  return {
    reaction,
    text: parts.join('   '),
    intensity: reaction === 'DORMANT' ? 0.15 : Math.min(1, 0.35 + progress * 0.65),
  };
}

function reactionFor(found: Extraction, progress: number): EggReaction {
  const moods = found.moods;
  if (moods.some((m) => TENSE.has(m))) return 'ALERT';
  if (moods.length > 0) return 'WARM';

  const heard = Object.keys(found.signals).length > 0 || found.measures.length > 0;
  if (heard) return 'ACK';

  // DORMANT è per quando non ha sentito NIENTE e ti conosce ancora poco: il
  // silenzio quasi totale è la risposta onesta a un messaggio da cui non è
  // uscito nulla, il primo giorno.
  //
  // ⚠️ Non vale quando qualcosa l'ha sentito. Una versione precedente teneva
  // l'uovo inerte per i primi due giorni a prescindere, e il risultato era che
  // il primissimo messaggio — quello che decide se uno ci riprova domani —
  // riceveva un puntino. Il risveglio graduale resta, ma lo porta il NUMERO di
  // suoni qui sotto, non il silenzio.
  return progress < 0.3 ? 'DORMANT' : 'CURIOUS';
}

/** Tutte le stringhe possibili: serve al controllo che non siano mai parole. */
export function allEggSounds(): string[] {
  return Object.values(SOUNDS).flat();
}
