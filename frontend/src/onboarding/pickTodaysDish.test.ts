import assert from 'node:assert/strict';
import test from 'node:test';
import { defaults } from './profile.ts';
import { MIN_MAIN_PRICE, pickTodaysDishOpenFirst, type RecommendationMeal, type RecommendationMensa } from './pickTodaysDish.ts';

const mensas: RecommendationMensa[] = [
  { id: 'm1', name: 'Closed one', campusId: 'zentrum', hasMenu: true, temporarilyClosed: false, closedOnMenuDay: true },
  { id: 'm2', name: 'Open one', campusId: 'zentrum', hasMenu: true, temporarilyClosed: false, closedOnMenuDay: false },
];
const meal = (mensaId: string, id: string, title: string, student: number): RecommendationMeal => ({ id, mensaId, date: '2026-10-12', title, titleDe: null, kind: 'main',
  service: 'lunch', dietTag: 'vegetarian', allergens: [], originDetail: null, components: [], price: { student, staff: student, external: student }, nutrition: null } as RecommendationMeal);
const profile = { ...defaults('zentrum'), priority: ['price', 'taste', 'speed', 'health'] as ReturnType<typeof defaults>['priority'] };

test('a mensa closed on the menu day loses to an open one, even when its dish is cheaper', () => {
  const result = pickTodaysDishOpenFirst(profile, mensas, [meal('m1', 'a', 'Cheap pasta', 5), meal('m2', 'b', 'Dear risotto', 12)]);
  assert.equal(result.pick?.meal.id, 'b');
  assert.equal(result.closed, false);
});

test('when only closed mensas have a fitting dish, it is still offered but flagged as closed', () => {
  const result = pickTodaysDishOpenFirst(profile, mensas, [meal('m1', 'a', 'Cheap pasta', 5)]);
  assert.equal(result.pick?.meal.id, 'a');
  assert.equal(result.closed, true);
});

test('no fitting dish at all is not flagged', () => {
  assert.deepEqual(pickTodaysDishOpenFirst(profile, mensas, []), { pick: null, closed: false });
});

test('mensas without the flag count as open', () => {
  const unflagged: RecommendationMensa[] = [{ id: 'm1', name: 'Unflagged', campusId: 'zentrum', hasMenu: true, temporarilyClosed: false }];
  const result = pickTodaysDishOpenFirst(profile, unflagged, [meal('m1', 'a', 'Pasta', 8)]);
  assert.equal(result.pick?.meal.id, 'a');
  assert.equal(result.closed, false);
});

const one = (id: string, title: string, student: number | null) => meal('m2', id, title, student as number);
test('a cheap soup labelled "main" is not the pick while a real main exists', () => {
  assert.equal(pickTodaysDishOpenFirst(profile, mensas, [one('a', 'Pastinakensuppe', 1.8), one('b', 'Chässpätzli', 6.1)]).pick?.meal.id, 'b');
  assert.ok(MIN_MAIN_PRICE > 1.8);
});
test('anything below the minimum price, or called soup/dessert, is skipped even when it is the best on price', () => {
  assert.equal(pickTodaysDishOpenFirst(profile, mensas, [one('a', 'Tomatensuppe', 5.5), one('b', 'Pasta', 7)]).pick?.meal.id, 'b');
  assert.equal(pickTodaysDishOpenFirst(profile, mensas, [one('a', 'Dessert of the Day', 2.4), one('b', 'Pasta', 7)]).pick?.meal.id, 'b');
});
test('when only starters are left, one of them is still offered instead of nothing; an unknown price is not a starter', () => {
  assert.equal(pickTodaysDishOpenFirst(profile, mensas, [one('a', 'Pastinakensuppe', 1.8)]).pick?.meal.id, 'a');
  assert.equal(pickTodaysDishOpenFirst(profile, mensas, [one('a', 'Mystery plate', null)]).pick?.meal.id, 'a');
});

test('Dozentenfoyer is never recommended at student pricing but remains available for staff', () => {
  const places: RecommendationMensa[] = [{ id: 'dozentenfoyer', name: 'Dozentenfoyer', campusId: 'zentrum', hasMenu: true, temporarilyClosed: false }];
  const dishes = [meal('dozentenfoyer', 'foyer-lunch', 'Pasta', 9)];
  assert.equal(pickTodaysDishOpenFirst(profile, places, dishes).pick, null);
  assert.equal(pickTodaysDishOpenFirst({ ...profile, priceTier: 'worker' }, places, dishes).pick?.meal.id, 'foyer-lunch');
});
