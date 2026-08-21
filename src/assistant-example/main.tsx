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
import { createChatModel } from '../brain/Brain';
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
        {!collapsed && <strong>Chat</strong>}
        <IconButton label="Chiudi" className="clone-mobile-close" onClick={onClose}><X size={19} /></IconButton>
      </div>
      <ThreadListPrimitive.Root className="clone-thread-list">
        <ThreadListPrimitive.New className="clone-new-thread" onClick={onClose}><Pencil size={18} /><span>Nuova chat</span></ThreadListPrimitive.New>
        {!collapsed && <div className="clone-history-label">Le tue chat</div>}
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
  <div className="clone-empty"><div className="clone-empty-inner"><h1>Da dove iniziamo?</h1><Composer placeholder="Chiedi qualsiasi cosa" /></div></div>
);

const Thread: FC = () => (
  <ThreadPrimitive.Root className="clone-thread">
    <AuiIf condition={(s) => s.thread.isEmpty}><EmptyState /></AuiIf>
    <AuiIf condition={(s) => !s.thread.isEmpty}>
      <ThreadPrimitive.Viewport className="clone-viewport">
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        <ThreadPrimitive.ViewportFooter className="clone-footer">
          <ThreadPrimitive.ScrollToBottom asChild><IconButton label="Vai in fondo" className="clone-scroll"><ArrowDown size={20} /></IconButton></ThreadPrimitive.ScrollToBottom>
          <Composer placeholder="Chiedi qualsiasi cosa" />
          <p>VINZ.MON può commettere errori. Verifica le informazioni importanti.</p>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </AuiIf>
  </ThreadPrimitive.Root>
);

const ChatGPTClone: FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [model, setModel] = useState('gpt-5.6-sol');
  return <div className="clone-shell">
    <Sidebar open={sidebarOpen} collapsed={collapsed} onClose={() => setSidebarOpen(false)} onToggle={() => setCollapsed((value) => !value)} />
    <main className="clone-main">
      <header className="clone-header">
        <IconButton label="Apri cronologia" className="clone-menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></IconButton>
        <select value={model} onChange={(event) => setModel(event.target.value)} aria-label="Modello AI">
          <option value="gpt-5.6-sol">5.6 Sol</option><option value="gpt-5.6-terra">5.6 Terra</option><option value="claude-sonnet">Claude Sonnet</option><option value="gemini-pro">Gemini Pro</option>
        </select>
        <ThreadListPrimitive.New asChild><IconButton label="Nuova chat"><Pencil size={20} /></IconButton></ThreadListPrimitive.New>
      </header>
      <Thread />
    </main>
  </div>;
};

function Runtime() {
  const model = useMemo(() => createChatModel(), []);
  const runtime = useRemoteThreadListRuntime({ adapter: threadAdapter, runtimeHook: () => useLocalRuntime(model, { adapters: { attachments, dictation: new WebSpeechDictationAdapter() } }) });
  return <AssistantRuntimeProvider runtime={runtime}><ChatGPTClone /></AssistantRuntimeProvider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Runtime /></StrictMode>);
