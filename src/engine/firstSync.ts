/* ============================================================================
   FIRST SYNC — IL TEST DEI 16 TIPI
   (VINZMON_COMPLETE_NARRATIVE_SYSTEM_FOR_CLAUDE v4 §3)

   🔷 «Il primo incontro comincia con un test stile 16Personalities.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ TRE COSE CHE SI SOMIGLIANO E NON SONO LA STESSA COSA. Il brief lo dice
   in tre punti diversi perché è l'errore che si fa per primo:

     FIRST SYNC (qui)      i 16 tipi — E/I, N/S, T/F, J/P. È il test che fa
                           L'UTENTE, una volta, all'inizio.
     SIGNAL SCAN (vecchio) le 12 domande di `personalityScan.ts`. Resta per i
                           salvataggi già cominciati, non per chi arriva ora.
     ARCHETIPI NARRATIVI   i 12 di Jung (HERO, REBEL…) in `generation-config`.
                           Descrivono il MON, mai l'utente, e si assegnano da
                           soli — nessuno li sceglie rispondendo a domande.

   Confonderli vorrebbe dire far scegliere all'utente il carattere della
   creatura, che è precisamente quello che §12 della MASTER SPEC vieta.
   ════════════════════════════════════════════════════════════════════════════

   🔒 NON È UNA DIAGNOSI, E IL BRIEF INSISTE. «Treat it as creative/product
   input, not as a validated psychometric diagnosis or a permanent truth about
   the user.» Quindi: niente percentuali in interfaccia, mai la frase «questa
   è la tua vera personalità», e il risultato resta materiale generativo — la
   lente con cui si legge la prima creatura, non un'etichetta appiccicata a
   chi la sta usando.

   ── Cosa esce da qui ────────────────────────────────────────────────────────

   Due cose insieme, e servono a due lettori diversi:

     `type`   uno dei 16 codici. Lo legge lo strato narrativo — la lente
              iniziale con cui si interpretano le tre uova.
     `seed`   i 16 assi di `PERSONALITY_KEYS` (§2). Li legge IL MOTORE, che
              non sa niente di MBTI e non deve saperlo: continua a ricevere
              esattamente la forma che riceveva dal Signal Scan.

   🔒 È il motivo per cui questo file produce ANCHE un `PersonalitySeed` invece
   di sostituirlo con quattro lettere: sotto, il generatore non cambia di una
   riga. Il brief §1 lo chiede esplicitamente — «extend, do not rebuild».
   ========================================================================= */

import { PERSONALITY_KEYS, type PersonalityKey, type PersonalitySeed } from './signals';

/* --- Le quattro dimensioni ------------------------------------------------- */

/** I quattro assi bipolari di §3. Ogni domanda ne muove uno solo. */
export type Dimension = 'EI' | 'NS' | 'TF' | 'JP';
export const DIMENSIONS: readonly Dimension[] = ['EI', 'NS', 'TF', 'JP'];

/** Il polo verso cui una risposta spinge. */
export type Pole = 'E' | 'I' | 'N' | 'S' | 'T' | 'F' | 'J' | 'P';

const POLES_OF: Record<Dimension, readonly [Pole, Pole]> = {
  EI: ['E', 'I'],
  NS: ['N', 'S'],
  TF: ['T', 'F'],
  JP: ['J', 'P'],
};

/* --- I sedici tipi --------------------------------------------------------- */

export interface TypeDef {
  id: string;
  /** L'etichetta comune. Si può mostrare: è un nome, non un verdetto. */
  label: string;
  /**
   * La tendenza creativa che il tipo suggerisce.
   *
   * 🔒 «Useful creative tendency (not diagnosis)» — la colonna del brief si
   * chiama così apposta, e il testo qui sotto non dice mai come l'utente È:
   * dice da dove si comincia a immaginare la creatura.
   */
  tendency: string;
}

