/* ============================================================================
   REDIGERE LA BOZZA — «te lo dico a parole, l'AI la trasforma nella scheda
   tecnica completa»

   Stesso schema di `notebook.ts`: un modello propone in
   JSON, il codice valida, e SOLO Vincenzo — non l'AI, non il codice — decide
   se la bozza gli piace. Non applica mai niente da sola: produce un oggetto
   che la stanza mostra, editabile, prima di finire in coda.

   🔒 GLI ESEMPI VERI SONO NEL PROMPT, NON INVENTATI. Il modello vede due
   Family reali intere (coreAnatomy, drivers, absoluteRule, fit, archetipi)
   prima di scrivere la sua: è la differenza fra chiedere «scrivi una Family»
   e chiedere «scrivi una Family che stia allo stesso livello di queste due».
   ========================================================================= */

import { ask } from './backend';
import { FAMILIES, AFFINITIES, ROLES, FASHIONS, MOODS, SIGNAL_KEYS, ARCHETYPE_MASSES } from '../engine/generation-config';
import { SIMPLE_FIELD_NAME, type TaxonomyAxis, type FamilyDraft, type SimpleDraft } from '../engine/taxonomyProposals';

function esempiFamily(): string {
  return FAMILIES.slice(0, 2)
    .map(
      (f) =>
        `{"id":"${f.id}","coreAnatomy":"${f.coreAnatomy}","it":"${f.it}","drivers":"${f.drivers}","absoluteRule":"${f.absoluteRule}","fit":${JSON.stringify(f.fit)},"archetypes":${JSON.stringify(f.archetypes.map((a) => ({ id: a.id, structure: a.structure, mass: a.mass })))},"supportsHair":${f.supportsHair},"supportsEyewear":${f.supportsEyewear},"humanoidity":${JSON.stringify(f.humanoidity)}}`,
    )
    .join('\n');
}

const SIMPLE_SOURCE: Record<Exclude<TaxonomyAxis, 'family'>, readonly Record<string, string>[]> = {
  affinity: AFFINITIES as unknown as Record<string, string>[],
  role: ROLES as unknown as Record<string, string>[],
  fashion: FASHIONS as unknown as Record<string, string>[],
  mood: MOODS as unknown as Record<string, string>[],
};

function esempiSemplici(asse: Exclude<TaxonomyAxis, 'family'>): string {
  const campo = SIMPLE_FIELD_NAME[asse];
  return SIMPLE_SOURCE[asse]
    .slice(0, 3)
    .map((e) => `{"id":"${e.id}","${campo}":"${e[campo]}","it":"${e.it}"}`)
    .join('\n');
}

function sistemaFamily(): string {
  return `You are drafting a new (or revised) Family entry for VINZ.MON's character generator. A Family is the creature's species-level body plan — it feeds directly into the image-generation prompt, so every field must be written the way the real ones are: concrete, visual, English.

TWO REAL FAMILIES, for the level of detail and tone expected:
${esempiFamily()}

ALLOWED SIGNAL KEYS for "fit" (use ONLY these, never invent one):
${SIGNAL_KEYS.join(', ')}

ALLOWED VALUES for archetype "mass": ${ARCHETYPE_MASSES.join(', ')}

Vinz will describe an idea in Italian. Answer with a single JSON object and nothing else:
{"id": "<UPPERCASE_SNAKE, English, short>",
 "coreAnatomy": "<English, one line, concrete anatomical description>",
 "it": "<Italian, short, for the UI>",
 "drivers": "<English, comma-separated personality drivers, e.g. 'CARE, REC, weirdness'>",
 "absoluteRule": "<English, one line: what this Family must always show and must never collapse into>",
 "fit": {"<signalKey>": <0-0.3>, ...(4 to 8 keys, weights that read as a coherent personality profile, roughly summing near 1)},
 "archetypes": [{"id": "<English, short>", "structure": "<English, one line, concrete>", "mass": "<COMPACT|BALANCED|MASSIVE>"}, ...(4 to 6 of them)],
 "supportsHair": <true|false>,
 "supportsEyewear": <true|false, almost always true>,
 "humanoidity": [<min 2-5>, <max min..5>]}

RULES:
- id must be UPPERCASE_SNAKE, English, and not collide with an existing Family unless Vinz is explicitly revising that one (you will be told which, if so).
- absoluteRule is what stops the image model from drifting into a cliché or into another Family — be specific about the anatomy, not the vibe.
- fit keys must all come from the allowed list above.
- humanoidity floor is never below 2 (VINZ.MON must always read a facial attitude).
- Write everything that will feed a prompt in English; only "it" is Italian.`;
}

