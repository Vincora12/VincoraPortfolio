import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, FileTextIcon, FolderIcon, PackageIcon, CalendarDaysIcon } from 'lucide-react';
import { artifactHref, PROJECT_LIMITS, type Project, type ProjectFile, type ProjectArtifact, type ProjectSummary } from '../engine/projects';
import { listProjects, loadProject, mutateProject } from './client';
import { ReminderPanel } from './ReminderPanel';
import { Markdown } from '../system/Markdown';
import './workspace-panel.css';
import { MODELS } from '../assistant-original/models';

export type WorkspaceIntent = 'artifact' | 'automation';
export function WorkspacePanel({ token, projectId, onBeginChat, model, onModel }: {
  token: string | null; projectId: string | null;
  onBeginChat: (project: Project | null, intent: WorkspaceIntent) => Promise<void>;
  model: string; onModel: (model: string) => void;
}) {
  const [page, setPage] = useState<'home' | 'projects' | 'files' | 'artifacts' | 'automations' | 'trash'>('home');
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [trash, setTrash] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [artifact, setArtifact] = useState<ProjectArtifact | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const navigate = (next: typeof page) => { setPage(next); setSelected([]); setSelecting(false); setArtifact(null); setError(''); setNotice(''); };
  async function refresh() {
    const [items, deleted] = await Promise.all([listProjects(token), listProjects(token, true)]);
    setProjects(items); setTrash(deleted);
  }
  useEffect(() => {
    let live = true;
    setBusy(true); busyRef.current = true;
    Promise.all([listProjects(token), listProjects(token, true), projectId ? loadProject(token, projectId) : Promise.resolve(null)])
      .then(([items, deleted, current]) => { if (live) { setProjects(items); setTrash(deleted); setProject(current?.trashedAt ? null : current); } })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Caricamento non riuscito.'); })
      .finally(() => { if (live) { setBusy(false); busyRef.current = false; } });
    return () => { live = false; };
  }, [token, projectId]);
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Operazione non riuscita. Riprova.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function toggle(id: string) { setSelected(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]); }
  async function begin(intent: WorkspaceIntent) {
    if (intent === 'artifact' && !project) { navigate('projects'); setNotice('Scegli o crea il gruppo in cui salvare il nuovo artefatto.'); return; }
    await onBeginChat(project, intent);
  }
  async function uploadFiles(files: File[]) {
    if (!project) return;
    if (files.reduce((n, f) => n + f.size, 0) > 5 * 1024 * 1024) throw new Error('Carica al massimo 5 MB per volta.');
    const prepared: ProjectFile[] = await Promise.all(files.map(async file => {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.onerror = () => reject(new Error(`Impossibile leggere ${file.name}`)); reader.readAsDataURL(file); });
      return { id: crypto.randomUUID(), name: file.name, size: file.size, data };
    }));
    setProject(await mutateProject(token, { action: 'upload-files', projectId: project.id, revision: project.revision, files: prepared }));
    await refresh(); setNotice(`${files.length} file caricati.`);
  }
  function download(file: ProjectFile) {
    const bytes = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const back = <button className="workspace-panel__back" onClick={() => artifact ? setArtifact(null) : navigate('home')}><ArrowLeftIcon aria-hidden="true" />{artifact ? 'Artefatti' : 'Spazio di lavoro'}</button>;
  const destination = (label: string, detail: string, next: typeof page, icon: ReactNode) => <button className="workspace-panel__row" onClick={() => navigate(next)}>{icon}<span>{label}<small>{detail}</small></span><ArrowRightIcon aria-hidden="true" /></button>;
  return <section className="workspace-panel" aria-label="Spazio di lavoro" aria-busy={busy}>
    {page !== 'home' && back}
    {error && <p role="alert">{error} <button disabled={busy} onClick={() => void run(async () => { await refresh(); if (project) setProject(await loadProject(token, project.id)); })}>Ricarica</button></p>}
    <p className="workspace-panel__status" role="status">{busy ? 'Caricamento…' : notice}</p>
    {page === 'home' && <>
      <h2>{project?.title ?? 'GLOBAL'}</h2><p>Il tuo spazio di lavoro</p>
      {destination('Progetti', 'Scegli e gestisci i gruppi', 'projects', <FolderIcon />)}
      {destination('File', `${project?.files?.length ?? 0} file`, 'files', <FileTextIcon />)}
      {destination('Artefatti', `${project?.artifacts.length ?? 0} documenti`, 'artifacts', <PackageIcon />)}
      {destination('Automazioni', 'Promemoria programmati', 'automations', <CalendarDaysIcon />)}
      <button className="workspace-panel__back" onClick={() => navigate('trash')}>Cestino · {trash.length} gruppi</button>
      <details><summary>Modello della chat</summary><select aria-label="Modello della chat" value={model} onChange={e => onModel(e.target.value)}><option value="auto">Automatico</option>{MODELS.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></details>
    </>}
    {(page === 'projects' || page === 'trash') && <>
      <h2>{page === 'trash' ? 'Cestino' : 'Progetti'}</h2>
      <p>{page === 'trash' ? 'Ripristina un gruppo con tutti i suoi file e artefatti.' : 'Ogni progetto è un gruppo di file e artefatti.'}</p>
      {page === 'projects' && <>
        <div className="workspace-panel__actions"><button disabled={busy} onClick={() => setCreating(!creating)}>Nuovo gruppo</button><button onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? 'Annulla' : 'Seleziona'}</button></div>
        {creating && <form onSubmit={e => { e.preventDefault(); void run(async () => { const saved = await mutateProject(token, { action: 'create', title: name.trim() }); setProject(saved); await refresh(); setName(''); setCreating(false); navigate('home'); }); }}><label>Nome del gruppo<input required maxLength={PROJECT_LIMITS.title} value={name} onChange={e => setName(e.target.value)} /></label><button disabled={busy || !name.trim()}>Crea gruppo</button></form>}
        {!selecting && <button className="workspace-panel__row" onClick={() => { setProject(null); navigate('home'); }}><FolderIcon /><span>GLOBAL<small>Spazio personale</small></span><ArrowRightIcon /></button>}
      </>}
      {(page === 'trash' ? trash : projects).map(item => <div key={item.id} className="workspace-panel__item">
        {selecting && <input type="checkbox" aria-label={`Seleziona ${item.title}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />}
        <button disabled={busy} className="workspace-panel__row" onClick={() => void run(async () => {
          if (selecting) { toggle(item.id); return; }
          if (page === 'trash') { await mutateProject(token, { action: 'restore', projectId: item.id, revision: item.revision }); await refresh(); setNotice('Gruppo ripristinato.'); }
          else { setProject(await loadProject(token, item.id)); navigate('home'); }
        })}><FolderIcon /><span>{item.title}<small>{item.fileCount ?? 0} file · {item.artifactCount} artefatti</small></span>{page === 'trash' ? 'Ripristina' : <ArrowRightIcon />}</button>
      </div>)}
      {page === 'trash' && !trash.length && !busy && <p>Il cestino è vuoto.</p>}
      {selected.length > 0 && <button disabled={busy} onClick={() => {
        const targets = projects.filter(p => selected.includes(p.id));
        if (!confirm(`Spostare nel cestino ${targets.length} gruppi con ${targets.reduce((n,p) => n+(p.fileCount ?? 0),0)} file e ${targets.reduce((n,p) => n+p.artifactCount,0)} artefatti? Puoi ripristinarli. Le chat restano conservate.`)) return;
        void run(async () => {
          for (const item of targets) { await mutateProject(token, { action: 'trash', projectId: item.id, revision: item.revision }); if (item.id === project?.id) setProject(null); setSelected(ids => ids.filter(id => id !== item.id)); }
          await refresh(); setSelecting(false); setNotice('Gruppi spostati nel cestino.');
        });
      }}>Sposta nel cestino ({selected.length})</button>}
    </>}
    {page === 'files' && <>
      <h2>File</h2><p>{project?.title ?? 'Scegli un gruppo per caricare i file.'}</p>
      {project ? <>
        <div className="workspace-panel__actions"><button className="workspace-panel__primary" disabled={busy} onClick={() => upload.current?.click()}>Carica file</button><button onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? 'Annulla' : 'Seleziona'}</button></div>
        <input ref={upload} type="file" multiple hidden onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void run(() => uploadFiles(files)); }} />
        <p className="workspace-panel__hint">Massimo 5 MB per caricamento. I file restano sul Mac e puoi scaricarli da qui.</p>
        {(project.files ?? []).map(file => <div className="workspace-panel__item" key={file.id}>{selecting && <input type="checkbox" aria-label={`Seleziona ${file.name}`} checked={selected.includes(file.id)} onChange={() => toggle(file.id)} />}<button className="workspace-panel__row" onClick={() => selecting ? toggle(file.id) : download(file)}><FileTextIcon /><span>{file.name}<small>{Math.ceil(file.size / 1024)} KB · Scarica</small></span><ArrowRightIcon /></button></div>)}
        {!project.files?.length && <p>Nessun file caricato.</p>}
        {project.context && <details><summary>Fonti salvate in precedenza</summary><pre>{project.context}</pre></details>}
        {selected.length > 0 && <button disabled={busy} onClick={() => { if (!confirm(`Eliminare definitivamente ${selected.length} file da questo gruppo?`)) return; void run(async () => { setProject(await mutateProject(token, { action: 'remove-files', projectId: project.id, revision: project.revision, ids: selected })); await refresh(); setSelected([]); setSelecting(false); setNotice('File eliminati.'); }); }}>Elimina selezionati ({selected.length})</button>}
      </> : <button onClick={() => navigate('projects')}>Scegli un gruppo</button>}
    </>}
    {page === 'artifacts' && <>
      <h2>{artifact?.title ?? 'Artefatti'}</h2><p>{project?.title ?? 'Scegli un gruppo per il nuovo artefatto.'}</p>
      {artifact ? <article><Markdown source={artifact.markdown} /></article> : <>
        <button className="workspace-panel__primary" disabled={busy} onClick={() => void run(() => begin('artifact'))}>Crea con l’AI</button>
        {(project?.artifacts ?? []).map(item => <div key={item.slug} className="workspace-panel__artifact"><button className="workspace-panel__row" onClick={() => setArtifact(item)}><PackageIcon /><span>{item.title}<small>Versione {item.revision} · Apri nell’app</small></span><ArrowRightIcon /></button><button onClick={() => void run(async () => { await navigator.clipboard.writeText(new URL(artifactHref(project!.id, item.slug), `${location.origin}/`).href); setNotice('Link privato copiato. Richiede accesso a VINZ.MON e alla rete Tailscale.'); })}>Copia link privato</button></div>)}
        {!project?.artifacts.length && <p>Nessun artefatto. Descrivi in chat cosa vuoi creare.</p>}
      </>}
    </>}
    {page === 'automations' && <ReminderPanel token={token} onClose={() => navigate('home')} onCreate={() => void run(() => begin('automation'))} />}
  </section>;
}
