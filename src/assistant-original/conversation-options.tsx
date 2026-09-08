import { useAui, useAuiState } from '@assistant-ui/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/shallow';
import { XIcon } from 'lucide-react';
import { ReminderPanel } from '../projects/ReminderPanel';
import { ProjectWorkspace } from '../projects/ProjectWorkspace';
import type { Project } from '../engine/projects';
import { GLOBAL_PROJECT_ID } from '../engine/projects';
import { WorkspacePanel, type WorkspaceIntent } from '../projects/WorkspacePanel';
import { discardLocalSession } from './conversation-lifecycle-adapter';
import { useApp, syncWithServer, resolveStateSyncConflict } from '../state/store';
import { getStateSyncStatus, subscribeStateSync } from '../system/stateSync';
import { requestManualRoomEntry } from './chat-room-presence';
import { ThreadListNew } from './components/assistant-ui/thread-list';
import { retryStorageSync, storageSyncFailures, subscribeStorageSync } from '../system/serverStorage';
import './conversation-options.css';

type ConversationScope = { projectId: string | null; projectTitle: string };

export function ConversationTabs({ scope, onNewThread }: { scope: ConversationScope; onNewThread: (threadId: string) => void }) {
  const aui = useAui();
  const tabsRef = useRef<HTMLElement>(null);
  const { items, current } = useAuiState(useShallow((s) => ({ items: s.threads.threadItems, current: s.threads.mainThreadId })));
  const regular = items.filter((item) => item.status === 'regular' && (item.id === current || (typeof item.custom?.projectId === 'string' ? item.custom.projectId : null) === scope.projectId));
  const visible = regular.slice(0, 5);
  const active = regular.find((item) => item.id === current);
  if (active && !visible.includes(active)) visible.push(active);
  useEffect(() => {
    const tabs = tabsRef.current;
    const selected = tabs?.querySelector<HTMLElement>("button[aria-current='page']");
    if (!tabs || !selected) return;
    const left = selected.offsetLeft;
    const right = left + selected.offsetWidth;
    if (left < tabs.scrollLeft) tabs.scrollTo({ left, behavior: 'smooth' });
    else if (right > tabs.scrollLeft + tabs.clientWidth) tabs.scrollTo({ left: right - tabs.clientWidth, behavior: 'smooth' });
  }, [current]);
  const closeActiveTab = (threadId: string) => {
    const next = regular.find((item) => item.id !== threadId);
    if (next) {
      requestManualRoomEntry(next.id);
      void aui.threads.switchToThread(next.id);
    }
    void aui.threads.item({ id: threadId }).archive();
  };
  return <nav ref={tabsRef} className="vinz-conversation-tabs me-health__tabs" aria-label="Conversazioni">
    {!active && <button type="button" aria-current="page">NUOVA CHAT</button>}
    {visible.map((item) => <button type="button" key={item.id} aria-current={current === item.id ? 'page' : undefined}
      title={item.title || 'Chat'} onClick={(event) => {
        if (current === item.id && event.target instanceof Element && event.target.closest('.vinz-conversation-tab__close')) { closeActiveTab(item.id); return; }
        if (current !== item.id) { requestManualRoomEntry(item.id); void aui.threads.switchToThread(item.id); }
      }}>
      <span className="vinz-conversation-tab__label">{item.title || 'Chat'}</span>
      {current === item.id && <span className="vinz-conversation-tab__close" aria-hidden="true"><XIcon /></span>}
    </button>)}
    <ThreadListNew className="vinz-conversation-new" labelClassName="sr-only" onCreated={onNewThread} />
  </nav>;
}