export const TYPES: readonly TypeDef[] = [
  { id: 'INTJ', label: 'Architetto', tendency: 'strategico, indipendente, orientato ai sistemi' },
  { id: 'INTP', label: 'Logico', tendency: 'analitico, esplorativo, orientato ai concetti' },
  { id: 'ENTJ', label: 'Comandante', tendency: 'deciso, organizzatore, orientato all’obiettivo' },
  { id: 'ENTP', label: 'Contestatore', tendency: 'inventivo, incalzante, orientato alle possibilità' },
  { id: 'INFJ', label: 'Avvocato', tendency: 'riflessivo, guidato da un ideale, orientato agli schemi' },
  { id: 'INFP', label: 'Mediatore', tendency: 'guidato dai valori, immaginativo, esploratore verso l’interno' },
  { id: 'ENFJ', label: 'Protagonista', tendency: 'relazionale, espressivo, capace di mettere in moto' },
  { id: 'ENFP', label: 'Animatore', tendency: 'curioso, pieno di energia, in cerca di possibilità' },
  { id: 'ISTJ', label: 'Logista', tendency: 'strutturato, affidabile, attento al dettaglio' },
  { id: 'ISFJ', label: 'Difensore', tendency: 'di appoggio, attento, orientato alla continuità' },
  { id: 'ESTJ', label: 'Dirigente', tendency: 'organizzato, pragmatico, concentrato sull’esecuzione' },
  { id: 'ESFJ', label: 'Console', tendency: 'sociale, di appoggio, orientato a tenere insieme' },
  { id: 'ISTP', label: 'Virtuoso', tendency: 'pratico, adattabile, risolutore' },
  { id: 'ISFP', label: 'Avventuriero', tendency: 'sensibile, estetico, flessibile, guidato dall’esperienza' },
  { id: 'ESTP', label: 'Imprenditore', tendency: 'orientato all’azione, reattivo, a suo agio col rischio' },
  { id: 'ESFP', label: 'Intrattenitore', tendency: 'espressivo, sociale, concentrato sul presente' },
];

export function typeDef(id: string): TypeDef {
  return TYPES.find((t) => t.id === id) ?? TYPES[0]!;
}

/* --- Le domande ------------------------------------------------------------ */

/**
 * Quanto una risposta sposta i 16 assi del motore.
 *
 * ⚠️ Stessa scala e stesso significato di `NUDGE` in `personalityScan.ts`: i
 * due test alimentano lo STESSO seme, e due scale diverse vorrebbero dire due
 * popolazioni di creature diverse a seconda di quale onboarding hai fatto.
 */
export const NUDGE = { strong: 15, normal: 10, weak: 6 } as const;
const { strong: S, normal: N, weak: W } = NUDGE;

type Nudge = Partial<Record<PersonalityKey, number>>;

export interface SyncAnswer {
  id: string;
  label: string;
  /** Il polo della dimensione della domanda verso cui questa risposta pesa. */
  pole: Pole;
  /** Quanto sposta gli assi del motore. */
  nudge: Nudge;
}

export interface SyncQuestion {
  index: number;
  dimension: Dimension;
  question: string;
  answers: readonly [SyncAnswer, SyncAnswer];
}

/**
 * Sedici domande, quattro per dimensione.
 *
 * 🔒 QUATTRO PER DIMENSIONE È IL MINIMO ONESTO. Il brief chiede di «preservare
 * abbastanza copertura da distinguere i 16 tipi»: con una o due domande per
 * asse un tipo si ribalta per un tocco distratto, e il risultato somiglierebbe
 * a un test di quelli che si fanno per noia. Con quattro, un asse si decide
 * a maggioranza e il pareggio è possibile ma raro.
 *
 * ⚠️ SCELTA FRA DUE, NON UNA SCALA. Una scala «quanto sei d'accordo da 1 a 5»
 * è il formato dei test veri, ed è anche il formato che fa sembrare tutto un
 * modulo da compilare. Due strade concrete costringono a scegliere e si
 * leggono come un rito — che è quello che §3.1 chiede.
 */
