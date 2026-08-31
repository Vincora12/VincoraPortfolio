function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function enablePushNotifications(token: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.ready;
  const keyResponse = await fetch('/api/push', { headers: { authorization: `Bearer ${token}` } });
  if (!keyResponse.ok) return false;
  const { publicKey } = (await keyResponse.json()) as { publicKey?: string };
  if (!publicKey) return false;

  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationKey(publicKey),
  });
  const saved = await fetch('/api/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(subscription),
  });
  return saved.ok;
}

export async function enableEvolutionNotifications(token: string): Promise<void> {
  await enablePushNotifications(token);
}

/** Opt-in esplicito per gli insight delle Machines. */
export async function enableMachineNotifications(token: string): Promise<boolean> {
  return enablePushNotifications(token);
}

export async function machineNotificationsEnabled(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || Notification.permission !== 'granted') return false;
  return Boolean(await (await navigator.serviceWorker.ready).pushManager.getSubscription());
}

export async function disableMachineNotifications(token: string): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (!subscription) return true;
  const response = await fetch('/api/push', { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
  if (response.ok) await subscription.unsubscribe();
  return response.ok;
}
