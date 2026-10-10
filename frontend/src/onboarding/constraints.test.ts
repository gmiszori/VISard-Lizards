import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesConstraints, type ConstraintMeal } from './constraints.ts';
import type { Profile } from './profile.ts';
const meal: ConstraintMeal = { dietTag: 'vegan', allergens: [], originDetail: null, components: ['Rice'] };
const allowed: Record<Profile['diet'], string[]> = {
  vegan: ['vegan'], vegetarian: ['vegan', 'vegetarian'], pescetarian: ['vegan', 'vegetarian', 'fish'],
  omnivore: ['vegan', 'vegetarian', 'fish', 'meat'], flexitarian: ['vegan', 'vegetarian', 'fish', 'meat'],
  carnivore: ['fish', 'meat'],
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
test('no_pork does not reject champignons or hamburger from a ham substring', () => {
  for (const component of ['Champignon sauce', 'Hamburger bun', 'Chamomile tea'])
    assert.equal(matchesConstraints({ ...meal, components: [component] }, { diet: 'omnivore', hard: ['no_pork'] }), true);
  for (const component of ['Schweinefleisch', 'Bratwurst', 'Schinkenwürfel'])
    assert.equal(matchesConstraints({ ...meal, components: [component] }, { diet: 'omnivore', hard: ['no_pork'] }), false);
});

test('nut_free also reads the dish text when the allergen list is incomplete (walnuts in the description)', () => {
  const bowl = { ...meal, dietTag: 'vegan' as const, allergens: ['gluten', 'sulphites', 'sesame'] as never, title: 'BULGUR BOWL', components: ['Baumnüssen & süss saure Orangen', 'Bulgur'] };
  assert.equal(matchesConstraints(bowl, { diet: 'vegan', hard: ['nut_free'] }), false);
  for (const word of ['Walnuss', 'Haselnüsse', 'Mandeln', 'Cashew', 'Pistazien', 'Pecan', 'peanut sauce', 'almond milk'.replace('almond milk', 'Mandelcreme')])
    assert.equal(matchesConstraints({ ...meal, components: [word] }, { diet: 'omnivore', hard: ['nut_free'] }), false, word);
  assert.equal(matchesConstraints({ ...meal, title: 'Mandel-Torte', components: [] }, { diet: 'omnivore', hard: ['nut_free'] }), false);
});
test('nut_free does not drop nutmeg or coconut milk', () => {
  for (const component of ['Muskatnuss', 'Kokosmilch', 'Kokosnuss', 'Hafermilch', 'Gemüse'])
    assert.equal(matchesConstraints({ ...meal, components: [component] }, { diet: 'omnivore', hard: ['nut_free'] }), true, component);
});
test('lactose_free and gluten_free also read the dish text', () => {
  assert.equal(matchesConstraints({ ...meal, components: ['Reis', 'Rahmsauce'] }, { diet: 'omnivore', hard: ['lactose_free'] }), false);
  assert.equal(matchesConstraints({ ...meal, components: ['Reis', 'Hafermilch', 'Erdnussbutter'] }, { diet: 'omnivore', hard: ['lactose_free'] }), true);
  assert.equal(matchesConstraints({ ...meal, components: ['Penne Arrabbiata'] }, { diet: 'omnivore', hard: ['gluten_free'] }), false);
  assert.equal(matchesConstraints({ ...meal, components: ['Reisnudeln', 'Gemüse'] }, { diet: 'omnivore', hard: ['gluten_free'] }), true);
});
