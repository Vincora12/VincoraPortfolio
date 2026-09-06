import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, FileTextIcon, FolderIcon, PackageIcon, CalendarDaysIcon, ChevronDownIcon, Trash2Icon } from 'lucide-react';
import { artifactHref, PROJECT_LIMITS, GLOBAL_PROJECT_ID, type Project, type ProjectFile, type ProjectArtifact, type ProjectSummary } from '../engine/projects';
import { listProjects, loadProject, mutateProject } from './client';
import { ReminderPanel } from './ReminderPanel';
import { Markdown } from '../system/Markdown';
import './workspace-panel.css';
import { MODELS } from '../assistant-original/models';

export type WorkspaceIntent = 'artifact' | 'automation';
export function WorkspacePanel({ token, projectId, onSelectProject, onBeginChat, model, onModel }: {
  token: string | null; projectId: string | null;
  onSelectProject: (project: Project) => Promise<void>;
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
    Promise.all([listProjects(token), listProjects(token, true), loadProject(token, projectId ?? GLOBAL_PROJECT_ID)])
      .then(async ([items, deleted, current]) => { const active = current.trashedAt ? await loadProject(token, GLOBAL_PROJECT_ID) : current; if (live) { setProjects(items); setTrash(deleted); setProject(active); } })
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
  async function chooseProject(next: Project) {
    await onSelectProject(next);
    setProject(next);
    navigate('home');
  }
  async function begin(intent: WorkspaceIntent) {
    if (!project) throw new Error('Lo spazio non è ancora disponibile. Premi Ricarica.');
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
  const empty = (title: string, text: string) => <div className="workspace-panel__empty"><strong>{title}</strong><p>{text}</p></div>;
  return <section className="workspace-panel" aria-label="Spazio di lavoro" aria-busy={busy}>
    {page !== 'home' && back}
    {page !== 'home' && page !== 'projects' && page !== 'trash' && <button className="workspace-panel__scope" onClick={() => navigate('projects')}><FolderIcon aria-hidden="true" /><span>{project?.title ?? 'Caricamento spazio…'}</span><ChevronDownIcon aria-hidden="true" /></button>}
    {error && <p role="alert">{error} <button disabled={busy} onClick={() => void run(async () => { await refresh(); const current = await loadProject(token, project?.id ?? projectId ?? GLOBAL_PROJECT_ID); setProject(current.trashedAt ? await loadProject(token, GLOBAL_PROJECT_ID) : current); })}>Ricarica</button></p>}
    <p className="workspace-panel__status" role="status">{busy ? 'Caricamento…' : notice}</p>
    {page === 'home' && <>
      <header className="workspace-panel__hero"><h2>{project?.title ?? 'GLOBAL'}</h2><p>{project?.id && project.id !== GLOBAL_PROJECT_ID ? 'Tutto quello che serve a questo progetto.' : 'Il tuo spazio personale. Tutto, in un posto.'}</p>
        <button className="workspace-panel__switch" disabled={busy} onClick={() => navigate('projects')}><FolderIcon aria-hidden="true" />Cambia progetto<ChevronDownIcon aria-hidden="true" /></button>
      </header>
      <nav className="workspace-panel__destinations" aria-label="Contenuti dello spazio">
        {destination('File', `${project?.files?.length ?? 0} file · Carica e scarica`, 'files', <FileTextIcon aria-hidden="true" />)}
        {destination('Artefatti', `${project?.artifacts.length ?? 0} documenti · Creati con l’AI`, 'artifacts', <PackageIcon aria-hidden="true" />)}
        {destination('Automazioni', 'Consulta e gestisci i promemoria', 'automations', <CalendarDaysIcon aria-hidden="true" />)}
      </nav>
      <footer className="workspace-panel__utilities"><button className="workspace-panel__back" onClick={() => navigate('trash')}><Trash2Icon aria-hidden="true" />Cestino{trash.length > 0 ? ` · ${trash.length}` : ''}</button>
      <details><summary>Modello della chat</summary><select aria-label="Modello della chat" value={model} onChange={e => onModel(e.target.value)}><option value="auto">Automatico</option>{MODELS.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></details></footer>
    </>}
    {(page === 'projects' || page === 'trash') && <>
      <h2>{page === 'trash' ? 'Cestino' : 'Progetti'}</h2>
      <p>{page === 'trash' ? 'Ripristina un gruppo con tutti i suoi file e artefatti.' : 'Scegli dove lavorare. File, artefatti e automazioni seguono il progetto.'}</p>
      {page === 'projects' && <>
        <div className="workspace-panel__actions"><button disabled={busy} onClick={() => setCreating(!creating)}>Nuovo gruppo</button><button onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? 'Annulla' : 'Seleziona'}</button></div>
        {creating && <form onSubmit={e => { e.preventDefault(); void run(async () => { const saved = await mutateProject(token, { action: 'create', title: name.trim() }); await refresh(); setName(''); setCreating(false); await chooseProject(saved); }); }}><label>Nome del gruppo<input required maxLength={PROJECT_LIMITS.title} value={name} onChange={e => setName(e.target.value)} /></label><button disabled={busy || !name.trim()}>Crea gruppo</button></form>}
        {!selecting && <button disabled={busy} className="workspace-panel__row" onClick={() => void run(async () => { await chooseProject(await loadProject(token, GLOBAL_PROJECT_ID)); })}><FolderIcon /><span>GLOBAL<small>Spazio personale</small></span><ArrowRightIcon /></button>}
      </>}
      {(page === 'trash' ? trash : projects).map(item => <div key={item.id} className="workspace-panel__item">
        {selecting && <input type="checkbox" aria-label={`Seleziona ${item.title}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />}
        <button disabled={busy} className="workspace-panel__row" onClick={() => void run(async () => {
          if (selecting) { toggle(item.id); return; }
          if (page === 'trash') { await mutateProject(token, { action: 'restore', projectId: item.id, revision: item.revision }); await refresh(); setNotice('Gruppo ripristinato.'); }
          else { await chooseProject(await loadProject(token, item.id)); }
        })}><FolderIcon /><span>{item.title}<small>{item.fileCount ?? 0} file · {item.artifactCount} artefatti</small></span>{page === 'trash' ? 'Ripristina' : <ArrowRightIcon />}</button>
      </div>)}
      {page === 'trash' && !trash.length && !busy && <p>Il cestino è vuoto.</p>}
      {selected.length > 0 && <button disabled={busy} onClick={() => {
        const targets = projects.filter(p => selected.includes(p.id));
        if (!confirm(`Spostare nel cestino ${targets.length} gruppi con ${targets.reduce((n,p) => n+(p.fileCount ?? 0),0)} file e ${targets.reduce((n,p) => n+p.artifactCount,0)} artefatti? Puoi ripristinarli. Le chat restano conservate.`)) return;
        void run(async () => {
          for (const item of targets) { await mutateProject(token, { action: 'trash', projectId: item.id, revision: item.revision }); if (item.id === project?.id) await chooseProject(await loadProject(token, GLOBAL_PROJECT_ID)); setSelected(ids => ids.filter(id => id !== item.id)); }
          await refresh(); setSelecting(false); setNotice('Gruppi spostati nel cestino.');
        });
      }}>Sposta nel cestino ({selected.length})</button>}
    </>}
    {page === 'files' && <>
      <h2>File</h2><p>I tuoi materiali, sempre a portata di mano.</p>
      {project ? <>
        <div className="workspace-panel__actions"><button className="workspace-panel__primary" disabled={busy} onClick={() => upload.current?.click()}>Carica file</button><button onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? 'Annulla' : 'Seleziona'}</button></div>
        <input ref={upload} type="file" multiple hidden onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void run(() => uploadFiles(files)); }} />
        <p className="workspace-panel__hint">Massimo 5 MB per caricamento. I file restano sul Mac e puoi scaricarli da qui.</p>
        {(project.files ?? []).map(file => <div className="workspace-panel__item" key={file.id}>{selecting && <input type="checkbox" aria-label={`Seleziona ${file.name}`} checked={selected.includes(file.id)} onChange={() => toggle(file.id)} />}<button className="workspace-panel__row" onClick={() => selecting ? toggle(file.id) : download(file)}><FileTextIcon /><span>{file.name}<small>{Math.ceil(file.size / 1024)} KB · Scarica</small></span><ArrowRightIcon /></button></div>)}
        {!project.files?.length && empty('Qui trovi i tuoi file', 'Carica documenti, immagini o altri materiali. Verranno conservati in questo spazio sul tuo Mac.')}
        {project.context && <details><summary>Fonti salvate in precedenza</summary><pre>{project.context}</pre></details>}
        {selected.length > 0 && <button disabled={busy} onClick={() => { if (!confirm(`Eliminare definitivamente ${selected.length} file da questo gruppo?`)) return; void run(async () => { setProject(await mutateProject(token, { action: 'remove-files', projectId: project.id, revision: project.revision, ids: selected })); await refresh(); setSelected([]); setSelecting(false); setNotice('File eliminati.'); }); }}>Elimina selezionati ({selected.length})</button>}
      </> : <p>{busy ? 'Apertura dei file dello spazio…' : 'Spazio non disponibile. Premi Ricarica per riprovare.'}</p>}
    </>}
    {page === 'artifacts' && <>
      <h2>{artifact?.title ?? 'Artefatti'}</h2>{!artifact && <p>Dall’idea al documento, insieme all’AI.</p>}
      {artifact ? <article><Markdown source={artifact.markdown} /></article> : <>
        <button className="workspace-panel__primary" disabled={busy || !project} onClick={() => void run(() => begin('artifact'))}>Crea con l’AI</button>
        {(project?.artifacts ?? []).map(item => <div key={item.slug} className="workspace-panel__artifact"><button className="workspace-panel__row" onClick={() => setArtifact(item)}><PackageIcon /><span>{item.title}<small>Versione {item.revision} · Apri nell’app</small></span><ArrowRightIcon /></button><button onClick={() => void run(async () => { await navigator.clipboard.writeText(new URL(artifactHref(project!.id, item.slug), `${location.origin}/`).href); setNotice('Link privato copiato. Richiede accesso a VINZ.MON e alla rete Tailscale.'); })}>Copia link privato</button></div>)}
        {!project?.artifacts.length && !busy && empty('La prossima idea parte dalla chat', 'Descrivi cosa vuoi creare: un report, un piano, un testo. Ritroverai qui il documento salvato, pronto da aprire.')}
      </>}
    </>}
    {page === 'automations' && <><h2>Automazioni</h2><ReminderPanel token={token} projectId={project?.id === GLOBAL_PROJECT_ID ? null : project?.id ?? null} createBusy={busy || !project} onClose={() => navigate('home')} onCreate={() => void run(() => begin('automation'))} /></>}
  </section>;
}
