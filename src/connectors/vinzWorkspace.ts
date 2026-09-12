/* ============================================================================
   LA CARTELLA DI VINZ — client verso /api/vinz-workspace

   🔷 È LA STESSA cartella che l'utente vede in FILES/"Aggiungi file": una per
   progetto, creata e gestita da VINZ stesso — legge, scrive, cancella lì
   dentro, mai altrove. La logica vera (fs sul Mac, il recinto anti-fuga) sta
   in `netlify/functions/_shared/vinzWorkspace.ts`; questo file è solo il
   client HTTP verso quell'endpoint.
   ========================================================================= */

export interface WorkspaceEntry {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

async function call<T>(token: string | null, projectId: string, projectTitle: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/vinz-workspace', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, projectTitle, ...body }),
  });
  const parsed = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok || !parsed) throw new Error((parsed as { error?: string } | null)?.error ?? 'Server locale non raggiungibile.');
  return parsed as T;
}

export async function loadWorkspace(token: string | null, projectId: string, projectTitle: string): Promise<{ root: string; tree: WorkspaceEntry[] }> {
  return call(token, projectId, projectTitle, { action: 'list' });
}

export async function readWorkspaceFile(
  token: string | null,
  projectId: string,
  projectTitle: string,
  path: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  try {
    const { content } = await call<{ content: string }>(token, projectId, projectTitle, { action: 'read', path });
    return { ok: true, content };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : 'Lettura non riuscita.' };
  }
}

export async function readWorkspaceBinaryFile(
  token: string | null,
  projectId: string,
  projectTitle: string,
  path: string,
): Promise<{ ok: true; base64: string; mediaType: string } | { ok: false; error: string }> {
  try {
    const result = await call<{ base64: string; mediaType: string }>(token, projectId, projectTitle, { action: 'read-binary', path });
    return { ok: true, base64: result.base64, mediaType: result.mediaType };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : 'Lettura non riuscita.' };
  }
}

export async function writeWorkspaceFile(
  token: string | null,
  projectId: string,
  projectTitle: string,
  path: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await call(token, projectId, projectTitle, { action: 'write', path, content });
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : 'Scrittura non riuscita.' };
  }
}

export async function uploadWorkspaceFile(
  token: string | null,
  projectId: string,
  projectTitle: string,
  path: string,
  base64: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await call(token, projectId, projectTitle, { action: 'upload', path, base64 });
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : 'Caricamento non riuscito.' };
  }
}

export async function deleteWorkspaceEntry(
  token: string | null,
  projectId: string,
  projectTitle: string,
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await call(token, projectId, projectTitle, { action: 'delete', path });
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : 'Cancellazione non riuscita.' };
  }
}

