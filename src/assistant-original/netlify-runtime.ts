import type {
  ChatModelAdapter,
  ThreadAssistantMessagePart,
  ThreadMessage,
} from "@assistant-ui/react";
import {
  replyWithLocalTools,
  savedToken,
  isMealLogIntent,
  isWorkoutLogIntent,
  shouldUseLocalTools,
  type ChatMealSlot,
  type MealConfirmation,
  type WorkoutConfirmation,
  type ChatCost,
} from "@/brain/stream";
import type { BrainMessage } from "@/brain/store/types";
import type { ToolResult, ToolUse } from "@/ai/tools";
import { readHealthJournal } from "@/engine/healthJournal";
import { useApp } from "@/state/store";
import { buildVoiceSystemPrompt } from "@/ai/voicePrompt";
import { persistChatTrace, recordChatTrace, systemPromptComposition, traceClock, type ChatTrace } from "@/ai/chatTrace";
import { voiceCard } from "@/engine/voiceCard";
import { captureChatMemoryForClient } from "@/assistant-original/chat-memory-feedback";
import { postChatClientError, postChatDiagnostic, postRuntimeEvent } from "@/system/runtimeLog";

type Source = { title: string; url: string; domain?: string };
type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  webSearches?: number;
};
type StreamEvent =
  | { type: "search_started" }
  | { type: "source_found"; source: Source }
  | { type: "answer_started" }
  | { type: "answer_delta"; delta: string }
  | {
      type: "answer_completed";
      model: string;
      usage: Usage;
      costUsd: number;
      sources: Source[];
    }
  | { type: "error"; message: string };

function textOf(message: ThreadMessage | undefined): string {
  if (!message) return "";
  return message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
}

type ChatImage = { mediaType: string; data: string };
type ChatFile = { mediaType: string; data: string; filename: string };
type MonReaction = { monName: string; index: number; label: string };

const REACTION_LABELS = ["NEUTRAL", "WARM", "AMUSED", "ALERT", "LOW", "INTENSE"] as const;

function textHash(text: string): number {
  let result = 5381;
  for (const char of text) result = ((result << 5) + result) ^ char.charCodeAt(0);
  return result >>> 0;
}

/**
 * Lo sticker è una reazione, non una decorazione automatica. Compare solo
 * quando il testo contiene un'emozione leggibile e la personalità è abbastanza
 * espressiva; la scelta resta deterministica per non cambiare ricaricando.
 */
function reactionForAnswer(text: string): MonReaction | null {
  const app = useApp.getState();
  const record = app.activeMonName ? app.mons[app.activeMonName] : null;
  if (!record || record.data.asset_manifest_status.reaction_pack !== "resolved") return null;

  const lower = text.toLocaleLowerCase("it");
  let index = -1;
  if (/mi dispiace|trist|stanc|pesante|male|delus|solitudine|mancanza/.test(lower)) index = 4;
  else if (/ahah|haha|lol|divert|ridere|assurdo|buff|scherz/.test(lower)) index = 2;
  else if (/attenzione|occhio|aspetta|sorpres|davvero\?|cosa\?!|ma che/.test(lower)) index = 3;
  else if (/importante|basta|assolutamente|non farlo|devi|deciso|arrabbi|serio/.test(lower)) index = 5;
  else if (/grazie|bello|bravo|perfetto|felice|content|mi piace|ti voglio|insieme|bene così/.test(lower)) index = 1;
  if (index < 0) return null;

  const expressiveness = record.data.voice_dna.emotion ?? 50;
  const chance = expressiveness > 70 ? 3 : expressiveness < 35 ? 1 : 2;
  if (textHash(`${record.data.name}|${text}`) % 5 >= chance) return null;
  return { monName: record.data.name, index, label: REACTION_LABELS[index]! };
}

/** assistant-ui tiene gli allegati separati dal testo del messaggio. */
function imagesOf(message: ThreadMessage | undefined): ChatImage[] {
  if (!message) return [];
  const attachmentParts = message.attachments?.flatMap((attachment) => attachment.content ?? []) ?? [];
  const parts = [...message.content, ...attachmentParts];
  const found = new Map<string, ChatImage>();
  for (const part of parts) {
    if (part.type !== "image" || typeof part.image !== "string") continue;
    const match = part.image.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match?.[1] || !match[2]) continue;
    found.set(part.image, { mediaType: match[1], data: match[2] });
  }
  return [...found.values()].slice(0, 4);
}

