// CampusEats service worker. Keeps the app usable on a bad connection (queues, basements, trains):
//  - pages: network first (menus change daily), the last copy that worked is used when offline
//  - built assets and icons: cache first (file names contain a hash, so a new build never reuses old ones)
//  - the backend API and anything from other sites is never cached
const VERSION = 'v1';
const PAGES = `campuseats-pages-${VERSION}`;
const ASSETS = `campuseats-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(PAGES).then(cache => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('campuseats-') && ![PAGES, ASSETS].includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') { event.respondWith(pageFirstFromNetwork(request)); return; }
  if (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/icons/')) event.respondWith(assetFromCache(request));
});

async function pageFirstFromNetwork(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetchWithTimeout(request, PAGE_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match(OFFLINE_URL)) ?? Response.error();
  }
}

async function assetFromCache(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}
