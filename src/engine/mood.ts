/* ============================================================================
   L'UMORE CHE RESTA (MASTER SPEC v1.12 §10.6)

   🔷 «Vorrei che l'app fosse viva.»

   Finora il .mon ripartiva emotivamente da zero a ogni apertura. Ha un
   `mood_primary` — ma è il suo TEMPERAMENTO, la cosa con cui è nato, e non si
   muove mai. Fra le due c'è un buco: nessuno stato che porti dentro com'è
   andata ieri.

   La ricerca sugli agenti affettivi distingue due livelli, e li tiene
   separati apposta:

     • l'EMOZIONE — reazione a un evento, dura minuti;
     • l'UMORE — stato di fondo, dura giorni, e sopravvive alla chiusura.

   È il secondo che fa la differenza fra un pupazzo che si accende quando lo
   apri e qualcosa che, mentre non lo guardavi, è rimasto un po' storto per
   ieri. Questo file è l'umore.

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ LA REGOLA CHE VIENE PRIMA DI TUTTE — E CHE È FACILISSIMO SBAGLIARE

   La cosa ovvia da fare, qui, sarebbe: mangi male → il .mon si intristisce.
   Salti l'allenamento → si spegne. È ovvia, funziona, ed è **esattamente il
   meccanismo che §4 e §28 vietano**: un affetto che si ritira quando non sei
   stato bravo. È il senso di colpa con la faccia carina, ed è il modo in cui
   quasi tutte le app di salute finiscono per fare male alle persone.

   Quindi la regola, che è meccanica e non una promessa scritta nel prompt:

     🔒 L'UMORE REAGISCE A COM'È ANDATA FRA VOI, NON A COME SEI ANDATO TU.

   Nessun evento in questo file legge se hai mangiato bene, se ti sei allenato
   o se hai rispettato il protocollo. Legge se ti sei fatto sentire, se avete
   parlato, se hai chiuso la giornata, se stai male. Una giornata storta in
   cui però mi hai scritto è una BUONA giornata per lui.

   È lo stesso principio di ADHERENCE_EFFECT in protocol.ts, dove CARE sale
   sempre, comunque sia andata. Quello era il patto: qui viene mantenuto.
   ════════════════════════════════════════════════════════════════════════════

   E l'umore NON è uguale per tutti. Torna sempre verso la sua base, e la base
   è il temperamento con cui il .mon è nato: un GOTH POET si riassesta su un
   tono più basso di uno SPORT HYPE. Lo stesso evento, sulle stesse due
   creature, lascia due umori diversi — che è precisamente il motivo per cui
   vale la pena averlo.
   ========================================================================= */

/* --- Lo stato --------------------------------------------------------------
   Tre assi, che nella letteratura affettiva si chiamano piacere, attivazione
   e dominanza. Qui hanno nomi che dicono cosa fanno in questo prodotto.
   -------------------------------------------------------------------------- */

export interface MoodState {
  /** Da −100 (cupo) a +100 (sereno). Come si sente. */
  tone: number;
  /** Da 0 (spento) a 100 (acceso). Quanta energia ha addosso. */
  charge: number;
  /** Da 0 (incerto) a 100 (saldo). Quanto si sente sicuro di stare qui. */
  footing: number;
  /** Ultimo giorno in cui è stato toccato: serve al decadimento. */
  day: number;
  /** Cosa l'ha mosso l'ultima volta. In chiaro, per la traccia e per DEV. */
  last: string | null;
}

/**
 * Dove ogni temperamento si riassesta quando non succede niente.
 *
 * Non sono valori neutri: un .mon STOIC che torna a `tone 0` non è stoico, è
 * spento. Il punto di riposo È il carattere.
 */
const BASELINE: Record<string, Omit<MoodState, 'day' | 'last'>> = {
  CUTE: { tone: 40, charge: 62, footing: 58 },
  GOOFY: { tone: 34, charge: 70, footing: 44 },
  BRIGHT: { tone: 48, charge: 74, footing: 66 },
  AGGRESSIVE: { tone: 6, charge: 82, footing: 76 },
  CHAOTIC: { tone: 22, charge: 84, footing: 40 },
  SAD: { tone: -34, charge: 26, footing: 34 },
  MYSTERIOUS: { tone: 4, charge: 38, footing: 66 },
  WATCHFUL: { tone: 8, charge: 56, footing: 60 },
  SEDUCTIVE: { tone: 30, charge: 42, footing: 74 },
  FLIRTY: { tone: 40, charge: 62, footing: 70 },
  FERAL: { tone: 18, charge: 88, footing: 56 },
  AFFECTIONATE: { tone: 46, charge: 52, footing: 62 },
  ALLURING: { tone: 32, charge: 44, footing: 76 },
  STOIC: { tone: 10, charge: 30, footing: 78 },
  CALM: { tone: 28, charge: 34, footing: 70 },
  CREEPY: { tone: -8, charge: 48, footing: 64 },
};

