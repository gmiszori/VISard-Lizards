// UniEats service worker: push notifications for starred dishes (src/push/push.ts)
// plus an offline cache for visited and prewarmed pages.

// v6 refreshes the offline page, which now translates itself. v5 lets push start even when an optional offline page cannot be fetched during installation.
const CACHE_NAME = 'unieats-shell-v6';
const PRECACHE_URLS = ['/', '/settings', '/onboarding', '/offline.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

/**
 * The server answers /settings with a redirect to /settings/, and fetch() follows it, so the response is marked
 * "redirected". A redirected response must not be used to answer a page navigation: the browser rejects it and the
 * offline visit showed the fallback (the home page) instead of the page. Cache a plain copy instead.
 */
async function plainCopy(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // A protected or temporarily unavailable page must not prevent the push worker from activating.
    await Promise.all(PRECACHE_URLS.map(async url => {
      try {
        const response = await fetch(url);
        if (!response.ok || new URL(response.url, self.location.origin).origin !== self.location.origin) return;
        await cache.put(url, await plainCopy(response));
      } catch { /* Offline cache is best-effort; push still needs an active worker. */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function putInCache(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, await plainCopy(response.clone()));
  return response;
}

async function warmUrls(urls) {
  const uniqueUrls = [...new Set(urls)]
    .map((value) => {
      try { return new URL(value, self.location.origin); } catch { return null; }
    })
    .filter((url) => url && url.origin === self.location.origin && !url.pathname.startsWith('/api/'));
  await Promise.all(uniqueUrls.map(async (url) => {
    try { await putInCache(url.pathname + url.search, await fetch(url.href)); }
    catch { /* offline or blocked URL: skip */ }
  }));
}

self.addEventListener('message', event => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) return;
  event.waitUntil(warmUrls(data.urls));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await putInCache(request, await fetch(request));
      } catch {
        const cache = await caches.open(CACHE_NAME);
        // "/settings/" and "/settings" are the same page; pages are cached under either spelling.
        const otherSpelling = url.pathname.length > 1 ? (url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : `${url.pathname}/`) : null;
        return await cache.match(request)
          || await cache.match(url.pathname)
          || (otherSpelling ? await cache.match(otherSpelling) : undefined)
          || await cache.match('/')
          || await cache.match('/offline.html')
          || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      event.waitUntil(fetch(request).then(response => putInCache(request, response)).catch(() => {}));
      return cached;
    }
    try {
      return await putInCache(request, await fetch(request));
    } catch {
      return Response.error();
    }
  })());
});

self.addEventListener('push', event => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { /* not JSON: show the default text */ }
  const title = typeof message.title === 'string' ? message.title : 'UniEats';
  const options = {
    body: typeof message.body === 'string' ? message.body : '',
    icon: '/favicon.svg',
    // One notification per tag: a new day's message replaces yesterday's instead of piling up,
    // and still alerts again (renotify).
    tag: typeof message.tag === 'string' ? message.tag : 'unieats',
    renotify: true,
    data: { url: typeof message.url === 'string' && message.url.startsWith('/') ? message.url : '/' },
  };
  // Some browsers cannot use an SVG icon; show the notification without it rather than not at all.
  event.waitUntil(self.registration.showNotification(title, options).catch(() => {
    delete options.icon;
    return self.registration.showNotification(title, options);
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
