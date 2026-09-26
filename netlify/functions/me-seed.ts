import { authorize, denied, json } from './_shared/auth';
import { callModel } from './_shared/modelGateway';
import { importPersonalMemorySeed } from './_shared/core/memory';

const INSTRUCTIONS = `Extract only explicitly supported persistent user knowledge from the supplied Seed. Return JSON only, with this shape: {"version":"1","entities":[{"mention":"...","type":"user|person|project|organization|place|interest|concept|other","aliases":["..."]}],"relations":[{"subject":"USER or entity mention","predicate":"free string","object":"entity mention" OR "value":"scalar","confidence":0.0,"validFrom":"ISO if explicit","validTo":"ISO if explicit"}],"episodes":[{"type":"free string","summary":"...","entities":["USER or entity mention"],"importance":0.0,"startedAt":"ISO if explicit","endedAt":"ISO if explicit"}]}. Be conservative: no inferred psychology, patterns, summaries, or facts not clearly stated. Use confidence below 1 unless the statement is unambiguous. Do not include unsupported keys.`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text;
  return JSON.parse(fenced.trim());
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'solo POST' }, 405);
  if (!authorize(request).ok) return denied();
  let body: { seed?: string; preferredModel?: string };
  try { body = (await request.json()) as { seed?: string }; } catch { return json({ error: 'body non leggibile' }, 400); }
  if (typeof body.seed !== 'string' || body.seed.trim().length === 0 || body.seed.length > 100_000) return json({ error: 'seed non valido' }, 400);
  const result = await importPersonalMemorySeed(body.seed, async (seed) => {
    /* vNext model gateway: route, local-only mode and spend recording (best-effort) in one place. */
    const response = await callModel({
      capability: 'text-cheap', purpose: 'memory', action: 'me_seed', preferredModel: body.preferredModel, enforceCap: false,
      localFirst: !body.preferredModel, onLocalFailure: 'escalate',
      acceptLocal: (r) => { try { extractJson(r.text); return true; } catch { return false; } },
    }, { system: [{ text: INSTRUCTIONS }], turns: [], user: seed, maxTokens: 4000 });
    if (!response.ok) throw new Error(response.error ?? 'estrazione non disponibile');
    return extractJson(response.text);
  });
  return json(result, result.status === 'failed' ? 422 : 200);
}

export const config = { path: '/api/me-seed' };
