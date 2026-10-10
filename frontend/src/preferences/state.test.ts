import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences, readPreferences, readFavourites } from './state.ts';
test('invalid stored shapes and boolean strings cannot break or silently enable filters', () => {
  for (const raw of [null, [], 'wrong', 12, { vegan: 'false', vegetarian: null, meat: [], compact: {}, openOnly: 'yes', priceTier: 'admin', locations: [null, 123, {}, 'invalid'] }]) {
    assert.deepEqual(normalizePreferences(raw), { vegan: true, vegetarian: true, meat: true, viewMode: 'standard', openOnly: false, locations: ['zentrum', 'hoenggerberg', 'irchel', 'oerlikon', 'basel', 'toni-areal', 'europaallee'], priceTier: 'student', devMode: false });
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
