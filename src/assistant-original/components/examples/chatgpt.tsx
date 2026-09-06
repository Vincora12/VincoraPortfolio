"use client";

import { cn } from "@/assistant-original/lib/utils";
import {
  ActionBarPrimitive,
  ActionBarMorePrimitive,
  AuiIf,
  AttachmentPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { postChatDiagnostic, postRuntimeEvent } from "@/system/runtimeLog";
import {
  publishChatLiveSnapshot,
  beginRepositoryOperation,
  endRepositoryOperation,
  currentRepositoryOperation,
} from "@/system/chatLiveDebug";
import { shortId, useChatLiveDebug, type DetectorResult, type ChatLiveDebugState, type ChatIncident } from "@/system/useChatLiveDebug";
import { useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FC } from "react";
import { createPortal } from "react-dom";
import { useMessageError } from "@assistant-ui/core/react";
import { TooltipIconButton } from "@/assistant-original/components/assistant-ui/tooltip-icon-button";
import { useShallow } from "zustand/shallow";
import WaveSurfer from "wavesurfer.js";
import RecordPlugin from "wavesurfer.js/dist/plugins/record.esm.js";
import { savedToken } from "@/brain/stream";
import { memoryTrace } from "@/assistant-original/chat-memory-feedback";
import {
  acquireRunOwnership,
  consumePromotedRepository,
  GateMarkLiveContext,
  isLocalUnsavedSession,
  newLocalMessageId,
  openingStillWelcome,
  promoteLocalSession,
  repositoryWithMessage,
  repositoryWithPendingUser,
  resolvePromotionHandoff,
} from "@/assistant-original/conversation-lifecycle-adapter";
import type { ThreadMessage } from "@assistant-ui/react";
import {
  ActivityIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  Download,
  Mic,
  MoreHorizontal,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Volume2,
  XIcon,
} from "lucide-react";
import { MarkdownText } from "@/assistant-original/components/assistant-ui/markdown-text";
import { ToolFallback } from "@/assistant-original/components/assistant-ui/tool-fallback";
import { Sources } from "@/assistant-original/components/assistant-ui/sources";
import { CloneThreadShell } from "./clone-thread-shell";
import { useApp } from "@/state/store";
import { voiceCard } from "@/engine/voiceCard";
import { useAssetUrl } from "@/system/AssetSlot";
import { EXPRESSION_SPEC, EXPRESSIONS } from "@/engine/assets";
import { loadChatTrace, type ChatTrace } from "@/ai/chatTrace";
import { memoryFeedbackFor, subscribeMemoryFeedback } from "@/assistant-original/chat-memory-feedback";
import {
  buildOpening,
  buildThoughtStatus,
  localMicroMemory,
  rememberConversation,
  rememberThoughtStatus,
  thoughtKind,
  toneFor,
} from "@/assistant-original/chat-micro-behaviors";
import {
  claimSessionRoomEntry,
  consumeManualRoomEntry,
  currentRoomEntryRevision,
  subscribeRoomEntry,
} from "@/assistant-original/chat-room-presence";
import {
  isPendingReveal,
  markRevealSeen,
  PRESENCE_STEP_MS,
  revealMetadata,
} from "@/assistant-original/chat-presence-visual";

/* FIRST TURN OBSERVABILITY ONLY — nessun cambio di comportamento: queste
   due funzioni avvolgono aui.thread.import()/startRun() con un log
   tecnico prima/dopo (conteggio messaggi, headId), senza mai leggerne
   il contenuto. Servono a capire, sul device reale, dove esattamente
   nell'albero dei messaggi la timeline del primo turno cambia forma. */
type AuiHandle = ReturnType<typeof useAui>;

const auiSnapshot = (aui: AuiHandle): { messageCount: number; headId: string } => {
  const exported = aui.thread.export();
  return { messageCount: exported.messages.length, headId: exported.headId ?? 'none' };
};

const importWithObservability = (
  aui: AuiHandle,
  caller: string,
  reason: string,
  repository: Parameters<AuiHandle['thread']['import']>[0],
  markLive: (() => void) | null,
): void => {
  const before = auiSnapshot(aui);
  /* import() è sincrono da cima a fondo (clear()+import()+resetHead(),
     nessun await nel mezzo — verificato nel sorgente vendor): possiamo
     chiudere l'attribuzione subito dopo, senza bisogno di un timeout. */
  beginRepositoryOperation({ operation: 'IMPORT', caller });
  /* FIRST TURN — HISTORY OWNERSHIP BLIND SPOT, CLOSED. import() stabilisce/
     sostituisce lo stato live esattamente come append()/update(), ma non
     tocca mai l'adapter history (confermato: BaseThreadRuntimeCore.import()
     non chiama adapters.history). Senza questo, una history.load() già in
     volo nel momento in cui QUESTO import atterra verrebbe ancora fidata e
     potrebbe cancellarlo. `markLive` arriva da GateMarkLiveContext — il
     gate DI QUESTO thread, non un puntatore globale che un altro gate
     montato altrove potrebbe aver sovrascritto. */
  markLive?.();
  aui.thread.import(repository);
  endRepositoryOperation();
  const after = auiSnapshot(aui);
  postRuntimeEvent({
    eventType: 'CHAT_THREAD_IMPORT',
    status: 'PASS',
    scope: 'chat',
    metadata: {
      caller,
      beforeMessageCount: before.messageCount,
      afterMessageCount: after.messageCount,
      beforeHeadId: before.headId,
      afterHeadId: after.headId,
      reason,
    },
  });
};

/* FIRST TURN — SINGLE RUN OWNER. Il percorso di invio del composer
   (ComposerPrimaryAction/insertAndSend) possiede la generazione per un
   vero messaggio utente. Non è un guard temporale: acquireRunOwnership()
   (conversation-lifecycle-adapter.ts) restituisce true UNA SOLA VOLTA per
   ogni parentId, per sempre — chiunque arrivi qui per primo per un dato
   id vince, indipendentemente da chi sia o quanto sia veloce. Chiunque
   arrivi dopo per lo STESSO id (tipicamente una riconciliazione
   dell'handoff di promozione che corre in parallelo all'invio del
   composer) diventa un no-op, non un secondo startRun. */
const startRunWithObservability = (
  aui: AuiHandle,
  caller: string,
  parentId: string,
): void => {
  if (!acquireRunOwnership(parentId)) {
    postRuntimeEvent({
      eventType: 'CHAT_RUN_BOUNDARY',
      status: 'PASS',
      scope: 'chat',
      metadata: { phase: 'SKIPPED_DUPLICATE', parentId, caller },
    });
    return;
  }
  const before = auiSnapshot(aui);
  /* startRun resta "in corso" per tutta la sua durata async (fino al
     .finally() sotto) — è quello che la specifica chiede: "quando
     un'operazione pubblica è in corso". */
  beginRepositoryOperation({ operation: 'START_RUN', caller, parentId });
  postRuntimeEvent({
    eventType: 'CHAT_RUN_BOUNDARY',
    status: 'START',
    scope: 'chat',
    metadata: { phase: 'START', parentId, messageCount: before.messageCount, headId: before.headId, caller },
  });
  /* FIRST TURN — CHE COSA GETTA startRun(). Il vendor lancia
     "Parent message not found" (message-repository.ts) se il parentId
     che gli passiamo non esiste nel repository su cui sta operando —
     una prova diretta e distinguibile del sospetto emerso da un
     incident reale (E · REPOSITORY DROP attribuito a START_RUN, head
     dopo il crollo nel formato generateId() del vendor, mai il nostro
     msg_<uuid>): che aui.thread in questo punto non sia più la stessa
     istanza runtime su cui promoteBeforeSend aveva appena importato
     quel messaggio. .then(success, failure) invece di solo .finally()
     perché un rifiuto è un'informazione diversa da un successo, non
     solo "la run è finita": senza questo l'errore del vendor si perde
     nel .catch() già presente sull'IIFE del click, mai osservato. */
  const result = aui.thread.startRun({ parentId });
  void Promise.resolve(result).then(
    () => {
      const after = auiSnapshot(aui);
      postRuntimeEvent({
        eventType: 'CHAT_RUN_BOUNDARY',
        status: 'PASS',
        scope: 'chat',
        metadata: { phase: 'END', parentId, messageCount: after.messageCount, headId: after.headId, caller },
      });
    },
    (error: unknown) => {
      const after = auiSnapshot(aui);
      postRuntimeEvent({
        eventType: 'CHAT_RUN_BOUNDARY',
        status: 'FAIL',
        scope: 'chat',
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'Unknown',
        metadata: { phase: 'ERROR', parentId, messageCount: after.messageCount, headId: after.headId, caller },
      });
    },
  ).finally(() => {
    endRepositoryOperation();
  });
};

const useFirstArrivalReveal = (arrivalId: unknown) => {
  const reveal = useRef<{ arrivalId: unknown; animate: boolean } | null>(null);
  if (!reveal.current || reveal.current.arrivalId !== arrivalId) {
    reveal.current = { arrivalId, animate: isPendingReveal(arrivalId) };
  }
  const { animate } = reveal.current;
  useEffect(() => {
    if (animate) markRevealSeen(arrivalId);
  }, [animate, arrivalId]);
  return animate;
};

export const ChatGPT: FC = () => {
  return (
    <CloneThreadShell>
      <ChatCostTotal />
      <LogCelebration />
      <ReactionMessageDispatcher />
      <ConversationMemory />
      <ConversationLifecycle />
      <ChatLiveDebugPublisher />
      <MonPresenceEvents />
      <ThreadPrimitive.Root className="flex h-full flex-col items-stretch bg-white px-4 text-[#0d0d0d] dark:bg-black dark:text-[#ececec]">
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <EmptyState />
        </AuiIf>

        <AuiIf condition={(s) => !s.thread.isEmpty}>
          <ThreadPrimitive.Viewport className="vinz-chat-thread-viewport flex grow flex-col gap-8 overflow-y-scroll pt-16">
            {/* 🔷 «Il messaggio che mando non deve arrivare alla parte più alta
                della chat ma alla parte più bassa, e poi salire quando arriva
                quello dell'AI.»

                🔴 Non era lo scorrimento: era il layout. In una colonna flex i
                messaggi partivano dall'alto e tutto lo spazio vuoto restava
                SOTTO, fra l'ultimo messaggio e il composer — così il primo
                messaggio sembrava sparato in cima. `mt-auto` qui mette lo
                spazio vuoto SOPRA: i messaggi si appoggiano al composer e
                salgono man mano che la conversazione cresce, come in una
                chat normale. Quando il contenuto supera l'altezza, `mt-auto`
                non ha più spazio da distribuire e si torna a scorrere. */}
            <div className="mt-auto flex flex-col gap-8">
              <ThreadPrimitive.Messages>
                {({ message }) => {
                  if (message.composer.isEditing) return <EditComposer />;
                  if (message.role === "system") return <SystemEventMessage />;
                  if (message.role === "user") return <UserMessage />;
                  return <AssistantMessage />;
                }}
              </ThreadPrimitive.Messages>
            </div>

            <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto flex w-full max-w-3xl flex-col gap-2 overflow-visible rounded-t-3xl bg-white pb-2 dark:bg-black">
              <ThreadScrollToBottom />
              <Composer placeholder="Ask anything" />
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </AuiIf>
      </ThreadPrimitive.Root>
    </CloneThreadShell>
  );
};

/** Conserva solo l'ultimo messaggio utile per poter riprendere davvero il filo. */
const ConversationMemory: FC = () => {
  const latestUserText = useAuiState((state) => {
    const message = [...state.thread.messages].reverse().find((item) => item.role === 'user');
    return message?.content
      .filter((part) => part.type === 'text')
      .map((part) => part.type === 'text' ? part.text : '')
      .join(' ')
      .trim() ?? '';
  });
  useEffect(() => {
    if (latestUserText) rememberConversation(latestUserText);
  }, [latestUserText]);
  return null;
};

const ConversationLifecycle: FC = () => {
  const aui = useAui();
  const markLive = useContext(GateMarkLiveContext);
  const { threadId, remoteId, readyToPromote } = useAuiState(
    useShallow((state) => ({
      threadId: state.threads.mainThreadId,
      remoteId: state.threadListItem.remoteId,
      readyToPromote: (() => {
        const messages = state.thread.messages;
        let lastUserIndex = -1;
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index]?.role === "user") { lastUserIndex = index; break; }
        }
        if (lastUserIndex < 0) return false;
        return messages.slice(lastUserIndex + 1).some(
          (message) => message.role === "assistant" && message.status.type !== "running",
        );
      })(),
    })),
  );
  useEffect(() => {
    if (!remoteId) return;
    const handoff = consumePromotedRepository(remoteId);
    if (!handoff) return;
    const resolution = resolvePromotionHandoff(aui.thread.export(), handoff);
    if (resolution.shouldImport) importWithObservability(aui, 'ConversationLifecycle', resolution.reason, handoff, markLive);
    postRuntimeEvent({
      eventType: 'CHAT_PROMOTION_HANDOFF_RESOLVED',
      status: 'PASS',
      scope: 'chat',
      metadata: { reason: resolution.reason },
    });
  }, [aui, remoteId, markLive]);
  useEffect(() => {
    if (!readyToPromote || !isLocalUnsavedSession(threadId)) return;
    void promoteLocalSession(threadId, aui.thread.export()).catch((error: unknown) => {
      console.warn("[VINZ chat] promozione conversazione non riuscita", error);
    });
  }, [aui, readyToPromote, threadId]);
  return null;
};

