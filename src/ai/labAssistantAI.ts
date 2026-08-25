/* ============================================================================
   CHIEDERE UNA MODIFICA A PAROLE

   🔷 «Fai in modo che escano di più gli occhiali da vista. E quindi poi lo
      provo.» — l'esempio che ha aperto tutto questo.

   Stesso schema di `notebook.ts`: un modello propone in JSON, il codice
   valida, e SOLO il codice decide se applicare — mai la fiducia nel prompt.
   Qui il filtro è `applicaLista()` in `engine/labAssistant.ts`, che verifica
   ogni id contro il registro prima di toccare qualunque cosa.
   ========================================================================= */

import { ask } from './backend';
import { descrizioneRegistroPerAI, type CambioProposto } from '../engine/labAssistant';

const SYSTEM = `You are the change-proposal assistant inside VINZ.LAB, a private developer lab for VINZ.MON, a personal app. Vinz describes what he wants in Italian; you translate it into changes to EXISTING, EXPOSED configuration fields — nothing else.

You may ONLY propose an id and value that appear literally in the FIELD CATALOG below. You may NEVER invent a new id, a new category value, or a field that isn't listed. If what he's asking for has no matching field, leave "changes" empty and explain in "unsupported" instead of guessing at a close id.

FIELD CATALOG:
{{CATALOGO}}

Answer with a single JSON object and nothing else:
{"changes": [{"id": "<exact id from the catalog>", "value": "<exact allowed value for that id>", "reason": "<in Italian, one short sentence: why this answers his request>"}],
 "unsupported": "<in Italian, one sentence: what part of the request no listed field can do — or null if everything was covered>"}

RULES:
- Propose the SMALLEST set of changes that satisfies the request. "fai uscire di più gli occhiali da vista" is ONE weight change on ONE eyewear id, not five.
- Never propose more than 8 changes for one request. A request needing more is a redesign, not a tweak: return it as "unsupported" and ask him to split it.
- Weight changes (id starts with "weight:"): read the request as a DIRECTION (more/less), not a demand for an absolute number. Pick a value that visibly moves the odds without silencing every alternative — rarely 0, rarely the max unless he explicitly says "only these" or "never this".
- Catalog on/off (id starts with "catalog:"): toggle only what the request is actually about. Never turn something back on as a side effect of turning something else off.
- Design tokens (id starts with "token:"): only for genuinely global visual requests ("i bordi sono troppo sottili ovunque"). A request about ONE screen or ONE component has no matching field here — say so in "unsupported" rather than changing a global token for a local ask.
- Model routing (id starts with "model:"): only touch this if he explicitly talks about which AI model does the work, not about what the app does.
- If a request is ambiguous between two fields, propose neither and explain the ambiguity in "unsupported".
- These changes affect a REAL running personal app. You are not applying them — Vinz reviews and approves every one before anything changes.`;

export interface RispostaAssistente {
  cambi: CambioProposto[];
  nonSupportato: string | null;
  failure: string | null;
  detail?: string;
}

const VUOTO = (failure: string | null, detail?: string): RispostaAssistente => ({
  cambi: [],
  nonSupportato: null,
  failure,
  detail,
});

export async function chiediModifiche(token: string | null, richiesta: string): Promise<RispostaAssistente> {
  if (!richiesta.trim()) return VUOTO(null);

  const system = SYSTEM.replace('{{CATALOGO}}', descrizioneRegistroPerAI());

  const { data, failure, detail } = await ask<{ text: string; model: string }>(token, {
    capability: 'text-cheap',
    system: [{ text: system }],
    user: richiesta.trim(),
    maxTokens: 1200,
  });

  if (!data) return VUOTO(failure ?? 'error', detail);

  const json = /\{[\s\S]*\}/.exec(data.text)?.[0];
  if (!json) return VUOTO('error', 'la risposta non conteneva un JSON riconoscibile');

  try {
    const parsed = JSON.parse(json) as {
      changes?: { id?: string; value?: string; reason?: string }[];
      unsupported?: string | null;
    };
    const cambi: CambioProposto[] = (parsed.changes ?? [])
      .filter((c) => typeof c.id === 'string' && typeof c.value === 'string')
      .map((c) => ({ id: c.id!, valore: c.value!, motivo: (c.reason ?? '').trim() || 'nessun motivo dato' }));

    return { cambi, nonSupportato: parsed.unsupported?.trim() || null, failure: null };
  } catch {
    return VUOTO('error', 'la risposta non era JSON valido');
  }
}
