/* ============================================================================
   IL RITMO DI SCRITTURA (MASTER SPEC v1.12 §17.3)

   🔷 «Ogni .mon ha un suo modo di rispondere: alcuni scrivono parola per
   parola, altri un paragrafo. Imitare diversi tipi di comportamenti umani.»

   La ricerca sulle interfacce conversazionali dice due cose che sembrano
   sbagliate e non lo sono:

   • Rispondere ISTANTANEAMENTE è percepito come meno umano di rispondere dopo
     una breve pausa. Il ritardo con l'indicatore alza la presenza percepita.
   • Spezzare una risposta in una reazione corta + il resto è più umano di un
     paragrafo unico, perché è così che scriviamo davvero.

   Quindi il ritmo non è un difetto da minimizzare: è materiale di carattere.

   ⚠️ MA UN RITMO UGUALE PER TUTTI È UNA MASCHERA, NON UN CARATTERE. Se ogni
   .mon esita nello stesso punto e scrive alla stessa velocità, dopo due
   creature si vede il meccanismo. Per questo il ritmo NON è una costante di
   prodotto: si ricava dal Voice DNA della singola creatura.

   🔒 E non si inventa un asse nuovo per farlo. §13 tiene lo schema chiuso, e i
   dodici assi di §14 dicono già tutto quello che serve:

     writing      → verbosity, sentence length, fragments
     temperament  → energy, patience, impulsivity
     emotion      → enthusiasm, irritability, vulnerability
     relationship → complicity

   Un SILENT STOIC ha `writing` basso e `temperament` paziente: pensa a lungo e
   poi consegna un blocco corto. Un CHAOTIC GEN-Z ha impulsività alta: parte
   subito, a raffiche, e si interrompe. Non è una regola scritta a mano per
   ciascuno dei sedici preset — esce dai numeri, quindi vale anche per le
   creature che non abbiamo ancora visto.
   ========================================================================= */

import type { VoiceDna } from './types';

/** Come il testo compare nella bolla. */
export type Reveal =
  /** Una parola alla volta, regolare. È la scrittura di chi pensa mentre scrive. */
  | 'word'
  /** A gruppi irregolari di parole, veloce. È chi digita di getto. */
  | 'burst'
  /** Tutto insieme dopo la pausa. È chi scrive il messaggio e poi lo manda. */
  | 'block';

export interface TypingRhythm {
  /** Quanto resta a «sta scrivendo…» prima che compaia la prima parola. */
  thinkMs: number;
  reveal: Reveal;
  /** Millisecondi per parola (`word`/`burst`). Ignorato da `block`. */
  paceMs: number;
  /**
   * L'indicatore si spegne e si riaccende una volta prima di rispondere.
   * È il tic più umano che ci sia — qualcuno che inizia a scrivere, si ferma,
   * ricomincia — e non lo fanno tutti: solo chi è vulnerabile o impulsivo.
   */
  hesitates: boolean;
  /**
   * Manda prima una reazione corta e poi il resto, in due bolle separate.
   * È il comportamento di chi ti risponde d'istinto e poi argomenta.
   */
  splitReply: boolean;
  /** Da quali assi è uscito: serve alla traccia e ai controlli. */
  from: string[];
}

/**
 * ⚠️ IL TETTO CHE SALVA IL CARATTERE DA SE STESSO.
 *
 * `paceMs` è il passo per parola, e su una risposta corta è esattamente il
 * carattere che vogliamo. Su una risposta lunga, moltiplicato, diventa altro:
 * un .mon lento che consegna trenta parole ci metterebbe quattro secondi e
 * mezzo di sola scrittura, e a quel punto non stai leggendo un carattere,
 * stai aspettando un'app rotta.
 *
 * Quindi il passo si mantiene finché il messaggio è corto e si comprime
 * quando è lungo. La differenza fra i .mon resta leggibile dove si legge
 * davvero — nelle prime parole.
 */
export const MAX_REVEAL_MS = 3000;

/** Legge un asse 0–100, con 50 come centro quando l'asse non c'è. */
function axis(voice: VoiceDna, id: string): number {
  const v = voice[id];
  return typeof v === 'number' ? v : 50;
}

