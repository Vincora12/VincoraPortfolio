import { useAui, useAuiState } from '@assistant-ui/react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/shallow';
import { ProjectWorkspace } from '../projects/ProjectWorkspace';
import { ReminderPanel } from '../projects/ReminderPanel';
import { useApp, syncWithServer, resolveStateSyncConflict } from '../state/store';
import { getStateSyncStatus, subscribeStateSync } from '../system/stateSync';
import { MODELS } from './models';
import { requestManualRoomEntry } from './chat-room-presence';
import { ThreadListNew } from './components/assistant-ui/thread-list';
import { retryStorageSync, storageSyncFailures, subscribeStorageSync, storageSyncConflicts, resolveStorageSyncConflict } from '../system/serverStorage';
import './conversation-options.css';

export function ConversationTabs() {
  const aui = useAui();
  const { items, current } = useAuiState(useShallow((s) => ({ items: s.threads.threadItems, current: s.threads.mainThreadId })));
  const regular = items.filter((item) => item.status === 'regular');
  const visible = regular.slice(0, 5);
  const active = regular.find((item) => item.id === current);
  if (active && !visible.includes(active)) visible.push(active);
  return <nav className="vinz-conversation-tabs" aria-label="Conversazioni">
    {!active && <button type="button" aria-current="page">NUOVA CHAT</button>}
    {visible.map((item) => <button type="button" key={item.id} aria-current={current === item.id ? 'page' : undefined}
      title={item.title || 'Chat'} onClick={() => { if (current !== item.id) { requestManualRoomEntry(item.id); void aui.threads.switchToThread(item.id); } }}>
      {item.title || 'Chat'}
    </button>)}
    <ThreadListNew className="vinz-conversation-new" labelClassName="sr-only" />
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
  const controls = <section className="vinz-chat-options" aria-label="Strumenti conversazione">
    <button type="button" data-open-workspace onClick={() => setOpen(true)}>PROJECTS / FILES / ARTIFACTS</button>
    <button type="button" data-open-workspace onClick={() => setRemindersOpen(true)}>PROMEMORIA</button>
    <label>MODELLO PER QUESTA CHAT<select value={value.model} onChange={(e) => setDraft({ ...value, model: e.target.value })}>
      <option value="auto">AUTO · routing VINZ.MON</option>{MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
    </select></label>
    {value.projectId && <p>Progetto: {value.projectTitle} <button type="button" disabled={scopeLocked} onClick={() => setDraft({ ...value, projectId: null, projectTitle: '' })}>Esci dal contesto</button></p>}
    {scopeLocked && <small>Per cambiare contesto progetto, apri una nuova chat. La cronologia di questa resta nel suo contesto.</small>}
    <small>Solo gli strumenti collegati sono disponibili. Nessun accesso automatico a mail, desktop o social.</small>
  </section>;
  const workspace = remindersOpen ? <div className="vinz-project-overlay" role="dialog" aria-modal="true" aria-label="Promemoria">
    <ReminderPanel token={token} onClose={() => { setRemindersOpen(false); if (location.hash === '#reminders') history.replaceState(null, '', location.pathname); }} />
  </div> : open ? <div className="vinz-project-overlay" role="dialog" aria-modal="true" aria-label="Projects">
    <ProjectWorkspace token={token} onClose={() => setOpen(false)} onSelectProject={scopeLocked ? undefined : (project) => { setDraft({ ...value, projectId: project.id, projectTitle: project.title }); setOpen(false); }} />
  </div> : null;
  return { controls, workspace, projectTitle: value.projectTitle };
}

export function ChatStorageStatus() {
  const failures = useSyncExternalStore(subscribeStorageSync, storageSyncFailures, () => 0);
  const conflicts = storageSyncConflicts();
  const [storageError, setStorageError] = useState('');
  async function resolve(key: string, choice: 'keep-local' | 'use-server') {
    if (!confirm(choice === 'keep-local' ? 'Sostituire la copia server di questa conversazione/configurazione con quella locale? Le due copie non verranno unite.' : 'Sostituire questa copia locale con quella server e ricaricare? Le modifiche non sincronizzate a questa voce verranno sostituite.')) return;
    try { const result = await resolveStorageSyncConflict(key, choice); if (result.reloadRequired) location.reload(); }
    catch { setStorageError('Conflitto non risolto. Nessuna conferma di salvataggio: riprova.'); }
  }
  const sync = useSyncExternalStore(subscribeStateSync, getStateSyncStatus, getStateSyncStatus);
  return <>
    {failures > 0 && <div role="status" className="vinz-chat-storage-status">Sincronizzazione chat non completata. Non cancellare i dati del browser. <button onClick={() => void retryStorageSync()}>Riprova</button></div>}
    {conflicts.length > 0 && <details className="vinz-chat-storage-status"><summary>Copie in conflitto · {conflicts.length}</summary>
      {conflicts.map((key, index) => <div key={key}>Voce {index + 1} · {key.includes(':messages:') ? 'messaggi chat' : key.endsWith(':threads') ? 'indice chat' : 'configurazione'}
        <button onClick={() => void resolve(key, 'keep-local')}>Conserva locale</button><button onClick={() => void resolve(key, 'use-server')}>Usa server</button>
      </div>)}
    </details>}
    {storageError && <p role="alert" className="vinz-chat-storage-status">{storageError}</p>}
    {sync.status === 'conflict' ? <div role="alert" className="vinz-chat-storage-status">Lo stato locale e quello server differiscono. Nessuna copia è stata sovrascritta.
      <button onClick={() => { if (confirm('Conservare lo stato di questo dispositivo al posto di quello server? Le modifiche dell’altra copia non saranno unite.')) void resolveStateSyncConflict('keep-local'); }}>Conserva questo dispositivo</button>
      <button onClick={() => { if (confirm('Caricare lo stato server? Le modifiche locali non sincronizzate verranno sostituite.')) void resolveStateSyncConflict('use-server'); }}>Usa copia server</button>
    </div> : (sync.status === 'error' || sync.status === 'pending') && <div role="status" className="vinz-chat-storage-status">Stato non sincronizzato. <button onClick={() => void syncWithServer()}>Riprova</button></div>}
  </>;
}
