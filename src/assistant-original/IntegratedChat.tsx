import { useEffect, useMemo, useRef, type CSSProperties, type FC, type PropsWithChildren } from "react";
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  RuntimeAdapterProvider,
  SimpleTextAttachmentAdapter,
  useAui,
  useAuiState,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  useRuntimeAdapters,
} from "@assistant-ui/react";
import { createLocalStorageAdapter } from "@assistant-ui/core/react";
import type { ToolResult, ToolUse } from "@/ai/tools";
import { createNetlifyChatModel } from "./netlify-runtime";
import { VinzImageAttachmentAdapter, VinzPdfAttachmentAdapter } from "./image-attachment";
import { ChatSurface } from "./chat-surface";
import "./styles.css";
import { migrateStoragePrefix, serverBackedStorage } from "@/system/serverStorage";
import { useApp } from "@/state/store";
import { ensureContrastOnBlack, ensureContrastOnWhite, readableOn } from "@/engine/colorDna";
import { createOwnershipGatedHistoryAdapter, GateMarkLiveContext, withLocalUnsavedSession } from "./conversation-lifecycle-adapter";
import { claimSessionRoomEntry } from "./chat-room-presence";
import { isLocalUnsavedSession } from "./conversation-lifecycle-adapter";
import { savedToken } from "@/brain/stream";

export const persistentThreadAdapter = createLocalStorageAdapter({
  storage: serverBackedStorage,
  prefix: "assistant-ui-official-chatgpt:",
});

const ACTIVE_THREAD_KEY = "assistant-ui-official-chatgpt:active-thread";

/* ⚠️ SI LEGGE ALL'IMPORT, PRIMA CHE IL RUNTIME MONTI. Appena il runtime parte
   crea un thread nuovo e `onThreadIdChange` sovrascrive questo puntatore con
   l'id di quello vuoto: leggerlo dopo vorrebbe dire rileggere sempre e solo la
   conversazione appena nata. `serverBackedStorage` rispecchia le sue chiavi in
   `localStorage`, quindi qui basta una lettura sincrona; la promessa serve al
   primo avvio su un dispositivo nuovo, dove la copia locale non c'è ancora. */
const previousActiveThreadSync = (() => {
  try {
    return localStorage.getItem(ACTIVE_THREAD_KEY);
  } catch {
    return null;
  }
})();
const previousActiveThreadRemote = previousActiveThreadSync
  ? Promise.resolve(previousActiveThreadSync)
  : serverBackedStorage.getItem(ACTIVE_THREAD_KEY).catch(() => null);

/* FIRST TURN — STALE HISTORY RACE FIX. `unstable_Provider` is remounted
   fresh per thread id by assistant-ui itself (`_OuterActiveThreadProvider`
   in RemoteThreadListHookInstanceManager.tsx keys its render on
   `${threadId}:${generation}`), so `createOwnershipGatedHistoryAdapter`'s
   closure — un-acquired at mount — naturally starts over for every new
   thread/reload, never leaking ownership across threads. See the invariant
   and mechanism written up next to `createOwnershipGatedHistoryAdapter` in
   conversation-lifecycle-adapter.ts.

   🔴 `RemoteThreadListHookInstanceManager` keeps more than one instance
   mounted at a time (not just the thread on screen), so more than one
   `HistoryOwnershipGate` can exist simultaneously. `markLive` is
   therefore provided through `GateMarkLiveContext` scoped to THIS gate's
   own subtree, not through a module-level pointer shared by all of
   them — see the comment on `GateMarkLiveContext` for the on-device
   incident that caught the module-level version marking the wrong
   gate. */
const HistoryOwnershipGate: FC<PropsWithChildren> = ({ children }) => {
  const adapters = useRuntimeAdapters();
  const realHistory = adapters?.history;
  const gated = useMemo(
    () => (realHistory ? createOwnershipGatedHistoryAdapter(realHistory) : undefined),
    [realHistory],
  );
  if (!gated) return <>{children}</>;
  return (
    <RuntimeAdapterProvider adapters={{ history: gated.adapter }}>
      <GateMarkLiveContext.Provider value={gated.markLive}>
        {children}
      </GateMarkLiveContext.Provider>
    </RuntimeAdapterProvider>
  );
};

const BasePersistentProvider = persistentThreadAdapter.unstable_Provider!;

const threadAdapter = withLocalUnsavedSession(
  {
    ...persistentThreadAdapter,
    unstable_Provider: ({ children }) => (
      <BasePersistentProvider>
        <HistoryOwnershipGate>{children}</HistoryOwnershipGate>
      </BasePersistentProvider>
    ),
  },
  (remoteId, repository) => serverBackedStorage.setItem(
    `assistant-ui-official-chatgpt:messages:${remoteId}`,
    JSON.stringify(repository),
    'persistSnapshot',
  ),
);

