import { useAui, useAuiState } from '@assistant-ui/react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useShallow } from 'zustand/shallow';
import { ArrowLeftIcon, ArrowRightIcon, BotIcon, CalendarDaysIcon, FileTextIcon, FolderIcon, PackageIcon, XIcon } from 'lucide-react';
import { ReminderPanel } from '../projects/ReminderPanel';
import { ProjectWorkspace } from '../projects/ProjectWorkspace';
import { artifactHref } from '../engine/projects';
import type { Project, ProjectSummary } from '../engine/projects';
import { listProjects, loadProject } from '../projects/client';
import { useApp, syncWithServer, resolveStateSyncConflict } from '../state/store';
import { getStateSyncStatus, subscribeStateSync } from '../system/stateSync';
import { MODELS } from './models';
import { requestManualRoomEntry } from './chat-room-presence';
import { ThreadListNew } from './components/assistant-ui/thread-list';
import { retryStorageSync, storageSyncFailures, subscribeStorageSync } from '../system/serverStorage';
import './conversation-options.css';

function ProjectChatSidebar({
  token,
  value,
  scopeLocked,
  onProject,
  onAutomations,
  onModel,
  openWorkspace,
}: {
  token: string | null;
  value: { model: string; projectId: string | null; projectTitle: string };
  scopeLocked: boolean;
  onProject: (project: ProjectSummary | null) => void;
  onAutomations: () => void;
  onModel: (model: string) => void;
  openWorkspace: () => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<'home' | 'projects' | 'materials'>('home');
  useEffect(() => {
    let live = true;
    void listProjects(token).then((items) => { if (live) setProjects(items); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Progetti non disponibili.'); });
    return () => { live = false; };
  }, [token]);
  useEffect(() => {
    let live = true;
    if (!value.projectId) { setProject(null); return () => { live = false; }; }
    void loadProject(token, value.projectId).then((item) => { if (live) setProject(item); }).catch(() => { if (live) setProject(null); });
    return () => { live = false; };
  }, [token, value.projectId]);
  const back = (label: string) => <button type="button" className="vinz-project-sidebar__back" onClick={() => setPage('home')}><ArrowLeftIcon aria-hidden="true" />{label}</button>;
  const selectProject = (next: ProjectSummary | null) => {
    onProject(next);
    setPage('home');
  };
  const row = (icon: ReactNode, label: string, detail: string, action: () => void) => <button type="button" className="vinz-project-sidebar__destination" onClick={action}><span className="vinz-project-sidebar__destination-icon">{icon}</span><span><b>{label}</b><small>{detail}</small></span><ArrowRightIcon aria-hidden="true" /></button>;

  return <section className="vinz-project-sidebar" aria-label="Spazio di lavoro del progetto">
    {page === 'home' && <>
      <div className="vinz-project-sidebar__active">
        <span className="vinz-project-sidebar__label"><i aria-hidden="true" />PROGETTO ATTIVO</span>
        <strong>{value.projectTitle || 'GLOBAL'}</strong>
        {scopeLocked && <small>CONTESTO BLOCCATO DA QUESTA CHAT</small>}
      </div>
      <div className="vinz-project-sidebar__destinations">
        {row(<FolderIcon aria-hidden="true" />, 'PROGETTO', 'CAMBIA O GESTISCI', () => setPage('projects'))}
        {row(<FileTextIcon aria-hidden="true" />, 'FILE E FONTI', project?.context ? 'FONTI SALVATE NEL CONTESTO' : 'NESSUN FILE CARICATO', () => setPage('materials'))}
        {row(<PackageIcon aria-hidden="true" />, 'ARTEFATTI', `${project?.artifacts.length ?? 0} CREATI`, () => setPage('materials'))}
        {row(<CalendarDaysIcon aria-hidden="true" />, 'AUTOMAZIONI', 'PROMEMORIA E CALENDARIO', onAutomations)}
      </div>
      <details className="vinz-project-sidebar__controls">
        <summary>ALTRE IMPOSTAZIONI</summary>
        <div className="vinz-project-sidebar__controls-body">
          <button type="button" className="vinz-project-sidebar__outline" onClick={openWorkspace}>GESTISCI PROGETTI E FILE</button>
          <label className="vinz-project-sidebar__model"><span className="vinz-project-sidebar__label"><BotIcon aria-hidden="true" />MODELLO</span><select value={value.model} onChange={(event) => onModel(event.target.value)}><option value="auto">AUTO · routing VINZ.MON</option>{MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
        </div>
      </details>
    </>}
    {page === 'projects' && <>
      {back('SPAZIO DI LAVORO')}
      <div className="vinz-project-sidebar__page-title"><h3>PROGETTI</h3><p>Scegli il contesto della prossima chat.</p></div>
      <div className="vinz-project-sidebar__project-list">
        <button type="button" className={`vinz-project-sidebar__destination ${value.projectId === null ? 'is-selected' : ''}`} disabled={scopeLocked} onClick={() => selectProject(null)}><span className="vinz-project-sidebar__destination-icon"><FolderIcon aria-hidden="true" /></span><span><b>GLOBAL</b><small>SPAZIO PERSONALE</small></span><ArrowRightIcon aria-hidden="true" /></button>
        {error ? <span className="vinz-project-sidebar__empty">{error}</span> : projects.length ? projects.map((item) => <button type="button" className={`vinz-project-sidebar__destination ${item.id === value.projectId ? 'is-selected' : ''}`} key={item.id} disabled={scopeLocked} onClick={() => selectProject(item)}><span className="vinz-project-sidebar__destination-icon"><PackageIcon aria-hidden="true" /></span><span><b>{item.title}</b><small>{item.artifactCount} ARTEFATTI</small></span><ArrowRightIcon aria-hidden="true" /></button>) : <span className="vinz-project-sidebar__empty">Nessun progetto salvato.</span>}
      </div>
      <button type="button" className="vinz-project-sidebar__outline vinz-project-sidebar__new-project" onClick={openWorkspace}>+ NUOVO PROGETTO</button>
    </>}
    {page === 'materials' && <>
      {back('SPAZIO DI LAVORO')}
      <div className="vinz-project-sidebar__page-title"><h3>{value.projectTitle || 'GLOBAL'}</h3><p>File, fonti e artefatti del progetto.</p></div>
      <div className="vinz-project-sidebar__section">
        <span className="vinz-project-sidebar__label">FILE E FONTI</span>
        <button type="button" className="vinz-project-sidebar__destination" onClick={openWorkspace} data-open-workspace><span className="vinz-project-sidebar__destination-icon"><FileTextIcon aria-hidden="true" /></span><span><b>CONTESTO DEL PROGETTO</b><small>{project?.context ? 'APRI LE FONTI SALVATE' : 'NESSUN FILE CARICATO'}</small></span><ArrowRightIcon aria-hidden="true" /></button>
      </div>
      <div className="vinz-project-sidebar__section">
        <span className="vinz-project-sidebar__label">ARTEFATTI</span>
        {project?.artifacts.length ? project.artifacts.map((artifact) => <a className="vinz-project-sidebar__destination" key={artifact.slug} href={artifactHref(project.id, artifact.slug)}><span className="vinz-project-sidebar__destination-icon"><PackageIcon aria-hidden="true" /></span><span><b>{artifact.title}</b><small>ARTEFATTO · V{artifact.revision}</small></span><ArrowRightIcon aria-hidden="true" /></a>) : <span className="vinz-project-sidebar__empty">Nessun artefatto creato.</span>}
      </div>
      <button type="button" className="vinz-project-sidebar__outline vinz-project-sidebar__new-project" onClick={openWorkspace} data-open-workspace>GESTISCI FILE E ARTEFATTI</button>
    </>}
  </section>;
}

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
    {visible.map((item) => <div key={item.id} className={`vinz-conversation-tab ${current === item.id ? 'is-active' : ''}`} aria-current={current === item.id ? 'page' : undefined}>
      <button type="button" className="vinz-conversation-tab__select" title={item.title || 'Chat'} onClick={() => { if (current !== item.id) { requestManualRoomEntry(item.id); void aui.threads.switchToThread(item.id); } }}>
        <span className="vinz-conversation-tab__label">{item.title || 'Chat'}</span>
      </button>
      {current === item.id && <button type="button" className="vinz-conversation-tab__close" aria-label={`Chiudi ${item.title || 'chat'}`} onClick={() => closeActiveTab(item.id)}><XIcon aria-hidden="true" /></button>}
    </div>)}
    <ThreadListNew className="vinz-conversation-new" labelClassName="sr-only" onCreated={onNewThread} />
  </nav>;
}

/** Per-thread options, not another identity/store. Persist only on regular threads. */
export function useConversationOptions() {
  const aui = useAui();
  const { id, remoteId, custom } = useAuiState(useShallow((s) => ({ id: s.threads.mainThreadId, remoteId: s.threadListItem.remoteId, custom: s.threadListItem.custom })));
  const [draft, setDraft] = useState<{ id: string; model: string; projectId: string | null; projectTitle: string }>({ id: '', model: 'auto', projectId: null, projectTitle: '' });
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
  const controls = <ProjectChatSidebar token={token} value={value} scopeLocked={scopeLocked} onProject={(project) => { setDraft({ ...value, projectId: project?.id ?? null, projectTitle: project?.title ?? '' }); }} onAutomations={() => setRemindersOpen(true)} onModel={(model) => setDraft({ ...value, model })} openWorkspace={() => setOpen(true)} />;
  const workspace = remindersOpen ? <div className="vinz-project-overlay" role="dialog" aria-modal="true" aria-label="Promemoria">
    <ReminderPanel token={token} onClose={() => { setRemindersOpen(false); if (location.hash === '#reminders') history.replaceState(null, '', location.pathname); }} />
  </div> : open ? <div className="vinz-project-overlay" role="dialog" aria-modal="true" aria-label="Projects">
    <ProjectWorkspace token={token} onClose={() => setOpen(false)} onSelectProject={scopeLocked ? undefined : (project) => { setDraft({ ...value, projectId: project.id, projectTitle: project.title }); setOpen(false); }} />
  </div> : null;
  return { controls, workspace, scope: { projectId: value.projectId, projectTitle: value.projectTitle }, inheritScope };
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
