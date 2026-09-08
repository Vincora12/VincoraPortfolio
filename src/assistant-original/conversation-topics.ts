/* ============================================================================
   QUANDO CHIUDERE UN TRATTO DI CONVERSAZIONE

   🔒 LA DECISIONE È GRATIS. Nessuna chiamata al modello per capire se hai
   cambiato argomento: si chiude su una soglia di messaggi o su una pausa lunga.
   Il modello si paga una volta sola, per dare al tratto un nome e un riassunto.

   ⚠️ LA PAUSA È IL SEGNALE MIGLIORE, e non è un ripiego. Le persone cambiano
   discorso quando tornano, non a metà di uno scambio: tre ore di silenzio
   separano due argomenti molto meglio di un cambio di parole nel mezzo di una
   frase. La soglia sui messaggi serve solo a chi parla per ore di fila.

   🔒 IL FILO RESTA UNO. Chiudere un topic non spezza niente in chat: è un
   segnalibro con un riassunto, non un taglio.
   ========================================================================= */

import { savedToken } from '@/brain/stream';
import { serverBackedStorage } from '@/system/serverStorage';

export interface ConversationTopic {
  id: string;
  threadId: string;
  title: string;
  summary: string;
  firstMessageId: string;
  lastMessageId: string;
  startedAt: string;
  endedAt: string;
  messageCount: number;
}

export interface TopicCandidate {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

/** Le stesse due soglie del server, per non decidere in due modi diversi. */
export const TOPIC_MESSAGE_THRESHOLD = 16;
export const TOPIC_GAP_MS = 3 * 60 * 60 * 1000;

const WATERMARK_PREFIX = 'vinzmon.topics.watermark:';

/** L'ultimo messaggio già finito dentro un topic chiuso, per questo filo. */
export async function readWatermark(threadId: string): Promise<string | null> {
  try {
    return await serverBackedStorage.getItem(`${WATERMARK_PREFIX}${threadId}`);
  } catch {
    return null;
  }
}

async function writeWatermark(threadId: string, messageId: string): Promise<void> {
  try {
    await serverBackedStorage.setItem(`${WATERMARK_PREFIX}${threadId}`, messageId);
  } catch {
    /* Senza segnalibro il tratto verrà riproposto: meglio un riassunto in più
       che perdere il pezzo. */
  }
}

/**
 * Il tratto ancora aperto: tutto quello che viene dopo il segnalibro.
 *
 * ⚠️ Se il segnalibro punta a un messaggio che non c'è più (cronologia
 * ripulita, altro dispositivo), si riparte da capo invece di restituire vuoto:
 * un segnalibro perso non deve far sparire la conversazione dall'indice.
 */
export function openStretch(messages: TopicCandidate[], watermark: string | null): TopicCandidate[] {
  if (!watermark) return messages;
  const index = messages.findIndex((message) => message.id === watermark);
  return index === -1 ? messages : messages.slice(index + 1);
}

export function shouldClose(stretch: TopicCandidate[], now = Date.now()): boolean {
  if (stretch.length < 4) return false;
  if (stretch.length >= TOPIC_MESSAGE_THRESHOLD) return true;
  const last = Date.parse(stretch[stretch.length - 1].at);
  return Number.isFinite(last) && now - last >= TOPIC_GAP_MS;
}

/* ============================================================================
   RIPRENDERE UN TOPIC

   🔒 STESSO IDIOMA DI `chat-room-presence`: chi tocca la pastiglia lascia qui
   un biglietto, e il runtime lo consuma al giro successivo. Non passa da
   `runConfig`, che `useConversationOptions` riscrive a ogni render con lo scope
   del progetto e cancellerebbe il biglietto.

   ⚠️ SI CONSUMA UNA VOLTA SOLA. Il riassunto entra nel contesto del turno in
   cui hai chiesto di riprendere, non di tutti quelli dopo: sarebbe un pezzo di
   conversazione vecchia che si trascina per sempre. */
let pendingTopic: ConversationTopic | null = null;

/* Il filo su cui si sta parlando. Lo pubblica `TopicKeeper`, che è l'unico
   punto del client che ha in mano il runtime; il runtime della chat lo legge
   per sapere quale segnalibro cercare. Stesso idioma del biglietto qui sopra. */
let currentThreadId = '';

export function setActiveThreadId(threadId: string): void {
  currentThreadId = threadId;
}

export function activeThreadId(): string {
  return currentThreadId;
}

export function requestTopicContext(topic: ConversationTopic): void {
  pendingTopic = topic;
}

export function consumeTopicContext(): ConversationTopic | null {
  const topic = pendingTopic;
  pendingTopic = null;
  return topic;
}

async function api<T>(path: string, body?: unknown): Promise<T | null> {
  const token = savedToken();
  if (!token) return null;
  try {
    const response = await fetch(`/api/topics${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function listTopics(limit = 12): Promise<ConversationTopic[]> {
  return (await api<{ topics: ConversationTopic[] }>(`?limit=${limit}`))?.topics ?? [];
}

/** I tratti già chiusi, pronti da mettere nel prompt di sistema. */
export async function topicArchive(limit = 5): Promise<string> {
  const topics = await listTopics(limit);
  if (!topics.length) return '';
  const lines = topics
    .map((topic) => `— «${topic.title}» (${new Date(topic.endedAt).toLocaleDateString('it-IT')}): ${topic.summary}`)
    .join('\n');
  return `\n\nDI COSA AVETE GIÀ PARLATO (riassunti di tratti passati di questa stessa conversazione, dal più recente):\n${lines}\nEND. Sono riassunti, non parole dette adesso: servono a non ripartire da zero, non vanno citati come se fossero appena stati detti.`;
}

export async function searchTopics(query: string): Promise<ConversationTopic[]> {
  return (await api<{ topics: ConversationTopic[] }>('', { action: 'search', query }))?.topics ?? [];
}

/**
 * Chiude il tratto aperto se è ora. Restituisce il topic creato, o `null` se
 * non era ora o se il riassunto non è riuscito.
 *
 * 🔒 Il segnalibro si sposta SOLO dopo che il server ha confermato il topic:
 * un riassunto fallito non deve far sparire quel tratto dall'indice per sempre.
 */
export async function maybeCloseTopic(
  threadId: string,
  messages: TopicCandidate[],
): Promise<ConversationTopic | null> {
  const watermark = await readWatermark(threadId);
  const stretch = openStretch(messages, watermark);
  if (!shouldClose(stretch)) return null;

  /* ⚠️ A BLOCCHI, NON TUTTO INSIEME. Alla prima accensione il tratto aperto è
     l'intera cronologia: riassumerla in un topic solo darebbe una riga sola per
     mesi di conversazione, cioè un indice inutile. Si chiude un blocco alla
     volta e il giro successivo prende il seguente, finché l'arretrato è
     rientrato. */
  const chunk = stretch.length > TOPIC_MESSAGE_THRESHOLD
    ? stretch.slice(0, TOPIC_MESSAGE_THRESHOLD)
    : stretch;

  const result = await api<{ topic: ConversationTopic | null }>('', {
    action: 'close',
    threadId,
    messages: chunk,
  });
  const topic = result?.topic ?? null;
  if (topic) await writeWatermark(threadId, topic.lastMessageId);
  return topic;
}
