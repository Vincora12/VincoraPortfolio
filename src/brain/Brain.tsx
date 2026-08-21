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
import { replyWithLocalTools, shouldUseLocalTools, streamReply } from './stream';
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
      const onChunk = (chunk: string) => {
        chunks.push(chunk);
        waiting?.();
        waiting = null;
      };
      const request = (runTool && shouldUseLocalTools(user) && !image
        ? replyWithLocalTools(history, user, abortSignal, onChunk, runTool, voiceModel)
        : streamReply(history, user, abortSignal, onChunk, image, voiceModel))
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
      <ActionBarPrimitive.Root className="aui-actions" hideWhenRunning>
        <ActionBarPrimitive.Copy className="aui-action">COPIA</ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload className="aui-action">RIPROVA</ActionBarPrimitive.Reload>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function ErrorMessage() {
  const error = useMessageError();
  return <div className="aui-error" role="alert">{typeof error === 'string' ? error : 'La risposta si è interrotta. Riprova.'}</div>;
}

function ThreadListItem() {
  return (
    <ThreadListItemPrimitive.Root className="aui-thread-item">
      <ThreadListItemPrimitive.Trigger className="aui-thread-item__trigger">
        <ThreadListItemPrimitive.Title fallback="Nuova conversazione" />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemPrimitive.Archive className="aui-thread-item__archive" aria-label="Archivia">×</ThreadListItemPrimitive.Archive>
    </ThreadListItemPrimitive.Root>
  );
}

function TopicTab() {
  return (
    <ThreadListItemPrimitive.Root className="aui-topic">
      <ThreadListItemPrimitive.Trigger className="aui-topic__trigger">
        <ThreadListItemPrimitive.Title fallback="Nuova chat" />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemPrimitive.Archive className="aui-topic__close" aria-label="Chiudi chat">×</ThreadListItemPrimitive.Archive>
    </ThreadListItemPrimitive.Root>
  );
}

function ThreadList({ close }: { close: () => void }) {
  return (
    <aside className="aui-sidebar" aria-label="Conversazioni">
      <div className="aui-sidebar__head"><strong>CONVERSAZIONI</strong><button type="button" onClick={close}>CHIUDI</button></div>
      <ThreadListPrimitive.Root>
        <ThreadListPrimitive.New className="aui-new" onClick={close}>＋ NUOVA CHAT</ThreadListPrimitive.New>
        <ThreadListPrimitive.Items components={{ ThreadListItem }} />
      </ThreadListPrimitive.Root>
    </aside>
  );
}

function Composer() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const dictate = () => {
    if (listening) return recognitionRef.current?.stop();
    const Recognition = (window as unknown as {
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    }).webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = 'it-IT';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      const input = inputRef.current;
      if (!transcript || !input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(input, input.value ? `${input.value} ${transcript}` : transcript);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  return (
    <ComposerPrimitive.Root className="aui-composer">
      <ComposerPrimitive.Attachments components={{ Attachment }} />
      <div className="aui-composer__row">
        <ComposerPrimitive.AddAttachment className="aui-composer__attach" aria-label="Allega file">＋</ComposerPrimitive.AddAttachment>
        <ComposerPrimitive.Input ref={inputRef} className="aui-composer__input" placeholder="Chiedi qualsiasi cosa…" aria-label="Messaggio" submitOnEnter />
        <button type="button" className={`aui-composer__mic ${listening ? 'is-listening' : ''}`} aria-label={listening ? 'Ferma dettatura' : 'Dettatura'} onClick={dictate}>●</button>
        <ComposerPrimitive.Send className="aui-composer__send">INVIA</ComposerPrimitive.Send>
        <ComposerPrimitive.Cancel className="aui-composer__cancel">STOP</ComposerPrimitive.Cancel>
      </div>
    </ComposerPrimitive.Root>
  );
}

function ChatSurface({ embedded, onSettings }: { embedded: boolean; onSettings?: () => void }) {
  const [showThreads, setShowThreads] = useState(false);
  return (
    <main className={`brain aui-chat ${embedded ? 'brain--embedded' : ''}`}>
      <header className="brain__header">
        <button className="brain__history" type="button" onClick={() => setShowThreads(true)}>CHAT</button>
        <h1>VINZ.MON</h1>
        <div className="brain__right">
          {onSettings && <button type="button" className="brain__settings" aria-label="Impostazioni AI" onClick={onSettings}>AI</button>}
          <ThreadListPrimitive.New className="brain__new">NUOVA</ThreadListPrimitive.New>
        </div>
      </header>
      <nav className="aui-topics" aria-label="Chat aperte">
        <ThreadListPrimitive.Root className="aui-topics__list">
          <ThreadListPrimitive.Items components={{ ThreadListItem: TopicTab }} />
          <ThreadListPrimitive.New className="aui-topics__new" aria-label="Nuova chat">＋</ThreadListPrimitive.New>
        </ThreadListPrimitive.Root>
      </nav>
      {showThreads ? <ThreadList close={() => setShowThreads(false)} /> : null}
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

function Runtime({ embedded, runTool, voiceModel, onSettings }: { embedded: boolean; runTool?: (use: ToolUse) => ToolResult; voiceModel?: string | null; onSettings?: () => void }) {
  const model = useMemo(() => createChatModel(runTool, voiceModel), [runTool, voiceModel]);
  const runtime = useRemoteThreadListRuntime({
    adapter: threadAdapter,
    runtimeHook: () => useLocalRuntime(model, { adapters: { attachments } }),
  });
  return <AssistantRuntimeProvider runtime={runtime}><ChatSurface embedded={embedded} onSettings={onSettings} /></AssistantRuntimeProvider>;
}

export function Brain({ embedded = false, runTool, voiceModel, onSettings }: { embedded?: boolean; runTool?: (use: ToolUse) => ToolResult; voiceModel?: string | null; onSettings?: () => void }) {
  return <Runtime embedded={embedded} runTool={runTool} voiceModel={voiceModel} onSettings={onSettings} />;
}
