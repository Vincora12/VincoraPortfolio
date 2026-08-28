import { authorize, denied, json } from './_shared/auth';
import { callProvider } from './_shared/providers';
import { resolveRoute } from './_shared/routing';
import { createMeModelStore } from './_shared/meModel';
import { captureChatMemory, shouldCaptureChatMessage } from './_shared/meChatMemory';

const INSTRUCTIONS = `You extract persistent personal knowledge from one user chat message. Precision over recall. Return JSON only: {"version":"1","memoryWorthy":boolean,"entities":[{"mention":"...","type":"user|person|project|organization|place|interest|concept|other","aliases":[]}],"relations":[{"subject":"USER or entity mention","predicate":"free string","object":"entity mention" OR "value":"scalar","objectType":"person|project|organization|place|interest|concept|other","confidence":0.0,"validFrom":"ISO if explicit","validTo":"ISO if explicit","explicitReplacement":false}],"episodes":[{"type":"free string","summary":"...","entities":["USER or entity mention"],"importance":0.0,"startedAt":"ISO if explicit","endedAt":"ISO if explicit"}]}. Extract only durable facts, relationships, projects, work, preferences, goals, plans, locations, history, or meaningful events explicitly stated. Ignore filler, one-off requests, transient emotion, calculations and generic opinions. Never infer psychology or write a response. Confidence must be below 1 unless unambiguous; omit unsupported keys.`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text;
  return JSON.parse(fenced.trim());
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'solo POST' }, 405);
  if (!authorize(request).ok) return denied();
  let body: { text?: string; conversationId?: string; messageId?: string; context?: Array<{ role?: string; text?: string }> };
  try { body = await request.json() as typeof body; } catch { return json({ error: 'body non leggibile' }, 400); }
  if (typeof body.text !== 'string' || body.text.trim().length === 0 || body.text.length > 20_000) return json({ error: 'messaggio non valido' }, 400);
  const context = Array.isArray(body.context) ? body.context.filter((item): item is { role: 'user' | 'assistant'; text: string } => (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string').slice(-8).map((item) => ({ ...item, text: item.text.slice(0, 4000) })) : [];
  if (!shouldCaptureChatMessage(body.text)) return json({ status: 'ignored', updated: false, created: 0, updatedCount: 0, superseded: 0, episodesCreated: 0, skipped: 0, ambiguities: [], warnings: [] });
  try {
    const route = resolveRoute('text-cheap');
    const response = await callProvider(route.provider, { model: route.model, system: [{ text: INSTRUCTIONS }], turns: [], user: `RECENT CONTEXT (interpretive only):\n${context.map((item) => `${item.role}: ${item.text}`).join('\\n')}\n\nCURRENT USER MESSAGE (source of any mutation):\n${body.text}`, maxTokens: 1800 });
    if (!response.ok) throw new Error(response.error ?? 'estrazione non disponibile');
    const result = await captureChatMemory(createMeModelStore(), {
      text: body.text,
      conversationId: body.conversationId,
      messageId: body.messageId,
      extraction: extractJson(response.text),
      context,
    });
    return json(result, result.status === 'failed' ? 422 : 200);
  } catch (error) {
    return json({ status: 'failed', updated: false, created: 0, updatedCount: 0, superseded: 0, episodesCreated: 0, skipped: 0, ambiguities: [], warnings: [error instanceof Error ? error.message : 'memory capture failed'] }, 200);
  }
}

export const config = { path: '/api/me-chat-capture' };
