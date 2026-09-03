/* ============================================================================
   LIVE DEBUG (LAB → SYSTEM → LIVE DEBUG)

   🔷 «creare dentro VINZ.MON una schermata LIVE DEBUG utilizzabile
      direttamente da iPhone, così possiamo osservare lo stato reale della
      chat mentre il bug accade.»

   🔴 «in attesa del primo snapshot dalla chat…» — sempre, sul device
   reale. LAB e Chat sono due pagine separate (`lab/index.html` vs
   `index.html`: `window.location.assign('/lab/')` in App.tsx è una
   navigazione vera), quindi due heap JavaScript diversi: lo snapshot
   runtime-only pubblicato dalla Chat non può attraversare quel confine.
   Per QUESTO esiste anche l'overlay dentro la Chat stessa
   (chatgpt.tsx → ChatDebugTrigger/ChatDebugOverlay, dietro DEV) — questa
   scheda resta utile quando LAB e Chat sono aperte nella stessa sessione
   (due tab, o la Chat aperta di recente nella stessa pagina prima di
   navigare qui) e per leggere comunque LIVE EVENTS, che passa dal
   server e quindi funziona sempre.

   🔒 QUESTA STANZA È SOLO OSSERVABILITÀ. Non corregge il bug del primo
   turno, non tocca ConversationLifecycle/resolvePromotionHandoff/
   promoteBeforeSend/promoteLocalSession/buildOpening/serverBackedStorage/
   il vendor assistant-ui. La logica (snapshot, detector, Runtime Log) è
   condivisa con l'overlay della Chat via ../../system/useChatLiveDebug —
   un solo debugger, due vestiti.

   ⚠️ Mai un testo di messaggio: solo id tecnici (abbreviati), ruoli,
   relazioni di parentela e conteggi.
   ========================================================================= */

import { Section, Rows, Status, Btn, PageHead } from './parts';
import { shortId, useChatLiveDebug, type DetectorResult } from '../../system/useChatLiveDebug';

function Detector({ label, result }: { label: string; result: DetectorResult }) {
  return (
    <div className={`livedebug-detector${result.suspect ? ' suspect' : ''}`}>
      <strong className="mono">{label}</strong>
      <div className="livedebug-detector__value mono">{result.suspect ? 'SUSPECT' : 'OK'}</div>
      <p className="note" style={{ margin: '4px 0 0' }}>{result.detail}</p>
    </div>
  );
}

export function LiveDebug() {
  const { snapshot, eventsSinceClear, eventsFailed, frozen, freeze, resume, clearView, detectors } = useChatLiveDebug();
  const visibleEvents = eventsSinceClear.slice(0, 30);
  const activeBranchIds = new Set(snapshot?.visibleMessageIds ?? []);

  return (
    <section className="page active">
      <PageHead
        kicker="SYSTEM.LAB / OBSERVABILITY"
        title="LIVE DEBUG"
        lead="Stato reale della chat mentre succede, sul device. Nessun testo di messaggio: solo id tecnici e conteggi."
      />
      <div className="livedebug-status">
        <Status label={frozen ? 'FROZEN' : 'LIVE'} ok={!frozen} />
        <span className="note" style={{ margin: 0 }}>
          {snapshot ? `aggiornato ${new Date(snapshot.updatedAt).toLocaleTimeString('it-IT')}` : 'in attesa del primo snapshot dalla chat…'}
        </span>
      </div>

      {!snapshot && (
        <p className="note">
          Se la Chat non è aperta in questa stessa pagina: LAB e Chat sono due pagine separate
          e lo snapshot runtime-only non le attraversa. Apri LIVE DEBUG dalla Chat stessa
          (pulsante DEBUG, visibile con DEV attivo) mentre il primo turno succede.
        </p>
      )}

      {frozen && (
        <div className="livedebug-frozen mono">
          <span>vista congelata — la chat continua a girare normalmente</span>
          <Btn onClick={resume}>RESUME</Btn>
        </div>
      )}

      <Section title="THREAD">
        <Rows
          rows={[
            ['THREAD ID', shortId(snapshot?.threadId ?? null)],
            ['REMOTE ID', shortId(snapshot?.remoteId ?? null)],
            ['HEAD ID', shortId(snapshot?.headId ?? null)],
            ['VISIBLE MESSAGES', String(snapshot?.visibleMessageIds.length ?? '—')],
            ['REPOSITORY MESSAGES', String(snapshot?.repositoryMessages.length ?? '—')],
            ['RUN STATUS', snapshot ? snapshot.runStatus.toUpperCase() : '—'],
            ['LAST UPDATE', snapshot ? new Date(snapshot.updatedAt).toLocaleTimeString('it-IT') : '—'],
          ]}
        />
      </Section>

      <Section
        title="CURRENT THREAD"
        note={!snapshot ? 'Apri una chat, nella stessa pagina, per vedere i dati reali.' : undefined}
      >
        {detectors.offBranch.suspect && <p className="livedebug-offbranch mono">OFF-BRANCH MESSAGES: {detectors.offBranch.count}</p>}
        {snapshot && snapshot.repositoryMessages.length > 0 && (
          <div className="livedebug-msglist">
            {snapshot.repositoryMessages.map((message) => (
              <div className="livedebug-msgrow" key={message.id}>
                <div>
                  <div className="livedebug-msgrow__id mono">{shortId(message.id)}</div>
                  <div className="livedebug-msgrow__meta mono">{message.role.toUpperCase()} · parent {shortId(message.parentId)}</div>
                </div>
                <div className="livedebug-msgrow__meta mono">
                  {activeBranchIds.has(message.id) ? 'BRANCH: YES' : 'BRANCH: NO'}
                  <br />
                  {message.id === snapshot.headId ? 'HEAD: YES' : 'HEAD: NO'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="BUG DETECTORS" note="Solo visivi: nessuna correzione automatica.">
        <div className="livedebug-detectors">
          <Detector label="A · MESSAGE COUNT DROP" result={detectors.messageCountDrop} />
          <Detector label="B · OFF-BRANCH" result={detectors.offBranch} />
          <Detector label="C · DUPLICATE RUN" result={detectors.duplicateRun} />
          <Detector label="D · STALE LOAD SUSPECTED" result={detectors.staleLoad} />
          <Detector label="E · REPOSITORY DROP" result={detectors.repositoryDrop} />
        </div>
      </Section>

      <div className="livedebug-actions">
        {frozen ? <Btn variant="dark" onClick={resume}>RESUME</Btn> : <Btn onClick={freeze}>FREEZE</Btn>}
        <Btn onClick={clearView}>CLEAR VIEW</Btn>
      </div>

      <Section
        title="LIVE EVENTS"
        note={eventsFailed ? 'Runtime Log non disponibile: verifica autenticazione o server.' : 'Ultimi eventi tecnici della chat, senza contenuti.'}
      >
        {visibleEvents.length === 0 ? (
          <p className="note">Nessun evento recente.</p>
        ) : (
          <div className="livedebug-events">
            {visibleEvents.map((event) => (
              <div className="livedebug-event" key={event.id}>
                <div className="livedebug-event__head mono">
                  <span>{new Date(event.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span>{event.eventType} · {event.status}</span>
                </div>
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <div className="livedebug-event__meta mono">
                    {Object.entries(event.metadata).map(([key, value]) => `${key}=${String(value)}`).join('  ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </section>
  );
}
