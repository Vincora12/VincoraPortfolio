import { StrictMode, useMemo, type FC } from "react";
import { createRoot } from "react-dom/client";
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import {
  createLocalStorageAdapter,
  createSimpleTitleAdapter,
} from "@assistant-ui/core/react";
import { ChatGPT } from "./components/examples/chatgpt";
import { ModelSelector } from "./components/assistant-ui/model-selector";
import { DEFAULT_MODEL_ID, MODELS } from "./models";
import { mockChatModel } from "./mock-runtime";
import { netlifyChatModel } from "./netlify-runtime";
import "@fontsource-variable/inter";
import "./styles.css";

const storage = {
  getItem: async (key: string) => localStorage.getItem(key),
  setItem: async (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: async (key: string) => localStorage.removeItem(key),
};

const threadAdapter = createLocalStorageAdapter({
  storage,
  prefix: "assistant-ui-official-chatgpt:",
  titleGenerator: createSimpleTitleAdapter(),
});

const attachments = new CompositeAttachmentAdapter([
  new SimpleImageAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

const selectedRuntime = new URLSearchParams(window.location.search).get("runtime");
const chatModel = selectedRuntime === "mock" ? mockChatModel : netlifyChatModel;

const App: FC = () => {
  const model = useMemo(() => chatModel, []);
  const runtime = useRemoteThreadListRuntime({
    adapter: threadAdapter,
    runtimeHook: () =>
      useLocalRuntime(model, {
        adapters: {
          attachments,
        },
      }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <main className="relative h-dvh overflow-hidden">
        <div
          aria-hidden="true"
          className="vinz-chat-top-fade pointer-events-none absolute inset-x-0 top-0 z-10 md:hidden"
        />
        <div className="absolute top-2 right-3 z-30">
          <ModelSelector
            models={MODELS}
            defaultValue={DEFAULT_MODEL_ID}
            defaultEffort="medium"
            variant="ghost"
            size="sm"
            align="end"
            className="rounded-full bg-white/80 dark:bg-[#212121]/90"
          />
        </div>
        <ChatGPT />
      </main>
    </AssistantRuntimeProvider>
  );
};

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
