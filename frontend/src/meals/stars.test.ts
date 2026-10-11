import test from 'node:test';
import assert from 'node:assert/strict';
import { starName, matchesMeal, normalizedName } from './stars.ts';

test('saved names still match after scraped separators are cleaned', () => {
  assert.equal(matchesMeal('SCHWAMMERL SCHNITTLAUCH RAHMSAUCE', ['Schwammerl Schnittlauch |Rahmsauce']), true);
});
test('stores the full dish name with tidy whitespace', () => {
  assert.equal(starName('  Schnitzel   with pommes '), 'Schnitzel with pommes');
  assert.equal(normalizedName('  SCHNITZEL  with  rice '), 'schnitzel with rice');
});
test('matches the same dish regardless of case and spacing', () => {
  assert.equal(matchesMeal('PANIERTES SCHNITZEL', ['Paniertes  Schnitzel']), true);
  assert.equal(matchesMeal('Pasta (vegan)', ['Pasta (vegan)']), true);
  assert.equal(matchesMeal('Chicken with rice', ['']), false);
  assert.equal(matchesMeal('', ['']), false);
});
test('starring one dish never stars a different dish that shares words', () => {
  const stars = [starName('Ground Meat with Horn-Shaped Noodles')];
  assert.equal(matchesMeal('Ground Meat with Horn-Shaped Noodles', stars), true);
  assert.equal(matchesMeal('Vegan Ground Meat with Horn-Shaped Pasta', stars), false);
  assert.equal(matchesMeal('Ground Meat with Horn-Shaped Pasta', stars), false);
  assert.equal(matchesMeal('Vegan Ground Meat with Horn-Shaped Pasta', ['PASTA']), false);
  assert.equal(matchesMeal('Planted Bowl', ['Rice Up! Bowl']), false);
  assert.equal(matchesMeal('Schnitzel with Cream Sauce', ['Schnitzel']), false);
});