/* LIVE DEBUG — pubblica sul canale diagnostico runtime-only
   (src/system/chatLiveDebug.ts) uno snapshot tecnico del thread: solo id,
   ruolo, parent e conteggi, mai il contenuto di un messaggio. Legge SOLO
   API pubbliche di assistant-ui (aui.subscribe — «fires after every
   state [change]», thread.getState/export, threads.item/
   threadListItem.getState, già usate altrove in questo file) — non
   tocca il vendor, non cambia niente del comportamento della chat: è un
   lettore passivo. */
const ChatLiveDebugPublisher: FC = () => {
  const aui = useAui();
  useEffect(() => {
    /* REPOSITORY MUTATION WATCHER — snapshot precedente tenuto SOLO in
       memoria (variabile locale alla closure dell'effetto: sparisce al
       remount, mai persistito). aui.subscribe() spara dopo OGNI
       mutazione del thread, comprese quelle interne ad assistant-ui che
       non passano da nessuno dei nostri wrapper (es. dentro
       __internal_load()): confrontando due export() consecutivi qui,
       vediamo un calo di messageCount indipendentemente da chi l'ha
       causato. */
    let previous: { messageCount: number; headId: string } | null = null;
    const publish = () => {
      const threadState = aui.thread.getState();
      const exported = aui.thread.export();
      const current = { messageCount: exported.messages.length, headId: exported.headId ?? 'none' };

      if (previous && current.messageCount < previous.messageCount) {
        const active = currentRepositoryOperation();
        postRuntimeEvent({
          eventType: 'CHAT_REPOSITORY_MUTATION',
          status: 'FAIL',
          scope: 'chat',
          metadata: {
            operation: active?.operation ?? 'UNATTRIBUTED_DROP',
            caller: active?.caller ?? 'ASSISTANT_UI_INTERNAL',
            beforeMessageCount: previous.messageCount,
            afterMessageCount: current.messageCount,
            beforeHeadId: previous.headId,
            afterHeadId: current.headId,
            ...(active?.parentId ? { parentId: active.parentId } : {}),
            ...(active?.messageId ? { messageId: active.messageId } : {}),
          },
        });
      }
      previous = current;

      publishChatLiveSnapshot({
        threadId: aui.threads.item("main").getState().id ?? null,
        remoteId: aui.threadListItem.getState().remoteId ?? null,
        headId: exported.headId ?? null,
        visibleMessageIds: threadState.messages.map((message) => message.id),
        repositoryMessages: exported.messages.map((item) => ({
          id: item.message.id,
          role: item.message.role,
          parentId: item.parentId,
        })),
        runStatus: threadState.isRunning ? "running" : "idle",
        updatedAt: new Date().toISOString(),
      });
    };
    publish();
    return aui.subscribe(publish);
  }, [aui]);
  return null;
};

/* LIVE DEBUG — l'overlay resta lo stesso, il punto d'ingresso adesso è
   globale (CREATION LAB FIX + UI CLEANUP §16).

   🔴 «in attesa del primo snapshot dalla chat…» sempre, sul device
   reale: LAB e Chat sono due pagine separate (lab/index.html vs
   index.html — window.location.assign('/lab/') in App.tsx è una vera
   navigazione), quindi due heap JavaScript diversi. Lo snapshot
   runtime-only di chatLiveDebug.ts non attraversa quel confine per
   costruzione. Questo overlay vive nello STESSO runtime del publisher
   (ChatLiveDebugPublisher, sopra), quindi lo vede sempre.

   🔷 «Il debug che sta nella chat, spostalo nel layer globale.» Il
   pulsante viveva DENTRO l'albero di `ChatGPT`, che App.tsx tiene montato
   sempre ma nasconde con CSS quando il tab attivo non è CHAT
   (`live-chat--hidden`) — quindi non era mai davvero raggiungibile da
   MON/SYNC/ME. Il PUBLISHER (sopra) resta qui: deve continuare a
   catturare anche a tab nascosta. Solo il TRIGGER si sposta — via
   `ChatDebugTrigger`, esportato e montato da `SystemControls` in
   App.tsx, stesso runtime quindi stesso stato — non una copia.
   Comportamento del debug stesso: invariato, `ChatDebugOverlay` non è
   toccato. */
export const ChatDebugTrigger: FC = () => {
  const devEnabled = useApp((s) => s.dev.enabled);
  if (!devEnabled) return null;
  return <ChatDebugArmed />;
};

/* BLACK BOX — questo componente monta SOLO quando i dev tools sono
   attivi (stesso criterio del pulsante DEBUG), non solo quando l'overlay
   è aperto: così l'hook (e la rilevazione OK→SUSPECT che contiene) resta
   attivo anche a drawer chiuso, e un incidente viene catturato anche se
   l'utente non stava guardando in quel momento — "L'utente NON deve
   dover premere FREEZE in tempo." Per chi non ha i dev tools attivi
   questo componente non monta mai: nessun polling in più per loro. */
const ChatDebugArmed: FC = () => {
  const [open, setOpen] = useState(false);
  const debug = useChatLiveDebug();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Apri live debug"
        className="debugtrigger"
      >
        DEBUG
      </button>
      {open && <ChatDebugOverlay onClose={() => setOpen(false)} debug={debug} />}
    </>
  );
};

const ChatDebugRow: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between border-b border-black/5 py-1 dark:border-white/5">
    <span className="text-black/50 dark:text-white/50">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);

const ChatDebugDetectorTile: FC<{ label: string; result: DetectorResult }> = ({ label, result }) => (
  <div className={`rounded-md border px-2 py-1.5 ${result.suspect ? "border-red-600" : "border-black/15 dark:border-white/15"}`}>
    <div className="font-semibold">{label}</div>
    <div className={`text-[11px] font-black ${result.suspect ? "text-red-600" : ""}`}>{result.suspect ? "SUSPECT" : "OK"}</div>
    <div className="text-black/50 dark:text-white/50">{result.detail}</div>
  </div>
);

type ChatDebugEventLike = {
  id: string;
  timestamp: string;
  eventType: string;
  status: string;
  error?: string;
  errorName?: string;
  metadata?: Record<string, string | number | boolean>;
};

