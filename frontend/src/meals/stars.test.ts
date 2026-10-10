import test from 'node:test';
import assert from 'node:assert/strict';
import { starName, matchesMeal, normalizedName } from './stars.ts';
test('stores plain names and matches returning dishes with different sides', () => {
  for (const name of ['Schnitzel with pommes', 'Schnitzel mit Pommes', 'Schnitzel avec frites', 'Schnitzel con patate']) assert.equal(starName(name), 'Schnitzel');
  assert.equal(matchesMeal('Schnitzel with rice', ['schnitzel']), true);
  assert.equal(normalizedName('  SCHNITZEL  with  rice '), 'schnitzel with rice');
});
test('dish names use word boundaries and escape regex characters', () => {
  assert.equal(matchesMeal('Champignon rice', ['Ham']), false);
  assert.equal(matchesMeal('Chicken with rice', ['']), false);
  assert.equal(matchesMeal('C++ special with rice', ['C++ special']), true);
  assert.equal(matchesMeal('Älplermagronen mit Apfelmus', ['Älplermagronen']), true);
  assert.equal(matchesMeal('Pasta (vegan)', ['Pasta (vegan)']), true);
});