/**
 * Il ritmo di scrittura di un .mon.
 *
 * Funzione pura: stesso Voice DNA, stesso ritmo, per sempre. Il ritmo è parte
 * dell'identità quanto il colore — se cambiasse a ogni messaggio si
 * leggerebbe come rumore invece che come carattere.
 */
export function typingRhythmFor(voice: VoiceDna): TypingRhythm {
  const writing = axis(voice, 'writing');
  const temperament = axis(voice, 'temperament');
  const emotion = axis(voice, 'emotion');
  const relationship = axis(voice, 'relationship');
  const from: string[] = [];

  /* --- La pausa prima di iniziare ------------------------------------------
     Chi ha temperamento alto (energia, impulsività) parte quasi subito. Chi ce
     l'ha basso (pazienza, calma) si prende il suo tempo.

     Il minimo non è zero ed è una scelta: sotto i ~400 ms la risposta arriva
     prima che tu abbia finito di guardare lo schermo, e legge come automatica.
     Il massimo sta a 2,2 s perché è la pausa a schermo fermo, quella in cui si
     vedono solo i puntini: è il pezzo di attesa che costa di più. */
  const thinkMs = Math.round(2200 - temperament * 18);
  from.push(`temperament:${temperament}`);

  /* --- Come compare il testo ------------------------------------------------
     `writing` alto significa prolisso, frasi lunghe: uno che scrive mentre
     pensa, quindi parola per parola. `writing` basso significa poche parole e
     frammenti: uno che formula in testa e consegna il blocco già finito.

     L'impulsività scavalca: chi è impulsivo digita a raffiche comunque, anche
     se dice poco. */
  let reveal: Reveal;
  if (temperament >= 70) {
    reveal = 'burst';
    from.push('temperament:impulsivo → raffiche');
  } else if (writing <= 35) {
    reveal = 'block';
    from.push(`writing:${writing} → blocco`);
  } else {
    reveal = 'word';
    from.push(`writing:${writing} → parola per parola`);
  }

  /* --- La velocità ----------------------------------------------------------
     Fra ~55 ms e ~150 ms per parola. Il basso è digitazione veloce, l'alto è
     qualcuno che sceglie le parole. Sopra i 150 ms si legge come un
     caricamento rotto, non come lentezza voluta. */
  const paceMs = Math.round(150 - temperament * 0.95);

  /* --- L'esitazione ---------------------------------------------------------
     Solo dove ha senso caratterialmente: chi è emotivo si ferma e ricomincia,
     chi è impulsivo manda e si corregge. Un .mon freddo e misurato che esita
     sarebbe una contraddizione — e le contraddizioni, in questo progetto, le
     decide il Character DNA, non un effetto di interfaccia. */
  const hesitates = emotion >= 65 || temperament >= 80;
  if (hesitates) from.push(`emotion:${emotion}`);

  /* --- Le due bolle ---------------------------------------------------------
     La reazione corta prima del resto è un gesto di complicità: la fa chi ti
     risponde d'istinto perché gli interessa, non chi tiene le distanze.
     Serve anche abbastanza da dire: chi parla pochissimo non ha un «resto». */
  const splitReply = relationship >= 60 && writing >= 45;
  if (splitReply) from.push(`relationship:${relationship}`);

  return { thinkMs, reveal, paceMs, hesitates, splitReply, from };
}

/**
 * Quanto dura in tutto, in millisecondi: pausa + scrittura (+ l'esitazione).
 * Serve a verificare che nessun .mon esca da una finestra ragionevole — un
 * carattere lentissimo resta comunque un'app che risponde.
 */
export function rhythmDurationMs(rhythm: TypingRhythm, words: number): number {
  return rhythm.thinkMs + revealDurationMs(rhythm, words) + (rhythm.hesitates ? 700 : 0);
}

/**
 * Quanto dura la comparsa del testo, tetto compreso.
 *
 * La UI deve usare QUESTA, non `words * paceMs`: è l'unico punto dove il tetto
 * di `MAX_REVEAL_MS` viene applicato, e se l'interfaccia se lo ricalcolasse da
 * sola il tetto verrebbe aggirato senza che nessun controllo se ne accorga.
 */
export function revealDurationMs(rhythm: TypingRhythm, words: number): number {
  if (rhythm.reveal === 'block') return 0;
  return Math.min(words * rhythm.paceMs, MAX_REVEAL_MS);
}
