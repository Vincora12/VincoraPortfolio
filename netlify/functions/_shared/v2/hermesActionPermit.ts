import { getStore } from '../localStore';

export type HermesWriteAction = 'meal' | 'workout' | 'weight';

interface Permit {
  action: HermesWriteAction;
  expiresAt: number;
}

const TTL_MS = 5 * 60_000;
const store = () => getStore({ name: 'vinzmon-hermes-action-permits', consistency: 'strong' });

export async function issueHermesActionPermit(requestId: string, action: HermesWriteAction): Promise<void> {
  if (!requestId || requestId.length > 160) throw new Error('HERMES_PERMIT_INVALID');
  await store().setJSON(requestId, { action, expiresAt: Date.now() + TTL_MS } satisfies Permit);
}

/** One-shot by design: even a repeated MCP call in the same agent run cannot duplicate a write. */
export async function consumeHermesActionPermit(requestId: string, action: HermesWriteAction): Promise<boolean> {
  if (!requestId || requestId.length > 160) return false;
  const permit = await store().get(requestId, { type: 'json' }) as Permit | null;
  await store().delete(requestId);
  return Boolean(permit && permit.action === action && permit.expiresAt >= Date.now());
}
