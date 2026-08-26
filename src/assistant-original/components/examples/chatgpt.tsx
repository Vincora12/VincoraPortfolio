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
import { useEffect, useRef, useState, type FC } from "react";
import { useMessageError } from "@assistant-ui/core/react";
import { TooltipIconButton } from "@/assistant-original/components/assistant-ui/tooltip-icon-button";
import { useShallow } from "zustand/shallow";
import WaveSurfer from "wavesurfer.js";
import RecordPlugin from "wavesurfer.js/dist/plugins/record.esm.js";
import { savedToken } from "@/brain/stream";
import {
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
import { fallbackGreeting } from "@/engine/voiceDna";
import { makeRng, seedFromString } from "@/engine/rng";
import { useAssetUrl } from "@/system/AssetSlot";
import { EXPRESSION_SPEC, EXPRESSIONS } from "@/engine/assets";

export const ChatGPT: FC = () => {
  return (
    <CloneThreadShell>
      <ChatCostTotal />
      <WorkoutCelebration />
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

/* 🔷 «La barra della chat non metterla mai al centro, sempre in basso.»
   🔴 A conversazione vuota stava in mezzo allo schermo (`justify-center` +
   `pb-[16vh]`) e poi, al primo messaggio, saltava giù in fondo: due posti
   diversi per lo stesso comando. Adesso il saluto galleggia nello spazio
   sopra e il campo sta in fondo, dove sta sempre. */
const EmptyState: FC = () => {
  const aui = useAui();
  const didGreet = useRef(false);
  const record = useApp((state) =>
    state.activeMonName ? state.mons[state.activeMonName] ?? null : null,
  );

  useEffect(() => {
    if (didGreet.current) return;
    didGreet.current = true;

    const greeting = record
      ? fallbackGreeting(
          makeRng(seedFromString(`${record.data.name}:chat:${Date.now()}`)),
          record.data.mood_primary,
          record.data.voice_dna,
        )
      : "Ciao. Da dove iniziamo?";

    aui.thread.append({
      role: "assistant",
      content: [{ type: "text", text: greeting }],
      metadata: record
        ? { custom: { monGreeting: true, monName: record.data.name } }
        : { custom: { monGreeting: true } },
      startRun: false,
    });
  }, [aui, record]);

  return (
    <div className="flex grow flex-col px-4">
      <div className="grow" aria-hidden="true" />
      <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch pb-2">
        <Composer placeholder="Ask anything" />
      </div>
    </div>
  );
};

const Composer: FC<{ placeholder: string }> = ({ placeholder }) => {
  const aui = useAui();
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

  const insertAndSend = (text: string) => {
    const composer = aui.thread.composer();
    const current = composer.getState().text.trim();
    composer.setText(current ? `${current} ${text}` : text);
    composer.send();
  };

  useEffect(() => {
    if (mode !== "idle" || !pendingTranscript) return;
    insertAndSend(pendingTranscript);
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
    <ComposerPrimitive.Root className="group/composer flex w-full flex-col rounded-[28px] border border-[#e5e5e5] bg-white px-2 py-2 focus-within:border-[#d0d0d0] dark:border-transparent dark:bg-[#212121] dark:focus-within:border-transparent">
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
      <div className="flex items-end gap-1">
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
        <ComposerPrimitive.Input
          ref={inputRef}
          placeholder={placeholder}
          rows={1}
          className="vinz-composer-input max-h-52 min-h-9 flex-1 resize-none bg-transparent py-1.5 pr-2 pl-1 text-base text-[#0d0d0d] outline-none placeholder:text-[#8e8e8e] dark:text-[#ececec] dark:placeholder:text-[#8e8e8e]"
        />

        <div className="flex shrink-0 items-center gap-1">
          <ComposerPrimaryAction onDictate={startDictation} />
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

const ComposerPrimaryAction: FC<{ onDictate: () => void }> = ({
  onDictate,
}) => {
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
        <ComposerPrimitive.Send className="vinz-clone-composer__send flex size-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white transition-opacity disabled:opacity-30 dark:bg-white dark:text-black">
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

const AssistantMessage: FC = () => {
  const { staScrivendo, haTesto } = useAuiState(
    useShallow((s) => ({
      staScrivendo: s.message.status?.type === "running",
      haTesto: (s.message.content ?? []).some(
        (part) => part.type === "text" && part.text.trim().length > 0,
      ),
    })),
  );
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
              return part.text.length > 0 ? <MarkdownText /> : null;
            }
            return null;
          }}
        </MessagePrimitive.Parts>
        <StatoDelPensiero />
        <MessagePrimitive.Error>
          <AssistantError />
        </MessagePrimitive.Error>
      </div>

      <MonReactionMessage />

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
              className="bg-popover text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 z-50 min-w-40 overflow-hidden rounded-xl border p-1.5"
            >
              <ActionBarPrimitive.ExportMarkdown asChild>
                <ActionBarMorePrimitive.Item className="text-muted-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none select-none">
                  <Download className="size-5" />
                  Export as Markdown
                </ActionBarMorePrimitive.Item>
              </ActionBarPrimitive.ExportMarkdown>
            </ActionBarMorePrimitive.Content>
          </ActionBarMorePrimitive.Root>
        </ActionBarPrimitive.Root>
        <BranchPicker className="ml-1" />
      </div>

      <MessageCost />
      <ActivePersonality />
      <MessageUpdates />

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

/** Celebra esclusivamente una scrittura realmente confermata dal runtime. */
const WorkoutCelebration: FC = () => {
  const [visible, setVisible] = useState(false);
  const initialized = useRef(false);
  const previousSignal = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const record = useApp((state) =>
    state.activeMonName ? state.mons[state.activeMonName] ?? null : null,
  );
  const reactionSheet = useAssetUrl(record?.data.name ?? "", "reaction_pack");
  const { loading, signal } = useAuiState(
    useShallow((state) => {
      const message = state.thread.messages.at(-1);
      const raw = message?.metadata.custom.updates;
      const updates = Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === "string")
        : [];
      const workoutSaved = updates.some((item) =>
        /Allenamento (?:aggiunto|corretto) in ME/i.test(item),
      );
      return {
        loading: state.thread.isLoading,
        signal: workoutSaved && message ? `${message.id}:${updates.join("|")}` : "",
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
      <strong>ALLENAMENTO<br />REGISTRATO</strong>
      <span className="vinz-workout-celebration__line" aria-hidden="true" />
    </div>
  );
};

/** Uno sticker inviato dal MON come reazione autonoma, separato dal testo. */
const MonReactionMessage: FC = () => {
  const raw = useAuiState((s) => s.message.metadata.custom.monReaction);
  const reaction = raw && typeof raw === "object"
    && "monName" in raw && typeof raw.monName === "string"
    && "index" in raw && typeof raw.index === "number"
      ? raw as { monName: string; index: number; label?: string }
      : null;
  const sheet = useAssetUrl(reaction?.monName ?? "", "reaction_pack");
  if (!reaction || !sheet || reaction.index < 0 || reaction.index >= EXPRESSIONS.length) return null;

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
const PENSIERI = [
  'Sto ragionando…',
  'Sto mettendo insieme la risposta…',
  'Ci sto ancora pensando…',
];

/** Dal nome tecnico dello strumento alla frase che leggi. */
function frasePerStrumento(toolName: string): string {
  const n = toolName.toLowerCase();
  if (n.includes('ricerca web')) return 'Sto cercando sul web…';
  if (n.includes('pagina') || n.includes('page')) return 'Sto scrivendo la pagina…';
  if (n.includes('promemoria') || n.includes('remind')) return 'Sto sistemando il promemoria…';
  if (n.includes('dati') || n.includes('mon')) return 'Sto leggendo i tuoi dati…';
  return 'Sto usando uno strumento…';
}

const StatoDelPensiero: FC = () => {
  const { inCorso, testoGiaArrivato, strumento } = useAuiState(
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
      return {
        inCorso: running,
        testoGiaArrivato: conTesto,
        strumento: attivo && attivo.type === 'tool-call' ? attivo.toolName : null,
      };
    }),
  );

  const [giro, setGiro] = useState(0);

  /* Il ciclo delle frasi generiche parte solo quando servono davvero: montare
     un timer che gira anche a chat ferma sarebbe lavoro per niente. */
  useEffect(() => {
    if (!inCorso || testoGiaArrivato || strumento) return;
    const t = setInterval(() => setGiro((n) => n + 1), 2600);
    return () => clearInterval(t);
  }, [inCorso, testoGiaArrivato, strumento]);

  if (!inCorso || testoGiaArrivato) return null;

  const frase = strumento
    ? frasePerStrumento(strumento)
    : PENSIERI[giro % PENSIERI.length]!;

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
