import { type CSSProperties, type FC } from "react";
import { ChatGPT } from "./components/examples/chatgpt";
import { ModelSelector } from "./components/assistant-ui/model-selector";
import { DEFAULT_MODEL_ID, MODELS } from "./models";

type ChatSurfaceProps = {
  model?: string | null;
  onModelChange?: (model: string) => void;
  /* 🔷 «Le pagine assistente devono essere interamente come quella della
     chat, con tutte le funzionalità, ma in bianco.» `embedded` monta la
     STESSA `<ChatGPT/>`, non una copia: cambia solo la cornice attorno —
     niente sfumatura tarata sulla tacca del telefono (`vinz-chat-top-fade`),
     selettore modello nel flusso invece che ancorato con l'inset del notch,
     e il bianco nativo del clone invece del nero forzato da `dark`. */
  embedded?: boolean;
  themeStyle?: CSSProperties;
};

/** La superficie approvata resta identica sia nell'esempio sia dentro VINZ.MON. */
export const ChatSurface: FC<ChatSurfaceProps> = ({ model, onModelChange, embedded = false, themeStyle }) => {
  const picker = (
    <ModelSelector
      models={MODELS}
      value={model && MODELS.some((item) => item.id === model) ? model : undefined}
      defaultValue={DEFAULT_MODEL_ID}
      onValueChange={onModelChange}
      defaultEffort="medium"
      variant="ghost"
      size="sm"
      align="end"
      className={embedded ? "rounded-full bg-[#f4f4f4]" : "rounded-full bg-white/80 dark:bg-[#212121]/90"}
    />
  );

  if (embedded) {
    return (
      <main style={themeStyle} className="assistant-clone relative flex h-full min-h-0 flex-col overflow-hidden bg-white text-[#0d0d0d]">
        <div className="flex justify-end px-3 pt-2">{picker}</div>
        <div className="min-h-0 flex-1">
          <ChatGPT />
        </div>
      </main>
    );
  }

  return (
    <main style={themeStyle} className="assistant-clone dark relative h-full min-h-0 overflow-hidden bg-black text-[#ececec]">
      <div
        aria-hidden="true"
        className="vinz-chat-top-fade pointer-events-none absolute inset-x-0 top-0 z-10 md:hidden"
      />
      <div className="vinz-chat-model absolute right-3 z-30">{picker}</div>
      <ChatGPT />
    </main>
  );
};
