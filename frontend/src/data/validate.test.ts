import assert from 'node:assert/strict';
import test from 'node:test';
import { average, DataError, hasOnlyOnePriceCategory, mergePrices, parseMeal, parseMealList, parseMensas, parseMeta, price } from './validate.ts';

const good = () => ({
  mensaId: 'polyterrasse', date: '2026-10-12', avgRating: 4.2,
  meal: { id: 'polyterrasse.2026-10-12.lunch.0', name: 'Fried Chicken', description: 'Fries, salad', prices: { student: 8.5, staff: 11.5, external: 15.5 }, allergens: ['gluten', 'eggs'], classification: ['meat', 'main', 'lunch'] },
});

test('F08: a correct meal passes unchanged', () => {
  assert.deepEqual(parseMeal(good()), good());
});

test('F08: unusable prices become unknown, never 0 or NaN', () => {
  for (const bad of ['8.50', 'n/a', NaN, Infinity, -1, 0, 1_000_000, null, undefined, {}, [], true]) {
    assert.equal(price(bad), null, String(bad));
    const meal = good();
    (meal.meal.prices as Record<string, unknown>).student = bad;
    assert.equal(parseMeal(meal)?.meal.prices.student, null);
    assert.equal(parseMeal(meal)?.meal.prices.staff, 11.5, 'the other prices are kept');
  }
  assert.equal(price(0.05), 0.05);
  assert.equal(price(1000), 1000);
});

test('F08: a missing or broken prices object only makes the prices unknown', () => {
  for (const prices of [undefined, null, 'x', 5, []]) {
    const meal = good();
    (meal.meal as Record<string, unknown>).prices = prices;
    assert.deepEqual(parseMeal(meal)?.meal.prices, { student: null, staff: null, external: null });
  }
});

const legacy = (cat: unknown, amount: unknown, id = 'polyterrasse.2026-10-12.lunch.0') => {
  const meal = good();
  const raw = meal.meal as Record<string, unknown>;
  delete raw.prices; raw.id = id; raw.price = { price: amount, cat };
  return meal;
};

test('F63: an older backend that only sends price {price, cat} still shows that price', () => {
  assert.deepEqual(parseMeal(legacy('student', 8.5))?.meal.prices, { student: 8.5, staff: null, external: null });
  assert.deepEqual(parseMeal(legacy('staff', 11.5))?.meal.prices, { student: null, staff: 11.5, external: null });
  assert.deepEqual(parseMeal(legacy('EXTERNAL', 15.5))?.meal.prices, { student: null, staff: null, external: 15.5 });
  assert.equal(parseMeal(legacy('unknown-group', 9))?.meal.prices.student, null, 'an unknown category is not guessed');
  assert.equal(parseMeal(legacy('student', 0))?.meal.prices.student, null, '0.00 is still "not published"');
});

test('F63: the new prices object wins over the single price', () => {
  const meal = good();
  (meal.meal as Record<string, unknown>).price = { price: 1, cat: 'student' };
  assert.equal(parseMeal(meal)?.meal.prices.student, 8.5);
});

test('F63: other price categories are merged in by meal id, existing prices are kept', () => {
  const student = [parseMeal(legacy('student', 8.5, 'a'))!, parseMeal(legacy('student', 6, 'b'))!];
  const staff = [parseMeal(legacy('staff', 11.5, 'a'))!];
  assert.equal(hasOnlyOnePriceCategory(student), true);
  const merged = mergePrices(student, staff);
  assert.deepEqual(merged[0]!.meal.prices, { student: 8.5, staff: 11.5, external: null });
  assert.deepEqual(merged[1]!.meal.prices, { student: 6, staff: null, external: null }, 'a meal missing from the other list is unchanged');
  assert.equal(hasOnlyOnePriceCategory(merged), false);
  assert.equal(student[0]!.meal.prices.staff, null, 'inputs are not mutated');
});

test('F63: a backend with all prices, or with no prices at all, does not ask again', () => {
  assert.equal(hasOnlyOnePriceCategory([parseMeal(good())!]), false);
  assert.equal(hasOnlyOnePriceCategory([]), false);
  assert.equal(hasOnlyOnePriceCategory([parseMeal(legacy('student', null))!]), false);
});

test('F08: ratings outside 0-5 or not numbers become null', () => {
  for (const bad of [-0.1, 5.1, NaN, '4', null, undefined, Infinity]) assert.equal(average(bad), null, String(bad));
  assert.equal(average(0), 0);
  assert.equal(average(5), 5);
});

