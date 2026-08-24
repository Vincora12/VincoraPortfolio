import type {
  ChatModelAdapter,
  ThreadAssistantMessagePart,
  ThreadMessage,
} from "@assistant-ui/react";

function textOf(message: ThreadMessage | undefined): string {
  if (!message) return "";
  return message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .trim();
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function toolPart(
  toolName: string,
  toolCallId: string,
  result?: Record<string, unknown>,
): ThreadAssistantMessagePart {
  return {
    type: "tool-call",
    toolName,
    toolCallId,
    args: {},
    argsText: "{}",
    ...(result ? { result } : {}),
  };
}

export const mockChatModel: ChatModelAdapter = {
  async *run({ messages, abortSignal, context }) {
    const prompt = textOf(messages.at(-1));
    const normalized = prompt.toLocaleLowerCase("it");
    const model = context.config?.modelName ?? "modello non selezionato";
    const effort = context.config?.reasoningEffort;
    const prefix = effort ? `${model} · ragionamento ${effort}` : model;
    const parts: ThreadAssistantMessagePart[] = [];

    if (normalized.includes("cerca") || normalized.includes("ricerca")) {
      parts.push(toolPart("Ricerca web in corso", "mock-search"));
      yield { content: [...parts] };
      await wait(450, abortSignal);
      parts.push(
        {
          type: "source",
          sourceType: "url",
          id: "assistant-ui-docs",
          url: "https://www.assistant-ui.com/docs/ui/model-selector",
          title: "assistant-ui Model Selector",
        },
        {
          type: "source",
          sourceType: "url",
          id: "assistant-ui-sources",
          url: "https://www.assistant-ui.com/docs/ui/sources",
          title: "assistant-ui Sources",
        },
      );
      parts[0] = toolPart("Ricerca web completata", "mock-search", {
        sources: 2,
      });
    } else if (
      normalized.includes("mangiato") ||
      normalized.includes("pasto")
    ) {
      parts.push(toolPart("Sto inserendo il pasto giornaliero", "mock-food"));
      yield { content: [...parts] };
      await wait(500, abortSignal);
      parts[0] = toolPart("Pasto inserito", "mock-food", { saved: true });
    }

    const reply = `Risposta mock locale con ${prefix}. Il runtime assistant-ui è attivo; nessuna API key è stata usata.`;
    let streamed = "";
    for (const word of reply.split(" ")) {
      await wait(42, abortSignal);
      streamed += `${streamed ? " " : ""}${word}`;
      yield {
        content: [...parts, { type: "text", text: streamed }],
      };
    }
    yield {
      content: [...parts, { type: "text", text: streamed }],
      metadata: { custom: { costUsd: 0, model } },
    };
  },
};
