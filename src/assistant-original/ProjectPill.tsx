/* ============================================================================
   LA PILLOLA DEL PROGETTO

   🔷 «I topic restano come sono, ma a sinistra c'è una pillola con il nome del
   progetto attuale. Clic → tendina con gli altri progetti, o + per crearne
   uno nuovo con un pop up dove inserisco il nome. Ogni progetto ha i suoi file
   e i suoi ACT.»

   🔷 «Una chat diversa per ogni progetto, almeno.» Sceglierne uno CAMBIA
   thread — verso quello già dedicato a quel progetto, o aprendone uno nuovo
   la prima volta (`selectProject`/`switchToProjectThread` in
   `conversation-options.tsx`). Non ritagga il filo corrente: lo sostituisce
   con quello giusto.

   🔒 ADDITIVO, MAI ESCLUSIVO. Scegliere un progetto non toglie la memoria
   generale: `resolveChatContext` (già così, non toccato qui) accoda il
   contesto del progetto a quello generale, non lo sostituisce. */

import { useEffect, useState } from 'react';
import { PlusIcon } from 'lucide-react';

import { useApp } from '@/state/store';
import { listProjects, mutateProject } from '@/projects/client';
import type { ProjectSummary } from '@/engine/projects';
import { ICON_NAMES, topicIcon } from '@/system/topicIcon';

export type ProjectRef = { id: string; title: string };

/** 🔷 «Fagliela anche inventare»: `icon` su un progetto è un'emoji libera
    (`cambia_icona_progetto`), non un nome dell'elenco chiuso delle
    automazioni — mostrala così com'è. Solo se combacia per caso con una di
    quelle chiavi (o manca) si torna al Lucide dedotto dal titolo. */
function ProjectGlyph({ title, icon }: { title: string; icon?: string | null }) {
  if (icon && !(icon in ICON_NAMES)) {
    return <span className="vinz-project-pill__emoji" aria-hidden="true">{icon}</span>;
  }
  const Icon = topicIcon(title, icon);
  return <Icon aria-hidden="true" />;
}

export function ProjectPill({
  scope,
  onChange,
  compact,
}: {
  scope: { projectId: string | null; projectTitle: string };
  onChange?: (project: ProjectRef | null) => void;
  /** 🔒 Solo icona: per infilarsi in una barra già stretta (`TabBar`, App.tsx)
      senza allargarla — quattro posti erano già al limite dello schermo, un
      quinto con etichetta mandava tutta la pagina in scroll orizzontale. Il
      nome del progetto resta leggibile nel menu, non sparisce. */
  compact?: boolean;
}) {
  const token = useApp((s) => s.token);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /* 🔷 Non solo quando si apre: anche da chiusa la pillola deve sapere
     l'icona del progetto attuale (`icon` salvato, o dedotta dal titolo). */
  useEffect(() => {
    let live = true;
    listProjects(token).then((list) => { if (live) setProjects(list); }).catch(() => { if (live) setProjects([]); });
    return () => { live = false; };
  }, [token]);

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

  const currentProject = scope.projectId ? projects?.find((p) => p.id === scope.projectId) : undefined;

  return (
    <div className="vinz-project-pill">
      <button
        type="button"
        className={`vinz-project-pill__trigger${scope.projectId ? ' vinz-project-pill__trigger--active' : ''}${compact ? ' vinz-project-pill__trigger--compact' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Progetto attuale: ${scope.projectId ? scope.projectTitle : 'Generale'}`}
      >
        <ProjectGlyph title={scope.projectId ? scope.projectTitle : 'Generale'} icon={currentProject?.icon} />
        {!compact && <span>{scope.projectId ? scope.projectTitle : 'Generale'}</span>}
      </button>

      {open && (
        <div className="vinz-project-pill__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className={!scope.projectId ? 'is-active' : ''}
            onClick={() => { onChange(null); setOpen(false); }}
          >
            <ProjectGlyph title="Generale" />
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
              <ProjectGlyph title={project.title} icon={project.icon} />
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
