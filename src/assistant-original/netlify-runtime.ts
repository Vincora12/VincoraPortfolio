import type {
  ChatModelAdapter,
  ThreadAssistantMessagePart,
  ThreadMessage,
} from "@assistant-ui/react";
import { savedToken } from "@/brain/stream";

type Source = { title: string; url: string; domain?: string };
type StreamEvent =
  | { type: "search_started" }
  | { type: "source_found"; source: Source }
  | { type: "answer_started" }
  | { type: "answer_delta"; delta: string }
  | { type: "answer_completed"; sources: Source[] }
  | { type: "error"; message: string };

function textOf(message: ThreadMessage | undefined): string {
  if (!message) return "";
  return message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
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
export const netlifyChatModel: ChatModelAdapter = {
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
      const body = (await response.json()) as { text?: string; sources?: Source[] };
      const parts = (body.sources ?? []).map(sourcePart);
      if (!body.text) throw new Error("La risposta è arrivata vuota.");
      yield { content: withText(parts, body.text) };
      return;
    }

    if (!response.body) throw new Error("Lo stream non è disponibile.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let searching = false;
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
    yield { content: withText(completeParts, answer) };
  },
};
