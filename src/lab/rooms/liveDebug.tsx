/* ============================================================================
   LIVE DEBUG (LAB → SYSTEM → LIVE DEBUG)

   🔷 «creare dentro VINZ.MON una schermata LIVE DEBUG utilizzabile
      direttamente da iPhone, così possiamo osservare lo stato reale della
      chat mentre il bug accade.»

   🔒 QUESTA STANZA È SOLO OSSERVABILITÀ. Non corregge il bug del primo
   turno, non tocca ConversationLifecycle/resolvePromotionHandoff/
   promoteBeforeSend/promoteLocalSession/buildOpening/serverBackedStorage/
   il vendor assistant-ui — legge due canali già esistenti e mai
   duplicati: lo snapshot runtime-only pubblicato dalla chat
   (../../system/chatLiveDebug.ts, letto qui in sola lettura) e il
   Runtime Log server già usato da RUNTIME LOG (../../ai/backend.ts).

   ⚠️ Mai un testo di messaggio: solo id tecnici (abbreviati), ruoli,
   relazioni di parentela e conteggi.
   ========================================================================= */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useApp } from '../../state/store';
import { loadRuntimeLog, type RuntimeEvent } from '../../ai/backend';
import { Section, Rows, Status, Btn, PageHead } from './parts';
import {
  subscribeChatLiveSnapshot,
  currentChatLiveSnapshot,
  type ChatLiveThreadSnapshot,
} from '../../system/chatLiveDebug';

/** Solo questi eventi riguardano il primo turno della chat — riusa il
 * Runtime Log esistente, non ne crea uno nuovo. */
const CHAT_EVENT_TYPES = new Set([
  'CHAT_THREAD_IMPORT',
  'CHAT_STORAGE_WRITE',
  'CHAT_STORAGE_READ',
  'CHAT_HISTORY_LOAD',
  'CHAT_RUN_BOUNDARY',
  'CHAT_PROMOTION_HANDOFF_RESOLVED',
  'CHAT_UI_SUBMIT',
  'CHAT_MODEL_ADAPTER_START',
  'CHAT_ROUTE_SELECTED',
]);

const shortId = (id: string | null): string => {
  if (!id) return '—';
  return id.length > 10 ? `…${id.slice(-8)}` : id;
};

