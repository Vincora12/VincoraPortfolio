/* ============================================================================
   REPO OPS — endpoint unico per le "mani in più" sul repository/Mac

   🔒 SOLO SUL SERVER LOCALE, come la cartella di lavoro (`vinz-workspace.ts`):
   git, npm, i log e i servizi esistono solo dove gira il vero Local Core.
   Sulla versione ospitata questo endpoint risponde 503, mai una simulazione.

   🔷 UN'AZIONE = UNA COSA. Nessun campo "comando" libero: `action` sceglie
   fra un elenco fisso, ogni voce chiama esattamente una funzione di
   `_shared/repoOps.ts`. Stessa forma di `vinz-workspace.ts`. */

import { authorize, denied, json } from './_shared/auth';
import { isLocalCoreServer } from './_shared/vinzWorkspace';
import { appendRuntimeEvent } from './_shared/runtimeLog';
import {
  gitBranch,
  gitDiff,
  gitLog,
  gitShow,
  gitStatus,
  inspectLocalServices,
  readVinzmonLogs,
  repoEdit,
  repoWrite,
  runNpmScript,
  scheduleRestart,
} from './_shared/repoOps';

const MAX_PATH_CHARS = 300;
const MAX_CONTENT_CHARS = 200_000;

type Platform = { waitUntil(promise: Promise<unknown>): void } | undefined;

export default async function handler(request: Request, platform?: Platform): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) return denied();
  if (request.method !== 'POST') return json({ error: 'solo POST' }, 405);

  if (!isLocalCoreServer()) {
    return json({ error: 'Questi strumenti funzionano solo parlando al server locale sul tuo computer, non sulla versione ospitata.' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const started = Date.now();
  const log = (status: 'PASS' | 'FAIL', extra?: Record<string, string | number | boolean>) =>
    void appendRuntimeEvent({ eventType: 'REPO_OPS', status, scope: 'system', action, durationMs: Date.now() - started, metadata: extra });

  if (action === 'git-status') {
    const result = gitStatus();
    log(result.ok ? 'PASS' : 'FAIL');
    return json(result);
  }
  if (action === 'git-diff') {
    const path = typeof body.path === 'string' ? body.path.slice(0, MAX_PATH_CHARS) : undefined;
    const result = gitDiff(path);
    log(result.ok ? 'PASS' : 'FAIL');
    return json(result);
  }
  if (action === 'git-log') {
    const limit = typeof body.limit === 'number' ? body.limit : undefined;
    const result = gitLog(limit);
    log(result.ok ? 'PASS' : 'FAIL');
    return json(result);
  }
  if (action === 'git-branch') {
    const result = gitBranch();
    log(result.ok ? 'PASS' : 'FAIL');
    return json(result);
  }
  if (action === 'git-show') {
    const ref = typeof body.ref === 'string' ? body.ref.slice(0, 80) : '';
    const result = gitShow(ref);
    log(result.ok ? 'PASS' : 'FAIL');
    return json(result);
  }
  if (action === 'repo-write') {
    const path = typeof body.path === 'string' ? body.path.slice(0, MAX_PATH_CHARS) : '';
    const content = typeof body.content === 'string' ? body.content.slice(0, MAX_CONTENT_CHARS) : '';
    const result = repoWrite(path, content);
    log(result.ok ? 'PASS' : 'FAIL', { path });
    return json(result);
  }
  if (action === 'repo-edit') {
    const path = typeof body.path === 'string' ? body.path.slice(0, MAX_PATH_CHARS) : '';
    const oldStr = typeof body.oldStr === 'string' ? body.oldStr : '';
    const newStr = typeof body.newStr === 'string' ? body.newStr.slice(0, MAX_CONTENT_CHARS) : '';
    const result = repoEdit(path, oldStr, newStr);
    log(result.ok ? 'PASS' : 'FAIL', { path });
    return json(result);
  }
  if (action === 'run-npm-script') {
    const name = typeof body.name === 'string' ? body.name : '';
    const result = runNpmScript(name);
    log(result.ok ? 'PASS' : 'FAIL', { name });
    return json(result);
  }
  if (action === 'read-logs') {
    const which = body.which === 'service-error' ? 'service-error' : 'service';
    const result = readVinzmonLogs(which);
    log(result.ok ? 'PASS' : 'FAIL');
    return json(result);
  }
  if (action === 'inspect-services') {
    const result = await inspectLocalServices();
    log('PASS');
    return json({ ok: true, ...result });
  }
  if (action === 'restart-service') {
    /* 🔒 Risponde PRIMA di programmare il riavvio vero — vedi il commento su
       `scheduleRestart` in repoOps.ts sul perché non si può fare il contrario. */
    log('PASS');
    const response = json({ ok: true, restarting: true, note: 'Riavvio avviato. Ricontrolla fra qualche secondo con inspect_local_services.' });
    platform?.waitUntil(Promise.resolve().then(() => scheduleRestart()));
    if (!platform) scheduleRestart();
    return response;
  }

  return json({ error: 'azione non disponibile' }, 400);
}

export const config = { path: '/api/repo-ops' };
