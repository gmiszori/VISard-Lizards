// UniEats service worker: only shows push notifications for starred dishes (src/push/push.ts).
// It does not cache anything; the app works the same without it.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { /* not JSON: show the default text */ }
  const title = typeof message.title === 'string' ? message.title : 'UniEats';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof message.body === 'string' ? message.body : '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    // One notification per tag: a new day's message replaces yesterday's instead of piling up.
    tag: typeof message.tag === 'string' ? message.tag : 'unieats',
    data: { url: typeof message.url === 'string' && message.url.startsWith('/') ? message.url : '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      return open.navigate(url);
    }
    return self.clients.openWindow(url);
  })());
});
