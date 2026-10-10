import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRecipePdf, type Recipe } from './recipePdf.ts';

test('recipe PDF is downloadable data and paginates long steps', () => {
  const recipe: Recipe = {
    title: 'Mushroom Risotto', intro: 'A home recreation.', servings: 2, minutes: 35,
    ingredients: [{ amount: '200 g', item: 'rice' }, { amount: '150 g', item: 'mushrooms' }],
    steps: Array.from({ length: 20 }, (_, index) => `Step ${index + 1}: ${'Stir gently. '.repeat(30)}`),
  };
  const logo = new Uint8Array(readFileSync(new URL('../../public/icon-192.png', import.meta.url)));
  const doc = createRecipePdf(recipe, 'en', logo);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 8)).startsWith('%PDF-'), true);
  assert.match(doc.output(), /\/Subtype \/Image/);
  assert.ok(bytes.length > 1000);
  assert.ok(doc.getNumberOfPages() > 1);
  assert.match(doc.output(), /Page 1 \/ /);
});

test('German recipe labels and offline logo fallback remain printable', () => {
  const doc = createRecipePdf({
    title: 'Pilzrisotto', intro: 'Eine einfache Nachkochidee.', servings: 2, minutes: 30,
    ingredients: [{ amount: '200 g', item: 'Reis' }], steps: ['Reis kochen.', 'Pilze anbraten.'],
  }, 'de');
  assert.equal(doc.getNumberOfPages(), 1);
  assert.match(doc.output(), /Zubereitung/);
  assert.match(doc.output(), /Seite 1 \/ 1/);
});
