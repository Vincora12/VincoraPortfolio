import { getStore } from '@netlify/blobs';
import { authorize, denied, json } from './_shared/auth';

const store = () => getStore('vinzmon-push');

export default async function push(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return json({ error: 'notifiche non configurate' }, 503);

  if (request.method === 'GET') return json({ publicKey });
  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);

  const subscription = (await request.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!subscription.endpoint?.startsWith('https://') || !subscription.keys?.p256dh || !subscription.keys.auth) {
    return json({ error: 'iscrizione non valida' }, 400);
  }
  await store().setJSON('subscription', subscription);
  return json({ ok: true });
}

export const config = { path: '/api/push' };
