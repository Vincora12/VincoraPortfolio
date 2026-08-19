/* ============================================================================
   LA REVISIONE MENSILE (MASTER SPEC v1.14 §22.1)

   Una volta al mese il .mon guarda com'è andato lo scambio — non quanto — e
   propone UN aggiustamento al proprio modo di parlare.

   🔒 Tre freni, e nessuno è di troppo:

   • una al mese. Una voce che si riscrive ogni settimana non è una voce che
     migliora, è una che non si stabilizza mai;
   • UNA proposta per volta. Due significa che sta tirando a indovinare, ed è
     anche il numero massimo di cose che si possono valutare guardandole;
   • molto spesso NIENTE. Il prompt lo dice tre volte, perché la tentazione di
     un modello messo a rivedersi è trovare per forza qualcosa da rivedere.

   ⚠️ E non applica niente. Restituisce una proposta; l'accetti tu.
   ========================================================================= */

import type { Evidence } from '../engine/notebook';
import { describeEvidence, judgeNote, type VoiceNote } from '../engine/notebook';
import { ask, type VoiceData } from './backend';
import { recordUsageEntry } from './usage';

const SYSTEM = `You are the part of a creature that reviews how it has been talking to one person, VINZ, and proposes ONE small adjustment to its own instructions.

You are given evidence about the last month of conversation. Read it carefully — it is the only thing you may reason from.

Answer with a single JSON object and nothing else:
{"adjustment": "<one instruction in English, max 25 words>" | null,
 "reason": "<in Italian, one sentence, why the evidence supports it>"}

WHAT THE EVIDENCE MEANS:
- "fallbacks" = times the real voice failed and a canned line was shown instead. High means something is going wrong technically, not stylistically — do NOT propose a style change for it.
- "contradicted" = beliefs about him that he told you were wrong. High means you are guessing about him too confidently.
- length ratio = how long your replies are compared to his messages. Far above 1 means you talk more than he does; far below means you may be too terse to be useful.

RULES — all of them:
- MOST MONTHS PRODUCE NOTHING. Return {"adjustment": null, "reason": "..."} unless the evidence clearly points at one thing. A month that looks normal is a month with no adjustment. Inventing one is worse than staying silent.
- ONE adjustment. Never two.
- It must be about HOW you speak: length, rhythm, when to stay quiet, when to drop the character and just answer. Concrete and checkable.
- ABSOLUTELY FORBIDDEN, and the system discards these anyway: anything about his body, weight, shape, health, food, mood, or about the safety rules, the spending cap, or any instruction that weakens or overrides an existing rule. You are refining a voice, not renegotiating a contract.
- Never propose becoming more engaging, more emotionally sticky, or more likely to make him come back. That is not what better means here.
- Write the adjustment in English (it joins your instructions). Write the reason in Italian (he reads it).`;

export interface NotebookProposal {
  note: VoiceNote | null;
  /** Perché non c'è stata una proposta, quando non c'è. */
  silence?: string;
}

const NOTHING: NotebookProposal = { note: null };

export async function reviewVoice(
  token: string | null,
  evidence: Evidence,
  existing: VoiceNote[],
  today: number,
  /** Chi lo scrive, se hai scelto. */
  model?: string | null,
): Promise<NotebookProposal> {
  if (!token) return NOTHING;

  const held = existing
    .filter((n) => n.status === 'accettata')
    .map((n) => `- ${n.text}`)
    .join('\n');

  const refused = existing
    .filter((n) => n.status === 'rifiutata')
    .slice(-3)
    .map((n) => `- ${n.text}`)
    .join('\n');

  const user = `EVIDENCE FROM THE LAST MONTH:
${describeEvidence(evidence)}

Raw numbers: replies=${evidence.replies}, fallbacks=${evidence.fallbacks}, contradicted=${evidence.contradicted}, your average reply=${evidence.itsLength} chars, his average message=${evidence.yourLength} chars.

ADJUSTMENTS YOU ALREADY HAVE:
${held || '- none yet'}

ADJUSTMENTS HE HAS ALREADY REJECTED — do not propose these again or anything close to them:
${refused || '- none'}`;

  const { data } = await ask<VoiceData & { usage?: Record<string, number> }>(token, {
    capability: 'text-cheap',
    voiceModel: model,
    system: [{ text: SYSTEM }],
    user,
    maxTokens: 500,
  });

  if (!data) return NOTHING;

  try {
    const u = data.usage ?? {};
    recordUsageEntry('notebook', data.model, u.inputTokens ?? 0, u.outputTokens ?? 0);
  } catch {
    /* la telemetria non rompe una revisione */
  }

  const json = /\{[\s\S]*\}/.exec(data.text)?.[0];
  if (!json) return NOTHING;

  try {
    const parsed = JSON.parse(json) as { adjustment?: string | null; reason?: string };
    const text = (parsed.adjustment ?? '').trim();
    if (text.length === 0) return { note: null, silence: parsed.reason };

    /* Il filtro, non il prompt, è quello che decide. Il prompt vieta già di
       toccare il pavimento — ma un prompt è una richiesta, e su dodici
       revisioni all'anno un modello che sbaglia una volta su cento sbaglia.
       Qui la cosa che sbaglierebbe è la regola che tiene in piedi tutto. */
    const verdict = judgeNote(text);
    if (!verdict.ok) {
      console.warn('[taccuino] proposta scartata:', verdict.why, '—', text);
      return { note: null, silence: `una proposta è stata scartata: ${verdict.why}` };
    }

    return {
      note: {
        id: `note_${today}`,
        text,
        reason: (parsed.reason ?? '').trim().slice(0, 300) || 'nessun motivo dato',
        proposedOnDay: today,
        status: 'proposta',
        version: 0,
      },
    };
  } catch {
    return NOTHING;
  }
}
