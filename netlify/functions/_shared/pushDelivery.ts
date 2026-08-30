import webpush from 'web-push';
import { getStore } from '@netlify/blobs';
import type { PendingInsight } from './machines';

export type StoredPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
const store = () => getStore('vinzmon-push');

export async function readPushSubscriptions(): Promise<StoredPushSubscription[]> {
  const current = await store().get('subscriptions', { type: 'json' }) as StoredPushSubscription[] | null;
  if (Array.isArray(current)) return current;
  const legacy = await store().get('subscription', { type: 'json' }) as StoredPushSubscription | null;
  return legacy ? [legacy] : [];
}

export async function savePushSubscription(subscription: StoredPushSubscription): Promise<void> {
  const subscriptions = (await readPushSubscriptions()).filter((item) => item.endpoint !== subscription.endpoint);
  subscriptions.push(subscription);
  await store().setJSON('subscriptions', subscriptions);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await store().setJSON('subscriptions', (await readPushSubscriptions()).filter((item) => item.endpoint !== endpoint));
}

export async function pushStatus(): Promise<{ configured: boolean; subscriptions: number }> {
  return { configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), subscriptions: (await readPushSubscriptions()).length };
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** Canonical Web Push sender shared by evolution and Machine Insights. */
export async function sendPushNotification(payload: PushPayload): Promise<{ sent: number; removed: number }> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { sent: 0, removed: 0 };
  webpush.setVapidDetails('mailto:vincenzotortora9517@gmail.com', publicKey, privateKey);
  const subscriptions = await readPushSubscriptions();
  let sent = 0; const invalid: string[] = [];
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify({ ...payload, url: payload.url ?? '/' }));
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) invalid.push(subscription.endpoint);
    }
  }
  if (invalid.length) await store().setJSON('subscriptions', subscriptions.filter((item) => !invalid.includes(item.endpoint)));
  return { sent, removed: invalid.length };
}

export function machineInsightPayload(insight: PendingInsight): PushPayload {
  return { title: 'VINZ.MON', body: 'Ho notato qualcosa.', url: `/?pendingInsight=${encodeURIComponent(insight.id)}`, tag: 'vinzmon-machine-insight' };
}
