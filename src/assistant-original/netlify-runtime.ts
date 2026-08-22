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

function pendingMealSlot(messages: readonly ThreadMessage[]): ChatMealSlot | undefined {
  const previous = messages.at(-2);
  if (previous?.role !== 'assistant') return undefined;
  const match = textOf(previous).match(
    /Confermi che lo registro come \*\*(colazione|spuntino|pranzo|merenda|cena|extra)(?:\s*\/[^*]+)?\*\*\?/i,
  );
  return match?.[1]?.toLocaleLowerCase('it-IT') as ChatMealSlot | undefined;
}

const confirms = (text: string) => /^\s*(?:s[iì]|confermo|ok(?:ay)?|va bene|esatto|corretto)\b/i.test(text);

function hasPendingWorkout(messages: readonly ThreadMessage[]): boolean {
  const previous = messages.at(-2);
  return previous?.role === 'assistant'
    && /Confermi che registro questo \*\*allenamento\*\* in ME\?/i.test(textOf(previous));
}

/** Recupera una modifica al piano proposta dall'AI e appena confermata. */
function pendingWorkoutPlanProposal(messages: readonly ThreadMessage[]): string | undefined {
  const previous = messages.at(-2);
  if (previous?.role !== 'assistant') return undefined;
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
  const user = workoutPlanProposal
    ? `Confermo questa modifica al piano di allenamento: ${workoutPlanProposal}`
    : textOf(last);
  const images = imagesForRun(
    messages,
    mealConfirmation?.status === 'confirmed' || workoutConfirmation?.status === 'confirmed',
  );
  const history = toBrainMessages(messages.slice(0, -1));
  let answer = "";
  const chunks: string[] = [];
  let waiting: (() => void) | null = null;
  let finished = false;
  let failure: unknown;
  let cost: ChatCost = { costUsd: 0 };
  const updates: string[] = [];

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
  yield {
    content: [{ type: "text" as const, text: answer }],
    metadata: {
      custom: {
        costUsd: cost.costUsd,
        model: cost.model ?? modelName,
        updates,
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

/** Runtime reale predefinito. Il mock locale resta disponibile con `?runtime=mock`. */
function createBaseNetlifyChatModel(): ChatModelAdapter {
  return {
  async *run({ messages, abortSignal, context }) {
    const token = savedToken();
    if (!token) throw new Error("Prima attiva VINZ.MON: manca il token.");

    const modelName = context.config?.modelName;
    const reasoningEffort = context.config?.reasoningEffort;
    const useStream = modelName?.startsWith("claude-") ?? false;
    const last = messages.at(-1);
    const images = imagesForRun(messages);
    const response = await fetch("/api/ai", {
      method: "POST",
      signal: abortSignal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        capability: "character-voice",
        config: { modelName, reasoningEffort },
        stream: useStream,
        webSearch: true,
        system: [
          {
            text: "You are a neutral, accurate and concise personal assistant. Reply in the user's language.",
          },
        ],
        turns: messages.slice(0, -1).map((message) => ({
          role: message.role,
          content: textOf(message),
        })),
        user: textOf(last),
        ...(images.length ? { images } : {}),
        maxTokens: 2000,
      }),
    });

    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as
        | { error?: string; reason?: string }
        | null;
      throw new Error(problem?.reason ?? problem?.error ?? `Richiesta fallita (${response.status}).`);
    }

    if (!useStream) {
      const body = (await response.json()) as {
        text?: string;
        sources?: Source[];
        costUsd?: number;
        model?: string;
      };
      const parts = (body.sources ?? []).map(sourcePart);
      if (!body.text) throw new Error("La risposta è arrivata vuota.");
      yield {
        content: withText(parts, body.text),
        metadata: {
          custom: { costUsd: body.costUsd ?? 0, model: body.model ?? modelName },
        },
      };
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
        if (event.type === "error") throw new Error(event.message);
        yield { content: snapshot() };
      }
      if (done) break;
    }

    const completeParts: ThreadAssistantMessagePart[] = [];
    if (sources.size > 0) completeParts.push(searchPart(true));
    completeParts.push(...[...sources.values()].map(sourcePart));
    yield {
      content: withText(completeParts, answer),
      metadata: { custom: { costUsd, model: answeredBy } },
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
      const last = args.messages.at(-1);
      const user = textOf(last);
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
      if (runTool && (shouldUseLocalTools(user) || mealConfirmation?.status === 'confirmed' || workoutConfirmation?.status === 'confirmed' || confirmedPlan)) {
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
