import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AttachmentPrimitive,
  ComposerPrimitive,
  CompositeAttachmentAdapter,
  MessagePrimitive,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  ThreadPrimitive,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter,
  type ThreadMessage,
} from '@assistant-ui/react';
import { createLocalStorageAdapter, createSimpleTitleAdapter, useMessageError } from '@assistant-ui/core/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { useAuiState } from '@assistant-ui/store';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';
import { replyWithLocalTools, savedToken, shouldUseLocalTools, streamReply, type ChatCost } from './stream';
import { loadSetup, type ModelChoice } from '../ai/backend';
import type { BrainMessage } from './store/types';
import type { ToolResult, ToolUse } from '../ai/tools';

const storage = {
  getItem: async (key: string) => localStorage.getItem(key),
  setItem: async (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: async (key: string) => localStorage.removeItem(key),
};

const threadAdapter = createLocalStorageAdapter({
  storage,
  prefix: 'vinzmon.chat.v1:',
  titleGenerator: createSimpleTitleAdapter(),
});

const attachments = new CompositeAttachmentAdapter([
  new SimpleImageAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

const DAILY_COST_KEY = 'vinzmon.chat.daily-cost.v1';

function formatCost(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function addDailyCost(costUsd: number) {
  if (!(costUsd > 0)) return;
  const day = new Date().toLocaleDateString('en-CA');
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_COST_KEY) ?? '{}') as Record<string, number>;
    saved[day] = (saved[day] ?? 0) + costUsd;
    localStorage.setItem(DAILY_COST_KEY, JSON.stringify(saved));
    window.dispatchEvent(new Event('vinzmon-cost-update'));
  } catch { /* Il contatore non deve mai bloccare la chat. */ }
}

function messageText(message: ThreadMessage): string {
  return message.content.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n').trim();
}

function toBrainMessages(messages: readonly ThreadMessage[]): BrainMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return [];
    return [{
      id: message.id,
      ts: message.createdAt.toISOString(),
      role: message.role,
      content: messageText(message),
    } satisfies BrainMessage];
  });
}

function imageFrom(message: ThreadMessage): { mediaType: string; data: string } | undefined {
  for (const part of message.content) {
    if (part.type !== 'image' || typeof part.image !== 'string') continue;
    const match = part.image.match(/^data:([^;]+);base64,(.+)$/s);
    if (match?.[1] && match[2]) return { mediaType: match[1], data: match[2] };
  }
  return undefined;
}

function createChatModel(runTool?: (use: ToolUse) => ToolResult, voiceModel?: string | null): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const last = messages.at(-1);
      if (!last || last.role !== 'user') throw new Error('Messaggio non valido.');
      const user = messageText(last) || 'Analizza questo allegato.';
      const history = toBrainMessages(messages.slice(0, -1));
      const image = imageFrom(last);
      let answer = '';
      const chunks: string[] = [];
      let waiting: (() => void) | null = null;
      let finished = false;
      let failure: unknown;
      let cost: ChatCost = { costUsd: 0 };
      const onChunk = (chunk: string) => {
        chunks.push(chunk);
        waiting?.();
        waiting = null;
      };
      const request = (runTool && shouldUseLocalTools(user) && !image
        ? replyWithLocalTools(history, user, abortSignal, onChunk, runTool, voiceModel)
        : streamReply(history, user, abortSignal, onChunk, image, voiceModel))
        .then((result) => { cost = result; addDailyCost(result.costUsd); })
        .catch((error: unknown) => { failure = error; })
        .finally(() => {
          finished = true;
          waiting?.();
          waiting = null;
        });
      while (!finished || chunks.length > 0) {
        if (chunks.length === 0) {
          await new Promise<void>((resolve) => { waiting = resolve; });
          continue;
        }
        answer += chunks.shift() ?? '';
        yield { content: [{ type: 'text', text: answer }] };
      }
      await request;
      if (failure) throw failure;
      yield { content: [{ type: 'text', text: answer }], metadata: { custom: { costUsd: cost.costUsd, model: cost.model } } };
    },
  };
}

