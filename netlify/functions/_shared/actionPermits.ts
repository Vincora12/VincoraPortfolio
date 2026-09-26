/* ============================================================================
   ACTION PERMITS — server-side proof that the user said yes (vNext Step 8)

   Generalises the one-shot permit first built for the CEREBRO/Hermes health
   writes (formerly v2/hermesActionPermit.ts) to every tool the canonical
   manifest marks `confirmation: 'permit'`.

   A permit is issued ONLY after the server itself verified the confirmation
   exchange: the user's current message is an affirmative answer AND the
   previous assistant message contains the exact question the manifest
   declares for that action. It is scoped to one request id, expires after a
   few minutes, and has a use budget (1 for structured writes; a small number
   for a confirmed code edit, which may touch several files). The executor
   consumes it before writing; a missing, expired, exhausted or mismatched
   permit is refused.
   ========================================================================= */
import { getStore } from './localStore';
import { CONFIRMATION_QUESTIONS } from '../../../src/mon-core/toolManifest';

export type PermitAction = 'meal' | 'workout' | 'weight' | 'codice';

interface Permit { action: PermitAction; expiresAt: number; usesLeft: number }

const TTL_MS = 5 * 60_000;
const USES: Record<PermitAction, number> = { meal: 1, workout: 1, weight: 1, codice: 8 };
const store = () => getStore({ name: 'vinzmon-action-permits', consistency: 'strong' });

/** Affirmative answers, the same set the chat's confirmation state machine accepts. */
export const confirmsText = (text: string) => /^\s*(?:s[iì]|yes|confermo|ok(?:ay)?|va bene|esatto|corretto|vai(?:\s+(?:pure|inserisci|registra|procedi))?|inserisci|registra|procedi|fallo|segna(?:lo)?|modifica)(?=\s|[.!?,;:]|$)/i.test(text);

/** Does the previous assistant message carry the exact question for this action? */
export function questionAskedFor(action: PermitAction, previousAssistantText: string): boolean {
  switch (action) {
    case 'meal': return CONFIRMATION_QUESTIONS.pasto.test(previousAssistantText);
    case 'workout': return previousAssistantText.includes(CONFIRMATION_QUESTIONS.allenamento);
    case 'weight': return previousAssistantText.includes(CONFIRMATION_QUESTIONS.peso);
    case 'codice': return previousAssistantText.includes(CONFIRMATION_QUESTIONS.codice);
  }
}

/** The server-side verification that must precede every permit. */
export function verifiedConfirmation(action: PermitAction, userText: string, previousAssistantText: string): boolean {
  return confirmsText(userText) && questionAskedFor(action, previousAssistantText);
}

export async function issueActionPermit(requestId: string, action: PermitAction): Promise<void> {
  if (!requestId || requestId.length > 160) throw new Error('PERMIT_INVALID');
  await store().setJSON(requestId, { action, expiresAt: Date.now() + TTL_MS, usesLeft: USES[action] } satisfies Permit);
}

/** Consumes one use. Even a repeated call in the same run cannot exceed the budget. */
export async function consumeActionPermit(requestId: string, action: PermitAction): Promise<boolean> {
  if (!requestId || requestId.length > 160) return false;
  const permit = await store().get(requestId, { type: 'json' }) as Permit | null;
  const valid = Boolean(permit && permit.action === action && permit.expiresAt >= Date.now() && permit.usesLeft > 0);
  if (!permit) return false;
  const usesLeft = valid ? permit.usesLeft - 1 : 0;
  if (usesLeft > 0 && permit.expiresAt >= Date.now()) await store().setJSON(requestId, { ...permit, usesLeft });
  else await store().delete(requestId);
  return valid;
}
