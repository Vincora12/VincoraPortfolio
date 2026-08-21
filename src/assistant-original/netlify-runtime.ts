import type {
  ChatModelAdapter,
  ThreadAssistantMessagePart,
  ThreadMessage,
} from "@assistant-ui/react";
import {
  replyWithLocalTools,
  savedToken,
  shouldUseLocalTools,
  type ChatCost,
} from "@/brain/stream";
import type { BrainMessage } from "@/brain/store/types";
import type { ToolResult, ToolUse } from "@/ai/tools";

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

function imageOf(message: ThreadMessage | undefined): { mediaType: string; data: string } | undefined {
  if (!message) return undefined;
  for (const part of message.content) {
    if (part.type !== "image" || typeof part.image !== "string") continue;
    const match = part.image.match(/^data:([^;]+);base64,(.+)$/s);
    if (match?.[1] && match[2]) return { mediaType: match[1], data: match[2] };
  }
  return undefined;
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
) {
  const last = messages.at(-1);
  const user = textOf(last);
  const image = imageOf(last);
  const history = toBrainMessages(messages.slice(0, -1));
  let answer = "";
  const chunks: string[] = [];
  let waiting: (() => void) | null = null;
  let finished = false;
  let failure: unknown;
  let cost: ChatCost = { costUsd: 0 };

  const request = replyWithLocalTools(
    history,
    user,
    abortSignal,
    (chunk) => {
      chunks.push(chunk);
      waiting?.();
      waiting = null;
    },
    runTool,
    modelName,
    image,
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
    metadata: { custom: { costUsd: cost.costUsd, model: cost.model ?? modelName } },
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
      if (runTool && shouldUseLocalTools(user)) {
        yield* runWithLocalTools(
          args.messages,
          args.abortSignal,
          runTool,
          args.context.config?.modelName,
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