function Attachment() {
  return (
    <AttachmentPrimitive.Root className="aui-attachment">
      <AttachmentPrimitive.Name />
      <AttachmentPrimitive.Remove className="aui-attachment__remove" aria-label="Rimuovi allegato">×</AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="aui-message aui-message--user">
      <MessagePrimitive.Attachments components={{ Attachment }} />
      <div className="aui-message__bubble"><MessagePrimitive.Parts /></div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="aui-message aui-message--assistant">
      <div className="aui-message__bubble aui-markdown">
        <MessagePrimitive.Parts components={{ Text: () => <MarkdownTextPrimitive defer /> }} />
        <MessagePrimitive.Error><ErrorMessage /></MessagePrimitive.Error>
      </div>
      <MessageCost />
      <ActionBarPrimitive.Root className="aui-actions" hideWhenRunning>
        <ActionBarPrimitive.Copy className="aui-action">COPIA</ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload className="aui-action">RIPROVA</ActionBarPrimitive.Reload>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function MessageCost() {
  const value = useAuiState((s) => s.message.metadata.custom.costUsd);
  const cost = typeof value === 'number' ? value : 0;
  return <small className="aui-message-cost">COSTO {formatCost(cost)}</small>;
}

function CostSummary() {
  const messages = useAuiState((s) => s.thread.messages);
  const chatCost = messages.reduce((sum, message) => {
    const value = message.metadata.custom.costUsd;
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);
  const readToday = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(DAILY_COST_KEY) ?? '{}') as Record<string, number>;
      return saved[new Date().toLocaleDateString('en-CA')] ?? 0;
    } catch { return 0; }
  };
  const [today, setToday] = useState(readToday);
  useEffect(() => {
    const update = () => setToday(readToday());
    window.addEventListener('vinzmon-cost-update', update);
    return () => window.removeEventListener('vinzmon-cost-update', update);
  }, []);
  return <div className="aui-cost-summary"><span>CHAT {formatCost(chatCost)}</span><span>OGGI {formatCost(today)}</span></div>;
}

function ErrorMessage() {
  const error = useMessageError();
  return <div className="aui-error" role="alert">{typeof error === 'string' ? error : 'La risposta si è interrotta. Riprova.'}</div>;
}

