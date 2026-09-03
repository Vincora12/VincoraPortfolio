/* ============================================================================
   LIVE DEBUG — logica condivisa fra LAB (src/lab/rooms/liveDebug.tsx) e
   l'overlay dentro la Chat (src/assistant-original/components/examples/
   chatgpt.tsx). Stesso snapshot (chatLiveDebug.ts), stessi detector, stesso
   Runtime Log — nessun secondo debugger, solo due vestiti diversi sullo
   stesso stato: il LAB usa i mattoni del suo disegno (parts.tsx/
   system.css), la Chat usa Tailwind com'è già il resto di chatgpt.tsx.

   🔒 Il canale di src/system/chatLiveDebug.ts è runtime-only: quando la
   Chat e il LAB sono due pagine separate (index.html vs lab/index.html —
   `window.location.assign('/lab/')` in App.tsx è una navigazione vera,
   non un cambio di rotta client-side), sono due heap JavaScript diversi e
   il LAB non può vedere lo snapshot pubblicato dall'altra pagina. Questo
   hook, montato DENTRO la Chat, non ha questo limite: vive nello stesso
   runtime del publisher.
   ========================================================================= */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useApp } from '../state/store';
import { loadRuntimeLog, type RuntimeEvent } from '../ai/backend';
import {
  subscribeChatLiveSnapshot,
  currentChatLiveSnapshot,
  subscribeChatIncident,
  currentChatIncident,
  captureChatIncident,
  clearChatIncident,
  noteDetectorTransitionToSuspect,
  type ChatLiveThreadSnapshot,
  type ChatIncident,
  type ChatIncidentDetectorId,
  type ChatIncidentTrigger,
} from './chatLiveDebug';

export type { ChatIncident } from './chatLiveDebug';

/** Solo questi eventi riguardano il primo turno della chat — riusa il
 * Runtime Log esistente, non ne crea uno nuovo. */
export const CHAT_EVENT_TYPES = new Set([
  'CHAT_THREAD_IMPORT',
  'CHAT_STORAGE_WRITE',
  'CHAT_STORAGE_READ',
  'CHAT_HISTORY_LOAD',
  'CHAT_RUN_BOUNDARY',
  'CHAT_PROMOTION_HANDOFF_RESOLVED',
  'CHAT_UI_SUBMIT',
  'CHAT_MODEL_ADAPTER_START',
  'CHAT_ROUTE_SELECTED',
  'CHAT_REPOSITORY_MUTATION',
]);

