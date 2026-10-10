import assert from 'node:assert/strict';
import test from 'node:test';
import { defaults } from './profile.ts';
import { MIN_MAIN_PRICE, pickTodaysDish, type RecommendationMeal, type RecommendationMensa } from './pickTodaysDish.ts';

const mensas: RecommendationMensa[] = [{ id: 'm1', name: 'Mensa', campusId: 'zentrum', hasMenu: true, temporarilyClosed: false }];
const meal = (id: string, title: string, student: number | null): RecommendationMeal => ({ id, mensaId: 'm1', date: '2026-10-07', title, titleDe: null, kind: 'main',
  service: 'lunch', dietTag: 'vegetarian', allergens: [], originDetail: null, components: [], price: { student, staff: student, external: student }, nutrition: null } as RecommendationMeal);
const profile = { ...defaults('zentrum'), priority: ['price', 'taste', 'speed', 'health'] as ReturnType<typeof defaults>['priority'] };

test('a cheap soup labelled "main" is not the pick while a real main exists', () => {
  const pick = pickTodaysDish(profile, mensas, [meal('a', 'Pastinakensuppe', 1.8), meal('b', 'Chässpätzli', 6.1)]);
  assert.equal(pick?.meal.id, 'b');
  assert.ok(MIN_MAIN_PRICE > 1.8);
});
test('anything below the minimum price, or called soup/dessert, is skipped even when it is the best on price', () => {
  assert.equal(pickTodaysDish(profile, mensas, [meal('a', 'Tomatensuppe', 5.5), meal('b', 'Pasta', 7)])?.meal.id, 'b');
  assert.equal(pickTodaysDish(profile, mensas, [meal('a', 'Dessert of the Day', 2.4), meal('b', 'Pasta', 7)])?.meal.id, 'b');
});
test('when only starters are left, one of them is still offered instead of nothing', () => {
  assert.equal(pickTodaysDish(profile, mensas, [meal('a', 'Pastinakensuppe', 1.8)])?.meal.id, 'a');
});
test('an unknown price is not treated as a starter', () => {
  assert.equal(pickTodaysDish(profile, mensas, [meal('a', 'Mystery plate', null)])?.meal.id, 'a');
});
