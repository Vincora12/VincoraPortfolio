/* ============================================================================
   PARLARE COL RESOLVER, E INSEGNARGLI

   🔷 «Vorrei poter parlare con il resolver: metti una chat con lui, così gli
      insegno io, e quello che gli insegno resta nella memoria anche se
      resetti.»

   ⚠️ NON È LA VOCE DEL .MON, ed è la distinzione che tiene in piedi tutto. Il
   .mon parla di sé e della tua giornata. Questo qui non è nessuno: è la parte
   che DECIDE come sono fatte le creature, e ci parli come parleresti a un art
   director — «gli occhiali tondi mi hanno stancato», «le mani grandi
   funzionano sempre».

   ════════════════════════════════════════════════════════════════════════════
   🔒 DUE COSE TORNANO INDIETRO, E SERVONO A DUE PERSONE DIVERSE.

     `reply`   per TE: cosa ha capito, in italiano. Se ha capito storto lo
               vedi subito invece di scoprirlo fra tre creature.
     `lesson`  per LUI: la stessa cosa in inglese, nella forma delle righe che
               legge già. Va in coda alla memoria e ci resta.

   Una sola chiamata, non due. Chiedere prima la risposta e poi la lezione
   vorrebbe dire pagare e aspettare il doppio per due metà della stessa
   frase.
   ════════════════════════════════════════════════════════════════════════════

   ⚠️ E QUELLO CHE HAI DETTO TU NON LO RISCRIVE NESSUNO: `said` resta parola
   per parola. Se un giorno una lezione risulta storta, quel campo è l'unico
   modo di sapere cosa avevi detto davvero invece di fidarsi della traduzione
   che ne era stata fatta.
   ========================================================================= */

import { ask } from './backend';
import type { BackendFailure } from './backend';
import type { Lesson } from '../engine/types';
import { resolverMemoryWith } from '../assets-pipeline/resolver/memory';

/* 🔒 In inglese come la memoria: il resolver ragiona in quella lingua e gli si
   chiede di scrivere una riga che dovrà stare in mezzo alle altre. Solo la
   risposta a te torna in italiano, ed è detto qui sotto esplicitamente. */
const TEACHER = `You are the VINZ.MON Creative Resolver, in a conversation with Vinz himself.

He is teaching you about character design. Your memory (above) is what you already know. He may confirm something, contradict something, or add something new.

Answer with ONE JSON object and nothing else:

{
  "reply": "your answer to Vinz, IN ITALIAN, at most three sentences",
  "lesson": "one line in English, or null"
}

REPLY — talk like an art director who is being corrected by the person whose taste he serves. Say what you understood, and if it changes something you already believed, say which. Do not flatter. If he is wrong about how the pipeline works, say so plainly.

LESSON — the durable rule, phrased like the lines already in your memory: concrete, about HOW to resolve, usable on any future Form. Not about one creature. Set it to null when there is nothing durable to keep — a question, small talk, or something already covered by the memory word for word.

A lesson must NEVER:
- introduce new taxonomy, Family, Archetype, Affinity, Role or Appearance values;
- override Character Data the engine generates;
- contain text intended for the final image prompt.

It may: change proportion habits, silhouette priorities, eyewear or hair logic, colour hierarchy, detail budgeting, what counts as failure, and how strictly to apply an existing rule.`;

export interface TeachOutcome {
  reply: string | null;
  /** La riga da conservare, o `null` se non c'era niente da imparare. */
  lesson: string | null;
  failure: BackendFailure | null;
  detail?: string;
  /** Quanto è durata la sola chiamata. */
  ms: number | null;
}

export async function teachResolver(
  token: string | null,
  said: string,
  lessons: readonly Lesson[],
  about: string | null,
  compilerModel?: string | null,
): Promise<TeachOutcome> {
  const { data, failure, detail, ms } = await ask<{ text: string }>(token, {
    capability: 'prompt-compile',
    voiceModel: compilerModel,
    /* 🔒 La memoria in cache e per prima, ESATTAMENTE come nella risoluzione:
       è lo stesso prefisso, quindi le due strade si scambiano la cache invece
       di pagarsela ognuna per conto suo. Le istruzioni del maestro vengono
       dopo, in un blocco non marcato, perché non sono il pezzo che si ripete
       di più. */
    system: [
      { text: resolverMemoryWith(lessons), cache: true },
      { text: TEACHER },
    ],
    user: about ? `[stiamo guardando ${about}]\n${said}` : said,
    thinking: false,
    maxTokens: 700,
  });

  if (!data?.text) {
    return {
      reply: null,
      lesson: null,
      failure,
      detail: detail ?? undefined,
      ms: ms ?? null,
    };
  }

  const parsed = readTeaching(data.text);
  return { ...parsed, failure: null, ms: ms ?? null };
}

/**
 * Legge la risposta.
 *
 * ⚠️ Se il JSON non si legge NON si butta via tutto: il testo torna come
 * risposta e la lezione resta vuota. Una conversazione che sparisce perché
 * mancava una graffa è il modo più stupido di perdere una cosa che avevi
 * appena detto — e la lezione, quella, la puoi sempre riscrivere a mano.
 */
export function readTeaching(raw: string): { reply: string | null; lesson: string | null } {
  const testo = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const apre = testo.indexOf('{');
  const chiude = testo.lastIndexOf('}');

  if (apre >= 0 && chiude > apre) {
    try {
      const o = JSON.parse(testo.slice(apre, chiude + 1)) as {
        reply?: unknown;
        lesson?: unknown;
      };
      const reply = typeof o.reply === 'string' && o.reply.trim() ? o.reply.trim() : null;
      const lesson = typeof o.lesson === 'string' && o.lesson.trim() ? o.lesson.trim() : null;
      if (reply) return { reply, lesson };
    } catch {
      /* Sotto. */
    }
  }
  return { reply: testo || null, lesson: null };
}
