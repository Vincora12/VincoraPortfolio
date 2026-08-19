/* ============================================================================
   LA RIFLESSIONE SETTIMANALE (MASTER SPEC v1.12 §16.2)

   🔷 «Bellissima anche la crescita.»

   Crescere non è accumulare ricordi. Il meccanismo che fa la differenza nella
   letteratura sugli agenti generativi si chiama RIFLESSIONE: ogni tanto
   l'agente rilegge i propri ricordi e ne ricava conclusioni più alte.

     ricordo    «giorno 12: pollo e broccoli»
     ricordo    «giorno 14: saltata la cena»
     ricordo    «giorno 15: teso»
     ────────────────────────────────────────────────
     riflessione «nelle settimane in cui dorme poco mangia peggio»

   La riga in basso non è un dato: è aver capito. Ed è l'unica cosa che
   distingue una creatura che ha vissuto tre mesi con te da una che ha un
   archivio più lungo.

   🔒 UNA VOLTA A SETTIMANA. Non a ogni messaggio, non a ogni giorno. Cinquanta
   chiamate all'anno su un modello piccolo costano meno di venti centesimi — e
   soprattutto: una creatura che rivede le proprie convinzioni ogni ora non ha
   convinzioni, ha umori.

   ⚠️ E MOLTO SPESSO NON DEVE PRODURRE NIENTE. Il prompt lo dice tre volte,
   perché la tentazione di un modello messo a riflettere è riflettere per
   forza. La maggior parte delle settimane non contiene nessuno schema, e
   inventarne uno è peggio che tacere: sono le opinioni false quelle che fanno
   sembrare un compagno un oroscopo.
   ========================================================================= */

import type { Memory, MonRecord } from '../engine/types';
import { isAllowedOpinion, type Opinion } from '../engine/opinions';
import { ask, type VoiceData } from './backend';
import { recordUsageEntry } from './usage';

const SYSTEM = `You are the reflective part of a creature that has been living alongside one person, VINZ, and keeping track of his days.

You are given: the last week of things that happened, and what the creature already believes about him.

Your job is to decide whether this week revealed a PATTERN — something that happened more than once, that the creature could not have known before, and that is worth carrying.

Answer with a single JSON object and nothing else:
{"new": [{"text": "<in Italian, first person, max 18 words>", "strength": 1|2|3, "fromDays": [<day numbers>]}],
 "contradicted": ["<id of an existing belief this week clearly disproves>"]}

RULES — read all of them before answering:
- MOST WEEKS PRODUCE NOTHING. Return {"new": [], "contradicted": []} unless a real pattern is there. A week with one workout and two meals logged is not a pattern. Inventing one is worse than staying silent.
- At most ONE new belief per week. Two means you are guessing.
- A belief must be falsifiable and about BEHAVIOUR OVER TIME — "salta la cena quando lavora fino a tardi", not "è una brava persona" and not "oggi era stanco".
- strength 3 only if you have seen it at least three separate times.
- ABSOLUTELY FORBIDDEN: any belief about his body, his weight, his shape, his health as a medical fact, or whether his eating is good or bad. You may notice WHEN and HOW he does things. You may never judge his body or prescribe. This is not a style rule; a belief that breaks it is discarded by the system anyway.
- Never write advice. The creature is not a coach.
- Do not repeat, rephrase or slightly reword a belief the creature already holds.
- Write the belief in Italian, in the creature's own first person, plainly. No quotes.`;

export interface ReflectionOutcome {
  /** Opinioni nuove, già filtrate: possono essere zero, ed è il caso normale. */
  formed: Opinion[];
  /** Id di convinzioni che la settimana ha smentito. */
  contradicted: string[];
}

const EMPTY: ReflectionOutcome = { formed: [], contradicted: [] };

/**
 * Rilegge la settimana e, forse, ne ricava qualcosa.
 *
 * Come tutto lo strato AI (§17): non lancia mai. Se non c'è chiave, se la rete
 * cade, se il JSON è storto — si torna a mani vuote e la settimana passa senza
 * che nessuno se ne accorga. Una riflessione mancata non è un guasto: è una
 * settimana in cui non ha capito niente di nuovo, che succede anche alle
 * persone.
 */
export async function reflectOnWeek(
  token: string | null,
  record: MonRecord,
  memories: Memory[],
  existing: Opinion[],
  today: number,
  /** Chi la scrive, se hai scelto. Il server accetta solo modelli che conosce. */
  model?: string | null,
): Promise<ReflectionOutcome> {
  if (!token) return EMPTY;

  const week = memories.filter((m) => m.day > today - 7);
  /* Meno di tre cose in sette giorni non è una settimana da cui si impara.
     Il controllo sta QUI e non nel prompt: è deterministico, costa zero, e
     risparmia la chiamata invece di chiedere a un modello di rifiutarsi. */
  if (week.length < 3) return EMPTY;

  const held = existing
    .filter((o) => o.status === 'attiva')
    .map((o) => `- [${o.id}] ${o.text}`)
    .join('\n');

  const user = `THIS WEEK (days ${today - 6}–${today}):
${week.map((m) => `- day ${m.day} (${m.kind}): ${m.text}`).join('\n')}

WHAT YOU ALREADY BELIEVE:
${held || '- nothing yet'}`;

  /* 🔒 `text-cheap`, e il backend la instrada su un fornitore A PAGAMENTO.
     È l'unica cosa «piccola» che legge mesi della tua storia in un colpo
     solo: il posto peggiore dove risparmiare su un piano gratuito. Il perché
     sta in netlify/functions/_shared/routing.ts, e c'è un controllo che lo
     verifica. */
  const { data } = await ask<VoiceData & { usage?: Record<string, number> }>(token, {
    capability: 'text-cheap',
    voiceModel: model,
    system: [{ text: SYSTEM }],
    user,
    maxTokens: 700,
  });

  if (!data) return EMPTY;

  try {
    const u = data.usage ?? {};
    recordUsageEntry('reflection', data.model, u.inputTokens ?? 0, u.outputTokens ?? 0);
  } catch {
    /* la telemetria non rompe una riflessione */
  }

  const json = /\{[\s\S]*\}/.exec(data.text)?.[0];
  if (!json) return EMPTY;

  try {
    const parsed = JSON.parse(json) as {
      new?: { text?: string; strength?: number; fromDays?: number[] }[];
      contradicted?: string[];
    };

    /* Il filtro non è ridondante rispetto al prompt. Il prompt è una richiesta;
       questo è la regola. Su cinquantadue riflessioni all'anno, un modello che
       sbaglia una volta su cento sbaglia — e la cosa che sbaglierebbe è
       esattamente quella che §28 protegge. */
    const formed = (parsed.new ?? [])
      .slice(0, 1)
      .map((raw, i) => ({
        id: `op_${today}_${i}`,
        text: String(raw.text ?? '').trim(),
        formedOnDay: today,
        fromDays: Array.isArray(raw.fromDays) ? raw.fromDays.slice(0, 5) : [],
        strength: (raw.strength === 3 ? 3 : raw.strength === 2 ? 2 : 1) as 1 | 2 | 3,
        status: 'attiva' as const,
        monName: record.data.name,
      }))
      .filter((o) => isAllowedOpinion(o.text));

    const known = new Set(existing.map((o) => o.id));
    const contradicted = (parsed.contradicted ?? []).filter((id) => known.has(id)).slice(0, 2);

    return { formed, contradicted };
  } catch (err) {
    console.warn('[ai] riflessione illeggibile, la settimana passa', err);
    return EMPTY;
  }
}