/** Per-thread options, not another identity/store. Persist only on regular threads. */
export function useConversationOptions() {
  const aui = useAui();
  const { id, remoteId, custom } = useAuiState(useShallow((s) => ({ id: s.threads.mainThreadId, remoteId: s.threadListItem.remoteId, custom: s.threadListItem.custom })));
  const [draft, setDraft] = useState<{ id: string; model: string; projectId: string | null; projectTitle: string }>({ id: '', model: 'auto', projectId: null, projectTitle: '' });
  const [pendingPrompt, setPendingPrompt] = useState<{ id: string; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(location.hash === '#reminders');
  const token = useApp((s) => s.token);
  const scopeLocked = useAuiState((s) => s.thread.messages.some((message) => message.role === 'user'));
  const value = draft.id === id ? draft : { id, model: typeof custom?.model === 'string' ? custom.model : 'auto', projectId: typeof custom?.projectId === 'string' ? custom.projectId : null, projectTitle: typeof custom?.projectTitle === 'string' ? custom.projectTitle : '' };
  useEffect(() => {
    const check = () => { if (location.hash === '#reminders') setRemindersOpen(true); };
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);
  useEffect(() => aui.modelContext.register({ getModelContext: () => ({ config: { modelName: value.model === 'auto' ? undefined : value.model } }) }), [aui, value.model]);
  useEffect(() => {
    aui.thread.composer().setRunConfig({ custom: { projectId: value.projectId } });
    if (draft.id === id && remoteId && (custom?.model !== value.model || (custom?.projectId ?? null) !== value.projectId)) {
      void aui.threads.item('main').updateCustom({ ...custom, model: value.model, projectId: value.projectId, projectTitle: value.projectTitle });
    }
  }, [aui, id, draft.id, remoteId, value.model, value.projectId, value.projectTitle, custom]);
  const inheritScope = (threadId: string) => {
    setDraft({ id: threadId, model: 'auto', projectId: value.projectId, projectTitle: value.projectTitle });
  };
  /* 🔷 «La chat non si cancella, ma da quel momento sa che stiamo parlando di
     quel progetto.» `selectWorkspaceProject`, sotto, esiste da prima e fa
     l'opposto apposta: cambia thread, perché nasce per il vecchio modello «una
     conversazione per progetto». Qui il filo resta lo stesso — stesso `id` nel
     draft — solo il progetto che gli è cucito sopra cambia. Passa dallo stesso
     `draft`/effetto di sopra (riga 76), quindi si persiste sul thread e
     sopravvive a un riavvio esattamente come il resto dello scope. */
  const setProjectScope = (project: { id: string; title: string } | null) => {
    const projectId = project && project.id !== GLOBAL_PROJECT_ID ? project.id : null;
    setDraft({ id, model: value.model, projectId, projectTitle: projectId ? project!.title : '' });
  };
  const selectWorkspaceProject = async (project: Project) => {
    const projectId = project.id === GLOBAL_PROJECT_ID ? null : project.id;
    if (projectId === value.projectId) return;
    // Navigate to the group's conversation; never reassign the current chat.
    const target = aui.threads.getState().threadItems.find(item => item.status === 'regular'
      && (typeof item.custom?.projectId === 'string' ? item.custom.projectId : null) === projectId);
    discardLocalSession(aui.threads.item('main').getState().id);
    setPendingPrompt(null);
    if (target) {
      requestManualRoomEntry(target.id);
      await aui.threads.switchToThread(target.id);
    } else {
      await aui.threads.switchToNewThread();
      discardLocalSession(aui.threads.item('main').getState().id);
      aui.thread.reset();
    }
    setDraft({ id: aui.threads.item('main').getState().id,
      model: typeof target?.custom?.model === 'string' ? target.custom.model : 'auto',
      projectId, projectTitle: projectId ? project.title : '' });
  };
  useEffect(() => {
    if (pendingPrompt?.id !== id || draft.id !== id) return;
    aui.thread.composer().setText(pendingPrompt.text);
    setPendingPrompt(null);
    window.dispatchEvent(new Event('vinz-workspace-close'));
  }, [pendingPrompt, id, draft.id, aui]);
  const beginWorkspaceChat = async (project: Project | null, intent: WorkspaceIntent) => {
    // The initial greeting can hold initialize() until the first user message.
    // Release that local-only session before asking the runtime to switch.
    discardLocalSession(aui.threads.item('main').getState().id);
    await aui.threads.switchToNewThread();
    const newId = aui.threads.item('main').getState().id;
    discardLocalSession(newId);
    aui.thread.reset();
    setDraft({ id: newId, model: 'auto', projectId: project?.id === GLOBAL_PROJECT_ID ? null : project?.id ?? null, projectTitle: project?.id === GLOBAL_PROJECT_ID ? '' : project?.title ?? '' });
    setPendingPrompt({ id: newId, text: intent === 'artifact'
      ? 'Aiutami a creare un artefatto in questo progetto. Chiedimi cosa voglio ottenere, poi lavoriamo insieme e salva il risultato come artefatto con il suo link. Vorrei creare: '
      : 'Aiutami a creare un promemoria. Chiedimi cosa ricordare e quando, poi riepiloga e chiedimi conferma prima di attivarlo. Vorrei: ' });
    setRemindersOpen(false);
  };
  const controls = <WorkspacePanel token={token} projectId={value.projectId} onSelectProject={selectWorkspaceProject} onBeginChat={beginWorkspaceChat} model={value.model} onModel={model => setDraft({ ...value, model })} />;
  const workspace = remindersOpen ? <div className="vinz-project-overlay" role="dialog" aria-modal="true" aria-label="Promemoria">
    <ReminderPanel token={token} onClose={() => { setRemindersOpen(false); if (location.hash === '#reminders') history.replaceState(null, '', location.pathname); }} />
  </div> : open ? <div className="vinz-project-overlay" role="dialog" aria-modal="true" aria-label="Projects">
    <ProjectWorkspace token={token} onClose={() => setOpen(false)} onSelectProject={scopeLocked ? undefined : (project) => { setDraft({ ...value, projectId: project.id, projectTitle: project.title }); setOpen(false); }} />
  </div> : null;
  return { controls, workspace, scope: { projectId: value.projectId, projectTitle: value.projectTitle }, inheritScope, setProjectScope };
}

export function ChatStorageStatus() {
  const failures = useSyncExternalStore(subscribeStorageSync, storageSyncFailures, () => 0);
  const sync = useSyncExternalStore(subscribeStateSync, getStateSyncStatus, getStateSyncStatus);
  return <>
    {failures > 0 && <div role="status" className="vinz-chat-storage-status">Sincronizzazione chat non completata. Non cancellare i dati del browser. <button onClick={() => void retryStorageSync()}>Riprova</button></div>}
    {sync.status === 'conflict' ? <div role="alert" className="vinz-chat-storage-status">Lo stato locale e quello server differiscono. Nessuna copia è stata sovrascritta.
      <button onClick={() => { if (confirm('Conservare lo stato di questo dispositivo al posto di quello server? Le modifiche dell’altra copia non saranno unite.')) void resolveStateSyncConflict('keep-local'); }}>Conserva questo dispositivo</button>
      <button onClick={() => { if (confirm('Caricare lo stato server? Le modifiche locali non sincronizzate verranno sostituite.')) void resolveStateSyncConflict('use-server'); }}>Usa copia server</button>
    </div> : (sync.status === 'error' || sync.status === 'pending') && <div role="status" className="vinz-chat-storage-status">Stato non sincronizzato. <button onClick={() => void syncWithServer()}>Riprova</button></div>}
  </>;
}