export const shortId = (id: string | null): string => {
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

export type DetectorResult = { suspect: boolean; detail: string };

/** A · MESSAGE COUNT DROP — un CHAT_THREAD_IMPORT il cui afterMessageCount
 * è più basso del beforeMessageCount: prova diretta di una cancellazione. */
export function detectMessageCountDrop(events: RuntimeEvent[]): DetectorResult {
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
export function detectOffBranch(snapshot: ChatLiveThreadSnapshot | null): DetectorResult & { count: number } {
  if (!snapshot) return { suspect: false, detail: 'nessuno snapshot ancora', count: 0 };
  const count = snapshot.repositoryMessages.length - snapshot.visibleMessageIds.length;
  if (count <= 0) return { suspect: false, detail: 'repository e branch attivo combaciano', count: 0 };
  return { suspect: true, detail: `${count} messaggi nel repository non sono nel branch attivo`, count };
}

/** C · DUPLICATE RUN — due CHAT_RUN_BOUNDARY phase=START con lo stesso
 * parentId nella stessa finestra di eventi osservata. */
export function detectDuplicateRun(events: RuntimeEvent[]): DetectorResult {
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
export function detectStaleLoad(events: RuntimeEvent[], maxRepoSeen: number | null): DetectorResult {
  if (maxRepoSeen === null) return { suspect: false, detail: 'nessun repository live osservato ancora' };
  const hit = events.find((event) => {
    if (event.eventType !== 'CHAT_STORAGE_READ' && event.eventType !== 'CHAT_HISTORY_LOAD') return false;
    const count = numMeta(event, 'messageCount');
    return count !== null && count < maxRepoSeen;
  });
  if (!hit) return { suspect: false, detail: `nessuna lettura più corta di ${maxRepoSeen} messaggi` };
  return { suspect: true, detail: `${hit.eventType}: ${numMeta(hit, 'messageCount')} < ${maxRepoSeen} osservati dal vivo` };
}

/** E · REPOSITORY DROP — un CHAT_REPOSITORY_MUTATION osservato: cattura
 * ANCHE i cali che non passano dai nostri wrapper (import/startRun/
 * append), perché è generato confrontando due export() consecutivi ad
 * ogni notifica di aui.subscribe(), non filtrando per chiamante. */
export function detectRepositoryDrop(events: RuntimeEvent[]): DetectorResult {
  const hit = events.find((event) => event.eventType === 'CHAT_REPOSITORY_MUTATION');
  if (!hit) return { suspect: false, detail: 'nessuna mutazione con calo osservata' };
  const before = numMeta(hit, 'beforeMessageCount');
  const after = numMeta(hit, 'afterMessageCount');
  const operation = strMeta(hit, 'operation') ?? 'UNATTRIBUTED_DROP';
  const caller = strMeta(hit, 'caller') ?? 'ASSISTANT_UI_INTERNAL';
  return { suspect: true, detail: `${before ?? '?'} → ${after ?? '?'} messaggi · ${operation} (${caller})` };
}

/** Costruisce la BLACK BOX: stessa forma per la cattura automatica
 * (transizione OK→SUSPECT) e per CAPTURE AGAIN (manuale). Prende gli
 * ultimi 20 eventi già filtrati sugli eventi del primo turno — mai il
 * testo di un messaggio. */
function buildIncident(
  trigger: ChatIncidentTrigger,
  triggerLabel: string,
  snapshot: ChatLiveThreadSnapshot | null,
  detectorList: Array<{ id: ChatIncidentDetectorId; label: string; result: DetectorResult }>,
  events: RuntimeEvent[],
): ChatIncident {
  return {
    capturedAt: new Date().toISOString(),
    triggerDetector: trigger,
    triggerLabel,
    snapshot,
    detectors: detectorList.map(({ id, label, result }) => ({ id, label, suspect: result.suspect, detail: result.detail })),
    events: events.slice(0, 20).map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      eventType: event.eventType,
      status: event.status,
      ...(event.metadata ? { metadata: event.metadata } : {}),
    })),
  };
}

export type ChatLiveDebugState = {
  snapshot: ChatLiveThreadSnapshot | null;
  eventsSinceClear: RuntimeEvent[];
  eventsFailed: boolean;
  frozen: boolean;
  freeze: () => void;
  resume: () => void;
  clearView: () => void;
  detectors: {
    messageCountDrop: DetectorResult;
    offBranch: DetectorResult & { count: number };
    duplicateRun: DetectorResult;
    staleLoad: DetectorResult;
    repositoryDrop: DetectorResult;
  };
  /** BLACK BOX — null finché nessun detector A-E è mai passato da OK a
   * SUSPECT (o finché CLEAR VIEW non l'ha cancellata). Vive nel modulo
   * runtime-only chatLiveDebug.ts, non in questo stato React: sopravvive
   * a chiusura/riapertura di DEBUG nella stessa Chat. */
  incident: ChatIncident | null;
  /** Sostituisce manualmente la black box con lo stato corrente,
   * indipendentemente da cattura automatica già avvenuta o meno. */
  captureIncidentNow: () => void;
};

/** Stato + polling + detector condivisi. Nessuna persistenza: frozen/
 * clearedAt/maxRepoSeen sono stato React locale al componente che chiama
 * l'hook, azzerato quando quel componente si smonta (LAB al cambio
 * scheda, l'overlay della Chat alla chiusura). */