function modelLabel(model?: string | null): string {
  if (!model) return '5.6 Terra';
  return model.replace(/^gpt-/, '').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function modelProvider(model: string): string {
  if (model.startsWith('claude')) return 'ANTHROPIC';
  if (model.startsWith('kimi')) return 'MOONSHOT';
  return 'OPENAI';
}

function Composer() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const recordRef = useRef<RecordPlugin | null>(null);
  const submitAfterRef = useRef(false);
  const [mode, setMode] = useState<'idle' | 'starting' | 'recording' | 'transcribing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);

  useEffect(() => () => {
    recordRef.current?.destroy();
    waveSurferRef.current?.destroy();
  }, []);

  const transcribe = async (blob: Blob) => {
    const token = savedToken();
    if (!token) throw new Error('Prima attiva VINZ.MON.');
    const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
    const form = new FormData();
    form.set('file', new File([blob], `voice.${extension}`, { type: blob.type }));
    const response = await fetch('/api/transcribe', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
    const body = await response.json().catch(() => null) as { text?: string; error?: string; reason?: string } | null;
    if (!response.ok || !body?.text) throw new Error(body?.reason ?? body?.error ?? 'Trascrizione non riuscita.');
    return body.text;
  };

  const insertAndSend = (text: string) => {
    const input = inputRef.current;
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(input, input.value ? `${input.value} ${text}` : text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('.aui-composer__send')?.click(), 80);
  };

  useEffect(() => {
    if (mode !== 'idle' || !pendingTranscript) return;
    insertAndSend(pendingTranscript);
    setPendingTranscript(null);
  }, [mode, pendingTranscript]);

  const startDictation = async () => {
    if (mode !== 'idle') return;
    setDictationError(null);
    setMode('starting');
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microfono non supportato da questo browser.');
      if (!waveRef.current) throw new Error('Registratore non pronto. Riprova.');
      recordRef.current?.destroy();
      waveSurferRef.current?.destroy();
      const wavesurfer = WaveSurfer.create({
        container: waveRef.current,
        height: 34,
        waveColor: '#a6a6a6',
        progressColor: '#f5f5f5',
        cursorWidth: 0,
        barWidth: 3,
        barGap: 2,
        barRadius: 3,
        barHeight: 1.15,
        normalize: true,
        interact: false,
      });
      const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const record = wavesurfer.registerPlugin(RecordPlugin.create({
        ...(safari && MediaRecorder.isTypeSupported('audio/mp4') ? { mimeType: 'audio/mp4' } : {}),
        scrollingWaveform: true,
        scrollingWaveformWindow: 4,
        renderRecordedAudio: false,
        mediaRecorderTimeslice: 500,
      }));
      waveSurferRef.current = wavesurfer;
      recordRef.current = record;
      submitAfterRef.current = false;
      record.on('record-progress', (duration) => setSeconds(Math.floor(duration / 1000)));
      record.on('record-end', async (blob) => {
        const submit = submitAfterRef.current;
        record.stopMic();
        setSeconds(0);
        if (!submit) { setMode('idle'); return; }
        setMode('transcribing');
        try {
          const text = await transcribe(blob);
          setPendingTranscript(text);
        } catch (error) {
          setDictationError(error instanceof Error ? error.message : 'Trascrizione non riuscita.');
        } finally { setMode('idle'); }
      });
      await record.startRecording({ channelCount: 1, echoCancellation: true, noiseSuppression: true });
      setSeconds(0);
      setMode('recording');
    } catch (error) {
      recordRef.current?.stopMic();
      setDictationError(error instanceof Error && error.message ? error.message : 'Consenti l’accesso al microfono e riprova.');
      setMode('idle');
    }
  };

  const finishDictation = (submit: boolean) => {
    submitAfterRef.current = submit;
    if (recordRef.current?.isRecording()) recordRef.current.stopRecording();
  };

  return (
    <ComposerPrimitive.Root className="aui-composer">
      <ComposerPrimitive.Attachments components={{ Attachment }} />
      <div className={`aui-composer__row ${mode !== 'idle' ? 'is-recording' : ''}`}>
        {mode !== 'idle' ? (
          <>
            <button type="button" className="aui-record__cancel" aria-label="Annulla registrazione" disabled={mode === 'starting' || mode === 'transcribing'} onClick={() => finishDictation(false)}>■</button>
            <div
              ref={waveRef}
              className={`aui-record__wave ${mode === 'starting' || mode === 'transcribing' ? 'is-loading' : ''}`}
              data-status={mode === 'transcribing' ? 'TRASCRIZIONE IN CORSO' : 'AVVIO MICROFONO'}
              aria-label={mode === 'starting' ? 'Avvio microfono' : mode === 'transcribing' ? 'Trascrizione in corso' : 'Livello del microfono'}
            />
            <time className="aui-record__time">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</time>
            <button type="button" className="aui-record__send" aria-label="Invia dettatura" disabled={mode === 'starting' || mode === 'transcribing'} onClick={() => finishDictation(true)}>↑</button>
          </>
        ) : (
          <>
        <ComposerPrimitive.AddAttachment className="aui-composer__attach" aria-label="Allega file">＋</ComposerPrimitive.AddAttachment>
        <ComposerPrimitive.Input ref={inputRef} className="aui-composer__input" placeholder="Scrivi a VINZ.MON" aria-label="Messaggio" submitOnEnter />
        <button
          type="button"
          className="aui-composer__mic"
          aria-label="Avvia dettatura"
          onClick={startDictation}
        ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4Zm7-4a7 7 0 0 1-14 0M12 18v4M9 22h6" /></svg></button>
        <ComposerPrimitive.Send className="aui-composer__send">INVIA</ComposerPrimitive.Send>
        <ComposerPrimitive.Cancel className="aui-composer__cancel">STOP</ComposerPrimitive.Cancel>
          </>
        )}
      </div>
      {dictationError && <p className="aui-record__error" role="alert">{dictationError}</p>}
    </ComposerPrimitive.Root>
  );
}

