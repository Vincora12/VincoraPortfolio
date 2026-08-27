import { useEffect, useMemo, useState, type CSSProperties, type FC } from "react";
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import {
  createLocalStorageAdapter,
  createSimpleTitleAdapter,
} from "@assistant-ui/core/react";
import type { ToolResult, ToolUse } from "@/ai/tools";
import { createNetlifyChatModel } from "./netlify-runtime";
import { VinzImageAttachmentAdapter, VinzPdfAttachmentAdapter } from "./image-attachment";
import { ChatSurface } from "./chat-surface";
import "./styles.css";
import { migrateStoragePrefix, serverBackedStorage } from "@/system/serverStorage";
import { useApp } from "@/state/store";
import { ensureContrastOnBlack, ensureContrastOnWhite, readableOn } from "@/engine/colorDna";

const threadAdapter = createLocalStorageAdapter({
  storage: serverBackedStorage,
  prefix: "assistant-ui-official-chatgpt:",
  titleGenerator: createSimpleTitleAdapter(),
});

const ACTIVE_THREAD_KEY = "assistant-ui-official-chatgpt:active-thread";

const attachments = new CompositeAttachmentAdapter([
  new VinzImageAttachmentAdapter(),
  new VinzPdfAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

type IntegratedChatProps = {
  runTool: (use: ToolUse) => ToolResult;
  voiceModel?: string | null;
  onModelChange?: (model: string) => void;
  /* 🔷 «Tutte le pagine assistente devono essere interamente come quella
     della chat, con tutte le funzionalità, ma in bianco.» `embedded` monta
     la STESSA `<ChatSurface/>`, non una copia: niente `.dark` forzato su
     `<html>` (il clone ha già `bg-white ... dark:bg-black` — è VINZ.MON che
     sceglie il nero, non il componente) e niente cornice tarata sulla tacca
     del telefono, che in un riquadro del lab non esiste. */
  embedded?: boolean;
};

export const IntegratedChat: FC<IntegratedChatProps> = ({
  runTool,
  voiceModel,
  onModelChange,
  embedded = false,
}) => {
  const palette = useApp((state) =>
    state.activeMonName ? state.mons[state.activeMonName]?.data.palette_dna ?? null : null,
  );
  const themeStyle = useMemo(() => {
    if (!palette) return undefined;
    const accentOnDark = ensureContrastOnBlack(palette.accent);
    const accentOnLight = ensureContrastOnWhite(palette.accent);
    return {
      "--char-primary": palette.primary,
      "--char-accent": accentOnLight,
      "--char-accent-on-dark": accentOnDark,
      "--char-on-primary": palette.on_primary,
      "--char-on-accent": readableOn(accentOnLight),
      "--char-on-accent-dark": readableOn(accentOnDark),
      "--char-primary-soft": `${palette.primary}1f`,
    } as CSSProperties;
  }, [palette]);

  useEffect(() => {
    if (!embedded) document.documentElement.classList.add("dark");
  }, [embedded]);
  const [restoredThreadId, setRestoredThreadId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void migrateStoragePrefix("assistant-ui-official-chatgpt:").then(() => Promise.all([
      threadAdapter.list(),
      serverBackedStorage.getItem(ACTIVE_THREAD_KEY),
    ])).then(([page, saved]) => {
      if (cancelled) return;
      const valid = page.threads.filter((thread) => thread.status === "regular");
      const restored = valid.some((thread) => thread.remoteId === saved)
        ? saved
        : valid[0]?.remoteId ?? null;
      setRestoredThreadId(restored);
    });
    return () => { cancelled = true; };
  }, []);

  if (restoredThreadId === undefined) {
    return <div className={embedded ? "h-full bg-white" : "h-full bg-black"} aria-label="Caricamento chat" />;
  }

  return (
    <IntegratedChatRuntime
      runTool={runTool}
      voiceModel={voiceModel}
      onModelChange={onModelChange}
      embedded={embedded}
      themeStyle={themeStyle}
      initialThreadId={restoredThreadId ?? undefined}
    />
  );
};

const IntegratedChatRuntime: FC<IntegratedChatProps & {
  themeStyle?: CSSProperties;
  initialThreadId?: string;
}> = ({ runTool, voiceModel, onModelChange, embedded = false, themeStyle, initialThreadId }) => {
  const model = useMemo(() => createNetlifyChatModel(runTool), [runTool]);
  const runtime = useRemoteThreadListRuntime({
    adapter: threadAdapter,
    initialThreadId,
    onThreadIdChange: (threadId) => {
      if (threadId) void serverBackedStorage.setItem(ACTIVE_THREAD_KEY, threadId);
    },
    runtimeHook: () =>
      useLocalRuntime(model, {
        adapters: { attachments },
      }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatSurface
        model={voiceModel}
        onModelChange={onModelChange}
        embedded={embedded}
        themeStyle={themeStyle}
      />
    </AssistantRuntimeProvider>
  );
};
