/* ============================================================================
   🤖 L'ASSISTENTE — la stessa chat, raggiungibile da CREATION, SYSTEM e DESIGN

   🔷 «Le pagine assistente devono essere interamente come quella della chat,
   con tutte le funzionalità, ma in bianco — in questo modo la chat è
   utilizzabile.» Scelto esplicitamente: «chat vera con gli strumenti», non
   solo l'aspetto.

   Non è tre assistenti diversi: è la STESSA `IntegratedChat` di VINZ.MON —
   stessi strumenti (`runMonTool`: legge i tuoi dati, scrive pagine, imposta
   promemoria, cerca sul web), stessa dettatura, stesso selettore di modello.
   Da qualunque lab la apri vedi la STESSA cronologia: i thread sono
   sincronizzati dal server sullo stesso token (`serverBackedStorage`), quello
   che si incolla da SYSTEM.LAB → SETUP se il lab, installato come icona sua,
   non lo eredita da VINZ.MON.

   🔴 SOSTITUISCE IL MECCANISMO PRECEDENTE — chiedi a parole → proposta →
   APPLICA/ANNULLA, scoped a cataloghi/pesi/token, mai una scrittura da sola.
   Qui l'assistente agisce direttamente, con gli stessi strumenti della chat
   di casa: non è la rete di sicurezza di prima con un vestito nuovo, è la
   scelta esplicita di tenerla per l'app vera (PROPONI, in CREATION.LAB) e
   toglierla qui, dove serve un aiuto generale.

   🔒 IL TEMA È «EMBEDDED»: bianco nativo del clone, non il nero forzato sul
   telefono — vedi `chat-surface.tsx`. Non un secondo foglio di stile: la
   STESSA classe che il componente già porta per il suo tema chiaro.
   ========================================================================= */

import { IntegratedChat } from '../../assistant-original/IntegratedChat';
import { useApp } from '../../state/store';
import type { ToolResult, ToolUse } from '../../ai/tools';
import '../skin/lab-assistant.css';

const runChatTool = (use: ToolUse): ToolResult => useApp.getState().runMonTool(use);

export function LabAssistantPanel() {
  const voiceModel = useApp((s) => s.voiceModel);
  const setVoiceModel = useApp((s) => s.setVoiceModel);

  return (
    <section className="page active labai">
      <div className="kicker mono">DESIGN + CREATION + SYSTEM · LA STESSA CHAT DI CASA</div>
      <h1>🤖 ASSISTENTE</h1>
      <p className="lead">
        È la stessa chat di VINZ.MON, con gli stessi strumenti: legge i tuoi dati, scrive pagine,
        imposta promemoria, cerca sul web. La cronologia è la stessa ovunque la apri.
      </p>
      <div className="labai-chatbox">
        <IntegratedChat runTool={runChatTool} voiceModel={voiceModel} onModelChange={setVoiceModel} embedded />
      </div>
    </section>
  );
}