function ChatSurface({ embedded, voiceModel, onModelChange }: { embedded: boolean; voiceModel?: string | null; onModelChange?: (model: string) => void }) {
  const [modelMenu, setModelMenu] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const activeModel = voiceModel ?? defaultModel;

  useEffect(() => {
    if (!modelMenu || models.length) return;
    void loadSetup(savedToken()).then(({ data }) => {
      setModels(data?.voices ?? []);
      setDefaultModel(data?.defaultVoice ?? null);
    });
  }, [modelMenu, models.length]);

  return (
    <main className={`brain aui-chat ${embedded ? 'brain--embedded' : ''}`}>
      <nav className="aui-chat-tools" aria-label="Impostazioni chat">
        {onModelChange && (
          <div className="aui-model-picker">
            <button type="button" className="aui-model-chip" aria-label="Cambia modello AI" aria-expanded={modelMenu} onClick={() => setModelMenu((open) => !open)}>{modelLabel(voiceModel)}⌄</button>
            {modelMenu && (
              <div className="aui-model-menu" role="menu" aria-label="Scegli AI">
                {models.length === 0 ? <span className="aui-model-menu__loading">CARICAMENTO…</span> : models.map((choice) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={choice.model === activeModel}
                    className={`aui-model-option ${choice.model === activeModel ? 'is-active' : ''}`}
                    disabled={!choice.ready}
                    key={choice.model}
                    onClick={() => { onModelChange(choice.model); setModelMenu(false); }}
                  >
                    <span>{choice.label.replace(/^GPT-/, '')}</span>
                    <small>{modelProvider(choice.model)}{!choice.ready ? ' · API MANCANTE' : ''}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <CostSummary />
      </nav>
      <ThreadPrimitive.Root className="aui-thread">
        <ThreadPrimitive.Viewport className="aui-thread__viewport">
          <ThreadPrimitive.Empty>
            <div className="brain__empty"><strong>Come posso aiutarti?</strong><p>Conversazione, domande, file, immagini e ricerca sul web.</p></div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          <ThreadPrimitive.ViewportFooter className="aui-thread__footer">
            <ThreadPrimitive.ScrollToBottom className="aui-scroll" aria-label="Vai in fondo">↓</ThreadPrimitive.ScrollToBottom>
            <Composer />
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </main>
  );
}

function Runtime({ embedded, runTool, voiceModel, onModelChange }: { embedded: boolean; runTool?: (use: ToolUse) => ToolResult; voiceModel?: string | null; onModelChange?: (model: string) => void }) {
  const model = useMemo(() => createChatModel(runTool, voiceModel), [runTool, voiceModel]);
  const runtime = useRemoteThreadListRuntime({
    adapter: threadAdapter,
    runtimeHook: () => useLocalRuntime(model, { adapters: { attachments } }),
  });
  return <AssistantRuntimeProvider runtime={runtime}><ChatSurface embedded={embedded} voiceModel={voiceModel} onModelChange={onModelChange} /></AssistantRuntimeProvider>;
}

export function Brain({ embedded = false, runTool, voiceModel, onModelChange }: { embedded?: boolean; runTool?: (use: ToolUse) => ToolResult; voiceModel?: string | null; onModelChange?: (model: string) => void }) {
  return <Runtime embedded={embedded} runTool={runTool} voiceModel={voiceModel} onModelChange={onModelChange} />;
}
