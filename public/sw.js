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
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      /* 🔴 «mi manda notifiche anche se sono nell'app». Il server non può
         sapere se stai guardando — lo sa solo il telefono, qui. Se una
         finestra dell'app ha il fuoco, la notifica è rumore su una cosa che
         stai già vedendo.

         ⚠️ Si guarda SOLO `focused`, non `visibilityState`: sbagliare in un
         senso ti fa arrivare una notifica di troppo mentre sei nell'app —
         fastidio. Sbagliare nell'altro te la fa PERDERE mentre sei fuori, ed
         è esattamente il segnale che regge tutto il lavoro in background. Nel
         dubbio si notifica. */
      if (clients.some((client) => client.focused)) return undefined;
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-180.png?v=2',
        badge: '/icon-180.png?v=2',
        /* 🔒 L'etichetta del server vince: decide QUALI notifiche si
           sostituiscono a vicenda. Prima veniva scartata e finivano tutte
           sotto quella dei mon, così una risposta di chat cancellava
           dallo schermo un mon appena pronto. */
        tag: data.tag ?? (data.url?.includes('pendingInsight') ? 'vinzmon-machine-insight' : 'vinzmon-evolution-ready'),
        data: { url: data.url ?? '/' },
      });
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