export function useChatLiveDebug(): ChatLiveDebugState {
  const token = useApp((s) => s.token);
  const liveSnapshot = useSyncExternalStore(subscribeChatLiveSnapshot, currentChatLiveSnapshot, currentChatLiveSnapshot);
  const incident = useSyncExternalStore(subscribeChatIncident, currentChatIncident, currentChatIncident);

  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [frozenSnapshot, setFrozenSnapshot] = useState<ChatLiveThreadSnapshot | null>(null);
  const [frozenEvents, setFrozenEvents] = useState<RuntimeEvent[]>([]);
  const [clearedAt, setClearedAt] = useState(0);
  const [maxRepoSeen, setMaxRepoSeen] = useState<number | null>(null);

  /* LIVE EVENTS — riusa /api/runtime-log già esistente, ~1s come
     richiesto: nessun WebSocket, nessun secondo sistema di log. */
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

  /* Massimo REPOSITORY MESSAGES osservato dal vivo — serve solo al
     detector D, mai usato per correggere/reimportare nulla. */
  useEffect(() => {
    if (frozen || !liveSnapshot) return;
    setMaxRepoSeen((prev) => (prev === null || liveSnapshot.repositoryMessages.length > prev ? liveSnapshot.repositoryMessages.length : prev));
  }, [liveSnapshot, frozen]);

  const snapshot = frozen ? frozenSnapshot : liveSnapshot;
  const activeEvents = frozen ? frozenEvents : events;
  const eventsSinceClear = activeEvents.filter((event) => new Date(event.timestamp).getTime() >= clearedAt);

  const detectors = {
    messageCountDrop: detectMessageCountDrop(eventsSinceClear),
    offBranch: detectOffBranch(snapshot),
    duplicateRun: detectDuplicateRun(eventsSinceClear),
    staleLoad: detectStaleLoad(eventsSinceClear, maxRepoSeen),
    repositoryDrop: detectRepositoryDrop(eventsSinceClear),
  };

  /* Stessi 5 detector del riquadro BUG DETECTORS, con id+label per la
   * BLACK BOX — nessuna nuova chiamata ai detector, solo un elenco dei
   * risultati già calcolati sopra. */
  const detectorList: Array<{ id: ChatIncidentDetectorId; label: string; result: DetectorResult }> = [
    { id: 'messageCountDrop', label: 'A · MESSAGE COUNT DROP', result: detectors.messageCountDrop },
    { id: 'offBranch', label: 'B · OFF-BRANCH', result: detectors.offBranch },
    { id: 'duplicateRun', label: 'C · DUPLICATE RUN', result: detectors.duplicateRun },
    { id: 'staleLoad', label: 'D · STALE LOAD', result: detectors.staleLoad },
    { id: 'repositoryDrop', label: 'E · REPOSITORY DROP', result: detectors.repositoryDrop },
  ];

  /* BLACK BOX — AUTO CAPTURE: la prima transizione OK→SUSPECT di
   * qualunque detector cattura automaticamente, senza che l'utente debba
   * premere FREEZE in tempo. Non ferma niente (chat/run/log/repository
   * continuano): è solo una copia diagnostica in memoria. Se una black
   * box è già presente, le transizioni successive non la sovrascrivono
   * — solo CAPTURE AGAIN (manuale) o CLEAR VIEW la toccano di nuovo. */
  useEffect(() => {
    let firstTransition: { id: ChatIncidentDetectorId; label: string } | null = null;
    for (const entry of detectorList) {
      const isNewTransition = noteDetectorTransitionToSuspect(entry.id, entry.result.suspect);
      if (isNewTransition && !firstTransition) firstTransition = entry;
    }
    if (firstTransition && currentChatIncident() === null) {
      captureChatIncident(buildIncident(firstTransition.id, firstTransition.label, snapshot, detectorList, activeEvents));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectorList, snapshot, activeEvents]);

  return {
    snapshot,
    eventsSinceClear,
    eventsFailed,
    frozen,
    freeze: () => { setFrozenSnapshot(liveSnapshot); setFrozenEvents(events); setFrozen(true); },
    resume: () => { setFrozen(false); setFrozenSnapshot(null); setFrozenEvents([]); },
    clearView: () => { setClearedAt(Date.now()); setMaxRepoSeen(null); clearChatIncident(); },
    detectors,
    incident,
    captureIncidentNow: () => {
      captureChatIncident(buildIncident('MANUAL', 'CAPTURE AGAIN', snapshot, detectorList, activeEvents));
    },
  };
}
