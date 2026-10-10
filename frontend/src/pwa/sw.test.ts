import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

/** Runs public/sw.js against a fake browser: in-memory caches, a scripted network and recorded listeners. */
function loadWorker(network: (url: string) => Promise<{ ok: boolean; clone(): unknown; body: string }>) {
  const stores = new Map<string, Map<string, unknown>>();
  const listeners: Record<string, (event: any) => void> = {};
  const cacheApi = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async add(url: string) { store.set(url, { ok: true, body: `cached:${url}`, clone() { return this; } }); },
        async put(request: { url: string }, response: unknown) { store.set(request.url, response); },
        async match(request: { url: string } | string) { return store.get(typeof request === 'string' ? request : request.url); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  const sandbox: Record<string, unknown> = {
    URL, AbortController, setTimeout, clearTimeout, Response: { error: () => ({ error: true }) },
    caches: cacheApi,
    fetch: (request: { url: string }) => network(request.url),
    self: {
      location: { origin: 'https://campuseats.test' },
      addEventListener: (type: string, handler: (event: any) => void) => { listeners[type] = handler; },
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
  };
  vm.runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), sandbox);
  const respond = async (request: Record<string, unknown>) => {
    let result: Promise<any> | undefined;
    listeners.fetch!({ request, respondWith: (promise: Promise<any>) => { result = promise; } });
    return result ? await result : undefined;
  };
  return { stores, listeners, respond };
}

const ok = (body: string) => ({ ok: true, body, clone() { return this; } });
const navigate = (path: string) => ({ method: 'GET', mode: 'navigate', url: `https://campuseats.test${path}` });

test('PWA: a page comes from the network and the copy is kept for later', async () => {
  const worker = loadWorker(async () => ok('fresh'));
  assert.equal((await worker.respond(navigate('/')))?.body, 'fresh');
  assert.equal((worker.stores.get('campuseats-pages-v1')!.get('https://campuseats.test/') as { body: string }).body, 'fresh');
});

test('PWA: offline, the last copy of the page is shown', async () => {
  let online = true;
  const worker = loadWorker(async () => { if (!online) throw new TypeError('Failed to fetch'); return ok('monday menu'); });
  await worker.respond(navigate('/canteen/polyterrasse'));
  online = false;
  assert.equal((await worker.respond(navigate('/canteen/polyterrasse')))?.body, 'monday menu');
});

test('PWA: offline and never visited, the offline page is shown', async () => {
  const worker = loadWorker(async () => { throw new TypeError('Failed to fetch'); });
  await worker.listeners.install!({ waitUntil: (promise: Promise<unknown>) => promise });
  assert.equal((await worker.respond(navigate('/settings')))?.body, 'cached:/offline.html');
});

test('PWA: an error page from the server is not kept as the offline copy', async () => {
  const worker = loadWorker(async () => ({ ok: false, body: 'boom', clone() { return this; } }));
  await worker.respond(navigate('/'));
  assert.equal(worker.stores.get('campuseats-pages-v1')!.has('https://campuseats.test/'), false);
});

test('PWA: built assets come from the cache once they were fetched', async () => {
  let calls = 0;
  const worker = loadWorker(async () => { calls++; return ok('js'); });
  const asset = { method: 'GET', mode: 'no-cors', url: 'https://campuseats.test/_astro/app.abc123.js' };
  await worker.respond(asset);
  await worker.respond(asset);
  assert.equal(calls, 1);
});

test('PWA: the backend, other sites and non-GET requests are left alone', async () => {
  const worker = loadWorker(async () => ok('x'));
  assert.equal(await worker.respond({ method: 'GET', mode: 'cors', url: 'http://localhost:8080/api/meals' }), undefined);
  assert.equal(await worker.respond({ method: 'POST', mode: 'cors', url: 'https://campuseats.test/api/ratings' }), undefined);
  assert.equal(await worker.respond({ method: 'GET', mode: 'cors', url: 'https://campuseats.test/data.json' }), undefined);
});

test('PWA: activating removes old CampusEats caches only', async () => {
  const worker = loadWorker(async () => ok('x'));
  worker.stores.set('campuseats-pages-v0', new Map()); worker.stores.set('other-app', new Map()); worker.stores.set('campuseats-pages-v1', new Map());
  await worker.listeners.activate!({ waitUntil: (promise: Promise<unknown>) => promise });
  assert.deepEqual([...worker.stores.keys()].sort(), ['campuseats-pages-v1', 'other-app']);
});
