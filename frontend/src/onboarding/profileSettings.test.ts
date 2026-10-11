import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readProfileSettings, writeProfileSettings } from './profileSettings.ts';

test('settings budget updates the saved profile and onboarding draft', () => {
  const data = new Map<string, string>([
    ['campuseats-profile', JSON.stringify({ v: 1, maxPrice: null, priceMode: 'soft', diet: 'vegan' })],
    ['campuseats-onboarding', JSON.stringify({ step: 3, profile: { maxPrice: null, priceMode: 'soft', diet: 'vegan' } })],
  ]);
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };

  writeProfileSettings({ maxPrice: 12.5, priceMode: 'hard' }, storage);
  assert.deepEqual([readProfileSettings(storage).maxPrice, readProfileSettings(storage).priceMode], [12.5, 'hard']);
  assert.deepEqual(JSON.parse(data.get('campuseats-profile')!),
    { v: 1, maxPrice: 12.5, priceMode: 'hard', diet: 'vegan' });
  assert.deepEqual(JSON.parse(data.get('campuseats-onboarding')!),
    { step: 3, profile: { maxPrice: 12.5, priceMode: 'hard', diet: 'vegan' } });
});

test('a budget chosen before onboarding remains available', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };

  writeProfileSettings({ maxPrice: 10, priceMode: 'soft' }, storage);
  assert.deepEqual(readProfileSettings(storage), { maxPrice: 10, priceMode: 'soft' });
});
