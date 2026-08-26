import { useEffect, useMemo, type CSSProperties, type FC } from "react";
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
    void migrateStoragePrefix("assistant-ui-official-chatgpt:");
  }, [embedded]);
  const model = useMemo(() => createNetlifyChatModel(runTool), [runTool]);
  const runtime = useRemoteThreadListRuntime({
    adapter: threadAdapter,
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
