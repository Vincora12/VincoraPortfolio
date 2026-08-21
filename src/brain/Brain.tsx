import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AttachmentPrimitive,
  ComposerPrimitive,
  CompositeAttachmentAdapter,
  MessagePrimitive,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter,
  type ThreadMessage,
} from '@assistant-ui/react';
import { createLocalStorageAdapter, createSimpleTitleAdapter, useMessageError } from '@assistant-ui/core/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { useAui, useAuiState } from '@assistant-ui/store';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';
import Sortable, { type MoveEvent, type SortableEvent } from 'sortablejs';
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

type TopicMenuState = { id: string; title: string; x: number; y: number; groupId?: string; groupName?: string; groupLeader?: boolean } | null;
type TopicController = {
  openMenu: (menu: NonNullable<TopicMenuState>) => void;
  movingId: string | null;
  openGroups: Set<string>;
  toggleGroup: (groupId: string) => void;
};
const TopicContext = createContext<TopicController | null>(null);

function TopicTab({ subtopic = false }: { subtopic?: boolean }) {
  const controller = useContext(TopicContext);
  const id = useAuiState((s) => s.threadListItem.id);
  const title = useAuiState((s) => s.threadListItem.title ?? 'Nuova chat');
  const savedCustom = useAuiState((s) => s.threadListItem.custom);
  const custom = savedCustom ?? {};
  const holdRef = useRef<number | null>(null);
  const heldRef = useRef(false);
  const color = typeof custom.vinzColor === 'string' ? custom.vinzColor : '#262626';
  const order = typeof custom.vinzOrder === 'number' ? custom.vinzOrder : 9999;
  const groupId = typeof custom.vinzGroupId === 'string' ? custom.vinzGroupId : null;
  const groupName = typeof custom.vinzGroupName === 'string' ? custom.vinzGroupName : 'Gruppo';
  const isLeader = custom.vinzGroupLeader === true;
  const groupOpen = groupId ? controller?.openGroups.has(groupId) : true;
  const clearHold = () => { if (holdRef.current) window.clearTimeout(holdRef.current); holdRef.current = null; };
  if ((groupId && !isLeader && !subtopic) || (subtopic && (!groupId || isLeader || !groupOpen))) return null;

  return (
    <ThreadListItemPrimitive.Root
      className={`aui-topic ${groupId ? 'is-grouped' : ''} ${isLeader ? 'is-group-leader' : ''} ${isLeader && !groupOpen ? 'is-group-collapsed' : ''} ${groupId && !isLeader && !groupOpen ? 'is-group-hidden' : ''}`}
      style={{ '--topic-color': color, order } as React.CSSProperties}
      data-topic-id={id}
      data-topic-group={groupId ?? undefined}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (controller?.movingId) return;
        heldRef.current = false;
        const { clientX: x, clientY: y } = event;
        holdRef.current = window.setTimeout(() => {
          heldRef.current = true;
          navigator.vibrate?.(25);
          controller?.openMenu({ id, title, x, y, groupId: groupId ?? undefined, groupName, groupLeader: isLeader });
        }, 480);
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onPointerLeave={clearHold}
    >
      {isLeader && groupId && <button type="button" className="aui-topic__group" onClick={() => controller?.toggleGroup(groupId)}>▦ {groupName}</button>}
      <ThreadListItemPrimitive.Trigger className="aui-topic__trigger" onClick={(event) => { if (heldRef.current || controller?.movingId) event.preventDefault(); }}>
        <ThreadListItemPrimitive.Title fallback="Nuova chat" />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemPrimitive.Archive className="aui-topic__close" aria-label="Chiudi chat">×</ThreadListItemPrimitive.Archive>
    </ThreadListItemPrimitive.Root>
  );
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

function ChatManager({ onClose }: { onClose: () => void }) {
  const aui = useAui();
  const topicIds = useAuiState((s) => s.threads.threadIds);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  const item = (id: string) => aui.threads.item({ id });
  const topics = topicIds.map((id, index) => {
    const state = item(id).getState();
    const custom = state.custom ?? {};
    return {
      id,
      title: state.title ?? 'Nuova chat',
      color: typeof custom.vinzColor === 'string' ? custom.vinzColor : '#262626',
      order: typeof custom.vinzOrder === 'number' ? custom.vinzOrder : index,
      groupId: typeof custom.vinzGroupId === 'string' ? custom.vinzGroupId : null,
      groupName: typeof custom.vinzGroupName === 'string' ? custom.vinzGroupName : 'Gruppo',
    };
  }).sort((a, b) => a.order - b.order);
  void revision;

  const patch = (id: string, values: Record<string, unknown>) => {
    const current = item(id).getState().custom ?? {};
    item(id).updateCustom({ ...current, ...values });
  };
  const normalizeOrder = (ids: string[]) => {
    ids.forEach((id, index) => patch(id, { vinzOrder: index }));
    refresh();
  };
  const move = (id: string, direction: -1 | 1) => {
    const ids = topics.map((topic) => topic.id);
    const from = ids.indexOf(id);
    const to = Math.max(0, Math.min(ids.length - 1, from + direction));
    if (from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    normalizeOrder(ids);
  };
  const rename = (id: string, title: string) => {
    const next = window.prompt('Rinomina chat', title)?.trim();
    if (next) { item(id).rename(next); refresh(); }
  };
  const moveToGroup = (id: string, groupId: string) => {
    if (groupId === '__new') {
      const name = window.prompt('Nome del nuovo gruppo', 'Nuovo gruppo')?.trim();
      if (!name) return;
      patch(id, { vinzGroupId: `group-${Date.now()}`, vinzGroupName: name, vinzGroupLeader: true });
    } else if (!groupId) {
      patch(id, { vinzGroupId: null, vinzGroupName: null, vinzGroupLeader: false });
    } else {
      const group = topics.find((topic) => topic.groupId === groupId);
      patch(id, { vinzGroupId: groupId, vinzGroupName: group?.groupName ?? 'Gruppo', vinzGroupLeader: false });
    }
    refresh();
  };
  const groups = Array.from(new Map(topics.filter((topic) => topic.groupId).map((topic) => [topic.groupId!, topic.groupName])).entries());
  const renderTopic = (topic: typeof topics[number]) => (
    <article className="aui-manager__topic" key={topic.id} style={{ '--topic-color': topic.color } as React.CSSProperties}>
      <button className="aui-manager__open" type="button" onClick={() => { item(topic.id).switchTo(); onClose(); }}>
        <i aria-hidden="true" />
        <span>{topic.title}</span>
      </button>
      <div className="aui-manager__actions">
        <button type="button" aria-label={`Sposta ${topic.title} in alto`} onClick={() => move(topic.id, -1)}>↑</button>
        <button type="button" aria-label={`Sposta ${topic.title} in basso`} onClick={() => move(topic.id, 1)}>↓</button>
        <button type="button" aria-label={`Rinomina ${topic.title}`} onClick={() => rename(topic.id, topic.title)}>✎</button>
        <label>
          <span className="sr-only">Gruppo di {topic.title}</span>
          <select value={topic.groupId ?? ''} onChange={(event) => moveToGroup(topic.id, event.target.value)}>
            <option value="">NESSUN GRUPPO</option>
            {groups.map(([id, name]) => <option value={id} key={id}>{name.toUpperCase()}</option>)}
            <option value="__new">＋ NUOVO GRUPPO</option>
          </select>
        </label>
      </div>
    </article>
  );

  return (
    <section className="aui-manager" aria-label="Gestisci chat">
      <header className="aui-manager__header">
        <button type="button" onClick={onClose} aria-label="Chiudi gestione chat">×</button>
        <h2>Chat</h2>
        <ThreadListPrimitive.New className="aui-manager__new" aria-label="Nuova chat">＋</ThreadListPrimitive.New>
      </header>
      <div className="aui-manager__body">
        {topics.filter((topic) => !topic.groupId).map(renderTopic)}
        {groups.map(([groupId, groupName]) => (
          <section className="aui-manager__group" key={groupId}>
            <h3>{groupName}</h3>
            {topics.filter((topic) => topic.groupId === groupId).map(renderTopic)}
          </section>
        ))}
        {topics.length === 0 && <p className="aui-manager__empty">Le tue chat appariranno qui.</p>}
      </div>
    </section>
  );
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
  const aui = useAui();
  useAuiState((s) => s.threads.threadIds);
  const topicListRef = useRef<HTMLDivElement>(null);
  const groupTargetRef = useRef<string | null>(null);
  const [modelMenu, setModelMenu] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [topicMenu, setTopicMenu] = useState<TopicMenuState>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState(() => new Set<string>());
  const skipTopicClickRef = useRef(false);
  const activeModel = voiceModel ?? defaultModel;

  const item = (id: string) => aui.threads.item({ id });
  const patchTopic = (id: string, patch: Record<string, unknown>) => {
    const current = item(id).getState().custom ?? {};
    item(id).updateCustom({ ...current, ...patch });
  };
  const renameTopic = () => {
    if (!topicMenu) return;
    const renamingGroup = topicMenu.groupLeader && topicMenu.groupId;
    const next = window.prompt(renamingGroup ? 'Rinomina gruppo' : 'Rinomina topic', renamingGroup ? topicMenu.groupName : topicMenu.title)?.trim();
    if (next && renamingGroup) {
      document.querySelectorAll<HTMLElement>(`[data-topic-group="${CSS.escape(renamingGroup)}"]`).forEach((node) => node.dataset.topicId && patchTopic(node.dataset.topicId, { vinzGroupName: next }));
    } else if (next) item(topicMenu.id).rename(next);
    setTopicMenu(null);
  };
  const colorTopic = (color: string) => {
    if (topicMenu?.groupLeader && topicMenu.groupId) {
      document.querySelectorAll<HTMLElement>(`[data-topic-group="${CSS.escape(topicMenu.groupId)}"]`).forEach((node) => node.dataset.topicId && patchTopic(node.dataset.topicId, { vinzColor: color }));
    } else if (topicMenu) patchTopic(topicMenu.id, { vinzColor: color });
    setTopicMenu(null);
  };
  useEffect(() => {
    if (!topicMenu) return;
    const actionAt = (event: PointerEvent) => document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-topic-action]');
    const onMove = (event: PointerEvent) => {
      if (actionAt(event)?.dataset.topicAction === 'move') {
        setMovingId(topicMenu.id);
        setTopicMenu(null);
        navigator.vibrate?.(18);
      }
    };
    const onUp = (event: PointerEvent) => {
      const action = actionAt(event);
      if (action?.dataset.topicAction === 'rename') { skipTopicClickRef.current = true; renameTopic(); }
      else if (action?.dataset.topicAction === 'color' && action.dataset.color) { skipTopicClickRef.current = true; colorTopic(action.dataset.color); }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [topicMenu]);
  useEffect(() => {
    if (!topicMenu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest('.aui-topic-menu, .aui-topic')) setTopicMenu(null);
    };
    const timer = window.setTimeout(() => document.addEventListener('pointerdown', close), 0);
    return () => { window.clearTimeout(timer); document.removeEventListener('pointerdown', close); };
  }, [topicMenu]);
  useEffect(() => {
    const list = topicListRef.current;
    if (!list || !movingId) return;
    const pointX = (event: Event | undefined) => {
      if (event instanceof TouchEvent) return event.touches[0]?.clientX ?? event.changedTouches[0]?.clientX;
      return event instanceof MouseEvent || event instanceof PointerEvent ? event.clientX : undefined;
    };
    const clearTarget = () => {
      list.querySelector('.is-group-target')?.classList.remove('is-group-target');
      groupTargetRef.current = null;
    };
    const sortable = Sortable.create(list, {
      draggable: '.aui-topic',
      animation: 220,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 3,
      scroll: true,
      scrollSensitivity: 55,
      scrollSpeed: 14,
      ghostClass: 'aui-topic--ghost',
      chosenClass: 'aui-topic--chosen',
      dragClass: 'aui-topic--drag',
      onMove: (event: MoveEvent, originalEvent?: Event) => {
        const related = event.related.closest<HTMLElement>('[data-topic-id]');
        const dragged = event.dragged.closest<HTMLElement>('[data-topic-id]');
        if (!related || !dragged || related === dragged) { clearTarget(); return true; }
        const x = pointX(originalEvent);
        const rect = related.getBoundingClientRect();
        const grouping = x !== undefined && x > rect.left + rect.width * .3 && x < rect.right - rect.width * .3;
        list.querySelector('.is-group-target')?.classList.remove('is-group-target');
        if (grouping) {
          related.classList.add('is-group-target');
          groupTargetRef.current = related.dataset.topicId ?? null;
          return false;
        }
        groupTargetRef.current = null;
        return true;
      },
      onEnd: (event: SortableEvent) => {
        const moving = event.item.dataset.topicId;
        const target = groupTargetRef.current;
        clearTarget();
        if (!moving) return setMovingId(null);
        if (target && target !== moving) {
          const groupId = `group-${Date.now()}`;
          const groupName = window.prompt('Nome del gruppo', 'Nuovo gruppo')?.trim() || 'Nuovo gruppo';
          patchTopic(target, { vinzGroupId: groupId, vinzGroupName: groupName, vinzGroupLeader: true });
          patchTopic(moving, { vinzGroupId: groupId, vinzGroupName: groupName, vinzGroupLeader: false });
          setOpenGroups((current) => new Set(current).add(groupId));
          document.querySelector<HTMLElement>(`[data-topic-id="${CSS.escape(target)}"]`)?.animate(
            [{ scale: '1' }, { scale: '1.14' }, { scale: '1' }],
            { duration: 300, easing: 'ease-out' },
          );
        } else {
          Array.from(list.querySelectorAll<HTMLElement>(':scope > .aui-topic')).forEach((node, index) => {
            if (node.dataset.topicId) patchTopic(node.dataset.topicId, { vinzOrder: index, vinzGroupId: null, vinzGroupName: null, vinzGroupLeader: false });
          });
        }
        setMovingId(null);
      },
    });
    return () => sortable.destroy();
  }, [movingId]);
  const topicController = useMemo<TopicController>(() => ({
    openMenu: setTopicMenu,
    movingId,
    openGroups,
    toggleGroup: (groupId) => setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    }),
  }), [movingId, openGroups]);

  useEffect(() => {
    if (!modelMenu || models.length) return;
    void loadSetup(savedToken()).then(({ data }) => {
      setModels(data?.voices ?? []);
      setDefaultModel(data?.defaultVoice ?? null);
    });
  }, [modelMenu, models.length]);

  return (
    <main className={`brain aui-chat ${embedded ? 'brain--embedded' : ''}`}>
      <nav className={`aui-topics ${movingId ? 'is-organizing' : ''}`} aria-label="Chat aperte">
          <ThreadListPrimitive.Root className="aui-topics__list" ref={topicListRef}>
            <TopicContext.Provider value={topicController}>
                <ThreadListPrimitive.Items components={{ ThreadListItem: TopicTab }} />
            </TopicContext.Provider>
            <ThreadListPrimitive.New className="aui-topics__new" aria-label="Nuova chat">＋</ThreadListPrimitive.New>
            <button type="button" className="aui-topics__manage" aria-label="Gestisci chat" onClick={() => setManagerOpen(true)}>☰</button>
          </ThreadListPrimitive.Root>
          <div className="aui-subtopics">
            <TopicContext.Provider value={topicController}>
                <ThreadListPrimitive.Items>{() => <TopicTab subtopic />}</ThreadListPrimitive.Items>
            </TopicContext.Provider>
          </div>
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
        {topicMenu && (
          <div className="aui-topic-menu" style={{ left: Math.min(topicMenu.x, window.innerWidth - 230), top: Math.min(topicMenu.y + 12, window.innerHeight - 170) }}>
            <button type="button" data-topic-action="rename" onClick={() => { if (skipTopicClickRef.current) skipTopicClickRef.current = false; else renameTopic(); }}>RINOMINA</button>
            <button type="button" data-topic-action="move" onClick={() => { setMovingId(topicMenu.id); setTopicMenu(null); }}>SPOSTA / RAGGRUPPA</button>
            <div className="aui-topic-menu__colors" aria-label="Cambia colore">
              {['#262626', '#7d3f45', '#9b6a28', '#41644a', '#315d77', '#594c79'].map((color) => <button type="button" key={color} data-topic-action="color" data-color={color} aria-label={`Colore ${color}`} style={{ background: color }} onClick={() => { if (skipTopicClickRef.current) skipTopicClickRef.current = false; else colorTopic(color); }} />)}
            </div>
          </div>
        )}
        {movingId && <div className="aui-organize-hint">SPOSTA TRA LE TAB · SOPRA UNA TAB CREA UN GRUPPO</div>}
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
      {managerOpen && createPortal(<ChatManager onClose={() => setManagerOpen(false)} />, document.body)}
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
