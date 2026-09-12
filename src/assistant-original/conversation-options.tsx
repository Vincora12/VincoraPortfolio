import { useAui, useAuiState } from '@assistant-ui/react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import type { ProjectRef } from './ProjectPill';
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
  const [draft, setDraft] = useState<{ id: string; model: string; effort: string; projectId: string | null; projectTitle: string }>({ id: '', model: 'auto', effort: '', projectId: null, projectTitle: '' });
  const [pendingPrompt, setPendingPrompt] = useState<{ id: string; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(location.hash === '#reminders');
  const token = useApp((s) => s.token);
  const scopeLocked = useAuiState((s) => s.thread.messages.some((message) => message.role === 'user'));
  const value = draft.id === id ? draft : { id, model: typeof custom?.model === 'string' ? custom.model : 'auto', effort: typeof custom?.effort === 'string' ? custom.effort : '', projectId: typeof custom?.projectId === 'string' ? custom.projectId : null, projectTitle: typeof custom?.projectTitle === 'string' ? custom.projectTitle : '' };
  /* 🔴 «La scelta non torna rispetto alle AI che vengono usate.» LAB → SYSTEM →
     AI → VOCE scrive in `stepModels.voice`, e la chat quotidiana non lo ha mai
     letto: `value.model` restava sempre "auto", e "auto" diventava
     `modelName: undefined` — che il server risolve col SUO predefinito
     (`ROUTING['character-voice']`), un terzo modello ancora diverso da quello
     che LAB mostrava come «attivo». Tre tabelle, tre risposte alla stessa
     domanda, e cambiare la scelta in LAB non toccava la chat di nessuno.

     🔒 "AUTO" RESTA IL SENTINEL PERSISTITO, SOLO LA RISOLUZIONE CAMBIA. Non
     scrivo il modello concreto su `custom.model` — resterebbe congelato alla
     preferenza di oggi anche il giorno che la cambi in LAB. "auto" continua a
     voler dire «segui la preferenza corrente», e quella preferenza si legge
     qui, al momento della richiesta, non prima. */
  const globalVoiceModel = useApp((s) => s.stepModels.voice) ?? undefined;
  useEffect(() => {
    const check = () => { if (location.hash === '#reminders') setRemindersOpen(true); };
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);
  useEffect(() => aui.modelContext.register({ getModelContext: () => ({ config: {
    modelName: value.model === 'auto' ? globalVoiceModel : value.model,
    /* 🔷 «Voglio poter forzare anche l'impegno (piccolo/medio/alto).»
       Stesso canale del modello: `''` = nessuna preferenza, il server usa il
       predefinito di quello step. Vedi `ModelEffortPill`, l'unico posto che
       scrive questo valore. */
    ...(value.effort ? { reasoningEffort: value.effort } : {}),
  } }) }), [aui, value.model, value.effort, globalVoiceModel]);
  useEffect(() => {
    aui.thread.composer().setRunConfig({ custom: { projectId: value.projectId } });
    if (draft.id === id && remoteId && (custom?.model !== value.model || custom?.effort !== value.effort || (custom?.projectId ?? null) !== value.projectId)) {
      void aui.threads.item('main').updateCustom({ ...custom, model: value.model, effort: value.effort, projectId: value.projectId, projectTitle: value.projectTitle });
    }
  }, [aui, id, draft.id, remoteId, value.model, value.effort, value.projectId, value.projectTitle, custom]);
  const inheritScope = (threadId: string) => {
    setDraft({ id: threadId, model: 'auto', effort: '', projectId: value.projectId, projectTitle: value.projectTitle });
  };
  /* 🔷 «Una chat diversa attiva per ogni progetto, almeno.» Non ritagga il filo
     corrente: cambia thread, verso quello già esistente per quel progetto o,
     la prima volta, aprendone uno nuovo — la stessa continuità di prima,
     moltiplicata per progetto invece che unica su tutto. `ref: null` è
     «Generale», la stessa cosa che `GLOBAL_PROJECT_ID` intende sotto. */
  const switchToProjectThread = async (ref: ProjectRef | null) => {
    const projectId = ref ? ref.id : null;
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
      effort: typeof target?.custom?.effort === 'string' ? target.custom.effort : '',
      projectId, projectTitle: projectId ? (ref?.title ?? '') : '' });
  };
  const selectWorkspaceProject = (project: Project) =>
    switchToProjectThread(project.id === GLOBAL_PROJECT_ID ? null : { id: project.id, title: project.title });
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
    setDraft({ id: newId, model: 'auto', effort: '', projectId: project?.id === GLOBAL_PROJECT_ID ? null : project?.id ?? null, projectTitle: project?.id === GLOBAL_PROJECT_ID ? '' : project?.title ?? '' });
    setPendingPrompt({ id: newId, text: intent === 'artifact'
      ? 'Aiutami a creare un artefatto in questo progetto. Chiedimi cosa voglio ottenere, poi lavoriamo insieme e salva il risultato come artefatto con il suo link. Vorrei creare: '
      : 'Aiutami a creare un promemoria. Chiedimi cosa ricordare e quando, poi riepiloga e chiedimi conferma prima di attivarlo. Vorrei: ' });
    setRemindersOpen(false);
  };
  const controls = <WorkspacePanel token={token} projectId={value.projectId} onSelectProject={selectWorkspaceProject} onBeginChat={beginWorkspaceChat} model={value.model} onModel={model => setDraft({ ...value, model })} />;
  /* 🔷 «Una pillola per forzare modello + impegno, al posto dei topic in
     alto.» Stesso stato di `controls` sopra (il picker dentro Progetti):
     un'unica fonte di verità, letta/scritta da due punti diversi
     dell'interfaccia invece di due tabelle che possono disallinearsi. */
  const modelChoice = { model: value.model, effort: value.effort,
    setModel: (model: string) => setDraft({ ...value, model }),
    setEffort: (effort: string) => setDraft({ ...value, effort }) };
  const workspace = remindersOpen ? <div className="vinz-project-overlay" role="dialog" aria-modal="true" aria-label="Promemoria">
    <ReminderPanel token={token} onClose={() => { setRemindersOpen(false); if (location.hash === '#reminders') history.replaceState(null, '', location.pathname); }} />
  </div> : open ? <div className="vinz-project-overlay" role="dialog" aria-modal="true" aria-label="Projects">
    <ProjectWorkspace token={token} onClose={() => setOpen(false)} onSelectProject={scopeLocked ? undefined : (project) => { setDraft({ ...value, projectId: project.id, projectTitle: project.title }); setOpen(false); }} />
  </div> : null;
  /* 🔒 Riferimento stabile, non un oggetto nuovo a ogni render. `ChatSurface`
     lo manda a `TabBar` con un evento appeso a `useEffect(..., [scope])`: un
     oggetto letterale qui dentro cambia riferimento a OGNI render di questo
     hook (che è spesso, segue lo streaming della risposta) e quell'effetto
     sparava un evento — e un giro di `setState` a cascata su un componente
     sibling — decine di volte al secondo. Risultato: pagina che sembrava
     ignorare i tocchi, non un bottone rotto. */
  const scope = useMemo(() => ({ projectId: value.projectId, projectTitle: value.projectTitle }), [value.projectId, value.projectTitle]);
  return { controls, workspace, scope, inheritScope, selectProject: switchToProjectThread, modelChoice };
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
