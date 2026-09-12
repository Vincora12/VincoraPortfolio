import { authorize, denied, json } from './_shared/auth';
import {
  deleteWorkspaceEntry,
  ensureProjectWorkspace,
  isLocalCoreServer,
  listWorkspaceTree,
  readWorkspaceBinary,
  readWorkspaceFile,
  writeWorkspaceBinary,
  writeWorkspaceFile,
} from './_shared/vinzWorkspace';

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) return denied();
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);

  if (!isLocalCoreServer()) {
    return json({ error: 'La cartella di lavoro funziona solo parlando al server locale sul tuo computer, non sulla versione ospitata.' }, 503);
  }

  let projectId = '';
  let projectTitle = '';
  let body: Record<string, unknown> = {};

  if (request.method === 'GET') {
    const url = new URL(request.url);
    projectId = url.searchParams.get('projectId') ?? '';
    projectTitle = url.searchParams.get('projectTitle') ?? '';
  } else {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: 'body non leggibile' }, 400);
    }
    projectId = typeof body.projectId === 'string' ? body.projectId : '';
    projectTitle = typeof body.projectTitle === 'string' ? body.projectTitle : '';
  }
  if (!projectId || !projectTitle) return json({ error: 'Progetto mancante: la cartella di lavoro esiste solo dentro un progetto.' }, 400);

  const root = await ensureProjectWorkspace(projectId, projectTitle);
  const action = request.method === 'GET' ? 'list' : body.action;

  if (action === 'list') {
    return json({ root, tree: await listWorkspaceTree(root) });
  }
  if (action === 'read') {
    const path = typeof body.path === 'string' ? body.path : '';
    if (!path) return json({ error: 'Percorso mancante.' }, 400);
    try {
      return json({ content: await readWorkspaceFile(root, path) });
    } catch (cause) {
      return json({ error: cause instanceof Error ? cause.message : 'Lettura non riuscita.' }, 400);
    }
  }
  if (action === 'write') {
    const path = typeof body.path === 'string' ? body.path : '';
    const content = typeof body.content === 'string' ? body.content : '';
    if (!path) return json({ error: 'Percorso mancante.' }, 400);
    try {
      await writeWorkspaceFile(root, path, content);
      return json({ ok: true });
    } catch (cause) {
      return json({ error: cause instanceof Error ? cause.message : 'Scrittura non riuscita.' }, 400);
    }
  }
  if (action === 'read-binary') {
    const path = typeof body.path === 'string' ? body.path : '';
    if (!path) return json({ error: 'Percorso mancante.' }, 400);
    try {
      const { base64, mediaType } = await readWorkspaceBinary(root, path);
      return json({ base64, mediaType });
    } catch (cause) {
      return json({ error: cause instanceof Error ? cause.message : 'Lettura non riuscita.' }, 400);
    }
  }
  if (action === 'upload') {
    const path = typeof body.path === 'string' ? body.path : '';
    const base64 = typeof body.base64 === 'string' ? body.base64 : '';
    if (!path || !base64) return json({ error: 'File mancante.' }, 400);
    try {
      await writeWorkspaceBinary(root, path, base64);
      return json({ ok: true });
    } catch (cause) {
      return json({ error: cause instanceof Error ? cause.message : 'Caricamento non riuscito.' }, 400);
    }
  }
  if (action === 'delete') {
    const path = typeof body.path === 'string' ? body.path : '';
    if (!path) return json({ error: 'Percorso mancante.' }, 400);
    try {
      await deleteWorkspaceEntry(root, path);
      return json({ ok: true });
    } catch (cause) {
      return json({ error: cause instanceof Error ? cause.message : 'Cancellazione non riuscita.' }, 400);
    }
  }
  return json({ error: 'Azione non disponibile.' }, 400);
}

export const config = { path: '/api/vinz-workspace' };
