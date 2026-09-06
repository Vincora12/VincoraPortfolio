import { useEffect, useState } from 'react';
import { Markdown } from '../system/Markdown';
import { artifactHref, PROJECT_LIMITS } from '../engine/projects';
import type { Project, ProjectArtifact, ProjectSummary } from '../engine/projects';
import { MAX_MARKDOWN_CHARS } from '../engine/pages';
import { listProjects, loadProject, mutateProject, draftProjectArtifact, downloadArtifact } from './client';
import './projects.css';

export function ProjectWorkspace({ token, onClose, onSelectProject }: {
  token: string | null;
  onClose: () => void;
  onSelectProject?: (project: Project) => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [context, setContext] = useState('');
  const [artifact, setArtifact] = useState<ProjectArtifact | null>(null);
  const [artifactTitle, setArtifactTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [task, setTask] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    setBusy(true);
    void listProjects(token).then((items) => { if (live) setProjects(items); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Caricamento non riuscito.'); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [token]);
  function select(next: Project | null) {
    setProject(next); setTitle(next?.title ?? ''); setInstructions(next?.instructions ?? ''); setContext(next?.context ?? '');
    setArtifact(null); setArtifactTitle(''); setMarkdown(''); setTask(''); setNotice('');
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Operazione non riuscita.'); } finally { setBusy(false); }
  }
  async function saveProject() {
    const saved = await mutateProject(token, project
      ? { action: 'update', projectId: project.id, revision: project.revision, title, instructions, context }
      : { action: 'create', title, instructions, context });
    setProject(saved);
    setProjects(await listProjects(token));
    setNotice('Progetto salvato sul server.');
  }
  async function saveArtifact() {
    if (!project) return;
    const saved = await mutateProject(token, { action: 'save-artifact', projectId: project.id, revision: project.revision, ...(artifact ? { slug: artifact.slug } : {}), title: artifactTitle, markdown });
    setProject(saved);
    setArtifact(artifact ? saved.artifacts.find((a) => a.slug === artifact.slug)! : saved.artifacts[saved.artifacts.length - 1]!);
    setNotice('Documento salvato. Il suo indirizzo resta stabile agli aggiornamenti.');
    setProjects(await listProjects(token));
  }
  const unsavedContext = !!project && (title !== project.title || instructions !== project.instructions || context !== project.context);
  return <section className="project-workspace" aria-label="Progetti">
    <header className="project-workspace__head"><h1>PROJECTS</h1><button onClick={onClose} aria-label="Chiudi progetti">CHIUDI ×</button></header>
    <p className="project-workspace__muted">Contesto separato dalla memoria personale. Documenti privati, salvati sul server.</p>
    {error && <p role="alert" className="project-workspace__error">{error}</p>}
    <p role="status" aria-live="polite">{busy ? 'Operazione in corso…' : notice}</p>
    <div className="project-workspace__layout">
      <nav aria-label="Elenco progetti">
        <label>CERCA PROGETTI<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titolo" /></label>
        <button disabled={busy} onClick={() => select(null)}>+ NUOVO PROGETTO</button>
        {projects.filter((p) => p.title.toLowerCase().includes(query.toLowerCase())).map((p) => <button className={p.id === project?.id ? 'is-active' : ''} disabled={busy} key={p.id} onClick={() => void run(async () => select(await loadProject(token, p.id)))}>{p.title}<small>{p.artifactCount} DOCUMENTI</small></button>)}
        {!busy && !projects.length && <p>Nessun progetto salvato.</p>}
      </nav>
      <div>
        <h2>{project ? 'CONTESTO DEL PROGETTO' : 'CREA UN PROGETTO'}</h2>
        <fieldset disabled={busy}>
          <label>TITOLO<input value={title} maxLength={PROJECT_LIMITS.title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>ISTRUZIONI<textarea value={instructions} maxLength={PROJECT_LIMITS.instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Come lavorare in questo progetto" rows={3} /></label>
          <label>CONTESTO / FONTI<textarea value={context} maxLength={PROJECT_LIMITS.context} onChange={(e) => setContext(e.target.value)} placeholder="Fatti e riferimenti del progetto, senza segreti" rows={5} /></label>
          <label>IMPORTA TESTO (.TXT / .MD, MAX 12 KB)<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(e) => {
            const file = e.target.files?.[0]; e.target.value = '';
            if (!file) return;
            void run(async () => {
              if (!/\.(txt|md)$/i.test(file.name) || file.size > 12000) throw new Error('Usa un file TXT/MD di massimo 12 KB.');
              const text = await file.text();
              const next = `${context}${context ? '\n\n' : ''}SOURCE: ${file.name}\n${text}`;
              if (next.length > PROJECT_LIMITS.context) throw new Error('Il contesto supera il limite: seleziona un estratto più breve.');
              setContext(next); setNotice('Testo importato nella bozza. Premi Salva progetto per conservarlo.');
            });
          }} /></label>
          <div className="project-workspace__actions"><button disabled={!title.trim()} onClick={() => void run(saveProject)}>SALVA PROGETTO</button>{project && onSelectProject && <button disabled={unsavedContext} onClick={() => onSelectProject(project)}>USA IN QUESTA CHAT</button>}</div>
        </fieldset>
        {project && <>
          <h2>ARTIFACTS / PAGINE</h2>
          <div className="project-workspace__actions"><button disabled={busy} onClick={() => { setArtifact(null); setArtifactTitle(''); setMarkdown(''); }}>+ NUOVO DOCUMENTO</button></div>
          {project.artifacts.map((a) => <div key={a.slug} className="project-workspace__artifact-row"><button disabled={busy} onClick={() => { setArtifact(a); setArtifactTitle(a.title); setMarkdown(a.markdown); }}>{a.title} · V{a.revision}</button><a href={artifactHref(project.id, a.slug)} target="_blank" rel="noopener noreferrer">APRI ↗</a></div>)}
          <fieldset disabled={busy}>
            <label>TITOLO DOCUMENTO<input maxLength={60} value={artifactTitle} onChange={(e) => setArtifactTitle(e.target.value)} /></label>
            <label>COMPITO PER AI<textarea maxLength={4000} rows={2} value={task} onChange={(e) => setTask(e.target.value)} placeholder="Crea un report usando questo contesto…" /></label>
            <button disabled={!task.trim() || unsavedContext} onClick={() => void run(async () => { setMarkdown(await draftProjectArtifact(token, project, task, artifact ?? undefined)); setNotice('Bozza AI pronta: verifica il contenuto e salva esplicitamente.'); })}>PREPARA BOZZA AI</button>
            {unsavedContext && <p>Salva il contesto prima di usarlo con AI o in chat.</p>}
            <label>DOCUMENTO MARKDOWN<textarea rows={10} maxLength={MAX_MARKDOWN_CHARS} value={markdown} onChange={(e) => setMarkdown(e.target.value)} /></label>
            <button disabled={!artifactTitle.trim() || !markdown.trim()} onClick={() => void run(saveArtifact)}>SALVA DOCUMENTO</button>
            {artifact && <div className="project-workspace__actions"><button onClick={() => downloadArtifact(artifact, 'md')}>SCARICA .MD SALVATO</button><button onClick={() => downloadArtifact(artifact, 'txt')}>SCARICA .TXT SALVATO</button></div>}
          </fieldset>
          {markdown && <details><summary>ANTEPRIMA BOZZA</summary><Markdown source={markdown} /></details>}
        </>}
      </div>
    </div>
  </section>;
}

/** Standalone private reader: no chat/history/context is rendered on this route. */
export function ProjectArtifactReader({ token, projectId, slug, onClose }: { token: string | null; projectId: string; slug: string; onClose: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setProject(null); setError(null);
    void loadProject(token, projectId).then((p) => { if (live) setProject(p); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Documento non disponibile.'); });
    return () => { live = false; };
  }, [token, projectId]);
  const artifact = project?.artifacts.find((a) => a.slug === slug);
  return <main className="project-workspace project-workspace--reader">
    <header className="project-workspace__head"><span>VINZ.MON / PRIVATE ARTIFACT</span><button onClick={onClose}>CHIUDI</button></header>
    {error ? <p role="alert">{error}</p> : !project ? <p role="status">Caricamento…</p> : !artifact ? <p>Documento non trovato.</p> : <>
      <p className="project-workspace__muted">{project.title} · V{artifact.revision} · {new Date(artifact.updatedAt).toLocaleDateString('it-IT')}</p>
      <h1>{artifact.title}</h1><article><Markdown source={artifact.markdown} /></article>
      <div className="project-workspace__actions"><button onClick={() => downloadArtifact(artifact, 'md')}>SCARICA .MD</button><button onClick={() => downloadArtifact(artifact, 'txt')}>SCARICA .TXT</button><button onClick={() => window.print()}>STAMPA / PDF</button></div>
    </>}
  </main>;
}
