/* ============================================================================
   /api/topics — i pezzi di conversazione già chiusi

   Il motore sta in `_shared/topics.ts`. Qui c'è la porta: token di VINZ
   obbligatorio, campi ricontrollati, nessuna scrittura che il client possa
   dettare a piacere (il titolo e il riassunto li scrive il modello, non lui).
   ========================================================================= */

import { authorize, denied, json } from './_shared/auth';
import { closeTopic, listTopics, searchTopics, type TopicMessage } from './_shared/topics';

interface Payload {
  action?: string;
  threadId?: string;
  query?: string;
  messages?: unknown;
}

const MAX_MESSAGES = 60;

function readMessages(value: unknown): TopicMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_MESSAGES)
    .map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>) : {}))
    .filter((row) => typeof row.id === 'string' && typeof row.text === 'string')
    .map((row) => ({
      id: String(row.id),
      role: row.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      text: String(row.text),
      at: typeof row.at === 'string' ? row.at : new Date().toISOString(),
    }));
}

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'GET') {
    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
    return json({ topics: await listTopics(limit) });
  }

  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);

  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  try {
    if (body.action === 'search') {
      const query = String(body.query ?? '').trim();
      if (!query) return json({ error: 'Serve qualcosa da cercare.' }, 400);
      return json({ topics: await searchTopics(query) });
    }

    if (body.action === 'close') {
      const threadId = String(body.threadId ?? '').trim();
      if (!threadId) return json({ error: 'threadId mancante' }, 400);
      const messages = readMessages(body.messages);
      if (messages.length < 2) return json({ error: 'Servono almeno due messaggi.' }, 400);
      const topic = await closeTopic(threadId, messages);
      return json({ topic });
    }

    return json({ error: 'Azione non disponibile.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Operazione non riuscita.' }, 500);
  }
}
