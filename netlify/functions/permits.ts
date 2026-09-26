/* ============================================================================
   /api/permits — turns a verified user "yes" into a server-side permit
   (vNext Step 8).

   Used by the browser orchestrator for write tools the manifest marks
   `confirmation: 'permit'` (today: repo_write/repo_edit after the `codice`
   question). The server verifies the exchange itself — the current message
   must be an affirmative answer and the previous assistant message must carry
   the exact manifest question — before issuing a short-lived permit bound to
   the turn id. Model tools cannot reach this endpoint.
   ========================================================================= */
import { authorize, denied, json } from './_shared/auth';
import { issueActionPermit, verifiedConfirmation } from './_shared/actionPermits';

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method !== 'POST') return json({ error: 'solo POST' }, 405);
  let body: { action?: unknown; requestId?: unknown; userText?: unknown; previousAssistantText?: unknown };
  try { body = await request.json() as typeof body; } catch { return json({ error: 'body non leggibile' }, 400); }
  const requestId = typeof body.requestId === 'string' ? body.requestId.slice(0, 160) : '';
  const userText = typeof body.userText === 'string' ? body.userText.slice(0, 2_000) : '';
  const previous = typeof body.previousAssistantText === 'string' ? body.previousAssistantText.slice(-20_000) : '';
  if (body.action !== 'codice' || !requestId) return json({ error: 'permesso non valido' }, 400);
  if (!verifiedConfirmation('codice', userText, previous)) return json({ error: 'CONFIRMATION_NOT_VERIFIED', code: 'CONFIRMATION_NOT_VERIFIED' }, 409);
  await issueActionPermit(requestId, 'codice');
  return json({ ok: true, permitId: requestId });
}

export const config = { path: '/api/permits' };