function filesOf(message: ThreadMessage | undefined): ChatFile[] {
  if (!message) return [];
  const parts = [...message.content, ...(message.attachments?.flatMap((item) => item.content ?? []) ?? [])];
  return parts.flatMap((part) => part.type === "file" && part.mimeType === "application/pdf"
    ? [{ mediaType: part.mimeType, data: part.data, filename: part.filename ?? "documento.pdf" }]
    : []).slice(0, 2);
}

/**
 * La foto corrente vince. Nei follow-up che la citano, riusa l'ultimo gruppo
 * di foto: così «non vedi la foto?» non perde il contesto visivo.
 */
function imagesForRun(messages: readonly ThreadMessage[], forcePrevious = false): ChatImage[] {
  const last = messages.at(-1);
  const current = imagesOf(last);
  if (current.length) return current;
  const user = textOf(last);
  if (!forcePrevious && !/\b(foto|immagin\w*|allegat\w*|ved\w*|guard\w*|quest\w*|piatto|porzion\w*|calori\w*|ingredient\w*)\b/i.test(user)) {
    return [];
  }
  for (let index = messages.length - 2; index >= Math.max(0, messages.length - 6); index--) {
    const previous = messages[index];
    if (previous?.role !== "user") continue;
    const images = imagesOf(previous);
    if (images.length) return images;
  }
  return [];
}

const FIXED_MEALS: ChatMealSlot[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];
const localDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

function proposedMealSlot(text: string, at = new Date()): ChatMealSlot {
  const normalized = text.toLocaleLowerCase('it-IT');
  let slot: ChatMealSlot;
  if (/\b(extra|altro|altra|aggiuntiv\w*)\b/.test(normalized)) slot = 'extra';
  else slot = FIXED_MEALS.find((name) => normalized.includes(name)) ?? (() => {
    const hour = at.getHours() + at.getMinutes() / 60;
    if (hour < 10.5) return 'colazione';
    if (hour < 12) return 'spuntino';
    if (hour < 15) return 'pranzo';
    if (hour < 18) return 'merenda';
    return 'cena';
  })();
  if (slot === 'extra') return slot;
  const day = localDay(at);
  const occupied = readHealthJournal().meals.some(
    (meal) => meal.slot === slot && localDay(new Date(meal.at)) === day,
  );
  return occupied ? 'extra' : slot;
}

const CHAT_MEAL_SLOTS = new Set<ChatMealSlot>([
  'colazione', 'spuntino', 'pranzo', 'merenda', 'cena', 'extra',
]);

/**
 * Trova la risposta conversazionale che precede l'ultimo messaggio utente.
 * Le reazioni del MON sono messaggi assistant reali per assistant-ui, ma non
 * aprono un nuovo turno: non devono quindi spezzare una conferma operativa.
 */
function precedingConversationAssistant(messages: readonly ThreadMessage[]): ThreadMessage | undefined {
  for (let index = messages.length - 2; index >= 0; index--) {
    const message = messages[index];
    if (!message) continue;
    if (message.role === 'user') return undefined;
    if (message.role !== 'assistant') continue;
    if (message.metadata.custom.monReactionOnly === true) continue;
    return message;
  }
  return undefined;
}

/**
 * La proposta del pasto appartiene allo stato del turno, non alla formulazione
 * visibile scelta dal Mon. Il fallback sul testo mantiene compatibili le chat
 * create prima dell'introduzione dei metadati strutturati.
 */
export function pendingMealSlot(messages: readonly ThreadMessage[]): ChatMealSlot | undefined {
  const previous = precedingConversationAssistant(messages);
  if (!previous) return undefined;
  const rawSlot = (previous.metadata.custom as {
    pendingMeal?: { slot?: unknown };
  }).pendingMeal?.slot;
  if (typeof rawSlot === 'string' && CHAT_MEAL_SLOTS.has(rawSlot as ChatMealSlot)) {
    return rawSlot as ChatMealSlot;
  }
  const match = textOf(previous).match(
    /Confermi che lo registro come \*\*(colazione|spuntino|pranzo|merenda|cena|extra)(?:\s*\/[^*]+)?\*\*\?/i,
  );
  return match?.[1]?.toLocaleLowerCase('it-IT') as ChatMealSlot | undefined;
}