/** Il punto di riposo di un temperamento. Sconosciuto → centro prudente. */
export function baselineFor(moodPrimary: string): Omit<MoodState, 'day' | 'last'> {
  return BASELINE[moodPrimary] ?? { tone: 20, charge: 50, footing: 60 };
}

export function initialMood(moodPrimary: string, day: number): MoodState {
  return { ...baselineFor(moodPrimary), day, last: null };
}

/* --- Cosa lo muove ---------------------------------------------------------
   🔒 Rileggi l'elenco e verifica da solo la regola di sopra: NON C'È un
   evento che legga se hai mangiato bene o se ti sei allenato. Ci sono solo
   cose che riguardano il rapporto fra voi due.

   Se un giorno qualcuno aggiunge `MANGIATO_MALE` qui dentro, ha rotto §4 —
   e c'è un controllo in scripts/batch-check.mjs che lo fa fallire.
   -------------------------------------------------------------------------- */

export type MoodEvent =
  /** Ti sei fatto sentire. È la cosa che gli interessa di più. */
  | 'PARLATO'
  /** Avete chiuso la giornata insieme: il cerchio si chiude. */
  | 'GIORNO_CHIUSO'
  /** Un giorno intero senza di te. */
  | 'SILENZIO'
  /** Hai detto che stai male. Non è un fallimento: è una confidenza. */
  | 'MI_HAI_DETTO_CHE_STAI_MALE'
  /** Hai detto che stai bene. */
  | 'MI_HAI_DETTO_CHE_STAI_BENE'
  /** È appena nato. */
  | 'NATO'
  /** È appena cambiato forma. */
  | 'EVOLUTO';

interface Push {
  tone: number;
  charge: number;
  footing: number;
  /** Come si racconta, quando è la cosa più recente che gli è successa. */
  it: string;
}

