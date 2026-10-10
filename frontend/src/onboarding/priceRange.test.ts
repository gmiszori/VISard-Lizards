import test from 'node:test';
import assert from 'node:assert/strict';
import { priceRange, tierPrice } from './priceRange.ts';
const meals = Array.from({ length: 101 }, (_, i) => ({ kind: 'main' as const, price: { student: i + 1, staff: i + 11, external: i + 21 } }));
test('interpolated percentiles remove tails and map worker to staff', () => {
  assert.deepEqual(priceRange(meals, 'student'), { min: 6, max: 96 });
  assert.deepEqual(priceRange(meals, 'worker'), { min: 16, max: 106 });
  assert.deepEqual(priceRange(meals, 'external'), { min: 26, max: 116 });
  assert.equal(tierPrice(meals[0]!, 'worker'), 11);
});
test('rounds to half francs; ignores non-main, null, nonfinite and nonpositive prices', () => {
  const only = { kind: 'main' as const, price: { student: 8.9, staff: null, external: null } };
  assert.deepEqual(priceRange([only, { ...only, kind: 'dessert', price: { ...only.price, student: 1000 } },
    ...[null, NaN, 0, -1].map(student => ({ ...only, price: { ...only.price, student } }))], 'student'), { min: 9, max: 9 });
  assert.deepEqual(priceRange([], 'student'), { min: 0, max: 0 });
  assert.deepEqual(priceRange([only], 'worker'), { min: 0, max: 0 });
});
