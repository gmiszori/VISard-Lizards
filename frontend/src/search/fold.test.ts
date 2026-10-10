import assert from 'node:assert/strict';
import test from 'node:test';
import { foldExpanded, foldPlain, matchesQuery } from './fold.ts';

test('search: umlauts and accents can be typed without them', () => {
  for (const query of ['zurich', 'Zürich', 'zuerich', 'ZÜRICH']) assert.ok(matchesQuery('Zürich-style Pork Stir-Fry', query), query);
  for (const query of ['spatzli', 'spaetzli', 'Spätzli']) assert.ok(matchesQuery('Rosemary Sauce, Spätzli, Green Beans', query), query);
  for (const query of ['hornli', 'hoernli', 'Hörnli']) assert.ok(matchesQuery("G`hacktes mit Hörnli", query), query);
  assert.ok(matchesQuery('Crème brûlée', 'creme brulee'));
});

test('search: ß and the German digraphs fold both ways', () => {
  assert.ok(matchesQuery('Weißwurst', 'weisswurst'));
  assert.ok(matchesQuery('Weisswurst', 'weißwurst'));
  assert.equal(foldPlain('Straße'), 'strasse');
  assert.equal(foldExpanded('Süß'), 'suess');
});

test('search: a query is not broadened beyond what the user typed', () => {
  assert.equal(matchesQuery('Pasta with tomato', 'ae'), false, '"ae" must not match every "a"');
  assert.equal(matchesQuery('Pasta with tomato', 'ue'), false);
  assert.equal(matchesQuery('Chicken curry', 'beef'), false);
  assert.equal(matchesQuery('Mensa', 'mensae'), false);
});

test('search: empty and spaced queries, case and special characters', () => {
  assert.ok(matchesQuery('anything', ''));
  assert.ok(matchesQuery('anything', '   '));
  assert.ok(matchesQuery('Black Angus Cheesy Burger', '  CHEESY  '));
  assert.ok(matchesQuery('Poly-Bowls (vegan)', '(vegan'));
  assert.equal(matchesQuery('Poly-Bowls', '.*'), false, 'no regular expressions');
  assert.equal(matchesQuery('', 'tofu'), false);
});
