/* ============================================================================
   LA CHAT VERA, CON UN MOTORE FINTO

   🔒 «DESIGN.LAB MUST MOUNT REAL VINZ.MON REACT COMPONENTS. DO NOT COPY THE UI.»

   ⚠️ MA NON `IntegratedChat`. Quello non è solo la superficie: migra le
   conversazioni salvate e parla col thread adapter sul server. Montarlo in
   preview vorrebbe dire che aprire DESIGN.LAB migra l'archivio delle chat.

   Quindi si monta `ChatSurface` — la superficie vera, la stessa che si vede in
   produzione — e le si dà sotto un runtime che vive solo in memoria e non
   chiama nessun modello. La forma è quella vera, il motore no: è esattamente
   la divisione che serve per guardare un'interfaccia senza usarla.
   ========================================================================= */

import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { ChatSurface } from '../../assistant-original/chat-surface';

const previewModel = {
  async run() {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'DESIGN.LAB: qui nessuna richiesta parte davvero.',
        },
      ],
    };
  },
};

export function DesignChatPreview() {
  const runtime = useLocalRuntime(previewModel as never);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatSurface />
    </AssistantRuntimeProvider>
  );
}
