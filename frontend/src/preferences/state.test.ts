import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences, readPreferences, readFavourites } from './state.ts';
test('invalid stored shapes and boolean strings cannot break or silently enable filters', () => {
  for (const raw of [null, [], 'wrong', 12, { vegan: 'false', vegetarian: null, meat: [], compact: {}, openOnly: 'yes', priceTier: 'admin', locations: [null, 123, {}, 'invalid'] }]) {
    assert.deepEqual(normalizePreferences(raw), { vegan: true, vegetarian: true, meat: true, compact: false, openOnly: false, locations: ['zentrum', 'hoenggerberg', 'irchel'], priceTier: 'student' });
  }
});
test('normalizes legacy locations, deduplicates, and preserves intentional empty selection', () => {
  assert.deepEqual(normalizePreferences({ locations: ['ETH Zentrum', 'UZH Zentrum', 'irchel', null, 'invalid'] }).locations, ['zentrum', 'irchel']);
  assert.deepEqual(normalizePreferences({ locations: [] }).locations, []);
  assert.deepEqual(normalizePreferences({ campus: 'UZH Irchel' }).locations, ['irchel']);
  assert.equal(normalizePreferences({ priceTier: 'worker' }, 'external').priceTier, 'worker');
  assert.equal(normalizePreferences({}, 'external').priceTier, 'external');
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