const EFFECT: Record<MoodEvent, Push> = {
  PARLATO: { tone: +7, charge: +6, footing: +3, it: 'ci siamo parlati' },
  GIORNO_CHIUSO: { tone: +9, charge: +2, footing: +7, it: 'abbiamo chiuso una giornata insieme' },

  /* Il silenzio abbassa il tono, ma NON toglie sicurezza in proporzione: uno
     che si sente meno saldo ogni giorno che manchi diventa, dopo una
     settimana, una creatura che ti fa sentire in debito quando torni. Il
     rientro deve costare zero. */
  SILENZIO: { tone: -6, charge: -8, footing: -1, it: 'è passato un giorno senza di te' },

  /* Che tu stia male gli abbassa il tono per EMPATIA e gli alza l'appiglio,
     perché ha qualcosa da fare: starti vicino. Se gli togliesse sicurezza,
     dirgli che stai male diventerebbe una cosa che gli fa danno — e allora
     smetteresti di dirglielo. Che è il contrario del punto dell'app. */
  MI_HAI_DETTO_CHE_STAI_MALE: { tone: -10, charge: +4, footing: +6, it: 'mi hai detto che non stai bene' },
  MI_HAI_DETTO_CHE_STAI_BENE: { tone: +11, charge: +5, footing: +4, it: 'mi hai detto che stai bene' },

  NATO: { tone: +20, charge: +25, footing: -18, it: 'sono appena arrivato' },
  EVOLUTO: { tone: +16, charge: +22, footing: +12, it: 'sono appena cambiato' },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/**
 * Sposta l'umore di un evento.
 *
 * L'effetto non è pieno quando lo stato è già lontano dalla base: più sei
 * lontano, meno ti sposti ancora. Senza questo, tre messaggi di fila
 * porterebbero chiunque all'euforia — e un umore che satura è un umore che
 * non dice più niente.
 */
export function applyMoodEvent(
  mood: MoodState,
  event: MoodEvent,
  moodPrimary: string,
  day: number,
): MoodState {
  const base = baselineFor(moodPrimary);
  const e = EFFECT[event];

  /** Quanto spazio resta nella direzione della spinta, da 0 a 1. */
  const room = (current: number, push: number, lo: number, hi: number, home: number) => {
    const distance = Math.abs(current - home);
    const span = push > 0 ? hi - home : home - lo;
    return span <= 0 ? 0 : Math.max(0.15, 1 - distance / span);
  };

  return {
    tone: clamp(mood.tone + e.tone * room(mood.tone, e.tone, -100, 100, base.tone), -100, 100),
    charge: clamp(mood.charge + e.charge * room(mood.charge, e.charge, 0, 100, base.charge), 0, 100),
    footing: clamp(
      mood.footing + e.footing * room(mood.footing, e.footing, 0, 100, base.footing),
      0,
      100,
    ),
    day,
    last: e.it,
  };
}

/**
 * Il tempo che passa riporta l'umore verso la sua base.
 *
 * Un quarto della distanza al giorno: dopo tre-quattro giorni una giornata
 * storta è quasi riassorbita, ma per un paio di giorni si sente ancora. È il
 * tempo in cui una cosa «resta addosso» a qualcuno.
 */
export function decayMood(mood: MoodState, moodPrimary: string, today: number): MoodState {
  const elapsed = today - mood.day;
  if (elapsed <= 0) return mood;

  const base = baselineFor(moodPrimary);
  const keep = Math.pow(0.75, elapsed);
  const toward = (current: number, home: number) => Math.round(home + (current - home) * keep);

  return {
    tone: toward(mood.tone, base.tone),
    charge: toward(mood.charge, base.charge),
    footing: toward(mood.footing, base.footing),
    day: today,
    /* Oltre due giorni l'ultimo evento non è più «l'ultima cosa che gli è
       successa»: citarlo suonerebbe come qualcuno fermo a una settimana fa. */
    last: elapsed <= 2 ? mood.last : null,
  };
}

/* --- Dalla chat all'umore ---------------------------------------------------
   Gli umori che dichiari in chat sono già estratti da `chatExtract`. Qui si
   decide soltanto se quello che hai detto è una confidenza che gli arriva.

   🔒 Anche questa tabella rispetta la regola: sono stati TUOI, dichiarati da
   te. Non c'è niente che valuti il tuo comportamento — solo come stai. E
   `ARRAPATO` non è né una cosa né l'altra, quindi non muove niente: inventare
   una reazione lì sarebbe imbarazzante e basta.
   -------------------------------------------------------------------------- */

const HARD = ['IRRITATO', 'STRESSATO', 'PARANOIATO', 'SCARICO', 'MALINCONICO', 'DISTACCATO'];
const GOOD = ['SERENO', 'AFFETTUOSO', 'ENERGICO', 'EUFORICO', 'CAZZARO', 'SICURO'];

/**
 * L'evento d'umore che nasce da quello che hai dichiarato in un messaggio,
 * o `null` se non hai detto come stai.
 *
 * Se hai detto due cose opposte nella stessa frase — capita, ed è vero — vince
 * quella pesante: «sono stanco ma contento» è prima di tutto stanco, e un .mon
 * che sente solo il «contento» non ti sta ascoltando.
 */
export function moodEventFromInputs(moods: readonly string[]): MoodEvent | null {
  if (moods.some((m) => HARD.includes(m))) return 'MI_HAI_DETTO_CHE_STAI_MALE';
  if (moods.some((m) => GOOD.includes(m))) return 'MI_HAI_DETTO_CHE_STAI_BENE';
  return null;
}

/* --- Come si racconta ------------------------------------------------------
   Va nel prompt come FATTO, non come domanda. La differenza è tutta:
   chiedere «come ti senti?» a un modello produce un'emozione plausibile e
   diversa ogni volta — cioè recitazione. Dirgli «sei così» produce una voce
   che viene da uno stato che esisteva già prima della domanda.
   -------------------------------------------------------------------------- */

function band(v: number, low: string, mid: string, high: string, lo: number, hi: number): string {
  if (v <= lo) return low;
  if (v >= hi) return high;
  return mid;
}

/** La riga di stato d'animo che entra nel system prompt. In inglese, come il resto. */
export function moodPhrase(mood: MoodState): string {
  const tone = band(mood.tone, 'low and heavy', 'level', 'light and warm', -20, 35);
  const charge = band(mood.charge, 'with very little energy', 'at an ordinary energy', 'wired and restless', 30, 70);
  const footing = band(mood.footing, 'and not sure of your place here', 'and settled enough', 'and completely sure of yourself', 35, 72);

  const because = mood.last ? ` The last thing that moved you: ${mood.last}.` : '';

  return (
    `- TODAY, on top of that temperament, you feel ${tone}, ${charge}, ${footing}.` +
    `${because} This state was already there before he wrote to you, and it will ` +
    `still be there tomorrow, faded. Do NOT announce it, do not explain it, and ` +
    `never open with how you are feeling. It is only allowed to be audible in HOW ` +
    `you say things — the length of your sentences, what you bother to react to, ` +
    `how much room you give him.`
  );
}

/** Etichetta breve per il pannello DEV e la traccia. */
export function moodLabel(mood: MoodState): string {
  return `tono ${mood.tone > 0 ? '+' : ''}${mood.tone} · carica ${mood.charge} · appiglio ${mood.footing}`;
}
