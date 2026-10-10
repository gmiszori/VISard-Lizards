import assert from 'node:assert/strict';
import test from 'node:test';
import { createOnboardingStore, savedTheme } from './onboardingStore.ts';
import { defaults } from './profile.ts';

test('system theme is read from storage and retained in an onboarding draft', () => {
  const data = new Map<string, string>([
    ['campuseats-theme', 'system'],
    ['campuseats-onboarding', JSON.stringify({ profile: defaults('zentrum', 'en', 'system'), step: 3, picks: [], ratingScale: 5 })],
  ]);
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  } });
  try {
    assert.equal(savedTheme(), 'system');
    const store = createOnboardingStore(['zentrum'], 6);
    assert.equal(store.state.profile.theme, 'system');
    assert.equal(store.state.step, 3);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