const attachments = new CompositeAttachmentAdapter([
  new VinzImageAttachmentAdapter(),
  new VinzPdfAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

type IntegratedChatProps = {
  runTool: (use: ToolUse) => ToolResult | Promise<ToolResult>;
  voiceModel?: string | null;
  onModelChange?: (model: string) => void;
  /* 🔷 «Tutte le pagine assistente devono essere interamente come quella
     della chat, con tutte le funzionalità, ma in bianco.» `embedded` monta
     la STESSA `<ChatSurface/>`, non una copia: niente `.dark` forzato su
     `<html>` (il clone ha già `bg-white ... dark:bg-black` — è VINZ.MON che
     sceglie il nero, non il componente) e niente cornice tarata sulla tacca
     del telefono, che in un riquadro del lab non esiste. */
  embedded?: boolean;
  onReady?: () => void;
};

export const IntegratedChat: FC<IntegratedChatProps> = ({
  runTool,
  voiceModel,
  onModelChange,
  embedded = false,
  onReady,
}) => {
  const palette = useApp((state) =>
    state.activeMonName ? state.mons[state.activeMonName]?.data.palette_dna ?? null : null,
  );
  const themeStyle = useMemo(() => {
    if (!palette) return undefined;
    const accentOnDark = ensureContrastOnBlack(palette.accent);
    const accentOnLight = ensureContrastOnWhite(palette.accent);
    return {
      "--char-primary": palette.primary,
      "--char-accent": accentOnLight,
      "--char-accent-on-dark": accentOnDark,
      "--char-on-primary": palette.on_primary,
      "--char-on-accent": readableOn(accentOnLight),
      "--char-on-accent-dark": readableOn(accentOnDark),
      "--char-primary-soft": `${palette.primary}1f`,
    } as CSSProperties;
  }, [palette]);

  useEffect(() => {
    if (!embedded) document.documentElement.classList.add("dark");
  }, [embedded]);
  useEffect(() => {
    void migrateStoragePrefix("assistant-ui-official-chatgpt:").catch((error: unknown) => {
      console.warn("[VINZ chat] migrazione storage non riuscita; uso lo storage corrente", error);
    });
  }, []);

  return (
    <IntegratedChatRuntime
      runTool={runTool}
      voiceModel={voiceModel}
      onModelChange={onModelChange}
      embedded={embedded}
      themeStyle={themeStyle}
      onReady={onReady}
    />
  );
};

const IntegratedChatRuntime: FC<IntegratedChatProps & {
  themeStyle?: CSSProperties;
}> = ({ runTool, voiceModel, onModelChange, embedded = false, themeStyle, onReady }) => {
  const model = useMemo(() => createNetlifyChatModel(runTool), [runTool]);
  const runtime = useRemoteThreadListRuntime({
    adapter: threadAdapter,
    onThreadIdChange: (threadId) => {
      if (threadId) void serverBackedStorage.setItem("assistant-ui-official-chatgpt:active-thread", threadId);
    },
    runtimeHook: () =>
      useLocalRuntime(model, {
        adapters: { attachments },
      }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatRuntimeReady onReady={onReady} />
      <ResumeLastThread />
      <AutomationInbox />
      <ChatSurface
        model={voiceModel}
        onModelChange={onModelChange}
        embedded={embedded}
        themeStyle={themeStyle}
      />
    </AssistantRuntimeProvider>
  );
};

/* ============================================================================
   RIPRENDERE LA STESSA CONVERSAZIONE

   🔴 «La chat non resta, se torno non vedo lo storico.»

   ⚠️ IL PUNTATORE SI SCRIVEVA E NON SI RILEGGEVA MAI. `onThreadIdChange` qui
   sopra salva da sempre `active-thread`, ma nessuno lo usava per rientrare:
   ogni apertura dell'app partiva da un thread NUOVO. Finché in cima c'erano le
   schede delle conversazioni il difetto era invisibile — la chat di ieri stava
   lì a un tocco di distanza — ma erano 18 fili separati, uno per avvio, non una
   relazione continua. Tolte le schede, lo storico è diventato irraggiungibile.

   🔒 NON RUBA IL POSTO A NIENTE. Riprende solo se il thread su cui si è aperti
   è ancora vuoto: se stai già scrivendo, o se il runtime ti ha già messo dove
   volevi, questo componente non fa niente. E lo fa una volta sola per mount.
   ========================================================================= */
let resumeAttempted = false;

const ResumeLastThread: FC = () => {
  const aui = useAui();
  const loading = useAuiState((state) => state.threads.isLoading);

  useEffect(() => {
    /* ⚠️ UNA VOLTA PER CARICAMENTO PAGINA, NON PER MOUNT. Cambiare thread fa
       rimontare tutto il sottoalbero del runtime — questo componente compreso —
       quindi un `useRef` si azzererebbe e la ripresa ripartirebbe in cerchio,
       creando un thread vuoto nuovo a ogni giro. Il flag sta nel modulo. */
    if (resumeAttempted || loading) return;
    resumeAttempted = true;

    void (async () => {
      const saved = previousActiveThreadSync ?? (await previousActiveThreadRemote);
      if (!saved) return;

      const threads = aui.threads.getState();
      if (threads.mainThreadId === saved) return;

      /* Il valore salvato è l'id con cui il runtime conosce il thread, che nei
         salvataggi esistenti compare come `remoteId`: si accettano entrambi. */
      const target = threads.threadItems.find(
        (item) => item.status === "regular" && (item.id === saved || item.remoteId === saved),
      );
      if (!target || target.id === threads.mainThreadId) return;

      /* Se la conversazione aperta ha già qualcosa dentro, è quella che vuoi. */
      if (aui.thread.getState().messages.length > 0) return;

      /* 🔴 QUI STAVA IL DIFETTO VERO, ed è più sottile di «non switcha».
         Sul thread ripreso la riga di presenza («è entrato nella chat») viene
         INSERITA IMPORTANDO il repository esportato in quel momento: se
         l'ingresso scatta prima che `load()` abbia applicato lo storico, quel
         repository è vuoto, l'import lo sovrascrive con il solo saluto e il
         gate viene marcato `live` — così le 11 righe già lette dal disco
         vengono buttate. Da fuori sembra «la chat non resta».

         🔒 Riprendere NON è entrare in una stanza. Consumando qui l'ingresso
         di sessione, la presenza non appende niente sul thread ripreso e lo
         storico arriva intero. Il saluto resta dove ha senso: quando una
         conversazione si apre davvero nuova. */
      claimSessionRoomEntry();
      try {
        await aui.threads.switchToThread(target.id);
      } catch (error) {
        console.warn("[VINZ chat] non sono riuscito a riprendere l'ultima conversazione", error);
      }
    })();
  }, [aui, loading]);

  return null;
};

/* ============================================================================
   LE AUTOMAZIONI ARRIVANO IN CHAT

   Il runner sul Mac produce il risultato e lo lascia in una casella; è questo
   componente a portarlo dentro la conversazione, come un messaggio di VINZ.

   🔒 LO CONSEGNA IL CLIENT, NON IL SERVER. Il repository dei messaggi vive nel
   browser, dietro il gate dello storico: scriverci dal server vorrebbe dire
   combattere con la copia viva e con `load()`, che è esattamente il difetto da
   cui usciamo con `ResumeLastThread`. Qui si passa dalla stessa porta di tutti,
   `aui.thread.append`.

   ⚠️ SI ACK SOLO DOPO L'APPEND. Se la pagina muore a metà, il risultato resta
   in casella e arriva al giro dopo: meglio riceverlo due volte che perderlo.

   ⚠️ Su un thread ancora non promosso (nuovo, senza un tuo messaggio) la
   consegna aspetta: l'append resterebbe appeso alla barriera di
   inizializzazione. Riprova al giro successivo. */
const AUTOMATION_POLL_MS = 60_000;

interface AutomationResult {
  id: string;
  title: string;
  text: string;
  at: string;
}

const AutomationInbox: FC = () => {
  const aui = useAui();
  /* Il thread nell'elenco delle dipendenze non è un dettaglio: al primo giro
     `ResumeLastThread` non ha ancora cambiato conversazione, quindi la consegna
     cadrebbe sul thread nuovo e non promosso e aspetterebbe un minuto intero.
     Cambiando thread l'effetto riparte e il risultato arriva subito. */
  const loading = useAuiState((state) => state.threads.isLoading);
  const threadId = useAuiState((state) => state.threads.mainThreadId);
  const busy = useRef(false);

  useEffect(() => {
    if (loading) return;
    let live = true;

    const deliver = async () => {
      if (busy.current || !live) return;
      const threadId = aui.threads.item("main").getState().id;
      if (isLocalUnsavedSession(threadId)) return;
      if (aui.thread.getState().isRunning) return;

      busy.current = true;
      try {
        const token = savedToken();
        if (!token) return;
        const response = await fetch("/api/automations?op=inbox", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) return;
        const { results } = (await response.json()) as { results?: AutomationResult[] };

        for (const result of results ?? []) {
          if (!live) return;
          aui.thread.append({
            role: "assistant",
            content: [{ type: "text", text: `**${result.title}**\n\n${result.text}` }],
            metadata: { custom: { automationResult: true, automationTitle: result.title } },
            startRun: false,
          } as Parameters<typeof aui.thread.append>[0]);
          await fetch("/api/automations", {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ action: "ack", id: result.id }),
          });
        }
      } catch {
        /* Rete assente o Core fermo: il risultato resta in casella. */
      } finally {
        busy.current = false;
      }
    };

    void deliver();
    const timer = window.setInterval(() => void deliver(), AUTOMATION_POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [aui, loading, threadId]);

  return null;
};

const CHAT_READY_FALLBACK_MS = 5_000;

const ChatRuntimeReady: FC<{ onReady?: () => void }> = ({ onReady }) => {
  const loading = useAuiState((state) => state.threads.isLoading);
  const reported = useRef(false);

  useEffect(() => {
    if (!onReady || reported.current || loading) return;
    reported.current = true;
    onReady();
  }, [loading, onReady]);

  useEffect(() => {
    if (!onReady || reported.current) return;
    const timeout = window.setTimeout(() => {
      if (reported.current) return;
      reported.current = true;
      console.warn("[VINZ chat] runtime ancora in caricamento; termino il boot in modalità degradata");
      onReady();
    }, CHAT_READY_FALLBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [onReady]);

  return null;
};
