self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'VINZ.MON', body: 'Ho notato qualcosa.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-180.png?v=2',
      badge: '/icon-180.png?v=2',
      tag: data.url?.includes('pendingInsight') ? 'vinzmon-machine-insight' : 'vinzmon-evolution-ready',
      data: { url: data.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients[0];
      if (open) return open.focus().then(() => open.navigate?.(url));
      return self.clients.openWindow(url);
    }),
  );
});
