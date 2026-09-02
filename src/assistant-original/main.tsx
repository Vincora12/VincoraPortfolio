import { StrictMode, useMemo, type FC } from "react";
import { createRoot } from "react-dom/client";
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
import { ChatSurface } from "./chat-surface";
import { mockChatModel } from "./mock-runtime";
import { netlifyChatModel } from "./netlify-runtime";
import { VinzImageAttachmentAdapter, VinzPdfAttachmentAdapter } from "./image-attachment";
import "@fontsource-variable/inter";
import "./standalone.css";
import { setLocalStorageItem } from "../system/localStorageDiagnostics";

const storage = {
  getItem: async (key: string) => localStorage.getItem(key),
  setItem: async (key: string, value: string) => setLocalStorageItem('assistant-original/main storage', key, value),
  removeItem: async (key: string) => localStorage.removeItem(key),
};

const threadAdapter = createLocalStorageAdapter({
  storage,
  prefix: "assistant-ui-official-chatgpt:",
  titleGenerator: createSimpleTitleAdapter(),
});

const attachments = new CompositeAttachmentAdapter([
  new VinzImageAttachmentAdapter(),
  new VinzPdfAttachmentAdapter(),
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
      <div className="h-dvh overflow-hidden"><ChatSurface /></div>
    </AssistantRuntimeProvider>
  );
};

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
