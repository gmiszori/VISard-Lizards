import assert from 'node:assert/strict';
import test from 'node:test';
import { defaults } from './profile.ts';
import { pickTodaysDishOpenFirst, type RecommendationMeal, type RecommendationMensa } from './pickTodaysDish.ts';

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
