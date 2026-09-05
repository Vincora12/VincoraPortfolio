/* ============================================================================
   AGENT.LAB, APERTO DA UN NODO DEL FLOW

   🔷 «Gli step reali del FLOW devono poter aprire Agent.lab in un
   modal/popup. Quando viene aperto da uno step, Agent.lab deve conoscere
   automaticamente il contesto tecnico di quello step.»

   🔒 UN OVERLAY, NON UNA NAVIGAZIONE. Si apre sopra CREATION.LAB — il FLOW
   sotto resta esattamente com'era, nessuno stato si perde chiudendo. Monta
   lo stesso `AgentLabChat` della stanza AGENT.LAB, con `context` valorizzato
   dal passo che lo ha aperto — stessa identica logica di invio, stesso
   confine di lettura/scrittura, un solo componente.
   ========================================================================= */

import { useEffect } from 'react';
import { LabStyle } from '../embed/LabStyle';
import agentCss from '../skin/agent.css?inline';
import { AgentLabChat, type AgentLabStepContext } from './AgentLabChat';

export function AgentLabModal({ step, onClose }: { step: AgentLabStepContext; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="agentlab-modal-overlay" onClick={onClose}>
      <LabStyle css={agentCss} />
      <div className="agentlab-modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Agent.lab">
        <div className="agentlab-modal-head">
          <h2 className="mono">🕵️ AGENT.LAB</h2>
          <button type="button" className="agentlab-modal-close" onClick={onClose} aria-label="Chiudi Agent.lab">✕</button>
        </div>
        <AgentLabChat context={step} />
      </div>
    </div>
  );
}
