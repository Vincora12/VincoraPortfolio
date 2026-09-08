/* ============================================================================
   I TOPIC — pezzi di conversazione che si chiudono da soli

   🔷 «Più andiamo avanti, più dovrebbe da solo chiudere dei pezzi di
   conversazione in dei topic.»

   Un topic è un tratto CONTIGUO del filo, chiuso e riassunto. Non spezza
   niente: la conversazione resta una sola e continua a scorrere. Il topic è
   metadato SOPRA la timeline, non un taglio dentro.

   Serve a tre cose insieme, ed è il motivo per cui vale la pena costruirlo:

     CONTESTO     al modello si mandano i riassunti dei tratti vecchi invece di
                  buttarli via. Oggi il client spedisce TUTTA la cronologia e il
                  server tiene solo gli ultimi 24 turni: il resto sparisce senza
                  lasciare traccia. Un riassunto costa poche righe e ricorda.
     RICERCA      «quando abbiamo parlato di X» cerca fra titoli e riassunti.
     NAVIGAZIONE  i pulsantini sopra la chat sono questi.

   🔒 QUANDO SI CHIUDE, DETERMINISTICO E GRATIS. Nessuna chiamata al modello per
   decidere se il discorso è cambiato: si chiude su una soglia di messaggi o su
   una pausa lunga. Il modello lo si paga UNA volta, per dare al tratto un nome
   e un riassunto. Chiedergli a ogni messaggio «è cambiato argomento?» sarebbe
   un costo continuo per una decisione che il tempo indovina quasi sempre.
   ========================================================================= */

import { getStore } from './localStore';
import { callProvider } from './providers';
import { resolveRoute } from './routing';
import { checkCap, recordSpend } from './spend';

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

export interface TopicMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

/** Il tratto aperto si chiude quando arriva a tanti messaggi… */
export const TOPIC_MESSAGE_THRESHOLD = 16;
/** …oppure quando fra un messaggio e l'altro è passato tanto tempo. */
export const TOPIC_GAP_MS = 3 * 60 * 60 * 1000;

const MAX_TOPICS = 400;
const MAX_CHARS_PER_MESSAGE = 600;
const MAX_SUMMARY_INPUT = 12_000;

function store() {
  return getStore({ name: 'vinzmon-topics', consistency: 'strong' });
}

export async function listTopics(limit = 40): Promise<ConversationTopic[]> {
  const { blobs } = await store().list({ prefix: 'topic:' });
  const rows = await Promise.all(
    blobs.map(async ({ key }) => (await store().get(key, { type: 'json' })) as ConversationTopic | null),
  );
  return rows
    .filter((row): row is ConversationTopic => Boolean(row))
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    .slice(0, limit);
}

/* ⚠️ Ricerca letterale, non semantica, e la differenza va detta: trova le
   parole che ci sono scritte. Titoli e riassunti sono già una compressione
   fatta dal modello, quindi in pratica pesca bene; ma «di cosa parlammo quella
   volta che ero giù» non è una domanda a cui questa ricerca sa rispondere. */
export async function searchTopics(query: string, limit = 8): Promise<ConversationTopic[]> {
  const needles = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
  if (!needles.length) return [];

  const scored = (await listTopics(MAX_TOPICS)).map((topic) => {
    const hay = `${topic.title} ${topic.summary}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    const score = needles.reduce((total, word) => total + (hay.includes(word) ? 1 : 0), 0);
    return { topic, score };
  });

  return scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.topic.endedAt.localeCompare(a.topic.endedAt))
    .slice(0, limit)
    .map((row) => row.topic);
}

const SUMMARY_RULES = [
  'You are indexing one stretch of an ongoing conversation so it can be found and recalled later.',
  'Reply with exactly two lines and nothing else.',
  'Line 1: TITOLO: a short Italian noun phrase, at most 6 words, naming what this stretch was about.',
  'Line 2: RIASSUNTO: two or three Italian sentences with the concrete substance — decisions taken, facts established, open questions. Names, numbers and dates matter; pleasantries do not.',
  'Write only what is actually in the messages. Never invent a decision that was not taken.',
].join(' ');

function parseSummary(text: string): { title: string; summary: string } {
  const title = /TITOLO:\s*(.+)/i.exec(text)?.[1]?.trim() ?? '';
  const summary = /RIASSUNTO:\s*([\s\S]+)/i.exec(text)?.[1]?.trim() ?? '';
  return {
    title: title.slice(0, 60) || 'Conversazione',
    summary: (summary || text.trim()).slice(0, 700),
  };
}

export async function closeTopic(threadId: string, messages: TopicMessage[]): Promise<ConversationTopic | null> {
  const usable = messages.filter((message) => message.text?.trim());
  if (usable.length < 2) return null;

  const cap = await checkCap();
  if (cap.blocked) throw new Error('Tetto mensile di spesa raggiunto.');

  const transcript = usable
    .map((message) => `${message.role === 'user' ? 'VINCENZO' : 'VINZ'}: ${message.text.slice(0, MAX_CHARS_PER_MESSAGE)}`)
    .join('\n')
    .slice(-MAX_SUMMARY_INPUT);

  const route = resolveRoute('text-cheap');
  const result = await callProvider(route.provider, {
    model: route.model,
    system: [{ text: SUMMARY_RULES }],
    turns: [],
    user: transcript,
    maxTokens: 400,
    effort: 'low',
  });

  if (result.usage.inputTokens || result.usage.outputTokens) {
    await recordSpend('text-cheap', result.model, result.usage, { action: 'topic-summary', subsystem: 'topics' });
  }
  if (!result.ok || !result.text.trim()) throw new Error(result.error || 'Riassunto non riuscito.');

  const { title, summary } = parseSummary(result.text);
  const first = usable[0];
  const last = usable[usable.length - 1];
  const topic: ConversationTopic = {
    id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    threadId,
    title,
    summary,
    firstMessageId: first.id,
    lastMessageId: last.id,
    startedAt: first.at,
    endedAt: last.at,
    messageCount: usable.length,
  };

  await store().setJSON(`topic:${topic.id}`, topic);
  return topic;
}
