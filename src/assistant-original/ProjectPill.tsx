/* ============================================================================
   LA PILLOLA DEL PROGETTO

   🔷 «I topic restano come sono, ma a sinistra c'è una pillola con il nome del
   progetto attuale. Clic → tendina con gli altri progetti, o + per crearne
   uno nuovo con un pop up dove inserisco il nome. Ogni progetto ha i suoi file
   e i suoi ACT.»

   🔒 NON CAMBIA THREAD. Il vecchio modello di Progetti (`WorkspacePanel`,
   `selectWorkspaceProject`) passa da un progetto all'altro cambiando
   conversazione — nasce da un'epoca in cui VINZ teneva una chat per
   progetto. Questa pillola usa `setProjectScope`, che aggiorna lo stesso
   filo: la chat non si cancella, da quel momento porta solo un contesto in
   più. Vedi `conversation-options.tsx`.

   🔒 ADDITIVO, MAI ESCLUSIVO. Scegliere un progetto non toglie la memoria
   generale: `resolveChatContext` (già così, non toccato qui) accoda il
   contesto del progetto a quello generale, non lo sostituisce. */

import { useEffect, useState } from 'react';
import { FolderIcon, PlusIcon } from 'lucide-react';

import { useApp } from '@/state/store';
import { listProjects, mutateProject } from '@/projects/client';
import type { ProjectSummary } from '@/engine/projects';

export type ProjectRef = { id: string; title: string };

export function ProjectPill({
  scope,
  onChange,
}: {
  scope: { projectId: string | null; projectTitle: string };
  onChange?: (project: ProjectRef | null) => void;
}) {
  const token = useApp((s) => s.token);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let live = true;
    listProjects(token).then((list) => { if (live) setProjects(list); }).catch(() => { if (live) setProjects([]); });
    return () => { live = false; };
  }, [open, token]);

  useEffect(() => {
    if (open) return;
    setCreating(false);
    setDraftTitle('');
    setError('');
  }, [open]);

  /* Renderizzata solo quando qualcuno sa cosa fare di un progetto scelto: la
     ChatSurface embedded (dentro LAB) ha già il suo pannello Progetti e non
     passa `onChange` — qui semplicemente non compare, niente da spegnere. */
  if (!onChange) return null;

  async function create() {
    const title = draftTitle.trim();
    if (!title || !onChange) return;
    setBusy(true);
    setError('');
    try {
      const project = await mutateProject(token, { action: 'create', title });
      setProjects(null);
      onChange({ id: project.id, title: project.title });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Creazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vinz-project-pill">
      <button
        type="button"
        className={`vinz-project-pill__trigger${scope.projectId ? ' vinz-project-pill__trigger--active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Progetto attuale"
      >
        <FolderIcon aria-hidden="true" />
        <span>{scope.projectId ? scope.projectTitle : 'Generale'}</span>
      </button>

      {open && (
        <div className="vinz-project-pill__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className={!scope.projectId ? 'is-active' : ''}
            onClick={() => { onChange(null); setOpen(false); }}
          >
            Generale
          </button>

          {projects === null && <p className="vinz-project-pill__meta">Carico i progetti…</p>}
          {projects?.map((project) => (
            <button
              key={project.id}
              type="button"
              role="menuitem"
              className={scope.projectId === project.id ? 'is-active' : ''}
              onClick={() => { onChange({ id: project.id, title: project.title }); setOpen(false); }}
            >
              {project.title}
            </button>
          ))}

          {!creating ? (
            <button type="button" className="vinz-project-pill__new" onClick={() => setCreating(true)}>
              <PlusIcon aria-hidden="true" /> Nuovo progetto
            </button>
          ) : (
            <form
              className="vinz-project-pill__create"
              onSubmit={(event) => { event.preventDefault(); void create(); }}
            >
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Nome del progetto"
                aria-label="Nome del nuovo progetto"
                autoFocus
                disabled={busy}
              />
              <button type="submit" disabled={busy || !draftTitle.trim()}>Crea</button>
            </form>
          )}

          {error && <p className="vinz-project-pill__error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
