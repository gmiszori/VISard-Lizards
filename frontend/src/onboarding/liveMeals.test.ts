import assert from 'node:assert/strict';
import test from 'node:test';
import type { DisplayMenuItem } from '../data/menu-display.ts';
import { liveRecommendationMeals } from './liveMeals.ts';
import { pickTodaysDish } from './pickTodaysDish.ts';
import { defaults } from './profile.ts';

const item = (over: Partial<DisplayMenuItem>): DisplayMenuItem => ({
  id: 'x', name: 'Dish', description: 'Rice, Vegetables', priceStudent: 7, priceWorker: 9, priceExternal: 12,
  dietary: 'vegetarian', category: 'Classic', service: 'lunch', allergens: [], ...over,
});
const mensas = [
  { id: 'a', name: 'Mensa A', campusId: 'zentrum' as const, hasMenu: true, temporarilyClosed: false },
  { id: 'b', name: 'Mensa B', campusId: 'irchel' as const, hasMenu: true, temporarilyClosed: false },
];
const canteens = [
  { id: 'a', menu: [
    item({ id: 'a1', name: 'Pork Schnitzel', description: 'Pork, Fries', dietary: 'meat', dietTag: 'meat', allergenIds: ['gluten', 'eggs'], priceStudent: 9.5 }),
    item({ id: 'a2', name: 'Cod Fillet', description: 'Cod, Spinach', dietary: 'meat', dietTag: 'fish', allergenIds: ['fish'] }),
    item({ id: 'a3', name: 'Hot & Cold Buffet', category: 'Side', priceStudent: 2.2 }),
  ] },
  { id: 'b', menu: [item({ id: 'b1', name: 'Tofu Curry', dietary: 'vegan', dietTag: 'vegan', allergenIds: ['soy'], priceStudent: null })] },
];

test('live meals: only main dishes, mapped to the shape the ranking reads', () => {
  const meals = liveRecommendationMeals(canteens, '2026-10-12');
  assert.deepEqual(meals.map(m => m.id), ['a1', 'a2', 'b1'], 'the buffet side is not a recommendation');
  const first = meals[0]!;
  assert.deepEqual([first.mensaId, first.date, first.kind, first.service, first.dietTag], ['a', '2026-10-12', 'main', 'lunch', 'meat']);
  assert.deepEqual(first.components, ['Pork', 'Fries']);
  assert.deepEqual(first.allergens, ['gluten', 'eggs']);
  assert.deepEqual(first.price, { student: 9.5, staff: 9, external: 12 });
  assert.equal(first.nutrition, null);
});

test('live meals: fish stays fish and sample items without a diet tag fall back to the card diet', () => {
  const meals = liveRecommendationMeals(canteens, '2026-10-12');
  assert.equal(meals.find(m => m.id === 'a2')!.dietTag, 'fish');
  const sample = liveRecommendationMeals([{ id: 'a', menu: [item({ id: 's', dietary: 'vegan' })] }], '2026-10-12');
  assert.equal(sample[0]!.dietTag, 'vegan');
  assert.deepEqual(sample[0]!.allergens, []);
});

test('live meals: the pick respects diet, allergens and the dish text for "no pork"', () => {
  const meals = liveRecommendationMeals(canteens, '2026-10-12');
  const pescetarian = { ...defaults('zentrum', 'en'), diet: 'pescetarian' as const, campusSecondary: ['irchel' as const] };
  assert.notEqual(pickTodaysDish(pescetarian, mensas, meals)?.meal.id, 'a1', 'no meat for a pescetarian');
  const noPork = { ...defaults('zentrum', 'en'), hard: ['no_pork' as const] };
  assert.equal(pickTodaysDish(noPork, mensas, meals)?.meal.id, 'a2', 'pork is found in the description text');
  const glutenFree = { ...defaults('zentrum', 'en'), hard: ['gluten_free' as const] };
  assert.equal(pickTodaysDish(glutenFree, mensas, meals)?.meal.id, 'a2');
});

test('live meals: an empty or side-only menu gives nothing to recommend', () => {
  assert.deepEqual(liveRecommendationMeals([], '2026-10-12'), []);
  assert.deepEqual(liveRecommendationMeals([{ id: 'a', menu: [item({ category: 'Side' })] }], '2026-10-12'), []);
});
