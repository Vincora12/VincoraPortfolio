/* ==========================================================================
   BRAIN — CONVERSAZIONI ED EVENTI (BLUEPRINT EPIC 2)

   Le conversazioni sono lo stato leggibile. Gli eventi sono la storia
   append-only da cui, se serve, si può dimostrare come quello stato è nato.
   Vivono in uno store separato: il Brain non legge e non scrive la partita.
   ========================================================================= */

import { getStore } from '@netlify/blobs';
import { authorize, denied, json } from './_shared/auth';

type Role = 'user' | 'assistant';

interface Message {
  id: string;
  ts: string;
  role: Role;
  content: string;
  context?: string;
  attachment?: { kind: 'image' | 'document'; name: string };
  interrupted?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

interface BrainState {
  version: 1;
  activeConversationId: string | null;
  conversations: Conversation[];
}

interface AppendPayload {
  conversationId?: string;
  message?: Message;
}

const STATE_KEY = 'state';
const MAX_MESSAGE_CHARS = 12_000;
const MAX_CONTEXT_CHARS = 10_000;
const MAX_CONVERSATIONS = 100;
const store = () => getStore('vinzmon-brain');

function emptyState(): BrainState {
  return { version: 1, activeConversationId: null, conversations: [] };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}

function validMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<Message>;
  return (
    validId(message.id) &&
    typeof message.ts === 'string' &&
    !Number.isNaN(Date.parse(message.ts)) &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    message.content.length > 0 &&
    message.content.length <= MAX_MESSAGE_CHARS &&
    (message.context === undefined ||
      (typeof message.context === 'string' && message.context.length <= MAX_CONTEXT_CHARS)) &&
    (message.attachment === undefined ||
      (typeof message.attachment === 'object' &&
        message.attachment !== null &&
        (message.attachment.kind === 'image' || message.attachment.kind === 'document') &&
        typeof message.attachment.name === 'string' &&
        message.attachment.name.length <= 180)) &&
    (message.interrupted === undefined || typeof message.interrupted === 'boolean')
  );
}

function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 54 ? `${oneLine.slice(0, 53)}…` : oneLine;
}

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[brain] richiesta rifiutata:', auth.reason);
    return denied();
  }

  if (request.method === 'GET') {
    const state = (await store().get(STATE_KEY, { type: 'json' })) as BrainState | null;
    return json(state ?? emptyState());
  }

  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);

  let payload: AppendPayload;
  try {
    payload = (await request.json()) as AppendPayload;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  if (!validId(payload.conversationId) || !validMessage(payload.message)) {
    return json({ error: 'evento malformato' }, 400);
  }

  const conversationId = payload.conversationId;
  const message = payload.message;

  /* ⚠️ Blobs non è transazionale. Il confronto ETag impedisce che due turni
     contemporanei si cancellino a vicenda; in caso di collisione rileggiamo
     e riproviamo, senza duplicare il messaggio grazie al suo id stabile. */
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await store().getWithMetadata(STATE_KEY, { type: 'json' });
    const state = (current?.data as BrainState | undefined) ?? emptyState();
    let conversation = state.conversations.find((item) => item.id === conversationId);

    if (conversation?.messages.some((item) => item.id === message.id)) {
      return json({ ok: true, state });
    }

    const now = new Date().toISOString();
    if (!conversation) {
      if (state.conversations.length >= MAX_CONVERSATIONS) {
        return json({ error: 'troppi thread: archivia prima di continuare' }, 409);
      }
      conversation = {
        id: conversationId,
        title: message.role === 'user' ? titleFrom(message.content) : 'Nuova conversazione',
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      state.conversations.unshift(conversation);
    }

    conversation.messages.push(message);
    conversation.updatedAt = now;
    state.activeConversationId = conversationId;

    const written = await store().setJSON(
      STATE_KEY,
      state,
      current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );
    if (!written.modified) continue;

    /* Una chiave per messaggio: scrivere due volte lo stesso id non crea due
       eventi. Il payload resta completo e può ricostruire il turno. */
    await store().setJSON(
      `events/${message.ts.replaceAll(':', '-')}/${message.id}`,
      {
        id: message.id,
        ts: message.ts,
        kind: message.role === 'user' ? 'USER_MESSAGE' : 'ASSISTANT_MESSAGE',
        payload: { conversationId, message },
      },
      { onlyIfNew: true },
    );

    return json({ ok: true, state });
  }

  return json({ error: 'salvataggio in conflitto: riprova' }, 409);
}

export const config = { path: '/api/brain' };