function sistemaSemplice(asse: Exclude<TaxonomyAxis, 'family'>): string {
  const campo = SIMPLE_FIELD_NAME[asse];
  const nomi: Record<typeof asse, string> = {
    affinity: 'Affinity (a contamination layered onto the body, e.g. MACHINE, PLANT)',
    role: 'Role (how the creature stands in the world, e.g. SAMURAI, WIZARD)',
    fashion: 'Fashion (a dressing logic, e.g. GOTH, TECHWEAR)',
    mood: 'Mood (a temperament the creature is born with, e.g. CUTE, AGGRESSIVE)',
  } as const;
  return `You are drafting a new (or revised) ${nomi[asse]} entry for VINZ.MON's character generator. It feeds directly into the image-generation prompt.

THREE REAL EXAMPLES, for the level of detail and tone expected:
${esempiSemplici(asse)}

Vinz will describe an idea in Italian. Answer with a single JSON object and nothing else:
{"id": "<UPPERCASE_SNAKE, English, short>",
 "${campo}": "<English, one concrete visual line — what actually changes on the body/silhouette/behaviour>",
 "it": "<Italian, short, evocative, for the UI>"}

RULES:
- id must be UPPERCASE_SNAKE, English, and not collide with an existing one unless Vinz is explicitly revising that one (you will be told which, if so).
- "${campo}" must be concrete and visual/behavioural, not a mood word alone — it has to be something an image model or the character generator can act on.`;
}

export interface RispostaBozza {
  family?: FamilyDraft;
  semplice?: SimpleDraft;
  failure: string | null;
  detail?: string;
}

export async function chiediBozza(
  token: string | null,
  asse: TaxonomyAxis,
  richiesta: string,
  basataSu: string | null,
): Promise<RispostaBozza> {
  const system = asse === 'family' ? sistemaFamily() : sistemaSemplice(asse);
  const user = basataSu
    ? `Sta rivedendo la voce esistente "${basataSu}". Idea: ${richiesta.trim()}`
    : richiesta.trim();

  const { data, failure, detail } = await ask<{ text: string; model: string }>(token, {
    capability: 'text-cheap',
    system: [{ text: system }],
    user,
    maxTokens: 1200,
  });

  if (!data) return { failure: failure ?? 'error', detail };

  const json = /\{[\s\S]*\}/.exec(data.text)?.[0];
  if (!json) return { failure: 'error', detail: 'la risposta non conteneva un JSON riconoscibile' };

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (asse === 'family') {
      const fitRaw = (parsed.fit ?? {}) as Record<string, number>;
      const fit = Object.entries(fitRaw)
        .filter(([k]) => (SIGNAL_KEYS as readonly string[]).includes(k))
        .map(([signal, weight]) => ({ signal: signal as FamilyDraft['fit'][number]['signal'], weight: Number(weight) || 0 }));
      const archetypesRaw = Array.isArray(parsed.archetypes) ? (parsed.archetypes as Record<string, unknown>[]) : [];
      const archetypes = archetypesRaw.map((a) => ({
        id: String(a.id ?? ''),
        structure: String(a.structure ?? ''),
        mass: (ARCHETYPE_MASSES as readonly string[]).includes(String(a.mass)) ? (a.mass as FamilyDraft['archetypes'][number]['mass']) : 'BALANCED',
      }));
      const humanoidity = Array.isArray(parsed.humanoidity) ? (parsed.humanoidity as number[]) : [2, 4];
      const family: FamilyDraft = {
        id: String(parsed.id ?? '').toUpperCase(),
        coreAnatomy: String(parsed.coreAnatomy ?? ''),
        it: String(parsed.it ?? ''),
        drivers: String(parsed.drivers ?? ''),
        absoluteRule: String(parsed.absoluteRule ?? ''),
        fit,
        archetypes,
        supportsHair: Boolean(parsed.supportsHair),
        supportsEyewear: parsed.supportsEyewear !== false,
        humanoidityMin: Math.max(2, Math.min(5, Number(humanoidity[0]) || 2)),
        humanoidityMax: Math.max(2, Math.min(5, Number(humanoidity[1]) || 4)),
      };
      return { family, failure: null };
    }

    const campo = SIMPLE_FIELD_NAME[asse as Exclude<TaxonomyAxis, 'family'>];
    const semplice: SimpleDraft = {
      id: String(parsed.id ?? '').toUpperCase(),
      it: String(parsed.it ?? ''),
      descrizione: String(parsed[campo] ?? ''),
    };
    return { semplice, failure: null };
  } catch {
    return { failure: 'error', detail: 'la risposta non era JSON valido' };
  }
}
