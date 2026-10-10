import test from 'node:test';
import assert from 'node:assert/strict';
import { distancePromptSeen, markDistancePromptSeen, saveDistanceDefault } from './near-me-preference.ts';
import { PREFERENCES_KEY, readPreferences } from '../preferences/state.ts';

test('distance default is opt-in and persists with other settings', () => {
  const values = new Map<string, string>([[PREFERENCES_KEY, JSON.stringify({ viewMode: 'list', priceTier: 'worker' })]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  assert.equal(readPreferences(storage).distanceDefault, false);
  assert.equal(saveDistanceDefault(true, storage), true);
  assert.equal(readPreferences(storage).distanceDefault, true);
  assert.equal(readPreferences(storage).viewMode, 'list');
  assert.equal(readPreferences(storage).priceTier, 'worker');
  assert.equal(saveDistanceDefault(false, storage), true);
  assert.equal(readPreferences(storage).distanceDefault, false);
  assert.equal(distancePromptSeen(storage), false);
  markDistancePromptSeen(storage);
  assert.equal(distancePromptSeen(storage), true);
});

test('blocked storage does not make distance sorting look persistent', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(saveDistanceDefault(true, blocked), false);
  assert.equal(distancePromptSeen(blocked), false);
  assert.doesNotThrow(() => markDistancePromptSeen(blocked));
});
