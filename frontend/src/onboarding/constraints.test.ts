import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesConstraints, type ConstraintMeal } from './constraints.ts';
import type { Profile } from './profile.ts';
const meal: ConstraintMeal = { dietTag: 'vegan', allergens: [], originDetail: null, components: ['Rice'] };
const allowed: Record<Profile['diet'], string[]> = {
  vegan: ['vegan'], vegetarian: ['vegan', 'vegetarian'], pescetarian: ['vegan', 'vegetarian', 'fish'],
  omnivore: ['vegan', 'vegetarian', 'fish', 'meat'], flexitarian: ['vegan', 'vegetarian', 'fish', 'meat'],
};
for (const diet of Object.keys(allowed) as Profile['diet'][]) test(`diet ${diet}`, () => {
  for (const dietTag of ['vegan', 'vegetarian', 'fish', 'meat'] as const)
    assert.equal(matchesConstraints({ ...meal, dietTag }, { diet, hard: [] }), allowed[diet].includes(dietTag));
});
for (const [constraint, allergen] of [['lactose_free', 'milk'], ['gluten_free', 'gluten'], ['nut_free', 'nuts'], ['nut_free', 'peanuts']] as const)
  test(`${constraint}: ${allergen}`, () => {
    assert.equal(matchesConstraints({ ...meal, allergens: [allergen] }, { diet: 'omnivore', hard: [constraint] }), false);
    assert.equal(matchesConstraints(meal, { diet: 'omnivore', hard: [constraint] }), true);
  });
test('no_pork: origin and every component alias', () => {
  assert.equal(matchesConstraints({ ...meal, originDetail: { meat: [{ type: 'pork', countries: [] }], fish: [] } }, { diet: 'omnivore', hard: ['no_pork'] }), false);
  for (const word of ['pork', 'Schwein', 'Speck', 'Bacon', 'ham', 'Schinken', 'Salami', 'Chorizo', 'Wurst'])
    assert.equal(matchesConstraints({ ...meal, components: [word] }, { diet: 'omnivore', hard: ['no_pork'] }), false);
  assert.equal(matchesConstraints(meal, { diet: 'omnivore', hard: ['no_pork'] }), true);
});
for (const constraint of ['halal', 'kosher'] as const) test(`${constraint} is stored but unfilterable`, () => {
  assert.equal(matchesConstraints({ ...meal, dietTag: 'meat', allergens: ['milk'] }, { diet: 'omnivore', hard: [constraint] }), true);
});
test('constraints combine with diet', () => {
  assert.equal(matchesConstraints({ ...meal, dietTag: 'vegetarian', allergens: ['milk'] }, { diet: 'vegetarian', hard: ['lactose_free', 'halal'] }), false);
});
