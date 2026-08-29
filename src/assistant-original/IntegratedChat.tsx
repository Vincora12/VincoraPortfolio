import { useEffect, useMemo, useRef, type CSSProperties, type FC } from "react";
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useAuiState,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { createLocalStorageAdapter } from "@assistant-ui/core/react";
import type { ToolResult, ToolUse } from "@/ai/tools";
import { createNetlifyChatModel } from "./netlify-runtime";
import { VinzImageAttachmentAdapter, VinzPdfAttachmentAdapter } from "./image-attachment";
import { ChatSurface } from "./chat-surface";
import "./styles.css";
import { migrateStoragePrefix, serverBackedStorage } from "@/system/serverStorage";
import { useApp } from "@/state/store";
import { ensureContrastOnBlack, ensureContrastOnWhite, readableOn } from "@/engine/colorDna";
import { withLocalUnsavedSession } from "./conversation-lifecycle-adapter";

export const persistentThreadAdapter = createLocalStorageAdapter({
  storage: serverBackedStorage,
  prefix: "assistant-ui-official-chatgpt:",
});
const threadAdapter = withLocalUnsavedSession(
  persistentThreadAdapter,
  (remoteId, repository) => serverBackedStorage.setItem(
    `assistant-ui-official-chatgpt:messages:${remoteId}`,
    JSON.stringify(repository),
  ),
);

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
  onReady?: () => void;
};

export const IntegratedChat: FC<IntegratedChatProps> = ({
  runTool,
  voiceModel,
  onModelChange,
  embedded = false,
  onReady,
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
  useEffect(() => {
    void migrateStoragePrefix("assistant-ui-official-chatgpt:").catch((error: unknown) => {
      console.warn("[VINZ chat] migrazione storage non riuscita; uso lo storage corrente", error);
    });
  }, []);

  return (
    <IntegratedChatRuntime
      runTool={runTool}
      voiceModel={voiceModel}
      onModelChange={onModelChange}
      embedded={embedded}
      themeStyle={themeStyle}
      onReady={onReady}
    />
  );
};

const IntegratedChatRuntime: FC<IntegratedChatProps & {
  themeStyle?: CSSProperties;
}> = ({ runTool, voiceModel, onModelChange, embedded = false, themeStyle, onReady }) => {
  const model = useMemo(() => createNetlifyChatModel(runTool), [runTool]);
  const runtime = useRemoteThreadListRuntime({
    adapter: threadAdapter,
    onThreadIdChange: (threadId) => {
      if (threadId) void serverBackedStorage.setItem("assistant-ui-official-chatgpt:active-thread", threadId);
    },
    runtimeHook: () =>
      useLocalRuntime(model, {
        adapters: { attachments },
      }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatRuntimeReady onReady={onReady} />
      <ChatSurface
        model={voiceModel}
        onModelChange={onModelChange}
        embedded={embedded}
        themeStyle={themeStyle}
      />
    </AssistantRuntimeProvider>
  );
};

const CHAT_READY_FALLBACK_MS = 5_000;

const ChatRuntimeReady: FC<{ onReady?: () => void }> = ({ onReady }) => {
  const loading = useAuiState((state) => state.threads.isLoading);
  const reported = useRef(false);

  useEffect(() => {
    if (!onReady || reported.current || loading) return;
    reported.current = true;
    onReady();
  }, [loading, onReady]);

  useEffect(() => {
    if (!onReady || reported.current) return;
    const timeout = window.setTimeout(() => {
      if (reported.current) return;
      reported.current = true;
      console.warn("[VINZ chat] runtime ancora in caricamento; termino il boot in modalità degradata");
      onReady();
    }, CHAT_READY_FALLBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [onReady]);

  return null;
};
