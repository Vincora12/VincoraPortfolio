import { getStore } from './_shared/localStore';
import { authorize, denied, json } from './_shared/auth';
import { createProject, updateProject, mutationProblem, projectSummary, validProjectId, PROJECT_LIMITS } from '../../src/engine/projects';
import type { Project, ProjectMutation } from '../../src/engine/projects';

const projectStore = () => getStore({ name: 'vinzmon-projects', consistency: 'strong' });

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Solo GET e POST.' }, 405);
  try {
    const store = projectStore();
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('projectId');
      if (id !== null) {
        if (!validProjectId(id)) return json({ error: 'Progetto non valido.' }, 400);
        const project = await store.get(`projects/${id}`, { type: 'json' }) as Project | null;
        return project ? json({ project }) : json({ error: 'Progetto non trovato.' }, 404);
      }
      const { blobs } = await store.list({ prefix: 'projects/' });
      // Creation's count guard is not a transaction across records. A rare pair
      // of concurrent creates may cross it; never silently hide those records.
      if (blobs.length > 500) return json({ error: 'Archivio troppo grande per questa vista. Nessun progetto eliminato.' }, 413);
      const projects = await Promise.all(blobs.map(async ({ key }) => {
        const p = await store.get(key, { type: 'json' }) as Project | null;
        return p ? projectSummary(p) : null;
      }));
      return json({ projects: projects.filter((p) => p !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
    }
    const raw = await request.text();
    if (raw.length > 100_000) return json({ error: 'Richiesta troppo grande.' }, 413);
    let input: ProjectMutation;
    try { input = JSON.parse(raw) as ProjectMutation; } catch { return json({ error: 'JSON non valido.' }, 400); }
    const problem = mutationProblem(input);
    if (problem) return json({ error: problem }, 400);
    const now = new Date().toISOString();
    if (input.action === 'create') {
      // Content is kept in bounded individual records, not a giant global snapshot.
      const { blobs } = await store.list({ prefix: 'projects/' });
      if (blobs.length >= PROJECT_LIMITS.projects) return json({ error: 'Limite progetti raggiunto.' }, 409);
      const project = createProject(input, crypto.randomUUID(), now);
      const written = await store.setJSON(`projects/${project.id}`, project, { onlyIfNew: true });
      if (!written.modified) return json({ error: 'Conflitto: riprova.' }, 409);
      return json({ project }, 201);
    }
    const key = `projects/${input.projectId}`;
    const current = await store.getWithMetadata(key, { type: 'json' });
    if (!current) return json({ error: 'Progetto non trovato.' }, 404);
    let project: Project;
    try { project = updateProject(current.data as Project, input, now); }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      return json({ error: code === 'CONFLICT' ? 'Progetto aggiornato altrove: ricarica prima di salvare.' : 'Documento non valido, non trovato o limite raggiunto.' }, code === 'CONFLICT' ? 409 : 400);
    }
    const written = await store.setJSON(key, project, { onlyIfMatch: current.etag });
    if (!written.modified) return json({ error: 'Progetto aggiornato altrove: ricarica prima di salvare.' }, 409);
    return json({ project });
  } catch {
    console.warn('[projects] storage operation failed');
    return json({ error: 'Archivio progetti non disponibile. Nessun salvataggio confermato.' }, 503);
  }
}
export const config = { path: '/api/projects' };