export const SYNC_QUESTIONS: readonly SyncQuestion[] = [
  /* --- E / I : dove si ricarica ------------------------------------------- */
  {
    index: 1,
    dimension: 'EI',
    question: 'Una serata libera, senza obblighi. Cosa la salva?',
    answers: [
      { id: 'people', label: 'Gente, rumore, qualcuno da incontrare', pole: 'E', nudge: { social: S, theatricality: N, confidence: W } },
      { id: 'alone', label: 'Casa, silenzio, nessuno che bussa', pole: 'I', nudge: { mystery: N, patience: N, social: -N } },
    ],
  },
  {
    index: 2,
    dimension: 'EI',
    question: 'Hai avuto un’idea. Il primo istinto qual è?',
    answers: [
      { id: 'say', label: 'Dirla subito a qualcuno e vedere che succede', pole: 'E', nudge: { social: N, impulsivity: N, confidence: N } },
      { id: 'keep', label: 'Tenerla, girarci intorno, dirla quando è pronta', pole: 'I', nudge: { patience: S, mystery: N, precision: W } },
    ],
  },
  {
    index: 3,
    dimension: 'EI',
    question: 'Dopo una giornata piena di persone, come stai?',
    answers: [
      { id: 'charged', label: 'Carico. Ne farei un’altra', pole: 'E', nudge: { social: S, confidence: N, playfulness: W } },
      { id: 'drained', label: 'Svuotato. Mi serve il vuoto', pole: 'I', nudge: { stoicism: N, mystery: N, social: -S } },
    ],
  },
  {
    index: 4,
    dimension: 'EI',
    question: 'In una stanza di sconosciuti, dove ti trovo?',
    answers: [
      { id: 'centre', label: 'In mezzo, a parlare con chiunque', pole: 'E', nudge: { social: S, theatricality: S, confidence: N } },
      { id: 'edge', label: 'Sul bordo, con una persona sola', pole: 'I', nudge: { mystery: S, patience: N, social: -N } },
    ],
  },

  /* --- N / S : da dove arrivano le informazioni ---------------------------- */
  {
    index: 5,
    dimension: 'NS',
    question: 'Guardi una cosa nuova. Cosa noti per primo?',
    answers: [
      { id: 'could', label: 'Cosa potrebbe diventare', pole: 'N', nudge: { curiosity: S, novelty: N, weirdness: W } },
      { id: 'is', label: 'Com’è fatta esattamente adesso', pole: 'S', nudge: { precision: S, discipline: N, control: W } },
    ],
  },
  {
    index: 6,
    dimension: 'NS',
    question: 'Ti fidi di più di…',
    answers: [
      { id: 'hunch', label: 'Una sensazione che non sai spiegare', pole: 'N', nudge: { weirdness: S, curiosity: N, mystery: N } },
      { id: 'proof', label: 'Una cosa che hai visto succedere', pole: 'S', nudge: { precision: N, stoicism: N, discipline: N } },
    ],
  },
  {
    index: 7,
    dimension: 'NS',
    question: 'Ti raccontano una storia. Cosa ti resta addosso?',
    answers: [
      { id: 'meaning', label: 'Cosa voleva dire, sotto', pole: 'N', nudge: { curiosity: S, mystery: N, novelty: W } },
      { id: 'detail', label: 'Un dettaglio preciso, una cosa vista', pole: 'S', nudge: { precision: S, patience: N, discipline: W } },
    ],
  },
  {
    index: 8,
    dimension: 'NS',
    question: 'Scegli il posto dove torneresti.',
    answers: [
      { id: 'strange', label: 'Uno che non hai ancora capito', pole: 'N', nudge: { novelty: S, curiosity: N, weirdness: N } },
      { id: 'known', label: 'Uno che conosci a memoria', pole: 'S', nudge: { discipline: N, patience: S, stoicism: W } },
    ],
  },

  /* --- T / F : come si decide ---------------------------------------------- */
  {
    index: 9,
    dimension: 'TF',
    question: 'Un amico ha sbagliato e lo sa. Tu cosa fai?',
    answers: [
      { id: 'straight', label: 'Glielo dico chiaro, serve a lui', pole: 'T', nudge: { control: N, precision: N, stoicism: N } },
      { id: 'soften', label: 'Prima gli sto vicino, il resto dopo', pole: 'F', nudge: { social: N, patience: S, adaptability: W } },
    ],
  },
  {
    index: 10,
    dimension: 'TF',
    question: 'Una decisione difficile si regge su…',
    answers: [
      { id: 'logic', label: 'Cosa funziona, anche se non piace', pole: 'T', nudge: { control: S, precision: N, stoicism: N } },
      { id: 'values', label: 'Cosa ti sembra giusto, anche se costa', pole: 'F', nudge: { adaptability: N, playfulness: W, social: N } },
    ],
  },
  {
    index: 11,
    dimension: 'TF',
    question: 'Ti fanno un complimento che non meriti.',
    answers: [
      { id: 'correct', label: 'Correggo. La precisione conta', pole: 'T', nudge: { precision: S, control: N, vanity: -W } },
      { id: 'accept', label: 'Lo prendo. Era un gesto, non un dato', pole: 'F', nudge: { social: N, playfulness: N, adaptability: N } },
    ],
  },
  {
    index: 12,
    dimension: 'TF',
    question: 'Cosa ti dà più fastidio in una discussione?',
    answers: [
      { id: 'illogic', label: 'Un ragionamento che non sta in piedi', pole: 'T', nudge: { precision: S, stoicism: N, control: W } },
      { id: 'coldness', label: 'Qualcuno trattato male per avere ragione', pole: 'F', nudge: { social: S, patience: N, adaptability: W } },
    ],
  },

  /* --- J / P : come si sta nel tempo --------------------------------------- */
  {
    index: 13,
    dimension: 'JP',
    question: 'Parti per un viaggio. Come ci arrivi?',
    answers: [
      { id: 'planned', label: 'Con tutto già deciso', pole: 'J', nudge: { discipline: S, control: N, patience: W } },
      { id: 'open', label: 'Con il biglietto e basta', pole: 'P', nudge: { impulsivity: S, adaptability: N, novelty: N } },
    ],
  },
  {
    index: 14,
    dimension: 'JP',
    question: 'Una cosa da fare entro venerdì. Quando la fai?',
    answers: [
      { id: 'early', label: 'Subito, così è fatta', pole: 'J', nudge: { discipline: S, control: N, precision: W } },
      { id: 'late', label: 'Quando arriva il momento giusto', pole: 'P', nudge: { adaptability: S, impulsivity: N, patience: -W } },
    ],
  },
  {
    index: 15,
    dimension: 'JP',
    question: 'Il piano salta all’ultimo.',
    answers: [
      { id: 'annoyed', label: 'Mi dà fastidio. Avevo organizzato', pole: 'J', nudge: { control: S, discipline: N, patience: -W } },
      { id: 'fine', label: 'Meglio. Si apre qualcos’altro', pole: 'P', nudge: { adaptability: S, novelty: N, playfulness: N } },
    ],
  },
  {
    index: 16,
    dimension: 'JP',
    question: 'Come ti trovi meglio a lavorare?',
    answers: [
      { id: 'closed', label: 'Una cosa alla volta, chiusa prima della prossima', pole: 'J', nudge: { discipline: S, precision: N, control: N } },
      { id: 'many', label: 'Tante aperte, salto dove tira', pole: 'P', nudge: { impulsivity: N, novelty: S, adaptability: N } },
    ],
  },
];

