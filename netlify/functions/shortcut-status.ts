/* ============================================================================
   VINZ.LAB → SHORTCUT API (brief §11)

   «Do NOT try to mirror or manage the user's actual Apple Shortcuts list
   inside VINZ.LAB. […] What VINZ.LAB should show instead is a small
   "SHORTCUT API" inspector for the integration surface.»

   Autenticato con `VINZMON_TOKEN`, quello di sempre — non quello delle
   Shortcut. Chi guarda questa schermata sei tu, dentro l'app già aperta; il
   secondo token resta un segreto che questa pagina non deve mai maneggiare,
   tantomeno mostrare.
   ========================================================================= */

import { authorize, denied, json } from './_shared/auth';
import { SHORTCUT_ACTION_ORDER, SHORTCUT_ACTIONS } from './_shared/shortcutActions';
import { recentShortcutCalls } from './_shared/shortcutLog';

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  if (request.method !== 'GET') return json({ error: 'solo GET' }, 405);

  const token = process.env.VINZMON_SHORTCUT_TOKEN;
  const recent = await recentShortcutCalls();

  return json({
    /* Mai il valore, solo se c'è ed è abbastanza lungo — lo stesso `present`
       che `setup.ts` già usa per le chiavi dei fornitori. */
    tokenConfigured: Boolean(token && token.length >= 24),
    actions: SHORTCUT_ACTION_ORDER.map((id) => SHORTCUT_ACTIONS[id]),
    recent,
    endpoint: '/api/shortcut',
  });
}

export const config = { path: '/api/shortcut-status' };
