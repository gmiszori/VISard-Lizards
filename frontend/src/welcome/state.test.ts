import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAppStorage, nextWelcomeStep, welcomeStep } from './state.ts';

test('new visitors start with install guidance and continue after onboarding', () => {
  assert.equal(welcomeStep(null, false), 'install');
  assert.equal(nextWelcomeStep('install'), 'personalise');
  assert.equal(welcomeStep('personalise', false), 'personalise');
  assert.equal(welcomeStep('settings', true), 'settings');
  assert.equal(nextWelcomeStep('settings'), 'finish');
  assert.equal(nextWelcomeStep('finish'), 'done');
  assert.equal(welcomeStep('done', false), null);
  assert.equal(welcomeStep(null, true), null);
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
