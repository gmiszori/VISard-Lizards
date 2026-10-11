import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences, readPreferences, readFavourites } from './state.ts';
test('invalid stored shapes and boolean strings cannot break or silently enable filters', () => {
  for (const raw of [null, [], 'wrong', 12, { vegan: 'false', vegetarian: null, meat: [], compact: {}, openOnly: 'yes', priceTier: 'admin', locations: [null, 123, {}, 'invalid'] }]) {
    assert.deepEqual(normalizePreferences(raw), { vegan: true, vegetarian: true, meat: true, viewMode: 'standard', openOnly: false, distanceDefault: false, locations: ['zentrum', 'hoenggerberg', 'irchel', 'oerlikon', 'basel', 'toni-areal', 'europaallee'], priceTier: 'student', devMode: false, mealCapitalization: 'title' });
  }
});
test('normalizes legacy locations, deduplicates, and preserves intentional empty selection', () => {
  assert.deepEqual(normalizePreferences({ locations: ['ETH Zentrum', 'UZH Zentrum', 'irchel', null, 'invalid'] }).locations, ['zentrum', 'irchel']);
  assert.deepEqual(normalizePreferences({ locations: [] }).locations, []);
  assert.deepEqual(normalizePreferences({ campus: 'UZH Irchel' }).locations, ['irchel']);
  assert.equal(normalizePreferences({ priceTier: 'worker' }, 'external').priceTier, 'worker');
  assert.equal(normalizePreferences({}, 'external').priceTier, 'external');
  assert.equal(normalizePreferences({ devMode: true }).devMode, true);
  assert.equal(normalizePreferences({ devMode: 'true' }).devMode, false);
  assert.equal(normalizePreferences({ distanceDefault: true }).distanceDefault, true);
  assert.equal(normalizePreferences({ distanceDefault: 'true' }).distanceDefault, false);
  assert.equal(normalizePreferences({ compact: true }).viewMode, 'compact');
  assert.equal(normalizePreferences({ compact: true, viewMode: 'list' }).viewMode, 'list');
  assert.equal(normalizePreferences({ viewMode: 'invalid' }).viewMode, 'standard');
});
test('malformed JSON, null profiles and unavailable storage have safe defaults', () => {
  const storage = { getItem: (key: string) => key === 'campuseats-profile' ? 'null' : '{bad' };
  assert.equal(readPreferences(storage).priceTier, 'student');
  assert.deepEqual(readFavourites(storage), []);
  const blocked = { getItem: () => { throw new Error('Denied'); } };
  assert.equal(readPreferences(blocked).vegan, true);
  assert.deepEqual(readFavourites(blocked), []);
  const invalid = { getItem: () => '[null,"polyterrasse",2,"polyterrasse",""]' };
  assert.deepEqual(readFavourites(invalid), ['polyterrasse']);
});

test('a previous distance opt-in is kept unless the new setting is explicit', () => {
  const storage = (distanceDefault?: boolean) => ({ getItem: (key: string) => key === 'campuseats-near-me' ? '1'
    : key === 'campuseats-preferences' ? JSON.stringify(distanceDefault === undefined ? {} : { distanceDefault }) : null });
  assert.equal(readPreferences(storage()).distanceDefault, true);
  assert.equal(readPreferences(storage(false)).distanceDefault, false);
});

test('all three food categories off is read as all on (nothing would be left to show)', () => {
  const read = normalizePreferences({ vegan: false, vegetarian: false, meat: false });
  assert.deepEqual([read.vegan, read.vegetarian, read.meat], [true, true, true]);
  const some = normalizePreferences({ vegan: false, vegetarian: false, meat: true });
  assert.deepEqual([some.vegan, some.vegetarian, some.meat], [false, false, true]);
});

test('meal capitalization persists valid choices and defaults old or invalid saves to title case', () => {
  for (const mode of ['upper', 'title', 'sentence', 'lower'] as const) {
    const storage = { getItem: (key: string) => key === 'campuseats-preferences' ? JSON.stringify({ mealCapitalization: mode }) : null };
    assert.equal(readPreferences(storage).mealCapitalization, mode);
  }
  for (const value of [undefined, null, 'invalid', true, {}]) {
    assert.equal(normalizePreferences({ mealCapitalization: value }).mealCapitalization, 'title');
  }
});
