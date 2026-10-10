import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSearch } from './dishSearch.ts';

const dishes = [
  { name: 'Poulet Curry', text: 'Polyterrasse Poulet Curry with rice', diet: 'meat' },
  { name: 'Kartoffel Suppe', text: 'Irchel Kartoffel Suppe', diet: 'vegan' },
  { name: 'Tofu Bowl', text: 'Irchel Tofu Bowl', diet: 'vegan' },
  { name: 'Seitan Bowl', text: 'Irchel Seitan Bowl', diet: 'vegan' },
  { name: 'Shrimp Bowl', text: 'Irchel Shrimp Bowl', diet: 'meat' },
  { name: 'Gemüse Pasta', text: 'Irchel Gemüse Pasta mit Käse', diet: 'vegetarian' },
];

const find = (query: string) => dishes.filter(dish => createSearch(query).test(dish.text, dish.diet)).map(dish => dish.name);

test('searches each word across canteen, dish and ingredient text', () => {
  assert.deepEqual(find('polyterrasse curry'), ['Poulet Curry']);
  assert.deepEqual(find('curry polyterrasse'), ['Poulet Curry']);
  assert.deepEqual(find('irchel cheese'), ['Gemüse Pasta']);
});

test('matches a small set of actual German/English equivalents and umlaut spellings', () => {
  assert.deepEqual(find('chicken'), ['Poulet Curry']);
  assert.deepEqual(find('potato'), ['Kartoffel Suppe']);
  assert.deepEqual(find('kaese'), ['Gemüse Pasta']);
  assert.deepEqual(find('kase'), ['Gemüse Pasta']);
  assert.deepEqual(find('chick'), ['Poulet Curry']);
});

test('diet terms use the label, including vegetarian meals that are vegan', () => {
  assert.deepEqual(find('vegan'), ['Kartoffel Suppe', 'Tofu Bowl', 'Seitan Bowl']);
  assert.deepEqual(find('vegan potato'), ['Kartoffel Suppe']);
  assert.deepEqual(find('vegane kartoffeln'), ['Kartoffel Suppe']);
  assert.deepEqual(find('meat'), ['Poulet Curry', 'Shrimp Bowl']);
  assert.ok(find('vegetarisch').includes('Kartoffel Suppe'));
  assert.ok(find('vegetarisch').includes('Gemüse Pasta'));
});

test('related foods and guesses do not masquerade as exact matches', () => {
  assert.deepEqual(find('tofu'), ['Tofu Bowl']);
  assert.deepEqual(find('fish'), []);
  assert.deepEqual(find('chiken'), []);
  assert.deepEqual(find('poulet'), ['Poulet Curry']);
});

test('a simple plural does not hide a dish', () => {
  assert.deepEqual(createSearch('bowls').test('Tofu Bowl', 'vegan'), true);
});

test('empty and connecting-word queries are inactive', () => {
  assert.equal(createSearch(' with und ').active, false);
  assert.equal(createSearch('').test('anything'), true);
});
