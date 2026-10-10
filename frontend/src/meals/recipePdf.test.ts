import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRecipePdf, type Recipe } from './recipePdf.ts';

test('recipe PDF is downloadable data and paginates long steps', () => {
  const recipe: Recipe = {
    title: 'Mushroom Risotto', intro: 'A home recreation.', servings: 2, minutes: 35,
    ingredients: [{ amount: '200 g', item: 'rice' }, { amount: '150 g', item: 'mushrooms' }],
    steps: Array.from({ length: 20 }, (_, index) => `Step ${index + 1}: ${'Stir gently. '.repeat(30)}`),
  };
  const doc = createRecipePdf(recipe, 'en');
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 8)).startsWith('%PDF-'), true);
  assert.ok(bytes.length > 1000);
  assert.ok(doc.getNumberOfPages() > 1);
});
