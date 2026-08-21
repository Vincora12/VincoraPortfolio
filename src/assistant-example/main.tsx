import { StrictMode, useMemo, useState, type FC } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ActionBarPrimitive, AuiIf, AssistantRuntimeProvider, AttachmentPrimitive,
  BranchPickerPrimitive, ComposerPrimitive, CompositeAttachmentAdapter,
  MessagePrimitive, SimpleImageAttachmentAdapter, SimpleTextAttachmentAdapter,
  ThreadListItemPrimitive, ThreadListPrimitive, ThreadPrimitive,
  WebSpeechDictationAdapter, useLocalRuntime, useRemoteThreadListRuntime,
} from '@assistant-ui/react';
import { createLocalStorageAdapter, createSimpleTitleAdapter } from '@assistant-ui/core/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import {
  ArrowDown, ArrowUp, AudioLines, Check, ChevronLeft, ChevronRight, Copy,
  Menu, Mic, PanelLeft, Pencil, Plus, RefreshCw, Share2, Square,
  ThumbsDown, ThumbsUp, Volume2, X,
} from 'lucide-react';
import { mockChatModel } from './mockRuntime';
import '@fontsource-variable/inter';
import './style.css';

const storage = {
  getItem: async (key: string) => localStorage.getItem(key),
  setItem: async (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: async (key: string) => localStorage.removeItem(key),
};
const threadAdapter = createLocalStorageAdapter({ storage, prefix: 'assistant-chatgpt-clone:', titleGenerator: createSimpleTitleAdapter() });
const attachments = new CompositeAttachmentAdapter([new SimpleImageAttachmentAdapter(), new SimpleTextAttachmentAdapter()]);

const IconButton: FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }> = ({ label, className = '', children, ...props }) => (
  <button className={`clone-icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>
);

const ChatGPTAttachment: FC = () => (
  <AttachmentPrimitive.Root className="clone-attachment">
    <div className="clone-attachment-thumb"><AttachmentPrimitive.unstable_Thumb /></div>
    <AttachmentPrimitive.Name />
    <AttachmentPrimitive.Remove className="clone-attachment-remove" aria-label="Rimuovi allegato"><X size={15} /></AttachmentPrimitive.Remove>
  </AttachmentPrimitive.Root>
);

const ThreadItem: FC = () => (
  <ThreadListItemPrimitive.Root className="clone-thread-item">
    <ThreadListItemPrimitive.Trigger className="clone-thread-trigger"><ThreadListItemPrimitive.Title fallback="Nuova chat" /></ThreadListItemPrimitive.Trigger>
    <ThreadListItemPrimitive.Delete className="clone-thread-delete" aria-label="Elimina chat"><X size={15} /></ThreadListItemPrimitive.Delete>
  </ThreadListItemPrimitive.Root>
);

const Sidebar: FC<{ open: boolean; collapsed: boolean; onClose: () => void; onToggle: () => void }> = ({ open, collapsed, onClose, onToggle }) => (
  <>
    <aside className={`clone-sidebar ${collapsed ? 'is-collapsed' : ''} ${open ? 'is-mobile-open' : ''}`}>
      <div className="clone-sidebar-head">
        <IconButton label={collapsed ? 'Mostra cronologia' : 'Nascondi cronologia'} onClick={onToggle}><PanelLeft size={19} /></IconButton>
        {!collapsed && <strong>Chats</strong>}
        <IconButton label="Chiudi" className="clone-mobile-close" onClick={onClose}><X size={19} /></IconButton>
      </div>
      <ThreadListPrimitive.Root className="clone-thread-list">
        <ThreadListPrimitive.New className="clone-new-thread" onClick={onClose}><Plus size={18} /><span>New chat</span></ThreadListPrimitive.New>
        <ThreadListPrimitive.Items components={{ ThreadListItem: ThreadItem }} />
      </ThreadListPrimitive.Root>
    </aside>
    {open && <button className="clone-backdrop" onClick={onClose} aria-label="Chiudi cronologia" />}
  </>
);

const ComposerPrimaryAction: FC = () => (
  <div className="clone-primary-actions">
    <AuiIf condition={(s) => s.thread.isRunning}>
      <ComposerPrimitive.Cancel className="clone-primary" aria-label="Interrompi"><Square size={13} fill="currentColor" /></ComposerPrimitive.Cancel>
    </AuiIf>
    <AuiIf condition={(s) => !s.thread.isRunning && s.composer.dictation != null}>
      <ComposerPrimitive.StopDictation className="clone-primary" aria-label="Ferma dettatura"><Square size={13} fill="currentColor" /></ComposerPrimitive.StopDictation>
    </AuiIf>
    <AuiIf condition={(s) => !s.thread.isRunning && s.composer.dictation == null && !s.composer.isEmpty}>
      <ComposerPrimitive.Send className="clone-primary" aria-label="Invia"><ArrowUp size={22} strokeWidth={2.5} /></ComposerPrimitive.Send>
    </AuiIf>
    <AuiIf condition={(s) => !s.thread.isRunning && s.composer.dictation == null && s.composer.isEmpty}>
      <ComposerPrimitive.Dictate asChild><IconButton label="Dettatura"><Mic size={20} /></IconButton></ComposerPrimitive.Dictate>
      <IconButton label="Modalità voce" className="clone-primary"><AudioLines size={20} /></IconButton>
    </AuiIf>
  </div>
);

const Composer: FC<{ placeholder: string }> = ({ placeholder }) => (
  <ComposerPrimitive.Root className="clone-composer">
    <AuiIf condition={(s) => s.composer.attachments.length > 0}>
      <div className="clone-composer-attachments"><ComposerPrimitive.Attachments components={{ Attachment: ChatGPTAttachment }} /></div>
    </AuiIf>
    <div className="clone-composer-row">
      <ComposerPrimitive.AddAttachment asChild><IconButton label="Aggiungi foto e file"><Plus size={21} /></IconButton></ComposerPrimitive.AddAttachment>
      <ComposerPrimitive.Input autoFocus rows={1} placeholder={placeholder} aria-label="Messaggio" />
      <ComposerPrimaryAction />
    </div>
    <ComposerPrimitive.DictationTranscript className="clone-transcript" />
  </ComposerPrimitive.Root>
);

const BranchPicker: FC = () => (
  <BranchPickerPrimitive.Root hideWhenSingleBranch className="clone-branch">
    <BranchPickerPrimitive.Previous><ChevronLeft size={17} /></BranchPickerPrimitive.Previous>
    <BranchPickerPrimitive.Number />/<BranchPickerPrimitive.Count />
    <BranchPickerPrimitive.Next><ChevronRight size={17} /></BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
);

const UserMessage: FC = () => (
  <MessagePrimitive.Root className="clone-message clone-user-message">
    <div className="clone-message-attachments"><MessagePrimitive.Attachments components={{ Attachment: ChatGPTAttachment }} /></div>
    <div className="clone-user-bubble"><MessagePrimitive.Parts /></div>
    <div className="clone-message-tools">
      <ActionBarPrimitive.Root hideWhenRunning autohide="always">
        <ActionBarPrimitive.Copy asChild><IconButton label="Copia"><Copy size={18} /></IconButton></ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Edit asChild><IconButton label="Modifica"><Pencil size={18} /></IconButton></ActionBarPrimitive.Edit>
      </ActionBarPrimitive.Root><BranchPicker />
    </div>
  </MessagePrimitive.Root>
);

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root className="clone-message clone-assistant-message">
    <div className="clone-markdown"><MessagePrimitive.Parts components={{ Text: () => <MarkdownTextPrimitive defer /> }} /></div>
    <div className="clone-message-tools clone-assistant-tools">
      <ActionBarPrimitive.Root hideWhenRunning>
        <ActionBarPrimitive.Copy asChild><IconButton label="Copia"><AuiIf condition={(s) => s.message.isCopied}><Check size={18} /></AuiIf><AuiIf condition={(s) => !s.message.isCopied}><Copy size={18} /></AuiIf></IconButton></ActionBarPrimitive.Copy>
        <ActionBarPrimitive.FeedbackPositive asChild><IconButton label="Buona risposta"><ThumbsUp size={18} /></IconButton></ActionBarPrimitive.FeedbackPositive>
        <ActionBarPrimitive.FeedbackNegative asChild><IconButton label="Risposta non utile"><ThumbsDown size={18} /></IconButton></ActionBarPrimitive.FeedbackNegative>
        <ActionBarPrimitive.Speak asChild><IconButton label="Leggi ad alta voce"><Volume2 size={18} /></IconButton></ActionBarPrimitive.Speak>
        <IconButton label="Condividi"><Share2 size={18} /></IconButton>
        <ActionBarPrimitive.Reload asChild><IconButton label="Rigenera"><RefreshCw size={18} /></IconButton></ActionBarPrimitive.Reload>
      </ActionBarPrimitive.Root><BranchPicker />
    </div>
  </MessagePrimitive.Root>
);

const EmptyState: FC = () => (
  <div className="clone-empty"><div className="clone-empty-inner"><h1>Where should we begin?</h1><Composer placeholder="Ask anything" /></div></div>
);

const Thread: FC = () => (
  <ThreadPrimitive.Root className="clone-thread">
    <AuiIf condition={(s) => s.thread.isEmpty}><EmptyState /></AuiIf>
    <AuiIf condition={(s) => !s.thread.isEmpty}>
      <ThreadPrimitive.Viewport className="clone-viewport">
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        <ThreadPrimitive.ViewportFooter className="clone-footer">
          <ThreadPrimitive.ScrollToBottom asChild><IconButton label="Vai in fondo" className="clone-scroll"><ArrowDown size={20} /></IconButton></ThreadPrimitive.ScrollToBottom>
          <Composer placeholder="Ask anything" />
          <p>ChatGPT can make mistakes. Check important info.</p>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </AuiIf>
  </ThreadPrimitive.Root>
);

const ChatGPTClone: FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  return <div className="clone-shell">
      <Sidebar open={sidebarOpen} collapsed={collapsed} onClose={() => setSidebarOpen(false)} onToggle={() => setCollapsed((value) => !value)} />
      <main className="clone-main">
        <IconButton label="Open chat history" className="clone-menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></IconButton>
        <Thread />
      </main>
  </div>;
};

function Runtime() {
  const model = useMemo(() => mockChatModel, []);
  const runtime = useRemoteThreadListRuntime({ adapter: threadAdapter, runtimeHook: () => useLocalRuntime(model, { adapters: { attachments, dictation: new WebSpeechDictationAdapter() } }) });
  return <AssistantRuntimeProvider runtime={runtime}><ChatGPTClone /></AssistantRuntimeProvider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Runtime /></StrictMode>);