/** Accetta anche le conferme operative naturali usate dopo una proposta. */
export const confirms = (text: string) => /^\s*(?:s[iì]|yes|yep|yeah|sure|confermo|ok(?:ay)?|va bene|esatto|corretto|vai(?:\s+(?:pure|inserisci|registra|procedi))?|inserisci|registra|procedi|fallo|segna(?:lo)?(?:\s+in\s+me)?)(?=\s|[.!?,;:]|$)/i.test(text);

function isImageCreationIntent(text: string): boolean {
  return /\b(?:genera|crea|disegna|fammi|realizza|produci|modifica|trasforma|ritocca)\b[^.!?]{0,100}\b(?:foto|immagine|ritratto|illustrazione|render|versione)\b|\b(?:fammi vedere|mostrami)\b[^.!?]{0,100}\b(?:come (?:starei|sarei)|in versione)\b/i.test(text);
}

async function* runImageCreation(messages: readonly ThreadMessage[], abortSignal: AbortSignal) {
  const token = savedToken();
  if (!token) throw new Error("Prima attiva VINZ.MON: manca il token.");
  const prompt = textOf(messages.at(-1));
  const reference = imagesForRun(messages, true)[0]?.data;
  yield { content: [{ type: "text" as const, text: reference ? "Sto modificando l’immagine…" : "Sto creando l’immagine…" }] };
  const response = await fetch("/api/ai", {
    method: "POST",
    signal: abortSignal,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ capability: "image", prompt, size: "1024x1024", ...(reference ? { reference } : {}) }),
  });
  const body = await response.json().catch(() => null) as { image?: string; reason?: string; error?: string; costUsd?: number; model?: string } | null;
  if (!response.ok || !body?.image) throw new Error(body?.reason ?? body?.error ?? "Immagine non generata");
  yield {
    content: [{ type: "image" as const, image: `data:image/png;base64,${body.image}`, filename: "vinz-mon-image.png" }],
    metadata: { custom: { costUsd: body.costUsd ?? 0, model: body.model } },
  };
}

function hasPendingWorkout(messages: readonly ThreadMessage[]): boolean {
  const previous = precedingConversationAssistant(messages);
  return Boolean(previous
    && /Confermi che registro questo \*\*allenamento\*\* in ME\?/i.test(textOf(previous)));
}

/** Recupera una modifica al piano proposta dall'AI e appena confermata. */
function pendingWorkoutPlanProposal(messages: readonly ThreadMessage[]): string | undefined {
  const previous = precedingConversationAssistant(messages);
  if (!previous) return undefined;
  const proposal = textOf(previous);
  const normalized = proposal.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const asksToAdd = /\bvuoi\s+(?:aggiungere|inserire|programmare|spostare|modificare)\b/i.test(normalized);
  const hasDay = /\b(?:lune(?:di)?|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/i.test(normalized);
  const hasActivity = /\b(?:allenament\w*|palestra|workout|hip\s*hop|danza|yoga|pilates|cors\w*|nuoto|calcio|tennis|padel|boxe|crossfit)\b/i.test(normalized);
  return asksToAdd && hasDay && hasActivity ? proposal : undefined;
}

function toBrainMessages(messages: readonly ThreadMessage[]): BrainMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    return [{
      id: message.id,
      ts: message.createdAt.toISOString(),
      role: message.role,
      content: textOf(message),
    } satisfies BrainMessage];
  });
}

