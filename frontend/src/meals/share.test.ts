import assert from 'node:assert/strict';
import test from 'node:test';
import { dishUrl, mealIdFromHash, shareText } from './share.ts';

test('share: the text is one readable line', () => {
  assert.equal(shareText({ dish: 'Cod Fillet', price: 'CHF 12.50', mensa: 'Mensa Polyterrasse', when: 'Lunch · 11:15–14:00', url: 'x' }),
    'Cod Fillet · CHF 12.50 · Mensa Polyterrasse · Lunch 11:15–14:00');
});

test('share: a dish without a published price simply leaves the price out', () => {
  assert.equal(shareText({ dish: 'PASTA', price: '', mensa: 'Obere Mensa', when: '', url: 'x' }), 'PASTA · Obere Mensa');
  assert.equal(shareText({ dish: ' PASTA ', price: '   ', mensa: 'Obere Mensa', when: 'Lunch · 11:00–14:00', url: 'x' }), 'PASTA · Obere Mensa · Lunch 11:00–14:00');
});

test('share: the link points at the dish and replaces an older hash', () => {
  assert.equal(dishUrl('/canteen/polyterrasse', 'polyterrasse.2026-10-12.lunch.0'), '/canteen/polyterrasse#polyterrasse.2026-10-12.lunch.0');
  assert.equal(dishUrl('/canteen/polyterrasse#old', 'a b'), '/canteen/polyterrasse#a%20b');
});

test('share: only plain meal ids are accepted from a link', () => {
  assert.equal(mealIdFromHash('#polyterrasse.2026-10-12.lunch.0'), 'polyterrasse.2026-10-12.lunch.0');
  assert.equal(mealIdFromHash('#a%20b'), null, 'spaces are not valid ids');
  for (const bad of ['', '#', '#<script>', '#%E0%A4%A', '#" onload="x', '#' + 'a'.repeat(200)]) assert.equal(mealIdFromHash(bad), null, bad);
});