test('F08: a meal without a usable identity is dropped', () => {
  const broken: Array<(m: ReturnType<typeof good>) => unknown> = [
    (m) => ({ ...m, mensaId: '' }), (m) => ({ ...m, mensaId: 7 }), (m) => ({ ...m, date: '2026-02-31' }), (m) => ({ ...m, date: 'tomorrow' }),
    (m) => ({ ...m, meal: null }), (m) => ({ ...m, meal: 'x' }), (m) => ({ ...m, meal: { ...m.meal, id: '' } }), (m) => ({ ...m, meal: { ...m.meal, id: 'x'.repeat(201) } }),
    (m) => ({ ...m, meal: { ...m.meal, name: '   ' } }), (m) => ({ ...m, meal: { ...m.meal, name: 5 } }),
    () => null, () => 'meal', () => 42, () => [],
  ];
  for (const make of broken) assert.equal(parseMeal(make(good())), null, JSON.stringify(make(good())).slice(0, 80));
});

test('Food2050 meals without a known classification get conservative defaults', () => {
  const meal = good();
  assert.deepEqual(parseMeal({ ...meal, meal: { ...meal.meal, classification: 'meat,main,lunch' } })?.meal.classification,
    ['meat', 'main', 'lunch']);
  assert.deepEqual(parseMeal({ ...meal, meal: { ...meal.meal, classification: ['veggie', 'snack', 'brunch'] } })?.meal.classification,
    ['vegetarian', 'main', 'lunch']);
});

test('F08: description and allergens are cleaned, extra fields are ignored', () => {
  const meal = good();
  Object.assign(meal.meal, { description: 12, allergens: ['gluten', 5, '', null, 'x'.repeat(41), 'milk'], hacker: '<script>', __proto__: { polluted: true } });
  const parsed = parseMeal(meal)!;
  assert.equal(parsed.meal.description, null);
  assert.deepEqual(parsed.meal.allergens, ['gluten', 'milk']);
  assert.equal('hacker' in parsed.meal, false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(parseMeal({ ...good(), meal: { ...good().meal, allergens: 'gluten' } })?.meal.allergens.length, 0);
  assert.equal(parseMeal({ ...good(), meal: { ...good().meal, description: 'x'.repeat(5000) } })?.meal.description?.length, 2000);
});

test('F08: a list keeps the good meals and counts the rejected ones', () => {
  const { meals, rejected } = parseMealList([good(), { nope: true }, null, good(), 'x']);
  assert.equal(meals.length, 2);
  assert.equal(rejected, 3);
  assert.deepEqual(parseMealList([]), { meals: [], rejected: 0 });
});

test('F09: a response with the wrong overall shape is a DataError, not "unreachable"', () => {
  for (const bad of [null, undefined, {}, 'meals', 5, { meals: [] }]) assert.throws(() => parseMealList(bad), DataError);
  assert.throws(() => parseMealList(new Array(5001).fill(good())), DataError);
  assert.equal(parseMealList(new Array(5000).fill(good())).meals.length, 5000);
  assert.ok(new DataError('x') instanceof Error);
});

test('F08: meta needs two real dates', () => {
  assert.deepEqual(parseMeta({ today: '2026-10-10', menuDate: '2026-10-12', dataFrom: 'x' }), { today: '2026-10-10', menuDate: '2026-10-12' });
  for (const bad of [null, {}, [], 'x', { today: '2026-10-10' }, { today: '2026-02-31', menuDate: '2026-10-12' }, { today: '2026-10-10', menuDate: 5 }]) assert.throws(() => parseMeta(bad), DataError);
});

test('F08: mensa ratings are optional, so a bad list means no ratings', () => {
  assert.deepEqual(parseMensas([{ id: 'a', title: 'A', campus: 'Zentrum', coordinates: { lat: 47.1, lng: 8.2 }, avgRating: 4 }, { id: 'b', avgRating: 9 }, { id: '', title: 'x' }, null, 5, { title: 'no id' }]),
    [
      { id: 'a', title: 'A', campus: 'Zentrum', coordinates: { lat: 47.1, lng: 8.2 }, avgRating: 4 },
      { id: 'b', title: 'b', campus: '', coordinates: null, avgRating: null },
    ]);
  for (const bad of [null, undefined, {}, 'x', 7]) assert.deepEqual(parseMensas(bad), []);
});