const ChatDebugEventRow: FC<{ event: ChatDebugEventLike }> = ({ event }) => (
  <div className="border-b border-black/5 pb-1.5 dark:border-white/5">
    <div className="flex justify-between">
      <span>{new Date(event.timestamp).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
      <span>{event.eventType} · {event.status}</span>
    </div>
    {(event.error || event.errorName) && (
      <div className="break-all text-red-600">
        {event.errorName ?? "Error"}{event.error ? `: ${event.error}` : ""}
      </div>
    )}
    {event.metadata && Object.keys(event.metadata).length > 0 && (
      <div className="break-all text-black/50 dark:text-white/50">
        {Object.entries(event.metadata).map(([key, value]) => `${key}=${String(value)}`).join("  ")}
      </div>
    )}
  </div>
);

const ChatDebugOverlay: FC<{ onClose: () => void; debug: ChatLiveDebugState }> = ({ onClose, debug }) => {
  const { snapshot, eventsSinceClear, eventsFailed, frozen, freeze, resume, clearView, detectors, incident, captureIncidentNow } = debug;
  const [showIncident, setShowIncident] = useState(false);
  const visibleEvents = eventsSinceClear.slice(0, 30);
  const activeBranchIds = new Set(snapshot?.visibleMessageIds ?? []);

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/65 p-3 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Live debug">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white text-[#0d0d0d] dark:bg-[#141414] dark:text-[#ececec] sm:max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">LIVE DEBUG</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                frozen ? "bg-black/10 text-black/60 dark:bg-white/15 dark:text-white/70" : "bg-black text-white dark:bg-white dark:text-black"
              }`}
            >
              {frozen ? "FROZEN" : "LIVE"}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi live debug" className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10">
            <XIcon size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 text-xs">
          <div className={`mb-3 rounded-md border px-2 py-1.5 ${incident ? "border-red-600" : "border-black/15 dark:border-white/15"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">BLACK BOX</span>
              <button
                type="button"
                onClick={captureIncidentNow}
                className="rounded-full border border-black/20 px-2 py-0.5 text-[10px] font-bold dark:border-white/20"
              >
                CAPTURE AGAIN
              </button>
            </div>
            {!incident ? (
              <p className="mt-1 text-black/50 dark:text-white/50">NO INCIDENT CAPTURED</p>
            ) : (
              <div className="mt-1">
                <p className="text-[11px] font-black text-red-600">INCIDENT CAPTURED</p>
                <p className="text-black/50 dark:text-white/50">
                  {new Date(incident.capturedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · trigger: {incident.triggerLabel}
                </p>
                <button
                  type="button"
                  onClick={() => setShowIncident(true)}
                  className="mt-1.5 rounded-full bg-[#0d0d0d] px-3 py-1 text-[10px] font-bold text-white dark:bg-white dark:text-black"
                >
                  VIEW INCIDENT
                </button>
              </div>
            )}
          </div>

          {!snapshot ? (
            <p className="text-black/50 dark:text-white/50">in attesa del primo snapshot dalla chat…</p>
          ) : (
            <>
              <ChatDebugRow label="THREAD ID" value={shortId(snapshot.threadId)} />
              <ChatDebugRow label="REMOTE ID" value={shortId(snapshot.remoteId)} />
              <ChatDebugRow label="HEAD ID" value={shortId(snapshot.headId)} />
              <ChatDebugRow label="VISIBLE MESSAGES" value={String(snapshot.visibleMessageIds.length)} />
              <ChatDebugRow label="REPOSITORY MESSAGES" value={String(snapshot.repositoryMessages.length)} />
              <ChatDebugRow label="RUN STATUS" value={snapshot.runStatus.toUpperCase()} />
            </>
          )}

          {detectors.offBranch.suspect && (
            <p className="mt-3 rounded-md border border-red-600 px-2 py-1.5 text-[11px] font-bold text-red-600">
              OFF-BRANCH MESSAGES: {detectors.offBranch.count}
            </p>
          )}

          {snapshot && snapshot.repositoryMessages.length > 0 && (
            <div className="mt-3 divide-y divide-black/10 border-t border-black/10 dark:divide-white/10 dark:border-white/10">
              {snapshot.repositoryMessages.map((message) => (
                <div key={message.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div>
                    <div className="font-semibold">{shortId(message.id)}</div>
                    <div className="text-black/50 dark:text-white/50">{message.role.toUpperCase()} · parent {shortId(message.parentId)}</div>
                  </div>
                  <div className="text-right text-black/50 dark:text-white/50">
                    {activeBranchIds.has(message.id) ? "BRANCH: YES" : "BRANCH: NO"}
                    <br />
                    {message.id === snapshot.headId ? "HEAD: YES" : "HEAD: NO"}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <ChatDebugDetectorTile label="A · MESSAGE COUNT DROP" result={detectors.messageCountDrop} />
            <ChatDebugDetectorTile label="B · OFF-BRANCH" result={detectors.offBranch} />
            <ChatDebugDetectorTile label="C · DUPLICATE RUN" result={detectors.duplicateRun} />
            <ChatDebugDetectorTile label="D · STALE LOAD" result={detectors.staleLoad} />
            <ChatDebugDetectorTile label="E · REPOSITORY DROP" result={detectors.repositoryDrop} />
            <ChatDebugDetectorTile label="F · SYSTEM ONLY" result={detectors.systemOnlyRegression} />
          </div>

          <div className="mt-4">
            <div className="mb-1 font-semibold">LIVE EVENTS</div>
            {eventsFailed && <p className="text-black/50 dark:text-white/50">Runtime Log non disponibile.</p>}
            {visibleEvents.length === 0 ? (
              <p className="text-black/50 dark:text-white/50">Nessun evento recente.</p>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto border-t border-black/10 pt-1.5 dark:border-white/10">
                {visibleEvents.map((event) => (
                  <ChatDebugEventRow key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 border-t border-black/10 px-4 py-3 dark:border-white/10">
          {frozen ? (
            <button type="button" onClick={resume} className="flex-1 rounded-full bg-[#0d0d0d] px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-black">RESUME</button>
          ) : (
            <button type="button" onClick={freeze} className="flex-1 rounded-full border border-[#0d0d0d] px-3 py-2 text-xs font-bold dark:border-white">FREEZE</button>
          )}
          <button type="button" onClick={clearView} className="flex-1 rounded-full border border-[#0d0d0d] px-3 py-2 text-xs font-bold dark:border-white">CLEAR VIEW</button>
          <button type="button" onClick={onClose} className="flex-1 rounded-full border border-[#0d0d0d] px-3 py-2 text-xs font-bold dark:border-white">CLOSE</button>
        </div>
      </div>
      {showIncident && incident && (
        <ChatIncidentView
          incident={incident}
          liveSnapshot={snapshot}
          onClose={() => setShowIncident(false)}
          onCaptureAgain={captureIncidentNow}
        />
      )}
    </div>
  );
};

/* COPIA TESTO — la lista EVENTS ha uno scroll interno separato da quello
   della schermata (max-h-40 su un contenitore dentro un altro
   overflow-y-auto): su schermi piccoli è facile fermarsi al bordo
   sbagliato e perdere righe senza accorgersene, anche facendo più
   screenshot. Il testo copiato non ha questo problema: contiene SEMPRE
   tutti gli eventi catturati (fino a 20, lo stesso limite già imposto in
   buildIncident/chatLiveDebug.ts), mai solo quelli visibili a schermo. */
function buildIncidentText(
  incident: ChatIncident,
  liveSnapshot: ChatLiveDebugState["snapshot"],
): string {
  const s = incident.snapshot;
  const lines: string[] = [];
  lines.push(`INCIDENT — ${incident.triggerLabel}`);
  lines.push(`catturato ${incident.capturedAt}`);
  lines.push("");
  lines.push("THREAD");
  lines.push(`  THREAD ID: ${s?.threadId ?? "—"}`);
  lines.push(`  REMOTE ID: ${s?.remoteId ?? "—"}`);
  lines.push("");
  lines.push("COUNTS");
  lines.push(`  VISIBLE MESSAGES: ${s?.visibleMessageIds.length ?? 0}`);
  lines.push(`  REPOSITORY MESSAGES: ${s?.repositoryMessages.length ?? 0}`);
  lines.push("");
  lines.push("HEAD");
  lines.push(`  HEAD ID: ${s?.headId ?? "—"}`);
  lines.push(`  RUN STATUS: ${(s?.runStatus ?? "—").toUpperCase()}`);
  lines.push("");
  lines.push("CURRENT THREAD (dal vivo, al momento della copia)");
  if (!liveSnapshot) {
    lines.push("  nessuno snapshot dal vivo disponibile ora");
  } else {
    lines.push(`  HEAD ID: ${liveSnapshot.headId}`);
    lines.push(`  VISIBLE MESSAGES: ${liveSnapshot.visibleMessageIds.length}`);
    lines.push(`  REPOSITORY MESSAGES: ${liveSnapshot.repositoryMessages.length}`);
    lines.push(`  RUN STATUS: ${liveSnapshot.runStatus.toUpperCase()}`);
  }
  lines.push("");
  lines.push("DETECTORS");
  for (const detector of incident.detectors) {
    lines.push(`  ${detector.label}: ${detector.suspect ? "SUSPECT" : "OK"} — ${detector.detail}`);
  }
  lines.push("");
  lines.push(`EVENTS (${incident.events.length})`);
  for (const event of incident.events) {
    const meta = event.metadata
      ? Object.entries(event.metadata).map(([key, value]) => `${key}=${String(value)}`).join(" ")
      : "";
    const err = event.error || event.errorName ? `  [${event.errorName ?? "Error"}: ${event.error ?? "—"}]` : "";
    lines.push(`  ${event.timestamp}  ${event.eventType} · ${event.status}${err}${meta ? `  ${meta}` : ""}`);
  }
  return lines.join("\n");
}

/* BLACK BOX — vista congelata dell'incidente catturato, così l'utente può
   fare screenshot anche minuti dopo (l'incidente resta nel modulo
   runtime-only finché non arriva un CLEAR VIEW). Sezioni richieste:
   THREAD / COUNTS / HEAD / CURRENT THREAD (per confronto col vivo, non
   con l'incidente) / DETECTORS / EVENTS. */
const ChatIncidentView: FC<{
  incident: ChatIncident;
  liveSnapshot: ChatLiveDebugState["snapshot"];
  onClose: () => void;
  onCaptureAgain: () => void;
}> = ({ incident, liveSnapshot, onClose, onCaptureAgain }) => {
  const s = incident.snapshot;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyIncidentText = () => {
    const text = buildIncidentText(incident, liveSnapshot);
    void navigator.clipboard.writeText(text)
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("failed"))
      .finally(() => setTimeout(() => setCopyState("idle"), 2000));
  };
  return (
    <div className="fixed inset-0 z-[110] flex items-end bg-black/70 p-3 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Incidente catturato">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white text-[#0d0d0d] dark:bg-[#141414] dark:text-[#ececec] sm:max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <span className="text-sm font-semibold">INCIDENT — {incident.triggerLabel}</span>
          <button type="button" onClick={onClose} aria-label="Chiudi incidente" className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10">
            <XIcon size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 text-xs">
          <p className="mb-3 text-black/50 dark:text-white/50">
            catturato {new Date(incident.capturedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>

          <div className="mb-1 font-semibold">THREAD</div>
          <ChatDebugRow label="THREAD ID" value={shortId(s?.threadId ?? null)} />
          <ChatDebugRow label="REMOTE ID" value={shortId(s?.remoteId ?? null)} />

          <div className="mb-1 mt-3 font-semibold">COUNTS</div>
          <ChatDebugRow label="VISIBLE MESSAGES" value={String(s?.visibleMessageIds.length ?? 0)} />
          <ChatDebugRow label="REPOSITORY MESSAGES" value={String(s?.repositoryMessages.length ?? 0)} />

          <div className="mb-1 mt-3 font-semibold">HEAD</div>
          <ChatDebugRow label="HEAD ID" value={shortId(s?.headId ?? null)} />
          <ChatDebugRow label="RUN STATUS" value={(s?.runStatus ?? "—").toUpperCase()} />

          <div className="mb-1 mt-3 font-semibold">CURRENT THREAD</div>
          {!liveSnapshot ? (
            <p className="text-black/50 dark:text-white/50">nessuno snapshot dal vivo disponibile ora</p>
          ) : (
            <>
              <ChatDebugRow label="HEAD ID" value={shortId(liveSnapshot.headId)} />
              <ChatDebugRow label="VISIBLE MESSAGES" value={String(liveSnapshot.visibleMessageIds.length)} />
              <ChatDebugRow label="REPOSITORY MESSAGES" value={String(liveSnapshot.repositoryMessages.length)} />
              <ChatDebugRow label="RUN STATUS" value={liveSnapshot.runStatus.toUpperCase()} />
            </>
          )}

          <div className="mb-1 mt-3 font-semibold">DETECTORS</div>
          <div className="grid grid-cols-2 gap-2">
            {incident.detectors.map((detector) => (
              <ChatDebugDetectorTile key={detector.id} label={detector.label} result={{ suspect: detector.suspect, detail: detector.detail }} />
            ))}
          </div>

          <div className="mb-1 mt-3 font-semibold">EVENTS</div>
          {incident.events.length === 0 ? (
            <p className="text-black/50 dark:text-white/50">nessun evento catturato.</p>
          ) : (
            <div className="max-h-40 space-y-1.5 overflow-y-auto border-t border-black/10 pt-1.5 dark:border-white/10">
              {incident.events.map((event) => (
                <ChatDebugEventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-black/10 px-4 py-3 dark:border-white/10">
          <button type="button" onClick={onCaptureAgain} className="flex-1 rounded-full border border-[#0d0d0d] px-3 py-2 text-xs font-bold dark:border-white">CAPTURE AGAIN</button>
          <button type="button" onClick={copyIncidentText} className="flex-1 rounded-full border border-[#0d0d0d] px-3 py-2 text-xs font-bold dark:border-white">
            {copyState === "copied" ? "COPIATO" : copyState === "failed" ? "NON RIUSCITO" : "COPY TEXT"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 rounded-full bg-[#0d0d0d] px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-black">CLOSE</button>
        </div>
      </div>
    </div>
  );
};

/* 🔷 «La barra della chat non metterla mai al centro, sempre in basso.»
   🔴 A conversazione vuota stava in mezzo allo schermo (`justify-center` +
   `pb-[16vh]`) e poi, al primo messaggio, saltava giù in fondo: due posti
   diversi per lo stesso comando. Adesso il saluto galleggia nello spazio
   sopra e il campo sta in fondo, dove sta sempre. */
const EmptyState: FC = () => {
  return (
    <div className="flex grow flex-col px-4">
      <div className="grow" aria-hidden="true" />
      <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch pb-2">
        <Composer placeholder="Ask anything" />
      </div>
    </div>
  );
};

const monLabel = (name: string) => name.toLocaleLowerCase('it').endsWith('.mon') ? name : `${name}.mon`;

/** Una chat è una stanza persistente. Gli ingressi sono espliciti: avvio di una
 * vera sessione o scelta manuale della stanza. Solo una sostituzione del Mon
 * nella stanza corrente produce anche un'uscita. */
const MonPresenceEvents: FC = () => {
  const aui = useAui();
  const markLive = useContext(GateMarkLiveContext);
  const activeMonKey = useApp((state) => state.activeMonName);
  const record = useApp((state) =>
    state.activeMonName ? state.mons[state.activeMonName] ?? null : null,
  );
  const { loading, threadId, remoteId, custom } = useAuiState(
    useShallow((state) => ({
      loading: state.threads.isLoading,
      threadId: state.threads.mainThreadId,
      remoteId: state.threadListItem.remoteId,
      custom: state.threadListItem.custom,
    })),
  );
  const room = useRef<{ threadId: string | null; monName: string | null }>({
    threadId: null,
    monName: null,
  });
  const openingSequence = useRef(0);
  const roomEntryRevision = useSyncExternalStore(
    subscribeRoomEntry,
    currentRoomEntryRevision,
    currentRoomEntryRevision,
  );

  /* FIRST TURN — PARKED APPEND FIX. Su una sessione locale non ancora
     promossa, aui.thread.append() NON è sicuro: dentro _runAppend il
     messaggio entra nel repository e la chiamata si PARCHEGGIA su
     `await this._getInitializePromise?.()` — la barriera che
     withLocalUnsavedSession tiene apposta pendente fino alla promozione.
     Quando la promozione la sblocca, ogni chiamata parcheggiata riprende
     ed esegue `resetHead(ilProprioMessaggio)`, che a quel punto ha figli
     (il saluto, il primo messaggio dell'utente, la risposta) e li
     CANCELLA tutti: resta quel solo messaggio, il SYSTEM root di ogni
     incidente. Finché la sessione è locale inseriamo quindi per import,
     che ottiene lo stesso risultato live senza barriera su cui
     parcheggiarsi e senza resetHead differito. Su un thread già
     persistente la barriera è già risolta e append resta la strada
     giusta: è anche ciò che lo persiste. */
  const insertPresenceMessage = (message: ThreadMessage, reason: string) => {
    if (isLocalUnsavedSession(threadId)) {
      importWithObservability(aui, 'MonPresenceEvents', reason, repositoryWithMessage(aui.thread.export(), message), markLive);
      return;
    }
    aui.thread.append({
      role: message.role,
      content: message.content,
      metadata: { custom: message.metadata.custom },
      startRun: false,
    } as Parameters<AuiHandle['thread']['append']>[0]);
  };

  const appendOpening = (monName: string, revealDelayMs: number) => {
    const sequence = ++openingSequence.current;
    const entryRevision = currentRoomEntryRevision();
    const card = record ? voiceCard(record) : null;
    const tone = toneFor(record?.data.voice_preset ?? null, card?.fingerprint ?? "");
    void buildOpening(tone, monName).then((greeting) => {
      if (openingSequence.current !== sequence) return;
      if (currentRoomEntryRevision() !== entryRevision) return;
      /* FIRST TURN — OPENING MUST NEVER RACE THE USER. Un saluto
         automatico in ritardo non può inserirsi in una conversazione che
         l'utente ha già iniziato: regola semantica (esistenza di un
         messaggio utente), non un fix di timing. */
      if (!openingStillWelcome(aui.thread.export().messages)) return;
      /* Append non-run: il resetHead che conta arriva dopo un await
         interno di assistant-ui che non osserviamo da qui — l'attribuzione
         scade da sola (beginRepositoryOperation) invece di essere chiusa
         con certezza che non abbiamo. */
      beginRepositoryOperation({ operation: "APPEND_GREETING", caller: "MonPresenceEvents" });
      insertPresenceMessage({
        id: newLocalMessageId(),
        createdAt: new Date(),
        role: "assistant",
        content: [{ type: "text", text: greeting }],
        status: { type: "complete", reason: "unknown" },
        metadata: {
          unstable_state: null,
          unstable_annotations: [],
          unstable_data: [],
          steps: [],
          custom: {
            monGreeting: true,
            monName,
            roomEntry: true,
            ...revealMetadata(revealDelayMs),
          },
        },
      }, 'PRESENCE_GREETING');
    });
  };

  const appendEnter = (monName: string, revealDelayMs = 0) => {
    beginRepositoryOperation({ operation: "APPEND_ENTER", caller: "MonPresenceEvents" });
    insertPresenceMessage({
      id: newLocalMessageId(),
      createdAt: new Date(),
      role: "system",
      content: [{ type: "text", text: `${monLabel(monName)} è entrato nella chat` }],
      metadata: {
        custom: { monPresenceEvent: "enter", monName, ...revealMetadata(revealDelayMs) },
      },
    }, 'PRESENCE_ENTER');
    appendOpening(monName, revealDelayMs + PRESENCE_STEP_MS);
  };

  useEffect(() => {
    const threadCustom = custom ?? {};
    const activeMonName = record?.data.name
      ?? activeMonKey
      ?? (typeof threadCustom.activeMonName === "string" ? threadCustom.activeMonName : null);
    if (loading || !activeMonName) return;
    if (room.current.threadId !== threadId) {
      room.current = { threadId, monName: activeMonName };
      const manualEntry = consumeManualRoomEntry(threadId);
      const sessionEntry = claimSessionRoomEntry();
      const realEntry = manualEntry || sessionEntry;
      if (realEntry) appendEnter(activeMonName);
      if (remoteId && threadCustom.activeMonName !== activeMonName) {
        void aui.threads.item("main").updateCustom({ ...threadCustom, activeMonName });
      }
      return;
    }

    const previous = room.current.monName;
    if (previous === activeMonName) {
      const manualEntry = consumeManualRoomEntry(threadId);
      if (manualEntry) appendEnter(activeMonName);
      if (remoteId && threadCustom.activeMonName !== activeMonName) {
        void aui.threads.item("main").updateCustom({ ...threadCustom, activeMonName });
      }
      return;
    }
    room.current.monName = activeMonName;

    if (previous) {
      insertPresenceMessage({
        id: newLocalMessageId(),
        createdAt: new Date(),
        role: "system",
        content: [{ type: "text", text: `${monLabel(previous)} è uscito dalla chat` }],
        metadata: {
          custom: { monPresenceEvent: "leave", monName: previous, ...revealMetadata(0) },
        },
      }, 'PRESENCE_LEAVE');
    }
    appendEnter(activeMonName, PRESENCE_STEP_MS);
    if (remoteId) void aui.threads.item("main").updateCustom({ ...threadCustom, activeMonName });
  }, [activeMonKey, aui, custom, loading, record, remoteId, roomEntryRevision, threadId]);

  return null;
};

const SystemEventMessage: FC = () => {
  const { isPresenceEvent, followsPresenceEvent, revealDelayMs, revealArrivalId } = useAuiState(
    useShallow((state) => {
      const custom = state.message.metadata.custom;
      const index = state.thread.messages.findIndex((message) => message.id === state.message.id);
      const previous = index > 0 ? state.thread.messages[index - 1] : null;
      return {
        isPresenceEvent: custom.monPresenceEvent === "leave" || custom.monPresenceEvent === "enter",
        followsPresenceEvent: previous?.role === "system"
          && (previous.metadata.custom.monPresenceEvent === "leave"
            || previous.metadata.custom.monPresenceEvent === "enter"),
        revealDelayMs: typeof custom.revealDelayMs === "number" ? custom.revealDelayMs : 0,
        revealArrivalId: custom.revealArrivalId,
      };
    }),
  );
  const animate = useFirstArrivalReveal(revealArrivalId);
  if (!isPresenceEvent) return null;
  return (
    <MessagePrimitive.Root
      className={cn(
        "mx-auto flex w-full max-w-3xl justify-center px-4 py-0.5",
        followsPresenceEvent && "-mt-4",
        animate && "vinz-presence-reveal",
      )}
      style={animate ? { "--vinz-reveal-delay": `${revealDelayMs}ms` } as CSSProperties : undefined}
    >
      <div className="rounded-full bg-black/[0.05] px-3 py-1 text-center text-[11px] leading-4 text-black/50 dark:bg-white/[0.07] dark:text-white/45">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
};

const Composer: FC<{ placeholder: string }> = ({ placeholder }) => {
  const aui = useAui();
  const markLive = useContext(GateMarkLiveContext);
  const threadId = useAuiState((state) => state.threads.mainThreadId);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const recordRef = useRef<RecordPlugin | null>(null);
  const submitAfterRef = useRef(false);
  const [mode, setMode] = useState<
    "idle" | "starting" | "recording" | "transcribing"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);

  useEffect(
    () => () => {
      recordRef.current?.destroy();
      waveSurferRef.current?.destroy();
    },
    [],
  );

  useEffect(() => {
    const onInsight = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      if (!detail?.prompt) return;
      const composer = aui.thread.composer();
      composer.setText(detail.prompt);
    };
    window.addEventListener("vinzmon-open-chat", onInsight);
    return () => window.removeEventListener("vinzmon-open-chat", onInsight);
  }, [aui]);

  const transcribe = async (blob: Blob) => {
    const token = savedToken();
    if (!token) throw new Error("Prima attiva VINZ.MON.");
    const extension = blob.type.includes("mp4") ? "m4a" : "webm";
    const form = new FormData();
    form.set(
      "file",
      new File([blob], `voice.${extension}`, { type: blob.type }),
    );
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    const body = (await response.json().catch(() => null)) as
      | { text?: string; error?: string; reason?: string }
      | null;
    if (!response.ok || !body?.text) {
      throw new Error(
        body?.reason ?? body?.error ?? "Trascrizione non riuscita.",
      );
    }
    return body.text;
  };

  const promoteBeforeSend = async (): Promise<string | null> => {
    if (!isLocalUnsavedSession(threadId)) return null;
    const composer = aui.thread.composer();
    const pending = repositoryWithPendingUser(aui.thread.export(), composer.getState().text.trim());
    importWithObservability(aui, 'promoteBeforeSend', 'FIRST_SEND', pending.repository, markLive);
    await promoteLocalSession(threadId, pending.repository);
    composer.setText("");
    composer.clearAttachments();
    return pending.userId;
  };

  const insertAndSend = async (text: string) => {
    const composer = aui.thread.composer();
    const current = composer.getState().text.trim();
    composer.setText(current ? `${current} ${text}` : text);
    const userId = await promoteBeforeSend();
    if (userId) startRunWithObservability(aui, 'insertAndSend', userId);
    else composer.send();
  };

  useEffect(() => {
    if (mode !== "idle" || !pendingTranscript) return;
    void insertAndSend(pendingTranscript);
    setPendingTranscript(null);
  }, [mode, pendingTranscript]);

  const startDictation = async () => {
    if (mode !== "idle") return;
    setDictationError(null);
    setMode("starting");
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error("Microfono non supportato da questo browser.");
      }
      if (!waveRef.current) throw new Error("Registratore non pronto. Riprova.");

      recordRef.current?.destroy();
      waveSurferRef.current?.destroy();
      const wavesurfer = WaveSurfer.create({
        container: waveRef.current,
        height: 34,
        waveColor: "#a6a6a6",
        progressColor: "#f5f5f5",
        cursorWidth: 0,
        barWidth: 3,
        barGap: 2,
        barRadius: 3,
        barHeight: 1.15,
        normalize: true,
        interact: false,
      });
      const safari = /^((?!chrome|android).)*safari/i.test(
        navigator.userAgent,
      );
      const record = wavesurfer.registerPlugin(
        RecordPlugin.create({
          ...(safari && MediaRecorder.isTypeSupported("audio/mp4")
            ? { mimeType: "audio/mp4" }
            : {}),
          scrollingWaveform: true,
          scrollingWaveformWindow: 4,
          renderRecordedAudio: false,
          mediaRecorderTimeslice: 500,
        }),
      );
      waveSurferRef.current = wavesurfer;
      recordRef.current = record;
      submitAfterRef.current = false;
      record.on("record-progress", (duration) =>
        setSeconds(Math.floor(duration / 1000)),
      );
      record.on("record-end", async (blob) => {
        const submit = submitAfterRef.current;
        record.stopMic();
        setSeconds(0);
        if (!submit) {
          setMode("idle");
          return;
        }
        setMode("transcribing");
        try {
          setPendingTranscript(await transcribe(blob));
        } catch (error) {
          setDictationError(
            error instanceof Error
              ? error.message
              : "Trascrizione non riuscita.",
          );
        } finally {
          setMode("idle");
        }
      });
      await record.startRecording({
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      });
      setSeconds(0);
      setMode("recording");
    } catch (error) {
      recordRef.current?.stopMic();
      setDictationError(
        error instanceof Error && error.message
          ? error.message
          : "Consenti l’accesso al microfono e riprova.",
      );
      setMode("idle");
    }
  };

  const finishDictation = (submit: boolean) => {
    submitAfterRef.current = submit;
    if (recordRef.current?.isRecording()) recordRef.current.stopRecording();
  };

  return (
    <ComposerPrimitive.Root className="vinz-composer group/composer box-border flex w-full min-w-0 flex-col rounded-[28px] border border-[#e5e5e5] bg-white px-2 py-2 focus-within:border-[#d0d0d0] dark:border-transparent dark:bg-[#212121] dark:focus-within:border-transparent">
      <AuiIf condition={(s) => s.composer.attachments.length > 0}>
        <div className="flex flex-row flex-wrap gap-2 px-1 pt-1 pb-2">
          <ComposerPrimitive.Attachments
            components={{ Attachment: ChatGPTAttachmentUI }}
          />
        </div>
      </AuiIf>

      {mode !== "idle" ? (
        <div className="vinz-record flex min-h-9 items-center gap-1">
          <button
            type="button"
            className="vinz-record__cancel"
            aria-label="Annulla registrazione"
            disabled={mode === "starting" || mode === "transcribing"}
            onClick={() => finishDictation(false)}
          >
            <span />
          </button>
          <div
            ref={waveRef}
            className={cn(
              "vinz-record__wave",
              (mode === "starting" || mode === "transcribing") &&
                "is-loading",
            )}
            data-status={
              mode === "transcribing"
                ? "TRASCRIZIONE IN CORSO"
                : "AVVIO MICROFONO"
            }
            aria-label={
              mode === "starting"
                ? "Avvio microfono"
                : mode === "transcribing"
                  ? "Trascrizione in corso"
                  : "Livello del microfono"
            }
          />
          <time className="vinz-record__time">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </time>
          <button
            type="button"
            className="vinz-record__send"
            aria-label="Invia dettatura"
            disabled={mode === "starting" || mode === "transcribing"}
            onClick={() => finishDictation(true)}
          >
            <ArrowUpIcon className="size-6" />
          </button>
        </div>
      ) : (
      <div className="flex w-full min-w-0 items-end gap-1">
        <ComposerPrimitive.AddAttachment asChild>
          <TooltipIconButton
            type="button"
            tooltip="Add photos & files"
            side="top"
            aria-label="Add attachment"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#5d5d5d] transition-colors hover:bg-black/[0.07] hover:text-[#5d5d5d] dark:text-[#cdcdcd] dark:hover:bg-white/15 dark:hover:text-[#cdcdcd]"
          >
            <PlusIcon size={20} />
          </TooltipIconButton>
        </ComposerPrimitive.AddAttachment>

        {/* `vinz-composer-input` non serve a vestirlo: è l'aggancio che
            permette a `base.css` di far sparire la barra di navigazione
            mentre questo campo ha il focus. */}
        {/* 🔴 NIENTE `autoFocus`. Su iPhone il focus dato dal codice NON apre
            la tastiera (serve un gesto), ma fa scattare lo stesso `:focus`:
            il nav spariva appena aprivi la chat, senza nessuna tastiera a
            prenderne il posto. Il campo si tocca, e allora sì. */}
        {/* 🔴 MAIN CHAT — ENTER (2026-09-06). Era `submitMode="none"`
            (invio da tastiera SEMPRE disattivato, "fix: stabilize mobile
            chat sending" del 31/08): la vera causa mobile era solo che su
            iOS il nav rimontava fra pointer-down e click sulla freccia,
            spostandola e perdendo il tap — non che Invio dovesse smettere
            di inviare ovunque. `submitMode="enter"` (il default della
            libreria: Invio invia, Shift+Invio va a capo, IME/composition e
            stato disabled già gestiti dal primitivo) più
            `unstable_insertNewlineOnTouchEnter` risolve lo stesso caso
            mobile (Invio va a capo SOLO su dispositivi touch-primari) senza
            disattivare Invio=invia su desktop. Nessun secondo percorso di
            invio: resta lo stesso `composer.send()`/submit del primitivo. */}
        <ComposerPrimitive.Input
          ref={inputRef}
          placeholder={placeholder}
          rows={1}
          submitMode="enter"
          unstable_insertNewlineOnTouchEnter
          className="vinz-composer-input box-border max-h-52 min-h-9 w-full min-w-0 flex-1 resize-none bg-transparent py-1.5 pr-2 pl-1 text-base text-[#0d0d0d] outline-none placeholder:text-[#8e8e8e] dark:text-[#ececec] dark:placeholder:text-[#8e8e8e]"
        />

        <div className="flex shrink-0 items-center gap-1">
          <ComposerPrimaryAction
            onDictate={startDictation}
            onBeforeSend={promoteBeforeSend}
            onSend={(userId) => {
              if (userId) startRunWithObservability(aui, 'ComposerPrimaryAction', userId);
              else aui.thread.composer().send();
            }}
          />
        </div>
      </div>
      )}
      {dictationError && (
        <p className="px-2 pt-1 text-[11px] text-[#ff8a8a]" role="alert">
          {dictationError}
        </p>
      )}
    </ComposerPrimitive.Root>
  );
};

const ComposerPrimaryAction: FC<{
  onDictate: () => void;
  onBeforeSend: () => Promise<string | null>;
  onSend: (userId: string | null) => void;
}> = ({ onDictate, onBeforeSend, onSend }) => {
  return (
    <div className="flex items-center gap-1">
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel className="vinz-clone-composer__cancel flex size-9 items-center justify-center rounded-full">
          <div className="size-2.5 rounded-[2px] bg-current" />
        </ComposerPrimitive.Cancel>
      </AuiIf>

      <AuiIf
        condition={(s) => !s.thread.isRunning && !s.composer.isEmpty}
      >
        <ComposerPrimitive.Send
          className="vinz-clone-composer__send flex size-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white transition-opacity disabled:opacity-30 dark:bg-white dark:text-black"
          onPointerDown={(event) => {
            // Su iOS il focus passava dalla textarea al bottone al pointer-down:
            // la tastiera si chiudeva e il click di invio veniva perso. Il
            // bottone non ha bisogno di prendere focus per eseguire il click.
            if (event.pointerType === "touch") event.preventDefault();
          }}
          onClick={(event) => {
            postChatDiagnostic('CHAT_UI_SUBMIT', 'ui-submit');
            event.preventDefault();
            void (async () => {
              const userId = await onBeforeSend();
              postChatDiagnostic('CHAT_RUN_START', 'composer-send');
              onSend(userId);
            })().catch((error: unknown) => {
              console.warn('[VINZ chat] invio non riuscito', error);
            });
          }}
        >
          <ArrowUpIcon className="size-6" />
        </ComposerPrimitive.Send>
      </AuiIf>

      <AuiIf
        condition={(s) =>
          !s.thread.isRunning && s.composer.isEmpty
        }
      >
        {/* 🔷 «Il pulsante per parlare live all'inizio togliamolo, lasciamo
            solo l'icona del microfono funzionante.» I due bottoni chiamavano
            entrambi `onDictate`: non erano due funzioni, erano la stessa
            mostrata due volte con un'icona diversa. */}
        <TooltipIconButton
          type="button"
          tooltip="Dictate"
          side="top"
          aria-label="Dictate"
          onClick={onDictate}
          className="flex size-9 items-center justify-center rounded-full text-[#5d5d5d] transition-colors hover:bg-black/[0.07] hover:text-[#5d5d5d] dark:text-[#cdcdcd] dark:hover:bg-white/15 dark:hover:text-[#cdcdcd]"
        >
          <Mic className="size-5" />
        </TooltipIconButton>
      </AuiIf>
    </div>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        className="bg-background absolute -top-10 z-10 self-center rounded-full border p-2 disabled:invisible dark:border-white/15 dark:bg-[#2a2a2a]"
      >
        <ChevronDownIcon className="size-5" />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const UserMessage: FC = () => {
  const messageId = useAuiState((state) => state.message.id);
  const memoryFeedback = useSyncExternalStore(subscribeMemoryFeedback, () => memoryFeedbackFor(messageId), () => "none" as const);
  return (
    <MessagePrimitive.Root className="relative mx-auto flex w-full max-w-3xl flex-col items-end gap-1 px-2 sm:px-0">
      <div className="flex flex-row flex-wrap justify-end gap-2">
        <MessagePrimitive.Attachments
          components={{ Attachment: ChatGPTAttachmentUI }}
        />
      </div>

      <div className="vinz-user-message max-w-[70%] rounded-[22px] px-4 py-2.5 leading-6">
        <MessagePrimitive.Parts />
      </div>

      <div className="flex items-center gap-0.5">
        <ActionBarPrimitive.Root
          hideWhenRunning
          autohide="always"
          autohideFloat="single-branch"
          className="flex items-center"
        >
          <ActionBarPrimitive.Copy asChild>
            <TooltipIconButton
              tooltip="Copy"
              side="top"
              className={assistantActionClassName}
            >
              <AuiIf condition={(s) => s.message.isCopied}>
                <CheckIcon className="size-5" />
              </AuiIf>
              <AuiIf condition={(s) => !s.message.isCopied}>
                <CopyIcon className="size-5" />
              </AuiIf>
            </TooltipIconButton>
          </ActionBarPrimitive.Copy>
          <ActionBarPrimitive.Edit asChild>
            <TooltipIconButton
              tooltip="Edit"
              side="top"
              className={assistantActionClassName}
            >
              <PencilIcon className="size-5" />
            </TooltipIconButton>
          </ActionBarPrimitive.Edit>
        </ActionBarPrimitive.Root>

        <BranchPicker />
      </div>
      {memoryFeedback === "explicit-failed" ? (
        <small className="mt-0.5 text-[11px] leading-4 text-red-600 dark:text-red-400">Non sono riuscito a ricordarlo — riprova</small>
      ) : memoryFeedback === "explicit-updated" ? (
        <small className="mt-0.5 text-[11px] leading-4 text-[#737373] dark:text-[#8e8e8e]">Ricordato ✓</small>
      ) : memoryFeedback === "updated" ? (
        <small className="mt-0.5 text-[11px] leading-4 text-[#737373] dark:text-[#8e8e8e]">Memoria aggiornata</small>
      ) : null}
    </MessagePrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <ComposerPrimitive.Root className="mx-auto flex w-full max-w-3xl flex-col justify-end gap-1 rounded-3xl bg-[#e9e9e9]/50 dark:bg-[#323232]">
      <ComposerPrimitive.Input className="text-foreground flex h-8 w-full resize-none bg-transparent p-5 pb-0 outline-none dark:text-white" />

      <div className="m-3 mt-2 flex items-center justify-center gap-2 self-end">
        <ComposerPrimitive.Cancel className="bg-background text-foreground hover:bg-muted rounded-full px-3 py-2 text-sm font-semibold dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800">
          Cancel
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-3 py-2 text-sm font-semibold dark:bg-white dark:text-black dark:hover:bg-white/90">
          Send
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
};

const assistantActionClassName =
  "flex size-9 items-center justify-center rounded-none border-0 bg-transparent p-2 text-[#5d5d5d] transition-[color,opacity,transform] hover:bg-transparent hover:text-[#0d0d0d] active:scale-90 active:opacity-55 data-[copied]:text-[#0d0d0d] data-[submitted]:text-[#0d0d0d] dark:text-[#b4b4b4] dark:hover:bg-transparent dark:hover:text-[#ececec] dark:data-[copied]:text-[#ececec] dark:data-[submitted]:text-[#ececec]";

const OpeningComposedText: FC<{ text: string; active: boolean; delayMs: number }> = ({ text, active, delayMs }) => {
  const [visible, setVisible] = useState(active ? 0 : text.length);
  useEffect(() => {
    if (!active) { setVisible(text.length); return; }
    let frame = 0;
    const startedAt = performance.now() + delayMs;
    const compose = (now: number) => {
      const count = Math.min(text.length, Math.floor(Math.max(0, now - startedAt) / 24));
      setVisible(count);
      if (count < text.length) frame = requestAnimationFrame(compose);
    };
    frame = requestAnimationFrame(compose);
    return () => cancelAnimationFrame(frame);
  }, [active, delayMs, text]);
  return <span className={active && visible < text.length ? "vinz-opening-writing" : undefined}>{text.slice(0, visible)}</span>;
};

const AssistantMessage: FC = () => {
  const [traceOpen, setTraceOpen] = useState(false);
  const { staScrivendo, haTesto, soloSticker, traceId, openingRevealDelay, openingRevealArrivalId } = useAuiState(
    useShallow((s) => ({
      staScrivendo: s.message.status?.type === "running",
      haTesto: (s.message.content ?? []).some(
        (part) => part.type === "text" && part.text.trim().length > 0,
      ),
      soloSticker: s.message.metadata.custom.monReactionOnly === true,
      traceId: typeof s.message.metadata.custom.traceId === "string"
        ? s.message.metadata.custom.traceId
        : null,
      openingRevealDelay: typeof s.message.metadata.custom.revealDelayMs === "number"
        ? s.message.metadata.custom.revealDelayMs
        : 0,
      openingRevealArrivalId: s.message.metadata.custom.roomEntry === true
        ? s.message.metadata.custom.revealArrivalId
        : null,
    })),
  );
  const animateOpening = useFirstArrivalReveal(openingRevealArrivalId);
  if (soloSticker) {
    return (
      <MessagePrimitive.Root className="vinz-sticker-message mx-auto flex w-full max-w-3xl flex-col px-2 sm:px-0">
        <MonReactionMessage />
      </MessagePrimitive.Root>
    );
  }
  return (
    <MessagePrimitive.Root className="vinz-assistant-message relative mx-auto flex w-full max-w-3xl flex-col px-2 sm:px-0">
      <div
        className={cn(
          "vinz-assistant-copy text-[#0d0d0d] dark:text-[#ececec]",
          staScrivendo && haTesto && "is-writing",
        )}
      >
        <MessagePrimitive.Parts>
          {({ part }) => {
            /* 🔴 Una parte di testo ancora VUOTA disegnava comunque il
               pallino che `@assistant-ui/react-markdown` mostra durante lo
               streaming — e adesso che sotto c'è «Sto ragionando…» erano due
               attese sovrapposte, una muta e una che parla. Finché non è
               arrivato niente da scrivere, qui non si disegna niente. */
            if (part.type === "text") {
              if (openingRevealArrivalId && part.text.length > 0) {
                return <OpeningComposedText text={part.text} active={animateOpening} delayMs={openingRevealDelay} />;
              }
              return part.text.length > 0 ? <MarkdownText /> : null;
            }
            if (part.type === "image") {
              return <img src={part.image} alt={part.filename ?? "Immagine generata"} className="mt-2 h-auto w-full max-w-lg rounded-2xl object-contain" />;
            }
            return null;
          }}
        </MessagePrimitive.Parts>
        <StatoDelPensiero />
        <MessagePrimitive.Error>
          <AssistantError />
        </MessagePrimitive.Error>
      </div>

      <WorkoutConfirmationButton />

      <div className="flex items-center pt-1">
        <ActionBarPrimitive.Root hideWhenRunning className="flex items-center">
          <ActionBarPrimitive.Copy asChild>
            <TooltipIconButton
              tooltip="Copy"
              side="top"
              className={assistantActionClassName}
            >
              <AuiIf condition={(s) => s.message.isCopied}>
                <CheckIcon className="size-5" />
              </AuiIf>
              <AuiIf condition={(s) => !s.message.isCopied}>
                <CopyIcon className="size-5" />
              </AuiIf>
            </TooltipIconButton>
          </ActionBarPrimitive.Copy>
          {/* 🔷 «Ci sono delle icone che non funzionano ma non servono
              nemmeno, come mi piace e non mi piace.» Mi piace/Non mi piace
              (`FeedbackPositive`/`FeedbackNegative`) non avevano nessun posto
              dove andare a finire — nessun adapter che li raccoglie — e
              «Share» non aveva nemmeno un gestore: era un bottone finto.
              Tolti entrambi invece di far finta che rispondessero. */}
          <ActionBarPrimitive.Speak asChild>
            <TooltipIconButton
              tooltip="Read aloud"
              side="top"
              className={assistantActionClassName}
            >
              <Volume2 className="size-5" />
            </TooltipIconButton>
          </ActionBarPrimitive.Speak>
          <ActionBarPrimitive.Reload asChild>
            <TooltipIconButton
              tooltip="Regenerate"
              side="top"
              className={assistantActionClassName}
            >
              <RefreshCwIcon className="size-5" />
            </TooltipIconButton>
          </ActionBarPrimitive.Reload>
          <ActionBarMorePrimitive.Root>
            <ActionBarMorePrimitive.Trigger asChild>
              <button
                type="button"
                aria-label="More"
                className={cn(
                  assistantActionClassName,
                  "data-[state=open]:bg-black/[0.07] dark:data-[state=open]:bg-white/15",
                )}
              >
                <MoreHorizontal className="size-5" />
              </button>
            </ActionBarMorePrimitive.Trigger>
            <ActionBarMorePrimitive.Content
              side="bottom"
              align="end"
              sideOffset={6}
              className="bg-black text-white data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 z-50 min-w-40 overflow-hidden rounded-xl border border-white/20 p-1.5"
            >
              <ActionBarPrimitive.ExportMarkdown asChild>
                <ActionBarMorePrimitive.Item className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white outline-none select-none focus:bg-white/15">
                  <Download className="size-5" />
                  Export as Markdown
                </ActionBarMorePrimitive.Item>
              </ActionBarPrimitive.ExportMarkdown>
              <ActionBarMorePrimitive.Item
                disabled={!traceId}
                onSelect={() => traceId && setTraceOpen(true)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white outline-none select-none focus:bg-white/15 data-[disabled]:cursor-default data-[disabled]:opacity-40"
              >
                <ActivityIcon className="size-5" />
                Trace
              </ActionBarMorePrimitive.Item>
            </ActionBarMorePrimitive.Content>
          </ActionBarMorePrimitive.Root>
        </ActionBarPrimitive.Root>
        <BranchPicker className="ml-1" />
      </div>

      <MessageCost />
      <ActivePersonality />
      <MessageUpdates />
      {traceOpen && traceId ? <TracePanel traceId={traceId} onClose={() => setTraceOpen(false)} /> : null}

      <div className="vinz-assistant-meta mt-1 flex flex-wrap items-center gap-1 text-xs text-[#8e8e8e]">
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === "source") return <Sources {...part} />;
            if (part.type === "tool-call")
              return part.toolUI ?? <ToolFallback {...part} />;
            return null;
          }}
        </MessagePrimitive.Parts>
      </div>
    </MessagePrimitive.Root>
  );
};

const TracePanel: FC<{ traceId: string; onClose: () => void }> = ({ traceId, onClose }) => {
  const [trace, setTrace] = useState<ChatTrace | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let current = true;
    void loadChatTrace(traceId).then((value) => {
      if (current) {
        setTrace(value);
        setLoaded(true);
      }
    });
    return () => { current = false; };
  }, [traceId]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end bg-black/65 p-3 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Chat trace">
      <section className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/20 bg-black p-5 text-white shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">Trace</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi trace" className="rounded-full p-2 text-white hover:bg-white/15">
            <XIcon className="size-5" />
          </button>
        </div>
        {!loaded ? <p className="text-sm text-white/60">Caricamento…</p> : !trace ? (
          <p className="text-sm text-white/60">Trace non disponibile.</p>
        ) : (
          <div className="space-y-4 text-sm leading-5">
            <TraceField label="Modello" value={trace.model} />
            <TraceField label="Percorso" value={trace.path} />
            <TraceField label="Personalità" value={trace.personality?.voicePreset} />
            <TraceField label="Writing fingerprint" value={trace.personality?.writingFingerprint} />
            <TraceField label="Reazioni" value={trace.personality?.reactions} />
            {trace.systemPromptComposition?.length ? (
              <TraceList
                label="System prompt composition"
                values={trace.systemPromptComposition.map((block) => `${block.name} · ${block.chars} caratteri`)}
              />
            ) : null}
            {trace.context?.length ? (
              <TraceList
                label={trace.contextKind === "voice-notes"
                  ? "Voice notes"
                  : trace.contextKind === "sources"
                    ? "Sources"
                    : trace.contextKind === "retrieved-memories"
                      ? "Retrieved memories"
                      : "Contesto"}
                values={trace.context}
              />
            ) : null}
            <TraceList label="Strumenti" values={trace.toolRounds.flat()} empty="Nessuno" />
            <TraceField label="Timing" value={`${trace.totalMs} ms`} />
            {trace.steps.length ? <TraceList label="Tappe" values={trace.steps.map((step) => `${step.ms} ms · ${step.label}: ${step.detail}`)} /> : null}
            <TraceField label="Errori" value={trace.error ?? "Nessuno"} />
            {trace.originatingUserMessageId && memoryTrace(trace.originatingUserMessageId) ? <TraceList label="Memory" values={Object.entries(memoryTrace(trace.originatingUserMessageId)).map(([key, value]) => `${key}: ${String(value)}`)} /> : <TraceField label="Memory" value="Non disponibile per il messaggio origine" />}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
};

const TraceField: FC<{ label: string; value?: string | null }> = ({ label, value }) => value ? (
  <div><div className="text-xs font-medium tracking-wide text-white/50 uppercase">{label}</div><div className="mt-1 break-words">{value}</div></div>
) : null;

const TraceList: FC<{ label: string; values: string[]; empty?: string }> = ({ label, values, empty }) => (
  <div>
    <div className="text-xs font-medium tracking-wide text-white/50 uppercase">{label}</div>
    <div className="mt-1 space-y-1 break-words">{values.length ? values.map((value, index) => <div key={`${value}-${index}`}>{value}</div>) : empty}</div>
  </div>
);

/**
 * Il modello sceglie la reaction insieme alla risposta, ma assistant-ui produce
 * un solo messaggio per run. Qui la reaction viene staccata e salvata come un
 * secondo messaggio assistant: nella cronologia resta davvero autonoma.
 */
const ReactionMessageDispatcher: FC = () => {
  const aui = useAui();
  const initialized = useRef(false);
  const previousSignal = useRef("");
  const { loading, signal, reaction } = useAuiState(
    useShallow((state) => {
      const message = state.thread.messages.at(-1);
      const raw = message?.metadata.custom.monReaction;
      const valid = raw && typeof raw === "object"
        && "monName" in raw && typeof raw.monName === "string"
        && "index" in raw && typeof raw.index === "number";
      const reactionOnly = message?.metadata.custom.monReactionOnly === true;
      return {
        loading: state.thread.isLoading,
        signal: valid && !reactionOnly && message ? message.id : "",
        reaction: valid && !reactionOnly ? raw : null,
      };
    }),
  );

  useEffect(() => {
    if (loading) return;
    if (!initialized.current) {
      initialized.current = true;
      previousSignal.current = signal;
      return;
    }
    if (!signal || signal === previousSignal.current || !reaction) return;
    previousSignal.current = signal;
    aui.thread.append({
      role: "assistant",
      content: [{ type: "text", text: "" }],
      metadata: {
        custom: {
          monReaction: reaction,
          monReactionOnly: true,
        },
      },
      startRun: false,
    });
  }, [aui, loading, reaction, signal]);

  return null;
};

/** La proposta resta conversazionale, ma la conferma è un'azione inequivocabile. */
const WorkoutConfirmationButton: FC = () => {
  const aui = useAui();
  const [submitted, setSubmitted] = useState(false);
  const { text, isLast, running } = useAuiState(
    useShallow((state) => ({
      text: (state.message.content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(""),
      isLast: state.thread.messages.at(-1)?.id === state.message.id,
      running: state.thread.isRunning,
    })),
  );
  const asksForWorkoutConfirmation = /Confermi che registro questo \*\*allenamento\*\* in ME\?/i.test(text);
  if (!asksForWorkoutConfirmation || !isLast) return null;

  const confirm = () => {
    if (submitted || running) return;
    setSubmitted(true);
    aui.thread.append("Vai, registra");
  };

  return (
    <button
      type="button"
      className="vinz-workout-confirm"
      onClick={confirm}
      disabled={submitted || running}
    >
      {submitted ? "REGISTRAZIONE…" : "REGISTRA ALLENAMENTO"}
    </button>
  );
};

/** La scena full-screen deve prendere il posto del composer anche su iOS. */
function dismissComposerKeyboard() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (!active.matches('input, textarea, [contenteditable="true"]')) return;
  active.blur();
}

/** Celebra esclusivamente una scrittura realmente confermata dal runtime. */
const LogCelebration: FC = () => {
  const [visible, setVisible] = useState(false);
  const initialized = useRef(false);
  const previousSignal = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const record = useApp((state) =>
    state.activeMonName ? state.mons[state.activeMonName] ?? null : null,
  );
  const reactionSheet = useAssetUrl(record?.data.name ?? "", "reaction_pack");
  const { loading, signal, title } = useAuiState(
    useShallow((state) => {
      const message = state.thread.messages.at(-1);
      const raw = message?.metadata.custom.updates;
      const updates = Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === "string")
        : [];
      const workoutSaved = updates.some((item) =>
        /Allenamento (?:aggiunto|corretto) in ME/i.test(item),
      );
      const mealSaved = updates.some((item) =>
        /Pasto (?:aggiunto|corretto) in ME/i.test(item),
      );
      const meSaved = updates.some((item) =>
        /Schermata ME aggiornata/i.test(item),
      );
      return {
        loading: state.thread.isLoading,
        signal: (workoutSaved || mealSaved || meSaved) && message ? `${message.id}:${updates.join("|")}` : "",
        title: workoutSaved ? 'ALLENAMENTO' : mealSaved ? 'PASTO' : meSaved ? 'ME' : '',
      };
    }),
  );

  useEffect(() => {
    if (loading) return;
    if (!initialized.current) {
      initialized.current = true;
      previousSignal.current = signal;
      return;
    }
    if (!signal || signal === previousSignal.current) return;
    previousSignal.current = signal;
    // assistant-ui conserva il composer focalizzato dopo l'invio: su iOS
    // la tastiera coprirebbe la metà inferiore della celebrazione.
    dismissComposerKeyboard();
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 2100);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [loading, signal]);

  if (!visible) return null;
  return (
    <div className="vinz-workout-celebration" role="status" aria-live="assertive">
      <div className="vinz-workout-celebration__pulse" aria-hidden="true" />
      {reactionSheet ? (
        <span
          className="vinz-workout-celebration__sticker"
          aria-label={`${record?.data.name ?? "Il tuo MON"} è felice`}
          style={{
            backgroundImage: `url(${reactionSheet})`,
            backgroundSize: `${EXPRESSION_SPEC.columns * 100}% ${EXPRESSION_SPEC.rows * 100}%`,
            backgroundPosition: `${100 / (EXPRESSION_SPEC.columns - 1)}% 0%`,
          }}
        />
      ) : null}
      <strong>{title}<br />REGISTRATO</strong>
      <span className="vinz-workout-celebration__line" aria-hidden="true" />
    </div>
  );
};

/** Uno sticker inviato dal MON come reazione autonoma, separato dal testo. */
const MonReactionMessage: FC = () => {
  const reactionOnly = useAuiState((s) => s.message.metadata.custom.monReactionOnly === true);
  const raw = useAuiState((s) => s.message.metadata.custom.monReaction);
  const reaction = raw && typeof raw === "object"
    && "monName" in raw && typeof raw.monName === "string"
    && "index" in raw && typeof raw.index === "number"
      ? raw as { monName: string; index: number; label?: string }
      : null;
  const sheet = useAssetUrl(reaction?.monName ?? "", "reaction_pack");
  if (!reactionOnly || !reaction || !sheet || reaction.index < 0 || reaction.index >= EXPRESSIONS.length) return null;

  const col = reaction.index % EXPRESSION_SPEC.columns;
  const row = Math.floor(reaction.index / EXPRESSION_SPEC.columns);
  const expression = EXPRESSIONS[reaction.index]!;
  return (
    <div className="vinz-chat-reaction" role="img" aria-label={`${reaction.monName}, ${expression.toLowerCase()}`}>
      <span
        aria-hidden="true"
        style={{
          backgroundImage: `url(${sheet})`,
          backgroundSize: `${EXPRESSION_SPEC.columns * 100}% ${EXPRESSION_SPEC.rows * 100}%`,
          backgroundPosition: `${(col * 100) / (EXPRESSION_SPEC.columns - 1)}% ${(row * 100) / (EXPRESSION_SPEC.rows - 1)}%`,
        }}
      />
    </div>
  );
};

/** Diagnostica visibile: conferma quale identità ha prodotto ogni risposta. */
const ActivePersonality: FC = () => {
  const record = useApp((state) =>
    state.activeMonName ? state.mons[state.activeMonName] ?? null : null,
  );
  if (!record) {
    return (
      <small className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[#737373] dark:text-[#8e8e8e]">
        Personalità: assistente neutro
      </small>
    );
  }

  const card = voiceCard(record);
  return (
    <small
      className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[#737373] dark:text-[#8e8e8e]"
      title={card.fingerprint}
    >
      Personalità: {record.data.voice_preset} · {record.data.family}/{record.data.affinity}
    </small>
  );
};

/* ============================================================================
   COSA STA FACENDO, MENTRE LO FA

   🔷 «Quando sta caricando il messaggio vorrei vedere dei testi di feedback
      per sapere cosa sta facendo l'AI. Tipo "sto cercando soluzioni al tuo
      problema" o genericamente "sto ragionando".»

   🔒 QUANDO SAPPIAMO DAVVERO COSA FA, LO DICIAMO; ALTRIMENTI NON LO INVENTIAMO.
   Il runtime emette parti `tool-call` vere — la ricerca sul web, gli strumenti
   che leggono il .mon — e quelle hanno un nome. Se ce n'è una in corso, la
   riga dice QUELLA cosa. Se non c'è, restano le frasi generiche, che sono
   vere qualunque cosa stia succedendo: sta pensando.

   ⚠️ Scrivere «sto cercando soluzioni al tuo problema» mentre il modello non
   sta cercando niente sarebbe un'animazione che racconta una storia: la volta
   che la ricerca non parte davvero, quella riga direbbe una bugia con l'aria
   di essere una diagnosi.

   La riga sparisce da sola appena arriva la prima parola: da lì in poi il
   testo che compare È il feedback. */
const StatoDelPensiero: FC = () => {
  const record = useApp((state) =>
    state.activeMonName ? state.mons[state.activeMonName] ?? null : null,
  );
  const { inCorso, testoGiaArrivato, strumento, azioneCompletata, richiesta, messageId } = useAuiState(
    useShallow((s) => {
      const parts = s.message.content ?? [];
      const running = s.message.status?.type === 'running';
      const conTesto = parts.some(
        (p) => p.type === 'text' && p.text.trim().length > 0,
      );
      /* Uno strumento è «in corso» finché non ha un risultato. */
      const attivo = parts.find(
        (p) => p.type === 'tool-call' && p.result === undefined,
      );
      const ultimoUtente = [...s.thread.messages].reverse().find((message) => message.role === 'user');
      const testoUtente = ultimoUtente?.content
        .filter((part) => part.type === 'text')
        .map((part) => part.type === 'text' ? part.text : '')
        .join(' ') ?? '';
      return {
        inCorso: running,
        testoGiaArrivato: conTesto,
        strumento: attivo && attivo.type === 'tool-call' ? attivo.toolName : null,
        azioneCompletata: parts.some((part) => part.type === 'tool-call' && part.result !== undefined),
        richiesta: testoUtente,
        messageId: s.message.id,
      };
    }),
  );

  const [giro, setGiro] = useState(0);
  const recenti = useRef(localMicroMemory().recentStatuses);
  const card = record ? voiceCard(record) : null;
  const tone = toneFor(record?.data.voice_preset ?? null, card?.fingerprint ?? '');
  const kind = thoughtKind(strumento, richiesta, azioneCompletata && !strumento ? 'after-action' : undefined);
  const frase = buildThoughtStatus({
    preset: record?.data.voice_preset ?? null,
    fingerprint: card?.fingerprint ?? '',
    tone,
    kind,
    seed: `${messageId}|${record?.data.name ?? 'neutral'}|${kind}|${giro}`,
    recent: recenti.current,
  });

  /* Il ciclo delle frasi generiche parte solo quando servono davvero: montare
     un timer che gira anche a chat ferma sarebbe lavoro per niente. */
  useEffect(() => {
    if (!inCorso || testoGiaArrivato || strumento) return;
    const t = setInterval(() => setGiro((n) => n + 1), 2600);
    return () => clearInterval(t);
  }, [inCorso, testoGiaArrivato, strumento]);

  useEffect(() => {
    if (!inCorso || testoGiaArrivato || (giro > 0 && !strumento)) return;
    recenti.current = [...recenti.current.filter((item) => item !== frase), frase].slice(-6);
    rememberThoughtStatus(frase);
  }, [frase, giro, inCorso, strumento, testoGiaArrivato]);

  if (!inCorso || testoGiaArrivato) return null;

  return (
    <div
      className="vinz-pensiero flex items-center gap-2 text-[#5d5d5d] dark:text-[#b4b4b4]"
      aria-live="polite"
    >
      <span className="vinz-pensiero__punto" aria-hidden="true" />
      <span className="vinz-pensiero__testo text-sm">{frase}</span>
    </div>
  );
};

function formatCost(value: number): string {
  if (value === 0) return "$0.0000";
  if (value < 0.0001) return "<$0.0001";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

const MessageCost: FC = () => {
  const value = useAuiState((s) => s.message.metadata.custom.costUsd);
  /* Durante l'attesa il costo non esiste ancora e mostrava «Costo risposta —»
     accanto a «Sto ragionando…»: due righe, una sola informativa. Il prezzo
     compare quando c'è un prezzo. */
  const inCorso = useAuiState((s) => s.message.status?.type === "running");
  if (inCorso && typeof value !== "number") return null;
  const cost = typeof value === "number" ? formatCost(value) : "—";
  return (
    <small className="mt-0.5 text-[11px] leading-4 text-[#737373] tabular-nums dark:text-[#8e8e8e]">
      Costo risposta {cost}
    </small>
  );
};

const MessageUpdates: FC = () => {
  const value = useAuiState((s) => s.message.metadata.custom.updates);
  const updates = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  if (updates.length === 0) return null;
  return (
    <div className="vinz-message-updates mt-1 flex flex-col gap-1" aria-live="polite">
      {updates.map((update) => (
        <small
          key={update}
          className="flex min-h-5 items-center gap-1.5 text-[11px] leading-4 text-[#a8a8a8]"
        >
          <CheckIcon
            className="size-3.5 shrink-0 text-[var(--char-accent)]"
            aria-hidden="true"
          />
          {update}
        </small>
      ))}
    </div>
  );
};

const ChatCostTotal: FC = () => {
  const total = useAuiState((s) =>
    s.thread.messages.reduce((sum, message) => {
      const value = message.metadata.custom.costUsd;
      return sum + (typeof value === "number" ? value : 0);
    }, 0),
  );
  return (
    <div className="vinz-chat-cost pointer-events-none absolute left-12 z-30 text-[11px] leading-4 font-medium text-[#737373] tabular-nums md:left-1/2 md:-translate-x-1/2 dark:text-[#8e8e8e]">
      Chat {formatCost(total)}
    </div>
  );
};

const AssistantError: FC = () => {
  const error = useMessageError();
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "La risposta si è interrotta. Riprova.";
  const message = /load failed|failed to fetch|networkerror/i.test(raw)
    ? "Connessione interrotta. Tocca Riprova."
    : raw;
  return (
    <p role="alert" className="mt-2 text-sm leading-5 text-[#d14f4f] dark:text-[#ff8585]">
      {message}
    </p>
  );
};

const BranchPicker: FC<{ className?: string }> = ({ className }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "text-muted-foreground inline-flex items-center text-sm font-semibold dark:text-[#b4b4b4]",
        className,
      )}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous" className="text-[#b4b4b4]">
          <ChevronLeftIcon className="size-5" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <BranchPickerPrimitive.Number />/<BranchPickerPrimitive.Count />
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next" className="text-[#b4b4b4]">
          <ChevronRightIcon className="size-5" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== "image") return {};
      if (s.attachment.file) return { file: s.attachment.file };
      const src = s.attachment.content?.filter((c) => c.type === "image")[0]
        ?.image;
      if (!src) return {};
      return { src };
    }),
  );

  return useFileSrc(file) ?? src;
};

const ChatGPTAttachmentUI: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";
  const src = useAttachmentSrc();

  return (
    <AttachmentPrimitive.Root className="group/attachment relative">
      <div className="bg-secondary flex items-center gap-2 overflow-hidden rounded-2xl border dark:bg-white/5">
        <AuiIf condition={(s) => s.attachment.type === "image"}>
          {src ? (
            <img
              className="size-32 rounded-md object-cover"
              alt="Attachment"
              src={src}
            />
          ) : (
            <div className="flex h-full w-12 items-center justify-center rounded-md">
              <AttachmentPrimitive.unstable_Thumb className="text-xs" />
            </div>
          )}
        </AuiIf>
        <AuiIf condition={(s) => s.attachment.type !== "image"}>
          <div className="bg-background flex h-full w-12 items-center justify-center rounded-[9px] text-[#6b6b6b] dark:bg-[#3a3a3a] dark:text-[#9a9a9a]">
            <AttachmentPrimitive.unstable_Thumb className="text-xs" />
          </div>
        </AuiIf>
      </div>
      {isComposer && (
        <AttachmentPrimitive.Remove className="absolute -top-1.5 -right-1.5 flex size-7 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#6b6b6b] transition-all hover:bg-[#f5f5f5] hover:text-[#0d0d0d] dark:border-[#3a3a3a] dark:bg-[#1a1a1a] dark:text-[#9a9a9a] dark:hover:bg-[#252525] dark:hover:text-white">
          <XIcon className="size-5" />
        </AttachmentPrimitive.Remove>
      )}
    </AttachmentPrimitive.Root>
  );
};
