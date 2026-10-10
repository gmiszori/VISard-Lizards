import assert from 'node:assert/strict';
import test from 'node:test';
import { ALLERGENS, allergenIds, allergenLabel, conflicts, isAllergenId, normalizeAvoid } from './allergens.ts';

test('allergens: all 14 EU allergens, each with an English and a German label', () => {
  assert.equal(ALLERGENS.length, 14);
  assert.equal(new Set(ALLERGENS.map(a => a.id)).size, 14);
  for (const a of ALLERGENS) { assert.ok(a.en && a.de, a.id); }
});

test('allergens: labels in both languages, unknown ids shown as they are', () => {
  assert.equal(allergenLabel('nuts', 'en'), 'Tree nuts');
  assert.equal(allergenLabel('nuts', 'de'), 'Schalenfrüchte');
  assert.equal(allergenLabel('milk', 'de'), 'Milch');
  assert.equal(allergenLabel('kiwi', 'de'), 'kiwi');
});

test('allergens: display labels in either language map back to ids', () => {
  assert.deepEqual(allergenIds(['Gluten', 'Tree nuts', 'Milch', 'Sulphites']), ['gluten', 'nuts', 'milk', 'sulphites']);
  assert.deepEqual(allergenIds(['milk', 'Milk', ' MILK ']), ['milk'], 'no duplicates');
  assert.deepEqual(allergenIds(['Pineapple', 3, null, undefined, {}]), [], 'unknown and non-text entries are dropped');
});

test('allergens: a dish conflicts only with what the user avoids', () => {
  assert.deepEqual(conflicts(['gluten', 'milk', 'celery'], ['milk', 'nuts']), ['milk']);
  assert.deepEqual(conflicts(['gluten'], []), []);
  assert.deepEqual(conflicts([], ['gluten']), [], 'a dish with no listed allergens has no conflict (the page still warns that none are listed)');
});

test('allergens: a stored avoid list is cleaned', () => {
  assert.deepEqual(normalizeAvoid(['gluten', 'gluten', 'kiwi', 5, 'nuts']), ['gluten', 'nuts']);
  for (const bad of [null, undefined, 'gluten', 5, {}, true]) assert.deepEqual(normalizeAvoid(bad), []);
  assert.equal(isAllergenId('peanuts'), true);
  assert.equal(isAllergenId('Peanuts'), false);
});

import { allergenNotice } from './notice.ts';
test('allergens: the hidden-dishes notice reads naturally in both languages', () => {
  assert.equal(allergenNotice(1, ['Gluten'], 'en'), '1 dish hidden: it contains Gluten.');
  assert.equal(allergenNotice(3, ['Gluten', 'Milk'], 'en'), '3 dishes hidden: they contain Gluten, Milk.');
  assert.equal(allergenNotice(1, ['Milch'], 'de'), '1 Gericht ausgeblendet: enthält Milch.');
  assert.equal(allergenNotice(2, ['Milch', 'Sellerie'], 'de'), '2 Gerichte ausgeblendet: enthalten Milch, Sellerie.');
});