/* --- Il risultato ---------------------------------------------------------- */

/** Le risposte date, per indice di domanda. */
export type SyncAnswers = Record<number, string>;

export function isSyncComplete(answers: SyncAnswers): boolean {
  return SYNC_QUESTIONS.every((q) => typeof answers[q.index] === 'string');
}

export interface FirstSyncResult {
  /** Uno dei 16 codici, per esempio `INTJ`. */
  type: string;
  /**
   * Quante risposte sono andate a ciascun polo, per dimensione.
   *
   * ⚠️ NON SI MOSTRA COME PERCENTUALE. §3.1: «Do not show percentages by
   * default». Serve a DEV e al narratore — sapere che un asse è 4-0 invece
   * di 3-1 cambia quanto quella lente pesa, e questo il modello lo può usare
   * senza che diventi un numero sullo schermo.
   */
  counts: Record<Pole, number>;
  /** Quando è stato fatto. Un test è un momento, non una proprietà. */
  takenAt: string;
}

/**
 * Da risposte a tipo.
 *
 * 🔒 IL PAREGGIO NON RESTA IN SOSPESO. Con quattro domande per asse un 2-2 è
 * possibile, e un tipo a tre lettere non esiste. Vince il polo dichiarato per
 * primo in `POLES_OF` — arbitrario, ma DICHIARATO e stabile: due volte lo
 * stesso pareggio danno lo stesso tipo, che è la sola cosa che conta perché
 * il seme resti riproducibile (§29).
 */
