import assert from 'node:assert/strict';
import test from 'node:test';
import { pickPrice } from './priceDisplay.ts';

test('F63: the chosen tier is used when it has a price', () => {
  assert.deepEqual(pickPrice({ student: 8.5, worker: 11.5, external: 15.5 }, 'worker'), { tier: 'worker', value: 11.5 });
});

test('F63: a missing price for the chosen tier falls back to another tier and says which', () => {
  assert.deepEqual(pickPrice({ student: 8.5, worker: null, external: null }, 'external'), { tier: 'student', value: 8.5 });
  assert.deepEqual(pickPrice({ student: null, worker: null, external: 15.5 }, 'student'), { tier: 'external', value: 15.5 });
  assert.deepEqual(pickPrice({ student: null, worker: 11.5, external: 15.5 }, 'external'), { tier: 'external', value: 15.5 });
});

test('F63: no price anywhere gives null, not 0', () => {
  assert.deepEqual(pickPrice({ student: null, worker: undefined, external: null }, 'student'), { tier: null, value: null });
  assert.deepEqual(pickPrice({ student: NaN, worker: null, external: null }, 'worker'), { tier: null, value: null });
});
