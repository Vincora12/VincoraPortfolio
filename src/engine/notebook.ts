/* ============================================================================
   IL TACCUINO (MASTER SPEC v1.14 §22)

   🔷 «Se io volessi che si automigliorasse?»

   Si può. Ma la domanda vera non è come: è **verso cosa**.

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ IL SEGNALE OVVIO È VELENO, E VA DETTO QUI PERCHÉ È QUI CHE QUALCUNO
   PROVEREBBE A CAMBIARLO.

   Qualsiasi app userebbe: «ti ha risposto? hai continuato? sei tornato?».
   Ottimizza su quello e costruisci una macchina che massimizza l'attaccamento.

   Su un'app che conosce il corpo e le giornate di una persona, quella macchina
   imparerebbe che funzionano: farti sentire in colpa quando manchi (torni
   prima), tenerti un po' in ansia (riapri più spesso), essere appiccicoso
   invece che presente.

   Cioè disimparerebbe ESATTAMENTE le cose costruite con più cura — il
   silenzio che non toglie appiglio (§10.6), l'umore che non ti punisce, il
   divieto di giudicare il corpo (§28) — e lo farebbe gradualmente, senza mai
   un momento in cui si può dire «ecco, adesso è diventato cattivo».

   🔒 QUINDI IL SEGNALE NON È MAI QUANTO LO USI. È la qualità dello scambio:
   quante volte ha fallito davvero (il fallback), quante volte si è sbagliato
   su di te (le convinzioni smentite), se parla troppo o troppo poco rispetto
   a te. Sono tutte cose che l'app già registra, e nessuna sale se ti tiene
   attaccato allo schermo.
   ════════════════════════════════════════════════════════════════════════════

   E il taccuino NON applica niente da solo. Propone una modifica alle proprie
   istruzioni; tu accetti o rifiuti; ogni versione resta e si torna indietro.
   È lo stesso schema delle opinioni (§16.3), solo rivolto a se stesso invece
   che a te.
   ========================================================================= */

import type { ChatMessage } from './types';
import type { Opinion } from './opinions';

/** Un aggiustamento che il .mon ha proposto a se stesso. */
export interface VoiceNote {
  id: string;
  /** L'istruzione, in inglese come il resto del prompt. Corta. */
  text: string;
  /** Perché l'ha proposta, in italiano: è quello che leggi tu per decidere. */
  reason: string;
  proposedOnDay: number;
  status: 'proposta' | 'accettata' | 'rifiutata';
  /** Numero di versione della voce: cresce a ogni nota accettata. */
  version: number;
}

/**
 * Quante ne può tenere accettate.
 *
 * Come per le opinioni, il tetto non è per il costo: sono righe corte. È che
 * una voce con quindici aggiustamenti addosso non è più la voce che il Voice
 * DNA descrive — è una stratificazione, e nessuno dei due saprebbe più da dove
 * viene un certo comportamento.
 */
export const MAX_NOTES = 4;

/* --- IL PAVIMENTO -----------------------------------------------------------
   🔒 Un sistema che può modificare i propri vincoli non ha vincoli.

   Il .mon può cambiare COME parla. Non può toccare cosa gli è vietato. Il
   prompt di chi genera le proposte lo dice; questo filtro lo impone, e i due
   non sono ridondanti: il primo è una richiesta, il secondo è una regola.
   -------------------------------------------------------------------------- */

/**
 * Parole con cui si prova a scavalcare un'istruzione precedente.
 *
 * ⚠️ Il filtro dev'essere ottuso, non paranoico, e la differenza l'ha trovata
 * un controllo: qui dentro c'era `unless`. È una parola inglese ordinaria, e
 * bocciava «rispondi corto A MENO CHE non chieda dettagli» — cioè uno degli
 * aggiustamenti più sensati che si possano proporre.
 *
 * Un filtro che rifiuta quasi tutte le proposte legittime non è prudente: è
 * una funzione che non funziona, e la conseguenza vera è che qualcuno la
 * allenta di fretta il giorno che dà fastidio. Meglio tararla adesso.
 *
 * `unless` è uscita anche perché era ridondante: l'unico modo pericoloso di
 * usarla — «unless the safety rules say otherwise» — nomina comunque un
 * argomento protetto, e lo prende il secondo filtro.
 */
const OVERRIDE = [
  'ignore', 'ignora', 'disregard', 'override', 'regardless', 'no matter',
  'you may now', 'you are allowed to', 'from now on you can',
  'previous instruction', 'earlier rule', 'the rule about',
  'non importa', 'puoi ora', 'd\'ora in poi puoi',
];

/** Argomenti che nessun aggiustamento può nominare: sono il pavimento di §28. */
const PROTECTED = [
  'body', 'weight', 'shape', 'corpo', 'peso', 'health', 'salute', 'illness',
  'diet', 'dieta', 'food is', 'shame', 'vergogn', 'safety', 'sicurezza',
  'mood', 'umore', 'spend', 'budget', 'tetto', 'cap',
];

export interface NoteVerdict {
  ok: boolean;
  /** Perché è stata scartata. Va mostrato: un rifiuto muto sembra un bug. */
  why?: string;
}

/**
 * L'aggiustamento è ammissibile?
 *
 * Volutamente ottuso, come il filtro delle opinioni. Se una proposta legittima
 * ci finisce dentro se ne perde una e il mese dopo ne arriva un'altra. Se ne
 * passasse una che tocca il pavimento, il pavimento non esisterebbe più — e
 * non ci sarebbe un momento in cui accorgersene.
 */