export function resolveType(answers: SyncAnswers): { type: string; counts: Record<Pole, number> } {
  const counts = { E: 0, I: 0, N: 0, S: 0, T: 0, F: 0, J: 0, P: 0 } as Record<Pole, number>;

  for (const q of SYNC_QUESTIONS) {
    const chosen = q.answers.find((a) => a.id === answers[q.index]);
    if (!chosen) continue;
    counts[chosen.pole] += 1;
  }

  const type = DIMENSIONS.map((d) => {
    const [first, second] = POLES_OF[d];
    return counts[second] > counts[first] ? second : first;
  }).join('');

  return { type, counts };
}

/**
 * Da risposte al seme che legge il motore.
 *
 * Stessa disciplina di `seedFromAnswers`: si parte dal neutro e si spinge. Chi
 * salta metà test ha un seme più piatto, non un seme sbagliato — «dato
 * mancante = sconosciuto, mai fallimento».
 */
export function seedFromSync(answers: SyncAnswers): PersonalitySeed {
  const seed = PERSONALITY_KEYS.reduce((acc, k) => {
    acc[k] = 50;
    return acc;
  }, {} as PersonalitySeed);

  for (const q of SYNC_QUESTIONS) {
    const chosen = q.answers.find((a) => a.id === answers[q.index]);
    if (!chosen) continue;
    for (const [key, delta] of Object.entries(chosen.nudge)) {
      const k = key as PersonalityKey;
      seed[k] = Math.max(0, Math.min(100, seed[k] + delta));
    }
  }

  return seed;
}

/** Tutto il risultato in un colpo, come lo salva lo store. */
export function firstSyncResult(answers: SyncAnswers): FirstSyncResult {
  const { type, counts } = resolveType(answers);
  return { type, counts, takenAt: new Date().toISOString() };
}

/**
 * Come il tipo entra nel prompt della creatura.
 *
 * 🔒 UNA LENTE, NON UNA SCHEDA. Il brief §3 vuole il risultato come «initial
 * personality lens for generation», e §15 vieta che una lettura psicologica
 * diventi un fatto. Quindi questa riga descrive DA DOVE si guarda, e non
 * dice mai «l'utente è così».
 */
export function lensLine(result: FirstSyncResult): string {
  const def = typeDef(result.type);
  return `Lente iniziale del First Sync: ${result.type} — ${def.tendency}. È il punto da cui guardare questa creatura, non una descrizione di chi la sta facendo nascere.`;
}
