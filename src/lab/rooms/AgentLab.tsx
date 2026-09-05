/* ============================================================================
   🕵️ AGENT.LAB — PROJECT INSPECTOR

   🔒 CONFINE — READ ACCESS → intero progetto. WRITE ACCESS → esclusivamente
   presentazionale, e nemmeno quello è una scrittura reale (vedi
   `docs/AGENT_LAB_V1_2026-09-04.md` e `netlify/functions/agent-lab.ts`).
   Questa stanza è la chat principale, senza contesto di un nodo del FLOW —
   per quella versione vedi `AgentLabModal.tsx`, aperta da CREATION.LAB.
   ========================================================================= */

import { LabStyle } from '../embed/LabStyle';
import systemCss from '../skin/system.css?inline';
import agentCss from '../skin/agent.css?inline';
import { Btn, LabTop, Notice, PageHead } from './parts';
import { AgentLabChat } from './AgentLabChat';

export function AgentLab({ onBack }: { onBack: () => void }) {
  return (
    <div className="app">
      <LabStyle css={systemCss} />
      <LabStyle css={agentCss} />
      <LabTop tabs={[{ id: 'inspector', label: 'INSPECTOR' }]} active="inspector" onTab={() => {}} onBack={onBack} />
      <main>
        <section className="page active">
          <PageHead
            kicker="AGENT.LAB / PROJECT INSPECTOR"
            title="AGENT.LAB"
            lead="L’agente tecnico interno di VINZ.MON. Legge l’intero progetto per rispondere — non inventa spiegazioni a memoria."
          />
          <Notice title="CONFINE">
            READ ACCESS → intero progetto (codice, config, documentazione). WRITE ACCESS →
            esclusivamente presentazionale, e nemmeno quello è mai una scrittura reale su
            repository: una richiesta genuinamente UI-only torna come patch pronta da incollare,
            mai applicata da sola. Nessuna chiave, token o segreto è mai leggibile da qui.
          </Notice>
          <AgentLabChat persistKey="main" />
          <div className="footer mono">AGENT.LAB · READ-ONLY SUL PROGETTO · SCRITTURA SOLO PRESENTAZIONALE, MAI AUTOMATICA</div>
          <Btn onClick={onBack}>← TORNA A VINZ.LAB</Btn>
        </section>
      </main>
    </div>
  );
}
