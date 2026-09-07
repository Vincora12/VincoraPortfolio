/* ============================================================================
   LE CONVERSAZIONI DI V2

   🔒 NAMESPACE SUO. Tutto sotto `vinzmon.v2.*`: la Current non legge né scrive
   questa chiave, quindi cancellare V2 non toglie niente alla versione attuale
   e viceversa. È persistenza vera su `localStorage`, non uno stato in memoria
   che sparisce al refresh — la conversazione deve sopravvivere al ricaricamento
   della pagina, che è uno dei punti da provare.

   ⚠️ Le conversazioni di V2 NON sono ancora i Topic di LobeHub. Finché il
   servizio LobeHub non è configurato, la sorgente di verità è questa; quando lo
   sarà, questo store diventa la proiezione locale dei suoi Topic. Vedi
   `docs/VINZMON_V2.md`, sezione «Projects e conversazioni».
   ========================================================================= */

import { newId, type V2Conversation, type V2Message } from './types';

const KEY = 'vinzmon.v2.conversations.v1';

let cache: V2Conversation[] | null = null;
const listeners = new Set<() => void>();

function read(): V2Conversation[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(parsed) ? (parsed as V2Conversation[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: V2Conversation[]): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Spazio esaurito o navigazione privata: la sessione corrente continua a
       funzionare in memoria, il refresh la perde. Meglio che perdere la chat. */
  }
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listConversations(): V2Conversation[] {
  return [...read()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string | null): V2Conversation | null {
  if (!id) return null;
  return read().find((conversation) => conversation.id === id) ?? null;
}

export function createConversation(): V2Conversation {
  const now = Date.now();
  const conversation: V2Conversation = {
    id: newId('c'),
    title: 'Nuova conversazione',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  write([conversation, ...read()]);
  return conversation;
}

export function deleteConversation(id: string): void {
  write(read().filter((conversation) => conversation.id !== id));
}

function replace(id: string, update: (conversation: V2Conversation) => V2Conversation): void {
  write(read().map((conversation) => (conversation.id === id ? update(conversation) : conversation)));
}

export function appendMessage(conversationId: string, message: V2Message): void {
  replace(conversationId, (conversation) => ({
    ...conversation,
    updatedAt: Date.now(),
    /* Il titolo lo detta la prima domanda: nessuna chiamata a un modello per
       battezzare una conversazione che magari dura un messaggio solo. */
    title:
      conversation.messages.length === 0 && message.role === 'user'
        ? message.text.replace(/\s+/g, ' ').trim().slice(0, 48) || conversation.title
        : conversation.title,
    messages: [...conversation.messages, message],
  }));
}

export function updateMessage(
  conversationId: string,
  messageId: string,
  patch: Partial<V2Message>,
): void {
  replace(conversationId, (conversation) => ({
    ...conversation,
    updatedAt: Date.now(),
    messages: conversation.messages.map((message) =>
      message.id === messageId ? { ...message, ...patch } : message,
    ),
  }));
}
