import { type CSSProperties, type FC, useEffect } from "react";
import { ChatGPT } from "./components/examples/chatgpt";
import { ChatStorageStatus, ConversationTabs, useConversationOptions } from './conversation-options';
import type { ProjectRef } from './ProjectPill';

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
export const ChatSurface: FC<ChatSurfaceProps> = ({ embedded = false, themeStyle }) => {
  const { controls, workspace, scope, inheritScope, selectProject, modelChoice } = useConversationOptions();

  /* 🔷 «Nel nav, come pillola» — non nella barra della chat, in basso, dove
     vive `<nav className="tabbar">` (App.tsx), un albero completamente
     diverso da questo (fuori da `AssistantRuntimeProvider`). Stesso bus di
     `vinz-workspace-close`/`vinz-open-chat`: TabBar riceve lo scope attuale
     e manda i cambi qui, dove `aui` esiste davvero. */
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vinz-project-scope', { detail: scope }));
  }, [scope]);
  useEffect(() => {
    const onSelect = (event: Event) => {
      void selectProject((event as CustomEvent<ProjectRef | null>).detail);
    };
    window.addEventListener('vinz-select-project', onSelect);
    return () => window.removeEventListener('vinz-select-project', onSelect);
  }, [selectProject]);

  if (embedded) {
    return (
      <main style={themeStyle} className="assistant-clone relative flex h-full min-h-0 flex-col overflow-hidden bg-white text-[#0d0d0d]">
        <ConversationTabs scope={scope} onNewThread={inheritScope} /><ChatStorageStatus />
        <div className="min-h-0 flex-1">
          <ChatGPT sidebarContent={controls} newThreadScope={scope} onNewThread={inheritScope} modelChoice={modelChoice} />
        </div>
        {workspace}
      </main>
    );
  }

  /* 🔷 UN FILO CONTINUO PER PROGETTO, NON PIÙ UNO SOLO GLOBALE. La pillola non
     sta più sopra al composer: vive nella barra di navigazione in basso
     (`TabBar`, App.tsx), a sinistra di CHAT · VINZ.MON · ME · SYNC — «un
     pezzo del nav». Sceglierla chiama `selectProject` (sopra, via evento):
     non ritagga il filo corrente, cambia thread — o ne apre uno nuovo la
     prima volta — verso quello già dedicato a quel progetto. Stessa
     continuità di prima, moltiplicata per progetto invece che unica su
     tutto. Vedi `docs/VINZ_CURRENT_SIMPLIFICATION.md` per il perché della
     vecchia scelta — questo la evolve, non la ribalta. */
  return (
    <main style={themeStyle} className="assistant-clone dark relative h-full min-h-0 overflow-hidden bg-black text-[#ececec]">
      <div className="vinz-chat-top-controls"><ChatStorageStatus /></div>
      <ChatGPT newThreadScope={scope} onNewThread={inheritScope} modelChoice={modelChoice} />
      {workspace}
    </main>
  );
};
