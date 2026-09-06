/* ============================================================================
   🕵️ AGENT.LAB — PROJECT INSPECTOR

   🔒 CONFINE — READ ACCESS → intero progetto. WRITE ACCESS → esclusivamente
   presentazionale, e nemmeno quello è una scrittura reale (vedi
   `docs/AGENT_LAB_V1_2026-09-04.md` e `netlify/functions/agent-lab.ts`).
   Questa stanza è la chat principale, senza contesto di un nodo del FLOW —
   per quella versione vedi `AgentLabModal.tsx`, aperta da CREATION.LAB.

   🔷 AUDIT & UNIFICATION — TEST A: «Agent.lab deve diventare una vera chat a
   pagina intera, comoda per conversazioni lunghissime» — non una chat
   secondaria incassata sotto testata+notice+footer con un tetto fisso di
   62vh (`agent.css`, versione precedente). Il corpo della chat (`.agentlab-chat`
   → `AgentLabChat.tsx`, INVARIATO: stessa implementazione, non una copia)
   ora riempie tutta l'altezza residua della pagina; testata, CONFINE e footer
   — informazioni vere ma non quotidiane — vivono in un cassetto richiudibile,
   chiuso di default: nessuna funzione esistente è stata tolta, solo spostata
   fuori dal percorso principale. Il pulsante "← TORNA A VINZ.LAB" in fondo
   era ridondante con la freccia di `LabTop` (stesso `onBack`): resta nel
   cassetto invece di sparire, per zero perdita di capacità pur senza
   duplicare la via principale d'uscita. */

import { useState } from 'react';
import { LabStyle } from '../embed/LabStyle';
import systemCss from '../skin/system.css?inline';
import agentCss from '../skin/agent.css?inline';
import { Btn, LabTop, Notice } from './parts';
import { AgentLabChat } from './AgentLabChat';

export function AgentLab({ onBack }: { onBack: () => void }) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className="app agentlab-page">
      <LabStyle css={systemCss} />
      <LabStyle css={agentCss} />
      <LabTop tabs={[{ id: 'inspector', label: 'INSPECTOR' }]} active="inspector" onTab={() => {}} onBack={onBack} />
      <main className="agentlab-main">
        <section className="page active agentlab-fullpage">
          <div className="agentlab-toolbar">
            <div className="agentlab-toolbar__title">
              <span className="kicker mono">AGENT.LAB / PROJECT INSPECTOR</span>
              <h1>AGENT.LAB</h1>
            </div>
            <button
              type="button"
              className="agentlab-info-toggle mono"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((v) => !v)}
            >
              {infoOpen ? 'CHIUDI ⓘ' : 'INFO ⓘ'}
            </button>
          </div>
          {infoOpen && (
            <div className="agentlab-drawer">
              <p className="lead">
                L’agente tecnico interno di VINZ.MON. Legge l’intero progetto per rispondere — non
                inventa spiegazioni a memoria.
              </p>
              <Notice title="CONFINE">
                READ ACCESS → intero progetto (codice, config, documentazione). WRITE ACCESS →
                esclusivamente presentazionale, e nemmeno quello è mai una scrittura reale su
                repository: una richiesta genuinamente UI-only torna come patch pronta da incollare,
                mai applicata da sola. Nessuna chiave, token o segreto è mai leggibile da qui.
              </Notice>
              <div className="footer mono">AGENT.LAB · READ-ONLY SUL PROGETTO · SCRITTURA SOLO PRESENTAZIONALE, MAI AUTOMATICA</div>
              <Btn onClick={onBack}>← TORNA A VINZ.LAB</Btn>
            </div>
          )}
          <AgentLabChat persistKey="main" />
        </section>
      </main>
    </div>
  );
}
