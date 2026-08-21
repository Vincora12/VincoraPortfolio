import { useEffect, useMemo, useRef, useState } from 'react';
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
  ThreadPrimitive,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter,
  type ThreadMessage,
} from '@assistant-ui/react';
import { createLocalStorageAdapter, createSimpleTitleAdapter, useMessageError } from '@assistant-ui/core/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { useAuiState } from '@assistant-ui/store';
import { useAui } from '@assistant-ui/store';
import { createOnDropHandler, dragAndDropFeature, hotkeysCoreFeature, selectionFeature, syncDataLoaderFeature } from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
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

export function createChatModel(runTool?: (use: ToolUse) => ToolResult, voiceModel?: string | null): ChatModelAdapter {
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

type ChatGroup = { id: string; name: string; parentId: string | null; icon: string; color: string };
type ChatTreeLayout = { groups: ChatGroup[]; placements: Record<string, string | null>; orders?: Record<string, string[]> };
type ChatTreeNode = { id: string; name: string; kind: 'root' | 'group' | 'chat'; icon: string; color: string; parentId: string | null };
const CHAT_TREE_KEY = 'vinzmon.chat.tree.v1';
const CHAT_ICONS = ['●', '★', '◆', '✦', '♥', '☾', '☀', '⚡'];
const CHAT_COLORS = ['#8a8a8a', '#d85d67', '#d99735', '#5f9f73', '#4e8daf', '#8874bd'];

function readChatTree(): ChatTreeLayout {
  try {
    const value = JSON.parse(localStorage.getItem(CHAT_TREE_KEY) ?? '') as ChatTreeLayout;
    if (Array.isArray(value.groups) && value.placements) return value;
  } catch { /* Prima apertura. */ }
  return { groups: [], placements: {} };
}

function ChatDrawer({ onClose }: { onClose: () => void }) {
  const aui = useAui();
  const { threadItems, mainThreadId } = useAuiState((s) => s.threads);
  const [layout, setLayout] = useState(readChatTree);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [visualOverrides, setVisualOverrides] = useState<Record<string, { icon?: string; color?: string }>>({});
  const [hiddenIds, setHiddenIds] = useState(() => new Set<string>());
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const saveLayout = (next: ChatTreeLayout) => { layoutRef.current = next; setLayout(next); localStorage.setItem(CHAT_TREE_KEY, JSON.stringify(next)); };
  const nodes = useMemo(() => {
    const map = new Map<string, ChatTreeNode>();
    map.set('root', { id: 'root', name: 'Chat', kind: 'root', icon: '', color: '', parentId: null });
    layout.groups.forEach((group) => map.set(group.id, { ...group, kind: 'group' }));
    threadItems.filter((thread) => thread.status !== 'archived' && !hiddenIds.has(thread.id)).forEach((thread) => {
      const custom = thread.custom ?? {};
      const visual = visualOverrides[thread.id] ?? {};
      map.set(thread.id, {
        id: thread.id,
        name: thread.title ?? 'Nuova chat',
        kind: 'chat',
        icon: visual.icon ?? (typeof custom.vinzIcon === 'string' ? custom.vinzIcon : '●'),
        color: visual.color ?? (typeof custom.vinzColor === 'string' ? custom.vinzColor : '#8a8a8a'),
        parentId: layout.placements[thread.id] ?? null,
      });
    });
    return map;
  }, [hiddenIds, layout, threadItems, visualOverrides]);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const childrenOf = (parentId: string) => {
    const normalized = parentId === 'root' ? null : parentId;
    const children = Array.from(nodesRef.current.values()).filter((node) => node.kind !== 'root' && node.parentId === normalized).map((node) => node.id);
    const order = layoutRef.current.orders?.[parentId] ?? [];
    return children.sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi);
    });
  };
  const handleDrop = createOnDropHandler<ChatTreeNode>((parent, newChildren) => {
    const next = { ...layoutRef.current, placements: { ...layoutRef.current.placements }, groups: [...layoutRef.current.groups], orders: { ...(layoutRef.current.orders ?? {}) } };
    const parentId = parent.getId();
    const normalizedParent = parentId === 'root' ? null : parentId;
    newChildren.forEach((id) => {
      const node = nodesRef.current.get(id);
      if (node?.kind === 'group') next.groups = next.groups.map((group) => group.id === id ? { ...group, parentId: normalizedParent } : group);
      if (node?.kind === 'chat') next.placements[id] = normalizedParent;
    });
    next.orders![parentId] = newChildren;
    saveLayout(next);
  });
  const tree = useTree<ChatTreeNode>({
    rootItemId: 'root',
    initialState: { expandedItems: layout.groups.map((group) => group.id) },
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().kind !== 'chat',
    dataLoader: {
      getItem: (id) => nodesRef.current.get(id) ?? nodesRef.current.get('root')!,
      getChildren: childrenOf,
    },
    indent: 18,
    canReorder: true,
    seperateDragHandle: true,
    onDrop: handleDrop,
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature, dragAndDropFeature],
  });
  useEffect(() => tree.rebuildTree(), [nodes]);

  const patchThread = async (id: string, patch: Record<string, unknown>) => {
    const item = aui.threads.item({ id });
    if (item.getState().status === 'new') await item.initialize();
    item.updateCustom({ ...(item.getState().custom ?? {}), ...patch });
    setVisualOverrides((current) => ({ ...current, [id]: { ...current[id], ...(typeof patch.vinzIcon === 'string' ? { icon: patch.vinzIcon } : {}), ...(typeof patch.vinzColor === 'string' ? { color: patch.vinzColor } : {}) } }));
  };
  const renameThread = async (id: string, name: string) => {
    const item = aui.threads.item({ id });
    if (item.getState().status === 'new') await item.initialize();
    item.rename(name);
  };
  const createGroup = (parentId: string | null = null) => {
    const name = window.prompt(parentId ? 'Nome del sottogruppo' : 'Nome del gruppo')?.trim();
    if (!name) return;
    saveLayout({ ...layout, groups: [...layout.groups, { id: `folder-${Date.now()}`, name, parentId, icon: '◆', color: '#8a8a8a' }] });
  };
  const moveChat = (id: string, parentId: string) => saveLayout({ ...layout, placements: { ...layout.placements, [id]: parentId || null } });
  const patchGroup = (id: string, patch: Partial<ChatGroup>) => saveLayout({ ...layout, groups: layout.groups.map((group) => group.id === id ? { ...group, ...patch } : group) });
  const deleteChat = (id: string, name: string) => {
    if (!window.confirm(`Eliminare la chat “${name}”?`)) return;
    aui.threads.item({ id }).archive();
    setHiddenIds((current) => new Set(current).add(id));
    const placements = { ...layout.placements };
    delete placements[id];
    saveLayout({ ...layout, placements });
    setMenuId(null);
  };
  const deleteGroup = (id: string, name: string, parentId: string | null) => {
    if (!window.confirm(`Eliminare il gruppo “${name}”? Le chat resteranno disponibili.`)) return;
    const placements = { ...layout.placements };
    Object.keys(placements).forEach((threadId) => { if (placements[threadId] === id) placements[threadId] = parentId; });
    saveLayout({
      placements,
      groups: layout.groups.filter((group) => group.id !== id).map((group) => group.parentId === id ? { ...group, parentId } : group),
    });
    setMenuId(null);
  };

  return (
    <div className="aui-drawer-layer" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="aui-drawer" aria-label="Le tue chat">
        <header className="aui-drawer__header">
          <h2>Chat</h2>
          <div><button type="button" onClick={() => createGroup()} aria-label="Nuovo gruppo">＋</button><button type="button" onClick={onClose} aria-label="Chiudi menu chat">×</button></div>
        </header>
        <div {...tree.getContainerProps()} className="aui-chat-tree">
          {tree.getItems().map((item) => {
            const node = item.getItemData();
            if (node.kind === 'root') return null;
            const current = node.kind === 'chat' && node.id === mainThreadId;
            const menuOpen = menuId === node.id;
            return (
              <div {...item.getProps()} className={`aui-tree-row ${node.kind === 'group' ? 'is-group' : ''} ${current ? 'is-current' : ''}`} key={node.id} style={{ paddingLeft: item.getItemMeta().level * 18 }}>
                <button type="button" className="aui-tree-row__drag" aria-label={`Sposta ${node.name}`} {...item.getDragHandleProps()}>≡</button>
                <button type="button" className="aui-tree-row__main" onClick={(event) => {
                  event.stopPropagation();
                  if (node.kind === 'group') item.isExpanded() ? item.collapse() : item.expand();
                  else { aui.threads.switchToThread(node.id); onClose(); }
                }}>
                  {node.kind === 'group' && <span className="aui-tree-row__chevron">{item.isExpanded() ? '⌄' : '›'}</span>}
                  <span className="aui-tree-row__icon" style={{ color: node.color }}>{node.icon}</span>
                  <span>{node.name}</span>
                  {current && <small>CORRENTE</small>}
                </button>
                <button type="button" className="aui-tree-row__more" aria-label={`Modifica ${node.name}`} onClick={(event) => { event.stopPropagation(); setMenuId(menuOpen ? null : node.id); }}>•••</button>
                {menuOpen && (
                  <div className="aui-tree-menu" onClick={(event) => event.stopPropagation()}>
                    <div className="aui-tree-menu__choices">{CHAT_ICONS.map((icon) => <button type="button" key={icon} onClick={() => node.kind === 'chat' ? void patchThread(node.id, { vinzIcon: icon }) : patchGroup(node.id, { icon })}>{icon}</button>)}</div>
                    <div className="aui-tree-menu__choices">{CHAT_COLORS.map((color) => <button type="button" key={color} aria-label={`Colore ${color}`} style={{ background: color }} onClick={() => node.kind === 'chat' ? void patchThread(node.id, { vinzColor: color }) : patchGroup(node.id, { color })} />)}</div>
                    {node.kind === 'group' ? (
                      <>
                        <button type="button" onClick={() => { const name = window.prompt('Rinomina gruppo', node.name)?.trim(); if (name) patchGroup(node.id, { name }); }}>RINOMINA</button>
                        <button type="button" onClick={() => createGroup(node.id)}>NUOVO SOTTOGRUPPO</button>
                        <button type="button" className="is-danger" onClick={() => deleteGroup(node.id, node.name, node.parentId)}>ELIMINA GRUPPO</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { const name = window.prompt('Rinomina chat', node.name)?.trim(); if (name) void renameThread(node.id, name); }}>RINOMINA</button>
                        <span className="aui-tree-menu__label">SPOSTA IN</span>
                        <div className="aui-tree-menu__destinations">
                          <button type="button" className={!node.parentId ? 'is-active' : ''} onClick={() => { moveChat(node.id, ''); setMenuId(null); }}>CHAT</button>
                          {layout.groups.map((group) => <button type="button" className={node.parentId === group.id ? 'is-active' : ''} key={group.id} onClick={() => { moveChat(node.id, group.id); setMenuId(null); }}>{group.name}</button>)}
                        </div>
                        <button type="button" className="is-danger" onClick={() => deleteChat(node.id, node.name)}>ELIMINA CHAT</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="aui-tree-drag-line" style={tree.getDragLineStyle()} />
        </div>
      </aside>
    </div>
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
    const prepare = (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt ?? '';
      window.setTimeout(() => {
        const input = inputRef.current;
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(input, prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.setSelectionRange(prompt.length, prompt.length);
      }, 80);
    };
    window.addEventListener('vinzmon-open-chat', prepare);
    return () => window.removeEventListener('vinzmon-open-chat', prepare);
  }, []);

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
  const [drawerOpen, setDrawerOpen] = useState(false);
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
        <button type="button" className="aui-chat-menu-button" aria-label="Apri elenco chat" onClick={() => setDrawerOpen(true)}>☰</button>
        <CostSummary />
        <div className="aui-chat-tools__spacer" />
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
      </nav>
      <ThreadPrimitive.Root className="aui-thread">
        <ThreadPrimitive.Viewport className="aui-thread__viewport">
          <ThreadPrimitive.Empty>
            <div className="brain__empty"><strong>Come posso aiutarti?</strong><p>Conversazione, domande, file, immagini e ricerca sul web.</p></div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          <ThreadPrimitive.ViewportFooter className="aui-thread__footer">
            <Composer />
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
      {drawerOpen && createPortal(<ChatDrawer onClose={() => setDrawerOpen(false)} />, document.body)}
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