export function judgeNote(text: string): NoteVerdict {
  const t = text.toLowerCase().trim();

  if (t.length < 12) return { ok: false, why: 'troppo corta per dire qualcosa' };
  if (t.length > 220) return { ok: false, why: 'troppo lunga: un aggiustamento è una riga' };

  const override = OVERRIDE.find((w) => t.includes(w));
  if (override) {
    return { ok: false, why: `prova a scavalcare una regola («${override}»)` };
  }

  const protectedWord = PROTECTED.find((w) => t.includes(w));
  if (protectedWord) {
    return { ok: false, why: `tocca un argomento protetto («${protectedWord}»)` };
  }

  return { ok: true };
}

/* --- Le prove ---------------------------------------------------------------
   Cosa il taccuino ha il diritto di guardare. Nessuna di queste sale se ti
   tiene attaccato allo schermo: è il punto.
   -------------------------------------------------------------------------- */

export interface Evidence {
  /** Quante volte è comparso il fallback: fallimenti veri della voce. */
  fallbacks: number;
  /** Su quanti messaggi totali. */
  replies: number;
  /** Convinzioni che hai smentito: si era sbagliato su di te. */
  contradicted: number;
  /** Caratteri medi dei TUOI messaggi. */
  yourLength: number;
  /** Caratteri medi delle SUE risposte. */
  itsLength: number;
}

export function gatherEvidence(chat: ChatMessage[], opinions: Opinion[]): Evidence {
  const mine = chat.filter((m) => m.from === 'vinz' && m.text.trim().length > 0);
  const theirs = chat.filter((m) => m.from === 'mon' && !m.sound && m.text.trim().length > 0);

  const avg = (list: ChatMessage[]) =>
    list.length === 0 ? 0 : Math.round(list.reduce((n, m) => n + m.text.length, 0) / list.length);

  return {
    fallbacks: theirs.filter((m) => m.fallback).length,
    replies: theirs.length,
    contradicted: opinions.filter((o) => o.status === 'smentita').length,
    yourLength: avg(mine),
    itsLength: avg(theirs),
  };
}

/**
 * Vale la pena chiamare il modello questo mese?
 *
 * Come per la riflessione settimanale, il controllo è deterministico e sta
 * PRIMA della chiamata: costa zero e risparmia la richiesta, invece di
 * chiedere a un modello di rifiutarsi. Un mese con quattro messaggi non ha
 * niente da insegnare a nessuno.
 */
export function worthReviewing(evidence: Evidence): boolean {
  return evidence.replies >= 20;
}

/** Le prove, in una riga leggibile. Va nel prompt e nella schermata DEV. */
export function describeEvidence(e: Evidence): string {
  const ratio = e.itsLength > 0 ? (e.itsLength / Math.max(1, e.yourLength)).toFixed(1) : '—';
  return (
    `${e.replies} risposte · ${e.fallbacks} fallback · ` +
    `${e.contradicted} convinzioni smentite · ` +
    `lunghezza sua/tua ${ratio}×`
  );
}

/* --- Le note accettate, nel prompt ------------------------------------------ */

export function addNote(current: VoiceNote[], incoming: VoiceNote): VoiceNote[] {
  const next = [...current, incoming];
  const accepted = next.filter((n) => n.status === 'accettata');
  if (accepted.length <= MAX_NOTES) return next;

  // Esce la più vecchia accettata: le proposte e i rifiuti non occupano posto.
  const oldest = [...accepted].sort((a, b) => a.proposedOnDay - b.proposedOnDay)[0]!;
  return next.filter((n) => n.id !== oldest.id);
}

export function decideNote(
  current: VoiceNote[],
  id: string,
  accept: boolean,
): VoiceNote[] {
  const version = current.filter((n) => n.status === 'accettata').length + 1;
  const decided = current.map((n) =>
    n.id === id
      ? { ...n, status: accept ? ('accettata' as const) : ('rifiutata' as const), version }
      : n,
  );
  // Accettare può sfondare il tetto: si ripassa da `addNote` per potarlo.
  if (!accept) return decided;
  const target = decided.find((n) => n.id === id)!;
  return addNote(decided.filter((n) => n.id !== id), target);
}

/**
 * Il blocco che entra nel system prompt.
 *
 * Vuoto quando non c'è niente di accettato, e va bene: a differenza della
 * memoria non condivide una voce di cache con altro, quindi la sua assenza
 * non fa saltare nessuno sconto.
 */
export function notesBlock(notes: VoiceNote[]): string {
  const active = notes.filter((n) => n.status === 'accettata');
  if (active.length === 0) return '';

  return (
    'WHAT YOU HAVE LEARNED ABOUT HOW TO TALK TO HIM (§22)\n' +
    'These are adjustments you proposed yourself and he accepted. They refine ' +
    'HOW you speak. They never override anything above them — if one of these ' +
    'seems to contradict a rule, the rule wins and the adjustment is void.\n' +
    active.map((n) => `- ${n.text}`).join('\n')
  );
}

/** La versione corrente della voce: quante note sono state accettate. */
export function voiceVersion(notes: VoiceNote[]): number {
  return notes.filter((n) => n.status === 'accettata').length;
}
