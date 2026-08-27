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
const THREADS_KEY = "assistant-ui-official-chatgpt:threads";
const RESTORE_TIMEOUT_MS = 4_000;

function localRestoredThreadId(): string | null | undefined {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const valid = parsed.filter((thread): thread is { remoteId: string; status?: string } =>
      typeof thread === "object"
      && thread !== null
      && typeof (thread as { remoteId?: unknown }).remoteId === "string"
      && ((thread as { status?: unknown }).status === undefined
        || (thread as { status?: unknown }).status === "regular"),
    );
    const saved = localStorage.getItem(ACTIVE_THREAD_KEY);
    return valid.some((thread) => thread.remoteId === saved)
      ? saved
      : valid[0]?.remoteId ?? null;
  } catch {
    return undefined;
  }
}

function restoreTimeout(): Promise<null> {
  return new Promise((resolve) => window.setTimeout(() => resolve(null), RESTORE_TIMEOUT_MS));
}

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
    /* La migrazione può richiedere una chiamata per ogni vecchia chat. Serve a
       sincronizzare copie legacy, ma non deve bloccare il primo render. */
    void migrateStoragePrefix("assistant-ui-official-chatgpt:").catch((error: unknown) => {
      console.warn("[VINZ chat] migrazione storage non riuscita; uso lo storage corrente", error);
    });

    const restore = Promise.allSettled([
      threadAdapter.list(),
      serverBackedStorage.getItem(ACTIVE_THREAD_KEY),
    ] as const);

    void Promise.race([restore, restoreTimeout()]).then((result) => {
      if (cancelled) return;
      if (result === null) {
        console.warn("[VINZ chat] ripristino remoto scaduto; uso la copia locale");
        setRestoredThreadId(localRestoredThreadId() ?? null);
        return;
      }

      const [listResult, activeResult] = result;
      if (listResult.status === "rejected") {
        console.warn("[VINZ chat] elenco conversazioni non disponibile; uso la copia locale", listResult.reason);
        setRestoredThreadId(localRestoredThreadId() ?? null);
        return;
      }

      const valid = listResult.value.threads.filter((thread) => thread.status === "regular");
      const saved = activeResult.status === "fulfilled" ? activeResult.value : null;
      if (activeResult.status === "rejected") {
        console.warn("[VINZ chat] conversazione attiva non disponibile; apro la più recente", activeResult.reason);
      }
      setRestoredThreadId(
        valid.some((thread) => thread.remoteId === saved)
          ? saved
          : valid[0]?.remoteId ?? null,
      );
    }).catch((error: unknown) => {
      if (cancelled) return;
      console.warn("[VINZ chat] ripristino fallito; uso uno stato locale valido", error);
      setRestoredThreadId(localRestoredThreadId() ?? null);
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
