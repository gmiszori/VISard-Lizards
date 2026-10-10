import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAppCaches, clearAppStorage, nextWelcomeStep, welcomeStep } from './state.ts';

test('new visitors see menus; explicitly started tours can still resume', () => {
  assert.equal(welcomeStep(null, false), null);
  assert.equal(welcomeStep('install', false), null);
  assert.equal(nextWelcomeStep('install'), 'personalise');
  assert.equal(welcomeStep('personalise', false), 'personalise');
  assert.equal(welcomeStep('settings', true), 'settings');
  assert.equal(nextWelcomeStep('settings'), 'finish');
  assert.equal(nextWelcomeStep('finish'), 'done');
  assert.equal(welcomeStep('done', false), null);
  assert.equal(welcomeStep(null, true), null);
});

test('new-user reset removes the PWA cache without touching unrelated caches', async () => {
  const entries = new Set(['unieats-shell-v2', 'campuseats-old', 'another-app']);
  await clearAppCaches({ keys: async () => [...entries], delete: async key => entries.delete(key) } as CacheStorage);
  assert.deepEqual([...entries], ['another-app']);
});

test('new-user reset removes all app storage but preserves unrelated origin data', () => {
  const values = new Map([['campuseats-profile', '{}'], ['campuseats-rating-anon-id', 'anon'],
    ['campuseats-welcome-tour', 'done'], ['other-app-setting', 'keep']]);
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    removeItem(key: string) { values.delete(key); },
  };
  clearAppStorage(storage);
  assert.deepEqual([...values], [['other-app-setting', 'keep']]);
});