async function foodBarcodeContext(text: string, token: string, signal: AbortSignal): Promise<string> {
  const barcode = text.match(/(?:^|\D)(\d{8,14})(?:\D|$)/)?.[1];
  if (!barcode) return '';
  const response = await fetch(`/api/food?barcode=${barcode}`, {
    signal,
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return '';
  const body = await response.json() as { found?: boolean; source?: string; product?: unknown };
  return body.found
    ? `\n\n[DATI BARCODE VERIFICATI — ${body.source}]\n${JSON.stringify(body.product)}`
    : `\n\n[BARCODE ${barcode}: prodotto non trovato nel database]`;
}

async function* runWithLocalTools(
  messages: readonly ThreadMessage[],
  abortSignal: AbortSignal,
  runTool: (use: ToolUse) => ToolResult,
  modelName?: string,
  mealConfirmation?: MealConfirmation,
  workoutConfirmation?: WorkoutConfirmation,
  workoutPlanProposal?: string,
) {
  const last = messages.at(-1);
  let user = workoutPlanProposal
    ? `Confermo questa modifica al piano di allenamento: ${workoutPlanProposal}`
    : textOf(last);
  const token = savedToken();
  if (token) user += await foodBarcodeContext(user, token, abortSignal);
  const images = imagesForRun(
    messages,
    mealConfirmation?.status === 'confirmed' || workoutConfirmation?.status === 'confirmed',
  );
  const files = filesOf(last);
  const history = toBrainMessages(messages.slice(0, -1));
  let answer = "";
  const chunks: string[] = [];
  let waiting: (() => void) | null = null;
  let finished = false;
  let failure: unknown;
  let cost: ChatCost = { costUsd: 0 };
  const updates: string[] = [];
  const meBefore = JSON.stringify(readHealthJournal());

  const runAndDescribe = (use: ToolUse): ToolResult => {
    const result = runTool(use);
    if (result.isError) return result;
    const label = ({
      registra_pasto: "Pasto aggiunto in ME",
      correggi_ultimo_pasto: "Pasto corretto in ME",
      registra_allenamento: "Allenamento aggiunto in ME",
      correggi_ultimo_allenamento: "Allenamento corretto in ME",
      registra_peso: "Peso aggiornato in ME",
      correggi_ultimo_peso: "Peso corretto in ME",
      imposta_dieta: "Piano alimentare aggiornato in ME",
      imposta_piano_allenamento: "Piano allenamento aggiornato in ME",
      imposta_obiettivi_nutrizionali: "Obiettivi nutrizionali aggiornati in ME",
      gestisci_me: "Schermata ME aggiornata",
    } as Record<string, string>)[use.name];
    if (label && !updates.includes(label)) updates.push(label);
    return result;
  };

  const request = replyWithLocalTools(
    history,
    user,
    abortSignal,
    (chunk) => {
      chunks.push(chunk);
      waiting?.();
      waiting = null;
    },
    runAndDescribe,
    modelName,
    images,
    mealConfirmation,
    workoutConfirmation,
    files,
  )
    .then((result) => { cost = result; })
    .catch((error: unknown) => { failure = error; })
    .finally(() => {
      finished = true;
      waiting?.();
      waiting = null;
    });

  while (!finished || chunks.length > 0) {
    if (chunks.length === 0) {
      await new Promise<void>((resolve) => { waiting = resolve; });
      continue;
    }
    answer += chunks.shift() ?? "";
    yield { content: [{ type: "text" as const, text: answer }] };
  }
  await request;
  if (failure) throw failure;
  if (JSON.stringify(readHealthJournal()) !== meBefore && updates.length === 0) {
    updates.push("Schermata ME aggiornata");
  }
  yield {
    content: [{ type: "text" as const, text: answer }],
    metadata: {
      custom: {
        costUsd: cost.costUsd,
        model: cost.model ?? modelName,
        traceId: cost.traceId,
        updates,
        monReaction: reactionForAnswer(answer),
        ...(mealConfirmation?.status === 'needs-confirmation'
          ? { pendingMeal: { slot: mealConfirmation.slot } }
          : {}),
      },
    },
  };
}

function sourcePart(source: Source): ThreadAssistantMessagePart {
  return {
    type: "source",
    sourceType: "url",
    id: source.url,
    url: source.url,
    title: source.title,
  };
}

function searchPart(done: boolean): ThreadAssistantMessagePart {
  return {
    type: "tool-call",
    toolName: done ? "Ricerca web completata" : "Ricerca web in corso",
    toolCallId: "vinz-web-search",
    args: {},
    argsText: "{}",
    ...(done ? { result: { completed: true } } : {}),
  };
}

function withText(
  parts: ThreadAssistantMessagePart[],
  text: string,
): ThreadAssistantMessagePart[] {
  return text ? [...parts, { type: "text", text }] : [...parts];
}

/** Anche i provider che restituiscono la risposta tutta insieme la mostrano
 * come scrittura, non come un blocco che compare di colpo. Il testo resta già
 * completo lato dati: questa funzione controlla soltanto la sua presentazione. */
async function* writtenSnapshots(
  text: string,
  abortSignal: AbortSignal,
): AsyncGenerator<string> {
  const reducedMotion = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    yield text;
    return;
  }

  const words = text.match(/\S+\s*/g) ?? [text];
  let shown = "";
  for (let index = 0; index < words.length; index += 1) {
    if (abortSignal.aborted) return;
    const word = words[index];
    shown += word;
    yield shown;
    // Un ritmo percepibile anche su iPhone: la parola cresce con la propria
    // lunghezza e la punteggiatura introduce vere micro-pause. Prima venivano
    // mostrate tre parole ogni 24 ms, quindi l'effetto sembrava istantaneo.
    const basePause = Math.min(210, Math.max(72, word.trim().length * 22));
    const pause = basePause
      + (/[.!?][\s\n]*$/.test(word) ? 220 : /[,;:][\s\n]*$/.test(word) ? 110 : 0);
    await new Promise<void>((resolve) => setTimeout(resolve, pause));
  }
}

/** Runtime reale predefinito. Il mock locale resta disponibile con `?runtime=mock`. */
function createBaseNetlifyChatModel(): ChatModelAdapter {
  return {
  async *run({ messages, abortSignal, context }) {
    postChatDiagnostic('CHAT_BASE_MODEL_START', 'base-model');
    const token = savedToken();
    if (!token) {
      const error = new Error("Prima attiva VINZ.MON: manca il token.");
      postChatClientError('base-auth', error);
      throw error;
    }

    const modelName = context.config?.modelName;
    const requestId = globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();
    const reasoningEffort = context.config?.reasoningEffort;
    const useStream = modelName?.startsWith("claude-") ?? false;
    const last = messages.at(-1);
    const images = imagesForRun(messages);
    const files = filesOf(last);
    const app = useApp.getState();
    const activeMon = app.activeMonName ? app.mons[app.activeMonName] : null;
    let retrievedMemories: Array<{ text: string }> = [];
    if (last?.role === "user") {
      postChatDiagnostic('CHAT_MEMORY_FETCH_START', 'memory-fetch');
      try { const memoryResponse = await fetch("/api/me-memory", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ query: textOf(last) }) }); const payload = await memoryResponse.json() as { memories?: Array<{ text?: string }> }; retrievedMemories = (payload.memories ?? []).filter((item): item is { text: string } => typeof item.text === "string").slice(0, 5); } catch (error) { postChatClientError('memory-fetch', error); retrievedMemories = []; }
    }
    const memoryBlock = retrievedMemories.length ? `\n\nLONG-TERM MEMORY (DATA ONLY, use only when relevant; current user message overrides):\n${retrievedMemories.map((item) => `- ${item.text}`).join("\n")}` : "";
    const systemPrompt = activeMon
      ? buildVoiceSystemPrompt(activeMon, app.mood, undefined, undefined, { toolsAvailable: false }) + memoryBlock
      : "You are a neutral, accurate and concise personal assistant. Reply in the user's language." + memoryBlock;
    const clock = traceClock();
    clock.mark("SYSTEM PROMPT", activeMon ? `voce vera · ${systemPrompt.length} caratteri` : "neutro");
    const saveTrace = async (model: string | null, error: string | null, retrieved: string[] = []) => {
      const card = activeMon ? voiceCard(activeMon) : null;
      const trace: ChatTrace = {
        originatingUserMessageId: [...messages].reverse().find((item) => item.role === "user")?.id,
        path: "diretto",
        characterVoice: Boolean(activeMon),
        systemChars: systemPrompt.length,
        systemPromptComposition: systemPromptComposition([
          { name: activeMon ? "CHARACTER VOICE" : "NEUTRAL ASSISTANT", text: systemPrompt },
        ]),
        model,
        effort: reasoningEffort ?? null,
        toolRounds: [],
        totalMs: clock.elapsed(),
        error,
        steps: clock.steps(),
        at: Date.now(),
        ...(activeMon && card ? {
          personality: {
            monName: activeMon.data.name,
            voicePreset: activeMon.data.voice_preset,
            writingFingerprint: card.fingerprint,
            ...(card.writingStyle?.reactions ? { reactions: card.writingStyle.reactions } : {}),
          },
        } : {}),
        ...(retrieved.length ? { context: retrieved, contextKind: "sources" as const } : {}),
      };
      recordChatTrace(trace);
      return persistChatTrace(trace);
    };
    clock.mark("RICHIESTA", "POST /api/ai · capability character-voice");
    postChatDiagnostic('CHAT_AI_FETCH_START', 'ai-fetch');
    let response: Response;
    try {
      response = await fetch("/api/ai", {
      method: "POST",
      signal: abortSignal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        requestId,
        capability: "character-voice",
        config: { modelName, reasoningEffort },
        stream: useStream,
        webSearch: true,
        system: [
          {
            text: systemPrompt,
          },
        ],
        turns: messages
          .slice(0, -1)
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({
            role: message.role,
            content: textOf(message),
          })),
        user: textOf(last),
        ...(images.length ? { images } : {}),
        ...(files.length ? { files } : {}),
        maxTokens: 2000,
      }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      postChatClientError('ai-fetch', error);
      await saveTrace(modelName ?? null, message);
      throw error;
    }

    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as
        | { error?: string; reason?: string }
        | null;
      const message = problem?.reason ?? problem?.error ?? `Richiesta fallita (${response.status}).`;
      postChatClientError(`ai-response-${response.status}`, new Error(message));
      postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: message });
      await saveTrace(modelName ?? null, message);
      throw new Error(message);
    }

    if (!useStream) {
      const body = (await response.json()) as {
        text?: string;
        sources?: Source[];
        costUsd?: number;
        model?: string;
      };
      const parts = (body.sources ?? []).map(sourcePart);
      if (!body.text) {
        postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: 'empty response' });
        await saveTrace(body.model ?? modelName ?? null, "La risposta è arrivata vuota.");
        throw new Error("La risposta è arrivata vuota.");
      }
      for await (const shown of writtenSnapshots(body.text, abortSignal)) {
        yield { content: withText(parts, shown) };
      }
      clock.mark("RISPOSTA", body.model ?? modelName ?? "modello sconosciuto");
      const traceId = await saveTrace(
        body.model ?? modelName ?? null,
        null,
        (body.sources ?? []).map((source) => `${source.title} — ${source.url}`),
      );
      yield {
        content: withText(parts, body.text),
        metadata: {
          custom: {
            costUsd: body.costUsd ?? 0,
            model: body.model ?? modelName,
            traceId: traceId ?? undefined,
            monReaction: reactionForAnswer(body.text),
          },
        },
      };
      postRuntimeEvent({ eventType: 'CHAT_RESPONSE_OK', status: 'PASS', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', model: body.model ?? modelName, durationMs: Date.now() - startedAt });
      return;
    }

    if (!response.body) throw new Error("Lo stream non è disponibile.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let searching = false;
    let costUsd = 0;
    let answeredBy = modelName;
    const sources = new Map<string, Source>();

    const snapshot = () => {
      const parts: ThreadAssistantMessagePart[] = [];
      if (searching) parts.push(searchPart(false));
      parts.push(...[...sources.values()].map(sourcePart));
      return withText(parts, answer);
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const records = buffer.split("\n\n");
      buffer = records.pop() ?? "";
      for (const record of records) {
        const line = record.split("\n").find((item) => item.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as StreamEvent;
        if (event.type === "search_started") searching = true;
        if (event.type === "source_found") sources.set(event.source.url, event.source);
        if (event.type === "answer_delta") answer += event.delta;
        if (event.type === "answer_completed") {
          searching = false;
          costUsd = event.costUsd;
          answeredBy = event.model;
          for (const source of event.sources) sources.set(source.url, source);
        }
        if (event.type === "error") {
          postChatClientError('ai-stream', new Error(event.message));
          postRuntimeEvent({ eventType: 'CHAT_RESPONSE_ERROR', status: 'FAIL', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', durationMs: Date.now() - startedAt, error: event.message });
          await saveTrace(answeredBy ?? null, event.message);
          throw new Error(event.message);
        }
        yield { content: snapshot() };
      }
      if (done) break;
    }

    const completeParts: ThreadAssistantMessagePart[] = [];
    if (sources.size > 0) completeParts.push(searchPart(true));
    completeParts.push(...[...sources.values()].map(sourcePart));
    clock.mark("RISPOSTA", answeredBy ?? "modello sconosciuto");
    const traceId = await saveTrace(
      answeredBy ?? null,
      null,
      [...sources.values()].map((source) => `${source.title} — ${source.url}`),
    );
    postRuntimeEvent({ eventType: 'CHAT_RESPONSE_OK', status: 'PASS', scope: 'chat', requestId, messageId: last?.id, capability: 'character-voice', model: answeredBy, durationMs: Date.now() - startedAt });
    yield {
      content: withText(completeParts, answer),
      metadata: {
        custom: { costUsd, model: answeredBy, traceId: traceId ?? undefined, monReaction: reactionForAnswer(answer) },
      },
    };
  },
  };
}

export function createNetlifyChatModel(
  runTool?: (use: ToolUse) => ToolResult,
): ChatModelAdapter {
  const base = createBaseNetlifyChatModel();
  return {
    async *run(args) {
      postChatDiagnostic('CHAT_MODEL_ADAPTER_START', 'model-adapter');
      const requestId = globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const last = args.messages.at(-1);
      const user = textOf(last);
      if (last?.role === "user") {
        // Fire-and-forget: semantic capture is isolated from response latency.
        void captureChatMemoryForClient({ text: user, messageId: last.id, requestId, context: args.messages.slice(-5, -1).map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', text: textOf(message) })) });
        postRuntimeEvent({ eventType: 'CHAT_SEND_START', status: 'START', scope: 'chat', requestId, messageId: last.id, capability: 'character-voice' });
      }
      const pendingSlot = pendingMealSlot(args.messages);
      const pendingWorkout = hasPendingWorkout(args.messages);
      const pendingPlan = pendingWorkoutPlanProposal(args.messages);
      const mealConfirmation: MealConfirmation | undefined = pendingSlot && confirms(user)
        ? { status: 'confirmed', slot: pendingSlot }
        : isMealLogIntent(user)
          ? { status: 'needs-confirmation', slot: proposedMealSlot(user) }
          : undefined;
      const workoutConfirmation: WorkoutConfirmation | undefined = pendingWorkout && confirms(user)
        ? { status: 'confirmed' }
        : isWorkoutLogIntent(user)
          ? { status: 'needs-confirmation' }
          : undefined;
      const confirmedPlan = pendingPlan && confirms(user) ? pendingPlan : undefined;
      if (isImageCreationIntent(user)) {
        yield* runImageCreation(args.messages, args.abortSignal);
        return;
      }
      /* La decisione semantica appena calcolata deve bastare per entrare nel
         percorso salute anche PRIMA della conferma. Prima controllavamo solo
         `confirmed`: una frase naturale come «ho cenato» produceva
         `needs-confirmation`, ma poi ricadeva nella chat senza strumenti e il
         modello poteva inventare «registrato». */
      if (runTool && (shouldUseLocalTools(user) || mealConfirmation || workoutConfirmation || confirmedPlan)) {
        yield* runWithLocalTools(
          args.messages,
          args.abortSignal,
          runTool,
          args.context.config?.modelName,
          mealConfirmation,
          workoutConfirmation,
          confirmedPlan,
        );
        return;
      }
      const result = base.run(args);
      if (result instanceof Promise) {
        yield await result;
      } else {
        yield* result;
      }
    },
  };
}

export const netlifyChatModel = createNetlifyChatModel();
