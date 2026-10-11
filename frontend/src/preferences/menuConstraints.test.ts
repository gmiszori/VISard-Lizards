import test from 'node:test';
import assert from 'node:assert/strict';
import { displayMealConstraints, backendMealConstraints, matchesMenuExclusions } from './menuConstraints.ts';
import { hasDietConflict, normalizeAllergens } from '../data/allergens.ts';
import type { DisplayMenuItem } from '../data/menu-display.ts';
import type { BackendMeal } from '../data/api.ts';

const dish: DisplayMenuItem = { id: 'audit', name: 'Artichoke Stroganoff', description: 'Rice and artichokes',
  dietary: 'vegetarian', allergens: ['Milch'], category: 'Classic', priceStudent: 8.9, priceWorker: 11, priceExternal: 17.5 };

test('milk exclusions use published allergens in detail and preview rows, even without milk in the dish text', () => {
  assert.equal(matchesMenuExclusions(displayMealConstraints(dish), ['lactose_free']), false);
  assert.equal(matchesMenuExclusions(displayMealConstraints({ ...dish, allergens: ['Milk'] }), ['lactose_free']), false);
  assert.equal(matchesMenuExclusions(displayMealConstraints(dish), []), true);
});
test('backend search results obey the same saved exclusion, including provider trace ids', () => {
  const meal: BackendMeal = { id: 'ai', name: 'Cauliflower', description: 'Lentils', prices: { student: 8.9, staff: 11, external: 17.5 },
    allergens: ['sesame'], traceAllergens: ['cerealsContainingGluten', 'Sellerie'], classification: ['vegan', 'main', 'lunch'] };
  assert.equal(matchesMenuExclusions(backendMealConstraints(meal), ['gluten_free']), false);
  assert.equal(matchesMenuExclusions(backendMealConstraints(meal), ['lactose_free']), true);
});
test('pork in a title and nuts in published metadata are excluded', () => {
  assert.equal(matchesMenuExclusions(displayMealConstraints({ ...dish, name: 'Pork chop', description: 'Rice', allergens: [] }), ['no_pork']), false);
  assert.equal(matchesMenuExclusions(displayMealConstraints({ ...dish, allergens: ['Schalenfrüchte'] }), ['nut_free']), false);
});
test('vegan contradictions use ingredients, with traces kept distinct', () => {
  assert.equal(hasDietConflict('vegan', ['Fische', 'Krebstiere']), true);
  assert.equal(hasDietConflict('vegan', ['Milch']), true);
  assert.equal(hasDietConflict('vegetarian', ['milk', 'eggs']), false);
  assert.equal(hasDietConflict('vegan', ['sesame']), false);
  assert.deepEqual(normalizeAllergens(['milk', 'Milch', 'cerealsContainingGluten']), ['milk', 'gluten']);
});
