import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
  WebSpeechDictationAdapter,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from '@assistant-ui/react';
import { createLocalStorageAdapter, createSimpleTitleAdapter } from '@assistant-ui/core/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { Icon } from '../system/Icon';
import { createChatModel } from '../brain/Brain';
import '@fontsource-variable/inter';
import './style.css';

const storage = {
  getItem: async (key: string) => localStorage.getItem(key),
  setItem: async (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: async (key: string) => localStorage.removeItem(key),
};

const threadAdapter = createLocalStorageAdapter({ storage, prefix: 'assistant-example:', titleGenerator: createSimpleTitleAdapter() });
const attachments = new CompositeAttachmentAdapter([new SimpleImageAttachmentAdapter(), new SimpleTextAttachmentAdapter()]);

function Attachment() {
  return <AttachmentPrimitive.Root className="demo-attachment"><AttachmentPrimitive.Name /><AttachmentPrimitive.Remove aria-label="Rimuovi allegato">×</AttachmentPrimitive.Remove></AttachmentPrimitive.Root>;
}

function UserMessage() {
  return <MessagePrimitive.Root className="demo-message demo-message--user"><MessagePrimitive.Attachments components={{ Attachment }} /><div className="demo-bubble"><MessagePrimitive.Parts /></div></MessagePrimitive.Root>;
}

function AssistantMessage() {
  return <MessagePrimitive.Root className="demo-message"><div className="demo-markdown"><MessagePrimitive.Parts components={{ Text: () => <MarkdownTextPrimitive defer /> }} /></div><ActionBarPrimitive.Root className="demo-actions" hideWhenRunning><ActionBarPrimitive.Copy>Copia</ActionBarPrimitive.Copy><ActionBarPrimitive.Reload>Riprova</ActionBarPrimitive.Reload></ActionBarPrimitive.Root></MessagePrimitive.Root>;
}

function ThreadItem() {
  return <ThreadListItemPrimitive.Root className="demo-thread-item"><ThreadListItemPrimitive.Trigger><Icon name="tell" size={16} /><span><ThreadListItemPrimitive.Title fallback="Nuova chat" /></span></ThreadListItemPrimitive.Trigger><ThreadListItemPrimitive.Delete aria-label="Elimina chat"><Icon name="close" size={14} /></ThreadListItemPrimitive.Delete></ThreadListItemPrimitive.Root>;
}

function Sidebar({ open, close }: { open: boolean; close: () => void }) {
  return <aside className={`demo-sidebar ${open ? 'is-open' : ''}`}><header><strong>assistant-ui</strong><button type="button" onClick={close} aria-label="Chiudi"><Icon name="close" size={18} /></button></header><ThreadListPrimitive.Root className="demo-thread-list"><ThreadListPrimitive.New onClick={close}><Icon name="edit" size={17} />Nuova chat</ThreadListPrimitive.New><ThreadListPrimitive.Items components={{ ThreadListItem: ThreadItem }} /></ThreadListPrimitive.Root></aside>;
}

function Composer() {
  return <ComposerPrimitive.Root className="demo-composer"><ComposerPrimitive.Attachments components={{ Attachment }} /><div className="demo-composer-row"><ComposerPrimitive.AddAttachment aria-label="Allega file"><Icon name="plus" /></ComposerPrimitive.AddAttachment><ComposerPrimitive.Input placeholder="Invia un messaggio" aria-label="Messaggio" submitOnEnter /><ComposerPrimitive.Dictate aria-label="Avvia dettatura"><Icon name="microphone" /></ComposerPrimitive.Dictate><ComposerPrimitive.StopDictation aria-label="Ferma dettatura"><Icon name="close" /></ComposerPrimitive.StopDictation><ComposerPrimitive.Send aria-label="Invia"><Icon name="upload" /></ComposerPrimitive.Send><ComposerPrimitive.Cancel aria-label="Interrompi"><Icon name="close" /></ComposerPrimitive.Cancel></div><ComposerPrimitive.DictationTranscript className="demo-transcript" /></ComposerPrimitive.Root>;
}

function Chat() {
  const [sidebar, setSidebar] = useState(false);
  const [model, setModel] = useState('gpt-5.6-sol');
  return <div className="demo-shell"><Sidebar open={sidebar} close={() => setSidebar(false)} />{sidebar && <button className="demo-backdrop" onClick={() => setSidebar(false)} aria-label="Chiudi menu" />}<main className="demo-main"><header className="demo-header"><button type="button" onClick={() => setSidebar(true)} aria-label="Apri chat"><Icon name="folder" /></button><select value={model} onChange={(event) => setModel(event.target.value)} aria-label="Modello AI"><option value="gpt-5.6-sol">GPT-5.6 Sol</option><option value="gpt-5.6-terra">GPT-5.6 Terra</option><option value="claude-sonnet">Claude Sonnet</option><option value="gemini-pro">Gemini Pro</option></select><button type="button" aria-label="Nuova chat"><Icon name="edit" /></button></header><ThreadPrimitive.Root className="demo-thread"><ThreadPrimitive.Viewport className="demo-viewport"><ThreadPrimitive.Empty><div className="demo-welcome"><h1>Come posso aiutarti?</h1><p>Questa è la struttura completa del template assistant-ui, senza VINZ.MON.</p></div></ThreadPrimitive.Empty><ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} /><ThreadPrimitive.ViewportFooter className="demo-footer"><Composer /><p>assistant-ui può commettere errori. Verifica le informazioni importanti.</p></ThreadPrimitive.ViewportFooter></ThreadPrimitive.Viewport></ThreadPrimitive.Root></main></div>;
}

function Runtime() {
  const model = useMemo(() => createChatModel(), []);
  const runtime = useRemoteThreadListRuntime({ adapter: threadAdapter, runtimeHook: () => useLocalRuntime(model, { adapters: { attachments, dictation: new WebSpeechDictationAdapter() } }) });
  return <AssistantRuntimeProvider runtime={runtime}><Chat /></AssistantRuntimeProvider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Runtime /></StrictMode>);
