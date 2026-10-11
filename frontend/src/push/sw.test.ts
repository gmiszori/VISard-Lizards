import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

test('an unavailable offline page does not prevent the push worker from installing', async () => {
  const listeners = new Map<string, (event: { waitUntil: (promise: Promise<unknown>) => void }) => void>();
  const cached: string[] = [];
  let activated = false;
  const worker = {
    location: { origin: 'https://unieats.example' },
    addEventListener: (name: string, listener: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void) => listeners.set(name, listener),
    skipWaiting: async () => { activated = true; },
  };
  const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
  runInNewContext(source, {
    self: worker, URL,
    caches: { open: async () => ({ put: async (url: string) => { cached.push(url); } }) },
    fetch: async (url: string) => {
      if (url === '/settings') throw new Error('login expired');
      return { ok: true, redirected: false, url: url === '/manifest.webmanifest'
        ? 'https://auth.example/login' : `https://unieats.example${url}` };
    },
  });
  let install: Promise<unknown> | undefined;
  listeners.get('install')?.({ waitUntil: promise => { install = promise; } });
  await install;
  assert.equal(activated, true);
  assert.equal(cached.includes('/settings'), false);
  assert.equal(cached.includes('/manifest.webmanifest'), false);
  assert.equal(cached.includes('/'), true);
});
