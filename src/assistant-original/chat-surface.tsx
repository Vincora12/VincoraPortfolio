import { type FC } from "react";
import { ChatGPT } from "./components/examples/chatgpt";
import { ModelSelector } from "./components/assistant-ui/model-selector";
import { DEFAULT_MODEL_ID, MODELS } from "./models";

type ChatSurfaceProps = {
  model?: string | null;
  onModelChange?: (model: string) => void;
};

/** La superficie approvata resta identica sia nell'esempio sia dentro VINZ.MON. */
export const ChatSurface: FC<ChatSurfaceProps> = ({ model, onModelChange }) => (
  <main className="assistant-clone dark relative h-full min-h-0 overflow-hidden bg-black text-[#ececec]">
    <div
      aria-hidden="true"
      className="vinz-chat-top-fade pointer-events-none absolute inset-x-0 top-0 z-10 md:hidden"
    />
    <div className="vinz-chat-model absolute right-3 z-30">
      <ModelSelector
        models={MODELS}
        value={model && MODELS.some((item) => item.id === model) ? model : undefined}
        defaultValue={DEFAULT_MODEL_ID}
        onValueChange={onModelChange}
        defaultEffort="medium"
        variant="ghost"
        size="sm"
        align="end"
        className="rounded-full bg-white/80 dark:bg-[#212121]/90"
      />
    </div>
    <ChatGPT />
  </main>
);
