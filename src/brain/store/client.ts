import { savedToken } from '../stream';
import { EMPTY_BRAIN, type BrainMessage, type BrainState } from './types';

const LOCAL_KEY = 'vinzmon.brain.v1';

function localState(): BrainState {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '') as BrainState;
    return parsed?.version === 1 ? parsed : EMPTY_BRAIN;
  } catch {
    return EMPTY_BRAIN;
  }
}

function keepLocal(state: BrainState): BrainState {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  return state;
}

async function call(body?: unknown): Promise<BrainState> {
  const token = savedToken();
  if (!token) return localState();

  const response = await fetch('/api/brain', {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Salvataggio non disponibile (${response.status}).`);
  const state = body
    ? ((await response.json()) as { state: BrainState }).state
    : (await response.json()) as BrainState;
  return keepLocal(state);
}

export async function loadBrain(): Promise<BrainState> {
  try {
    return await call();
  } catch {
    return localState();
  }
}

export async function appendMessage(
  state: BrainState,
  conversationId: string,
  message: BrainMessage,
): Promise<BrainState> {
  /* La copia locale cambia subito: anche offline il turno sopravvive al reload. */
  const next = structuredClone(state);
  let conversation = next.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    const title = message.content.replace(/\s+/g, ' ').trim();
    conversation = {
      id: conversationId,
      title: title.length > 54 ? `${title.slice(0, 53)}…` : title,
      createdAt: message.ts,
      updatedAt: message.ts,
      messages: [],
    };
    next.conversations.unshift(conversation);
  }
  if (!conversation.messages.some((item) => item.id === message.id)) {
    conversation.messages.push(message);
  }
  conversation.updatedAt = message.ts;
  next.activeConversationId = conversationId;
  keepLocal(next);

  try {
    return await call({ conversationId, message });
  } catch {
    return next;
  }
}
