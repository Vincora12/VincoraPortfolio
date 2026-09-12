import { authorize, denied, json } from './_shared/auth';
import { loadNotificationPrefs, saveNotificationPrefs } from './_shared/notificationPrefs';

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) return denied();
  if (request.method === 'GET') return json(await loadNotificationPrefs());
  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }
  return json(await saveNotificationPrefs(body));
}

export const config = { path: '/api/notification-prefs' };
