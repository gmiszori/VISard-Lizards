import assert from 'node:assert/strict';
import test from 'node:test';
import type { CampusId } from '../data/canteens';
import { seedProfile } from './seed.ts';

const campuses = ['zentrum', 'hoenggerberg', 'irchel'] as CampusId[];
const profile = { v: 1, lang: 'en', campus: 'zentrum', campusSecondary: ['irchel'], theme: 'light', diet: 'vegan', hard: ['no_pork', 'halal'],
  soft: [], dislikes: [], priority: ['price', 'taste', 'speed', 'health'], priceTier: 'student', maxPrice: 9, priceMode: 'hard',
  lunchTime: null, notifyDaily: false, mensaRatings: [] };

test('replaying onboarding starts from the saved answers, with the price category from Settings', () => {
  const seed = seedProfile(profile, { priceTier: 'external', locations: ['zentrum', 'irchel'] }, campuses);
  assert.equal(seed.priceTier, 'external');
  assert.equal(seed.diet, 'vegan');
  assert.deepEqual(seed.hard, ['no_pork']); // the removed halal answer is dropped
  assert.deepEqual(seed.priority, ['price', 'taste', 'speed', 'health']);
  assert.equal(seed.maxPrice, 9);
  assert.equal(seed.priceMode, 'hard');
  assert.equal(seed.campus, 'zentrum');
  assert.deepEqual(seed.campusSecondary, ['irchel']);
});

test('campuses changed in Settings win over the saved profile', () => {
  const seed = seedProfile(profile, { priceTier: 'student', locations: ['hoenggerberg', 'irchel'] }, campuses);
  assert.equal(seed.campus, 'hoenggerberg');
  assert.deepEqual(seed.campusSecondary, ['irchel']);
});

test('no saved profile, or an unreadable one, seeds nothing', () => {
  for (const saved of [null, undefined, 'x', [], {}, { v: 2 }])
    assert.deepEqual(seedProfile(saved, { priceTier: 'external', locations: ['zentrum'] }, campuses), {});
});

test('invalid saved values are left to the defaults', () => {
  const seed = seedProfile({ v: 1, campus: 'mars', campusSecondary: 'x', diet: 'breatharian', hard: 'no_pork', priceMode: 'maybe', maxPrice: -3,
    priority: ['taste', 'taste', 'price', 'health'] }, { priceTier: 'student', locations: [] }, campuses);
  assert.deepEqual(seed, { priceTier: 'student' });
});
