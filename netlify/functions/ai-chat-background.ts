/* ============================================================================
   LA CHIACCHIERATA CHE NON SI FERMA QUANDO ESCI DALL'APP

   🔷 «esco e riesco. Questo mi fa spendere un botto. Deve lavorare in
   background come quando genera i mon.»

   Prima, la chat generale teneva aperta una `fetch(..., {stream:true})` per
   tutta la durata della risposta. Su iOS quella connessione muore pochi
   secondi dopo che l'app va in background — non per un bug qui, è la
   piattaforma: Safari sospende la rete di una scheda molto prima che un
   modello finisca di pensare. Tornare non riprendeva niente: la richiesta
   era già morta, e bisognava rifarla da capo.

   Questo file fa esattamente quello che fa già `evolution-background.ts` per
   la generazione dei mon: parte, risponde subito 202 (per convenzione
   Netlify, ogni funzione che finisce per "-background" gira così), e il
   lavoro vero continua da solo. Il risultato si scrive in un archivio
   (`vinzmon-ai-chat`) che `ai-chat-job.ts` legge quando il telefono chiede
   "sei pronto?" — una richiesta corta, che sopravvive al background perché
   non deve restare aperta per interi minuti.

   ⚠️ SOLO `character-voice`, SOLO SENZA STRUMENTI. Il giro con gli strumenti
   (`replyWithLocalTools` in `src/brain/stream.ts`) esegue gli strumenti nel
   browser, contro lo stato locale dell'app — spostarlo qui vorrebbe dire dare
   al server accesso a dati che vivono solo sul telefono, ed è un lavoro a
   parte, non fatto oggi. Questo copre la chiacchierata semplice, che è la
   maggioranza dei turni e il caso esatto del reclamo: "sono uscito mentre
   rispondeva".

   🔒 Stessi tetti di `ai.ts` (vedi `_shared/chatLimits.ts` per il perché non
   sono importati direttamente), stessa chiamata (`callProvider`), stessa
   registrazione di spesa — questo NON è un percorso più permissivo, è lo
   stesso giro non-streaming spostato a girare da solo invece che sotto una
   risposta HTTP che qualcuno deve tenere aperta. */

import { authorize } from './_shared/auth';
import { resolveRoute, type Capability } from './_shared/routing';
import { callProvider, type SystemBlock, type Turn } from './_shared/providers';
import { checkCap, readLocalOnlyMode, recordSpend } from './_shared/spend';
import { getStore } from './_shared/localStore';
import { sendPushNotification } from './_shared/pushDelivery';
import { CHAT_LIMITS, resolveChatPreferences } from './_shared/chatLimits';

type JobStatus = 'running' | 'ready' | 'error';

interface Job {
  id: string;
  status: JobStatus;
  text?: string;
  sources?: { title: string; url: string; domain?: string }[];
  model?: string;
  costUsd?: number;
  error?: string;
  updatedAt: string;
}

const CAPABILITY: Capability = 'character-voice';
const store = () => getStore('vinzmon-ai-chat');
const jobKey = (id: string) => `job:${id}`;

async function save(job: Job): Promise<void> {
  job.updatedAt = new Date().toISOString();
  await store().setJSON(jobKey(job.id), job);
}

interface Payload {
  jobId?: string;
  config?: { modelName?: string; reasoningEffort?: string };
  system?: SystemBlock[];
  turns?: Turn[];
  user?: string;
  images?: { mediaType: string; data: string }[];
  files?: { mediaType: string; data: string; filename: string }[];
  webSearch?: boolean;
  thinking?: boolean;
  maxTokens?: number;
}

export default async function aiChatBackground(request: Request): Promise<void> {
  if (!authorize(request).ok) return;

  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return;
  }

  const id = body.jobId?.trim() ?? '';
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) return;

  const job: Job = { id, status: 'running', updatedAt: new Date().toISOString() };
  await save(job);

  const cap = await checkCap();
  if (cap.blocked) {
    job.status = 'error';
    job.error = 'tetto mensile raggiunto';
    await save(job);
    return;
  }

  const preferences = resolveChatPreferences(body.config);
  const route = resolveRoute(CAPABILITY, preferences.modelName);

  const localOnly = await readLocalOnlyMode();
  if (localOnly.enabled && route.provider !== 'ollama') {
    job.status = 'error';
    job.error = 'modalità solo-locale attiva — questa richiesta userebbe un modello cloud';
    await save(job);
    return;
  }

  const system = body.system ?? [];
  const turns = (body.turns ?? []).slice(-CHAT_LIMITS.turns);
  const user = (body.user ?? '').slice(0, CHAT_LIMITS.userChars);
  const images = (body.images ?? []).slice(0, 4);
  const files = (body.files ?? []).slice(0, 2);
  const webSearch = Boolean(body.webSearch) && (route.provider === 'anthropic' || route.provider === 'openai');

  const result = await callProvider(route.provider, {
    model: route.model,
    system,
    turns,
    user,
    userBlocks: [],
    images,
    files,
    thinking: Boolean(body.thinking),
    ...(preferences.effort ? { effort: preferences.effort } : {}),
    tools: [],
    webSearch,
    maxTokens: Math.min(body.maxTokens ?? CHAT_LIMITS.maxTokens, CHAT_LIMITS.maxTokens),
  });

  let costUsd = 0;
  if (result.usage.inputTokens || result.usage.outputTokens || result.usage.webSearches) {
    costUsd = await recordSpend(CAPABILITY, result.model, result.usage, { action: CAPABILITY, subsystem: 'ai-chat-background' });
  }

  if (!result.ok) {
    job.status = 'error';
    job.error = (result.error ?? 'risposta non disponibile').slice(0, 400);
    await save(job);
    return;
  }

  job.status = 'ready';
  job.text = result.text;
  job.sources = result.sources;
  job.model = result.model;
  job.costUsd = costUsd;
  await save(job);

  /* 🔒 Sempre accesa, non condizionata a una preferenza per categoria — come
     la notifica di Hermes in `runs.ts` e per la stessa ragione (vedi il
     commento lì): questa notifica NON è un extra opzionale, è il segnale che
     rende il background utile. Silenziarla per scelta romperebbe proprio il
     meccanismo che il reclamo chiedeva di costruire. */
  try {
    await sendPushNotification({
      title: 'VINZ.MON',
      body: result.text.slice(0, 140) || 'Risposta pronta.',
      url: '/',
      tag: `vinzmon-chat-${id}`,
    });
  } catch (error) {
    console.warn('[ai-chat-background] notifica push non inviata:', error);
  }
}

export const config = { path: '/api/ai-chat-background' };
