import { useEffect, useMemo, type FC } from "react";
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
import { VinzImageAttachmentAdapter } from "./image-attachment";
import { ChatSurface } from "./chat-surface";
import "./styles.css";
import { serverBackedStorage } from "@/system/serverStorage";

const threadAdapter = createLocalStorageAdapter({
  storage: serverBackedStorage,
  prefix: "assistant-ui-official-chatgpt:",
  titleGenerator: createSimpleTitleAdapter(),
});

const attachments = new CompositeAttachmentAdapter([
  new VinzImageAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

type IntegratedChatProps = {
  runTool: (use: ToolUse) => ToolResult;
  voiceModel?: string | null;
  onModelChange?: (model: string) => void;
};

export const IntegratedChat: FC<IntegratedChatProps> = ({
  runTool,
  voiceModel,
  onModelChange,
}) => {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
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
      <ChatSurface model={voiceModel} onModelChange={onModelChange} />
    </AssistantRuntimeProvider>
  );
};