function numMeta(event: RuntimeEvent, key: string): number | null {
  const value = event.metadata?.[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
}
function strMeta(event: RuntimeEvent, key: string): string | null {
  const value = event.metadata?.[key];
  return typeof value === 'string' ? value : null;
}

type DetectorResult = { suspect: boolean; detail: string };

/** A · MESSAGE COUNT DROP — un CHAT_THREAD_IMPORT il cui afterMessageCount
 * è più basso del beforeMessageCount: prova diretta di una cancellazione. */
function detectMessageCountDrop(events: RuntimeEvent[]): DetectorResult {
  const hit = events.find((event) => {
    if (event.eventType !== 'CHAT_THREAD_IMPORT') return false;
    const before = numMeta(event, 'beforeMessageCount');
    const after = numMeta(event, 'afterMessageCount');
    return before !== null && after !== null && after < before;
  });
  if (!hit) return { suspect: false, detail: 'nessun calo osservato negli eventi recenti' };
  return {
    suspect: true,
    detail: `${numMeta(hit, 'beforeMessageCount')} → ${numMeta(hit, 'afterMessageCount')} messaggi (${strMeta(hit, 'caller') ?? strMeta(hit, 'reason') ?? '—'})`,
  };
}

/** B · OFF-BRANCH — il repository contiene più messaggi di quanti il
 * branch attivo ne renderizzi. Calcolato dal vivo, non dagli eventi. */
function detectOffBranch(snapshot: ChatLiveThreadSnapshot | null): DetectorResult & { count: number } {
  if (!snapshot) return { suspect: false, detail: 'nessuno snapshot ancora', count: 0 };
  const count = snapshot.repositoryMessages.length - snapshot.visibleMessageIds.length;
  if (count <= 0) return { suspect: false, detail: 'repository e branch attivo combaciano', count: 0 };
  return { suspect: true, detail: `${count} messaggi nel repository non sono nel branch attivo`, count };
}

/** C · DUPLICATE RUN — due CHAT_RUN_BOUNDARY phase=START con lo stesso
 * parentId nella stessa finestra di eventi osservata. */
function detectDuplicateRun(events: RuntimeEvent[]): DetectorResult {
  const starts = events.filter((event) => event.eventType === 'CHAT_RUN_BOUNDARY' && strMeta(event, 'phase') === 'START');
  const byParent = new Map<string, number>();
  for (const event of starts) {
    const parentId = strMeta(event, 'parentId');
    if (!parentId) continue;
    byParent.set(parentId, (byParent.get(parentId) ?? 0) + 1);
  }
  const duplicated = [...byParent.entries()].find(([, count]) => count > 1);
  if (!duplicated) return { suspect: false, detail: 'nessuna startRun ripetuta sullo stesso messaggio' };
  return { suspect: true, detail: `${duplicated[1]} avvii di run per lo stesso messaggio utente` };
}

/** D · STALE LOAD SUSPECTED — una CHAT_STORAGE_READ o CHAT_HISTORY_LOAD
 * con messageCount più basso del massimo repository live osservato per
 * questo thread. */
function detectStaleLoad(events: RuntimeEvent[], maxRepoSeen: number | null): DetectorResult {
  if (maxRepoSeen === null) return { suspect: false, detail: 'nessun repository live osservato ancora' };
  const hit = events.find((event) => {
    if (event.eventType !== 'CHAT_STORAGE_READ' && event.eventType !== 'CHAT_HISTORY_LOAD') return false;
    const count = numMeta(event, 'messageCount');
    return count !== null && count < maxRepoSeen;
  });
  if (!hit) return { suspect: false, detail: `nessuna lettura più corta di ${maxRepoSeen} messaggi` };
  return { suspect: true, detail: `${hit.eventType}: ${numMeta(hit, 'messageCount')} < ${maxRepoSeen} osservati dal vivo` };
}

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
  const token = useApp((s) => s.token);
  const liveSnapshot = useSyncExternalStore(subscribeChatLiveSnapshot, currentChatLiveSnapshot, currentChatLiveSnapshot);

  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [frozenSnapshot, setFrozenSnapshot] = useState<ChatLiveThreadSnapshot | null>(null);
  const [frozenEvents, setFrozenEvents] = useState<RuntimeEvent[]>([]);
  const [clearedAt, setClearedAt] = useState(0);
  const [maxRepoSeen, setMaxRepoSeen] = useState<number | null>(null);

  /* LIVE EVENTS — riusa /api/runtime-log già esistente, aggiornamento a
     ~1s come richiesto: nessun WebSocket, nessun secondo sistema di log. */
  useEffect(() => {
    if (frozen) return;
    let cancelled = false;
    const poll = () => {
      void loadRuntimeLog(token).then(({ data, failure }) => {
        if (cancelled) return;
        if (failure || !data) { setEventsFailed(true); return; }
        setEventsFailed(false);
        setEvents(data.events.filter((event) => CHAT_EVENT_TYPES.has(event.eventType)));
      });
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token, frozen]);

  /* Massimo REPOSITORY MESSAGES osservato dal vivo per questo thread —
     serve solo al detector D, MAI usato per correggere/reimportare nulla. */
  useEffect(() => {
    if (frozen || !liveSnapshot) return;
    setMaxRepoSeen((prev) => (prev === null || liveSnapshot.repositoryMessages.length > prev ? liveSnapshot.repositoryMessages.length : prev));
  }, [liveSnapshot, frozen]);

  const onFreeze = () => {
    setFrozenSnapshot(liveSnapshot);
    setFrozenEvents(events);
    setFrozen(true);
  };
  const onResume = () => {
    setFrozen(false);
    setFrozenSnapshot(null);
    setFrozenEvents([]);
  };
  const onClearView = () => {
    setClearedAt(Date.now());
    setMaxRepoSeen(null);
  };

  const activeSnapshot = frozen ? frozenSnapshot : liveSnapshot;
  const activeEvents = frozen ? frozenEvents : events;
  const eventsSinceClear = activeEvents.filter((event) => new Date(event.timestamp).getTime() >= clearedAt);
  const visibleEvents = eventsSinceClear.slice(0, 30);
  const activeBranchIds = new Set(activeSnapshot?.visibleMessageIds ?? []);

  const offBranch = detectOffBranch(activeSnapshot);
  const messageCountDrop = detectMessageCountDrop(eventsSinceClear);
  const duplicateRun = detectDuplicateRun(eventsSinceClear);
  const staleLoad = detectStaleLoad(eventsSinceClear, maxRepoSeen);

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
          {activeSnapshot ? `aggiornato ${new Date(activeSnapshot.updatedAt).toLocaleTimeString('it-IT')}` : 'in attesa del primo snapshot dalla chat…'}
        </span>
      </div>

      {frozen && (
        <div className="livedebug-frozen mono">
          <span>vista congelata — la chat continua a girare normalmente</span>
          <Btn onClick={onResume}>RESUME</Btn>
        </div>
      )}

      <Section title="THREAD">
        <Rows
          rows={[
            ['THREAD ID', shortId(activeSnapshot?.threadId ?? null)],
            ['REMOTE ID', shortId(activeSnapshot?.remoteId ?? null)],
            ['HEAD ID', shortId(activeSnapshot?.headId ?? null)],
            ['VISIBLE MESSAGES', String(activeSnapshot?.visibleMessageIds.length ?? '—')],
            ['REPOSITORY MESSAGES', String(activeSnapshot?.repositoryMessages.length ?? '—')],
            ['RUN STATUS', activeSnapshot ? activeSnapshot.runStatus.toUpperCase() : '—'],
            ['LAST UPDATE', activeSnapshot ? new Date(activeSnapshot.updatedAt).toLocaleTimeString('it-IT') : '—'],
          ]}
        />
      </Section>

      <Section
        title="CURRENT THREAD"
        note={!activeSnapshot ? 'Apri una chat per vedere i dati reali.' : undefined}
      >
        {offBranch.suspect && <p className="livedebug-offbranch mono">OFF-BRANCH MESSAGES: {offBranch.count}</p>}
        {activeSnapshot && activeSnapshot.repositoryMessages.length > 0 && (
          <div className="livedebug-msglist">
            {activeSnapshot.repositoryMessages.map((message) => (
              <div className="livedebug-msgrow" key={message.id}>
                <div>
                  <div className="livedebug-msgrow__id mono">{shortId(message.id)}</div>
                  <div className="livedebug-msgrow__meta mono">{message.role.toUpperCase()} · parent {shortId(message.parentId)}</div>
                </div>
                <div className="livedebug-msgrow__meta mono">
                  {activeBranchIds.has(message.id) ? 'BRANCH: YES' : 'BRANCH: NO'}
                  <br />
                  {message.id === activeSnapshot.headId ? 'HEAD: YES' : 'HEAD: NO'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="BUG DETECTORS" note="Solo visivi: nessuna correzione automatica.">
        <div className="livedebug-detectors">
          <Detector label="A · MESSAGE COUNT DROP" result={messageCountDrop} />
          <Detector label="B · OFF-BRANCH" result={offBranch} />
          <Detector label="C · DUPLICATE RUN" result={duplicateRun} />
          <Detector label="D · STALE LOAD SUSPECTED" result={staleLoad} />
        </div>
      </Section>

      <div className="livedebug-actions">
        {frozen ? <Btn variant="dark" onClick={onResume}>RESUME</Btn> : <Btn onClick={onFreeze}>FREEZE</Btn>}
        <Btn onClick={onClearView}>CLEAR VIEW</Btn>
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
