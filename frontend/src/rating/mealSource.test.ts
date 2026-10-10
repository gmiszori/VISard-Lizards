import assert from 'node:assert/strict';
import test from 'node:test';
import { loadMeals } from './mealSource.ts';

const bundled = () => ['bundled-1', 'bundled-2'];

test('F06: without a backend the bundled list is used', async () => {
  assert.deepEqual(await loadMeals(null, bundled), ['bundled-1', 'bundled-2']);
});

test('F06: with a backend its list is used', async () => {
  assert.deepEqual(await loadMeals(async () => ['live-1'], bundled), ['live-1']);
  assert.deepEqual(await loadMeals(async () => [], bundled), [], 'an empty live list is a real answer, not a reason to use bundled ids');
});

test('F06: a failing backend is an error, never a silent switch to bundled ids', async () => {
  const failing = async (): Promise<string[]> => { throw new Error('503'); };
  await assert.rejects(loadMeals(failing, bundled), /503/);
  await assert.rejects(loadMeals(failing, bundled, false), /503/);
});

test('F06: the device-only simulator may fall back to the bundled list', async () => {
  const failing = async (): Promise<string[]> => { throw new Error('offline'); };
  assert.deepEqual(await loadMeals(failing, bundled, true), ['bundled-1', 'bundled-2']);
});

test('F06: the bundled list is only read when needed', async () => {
  let reads = 0;
  await loadMeals(async () => ['live'], () => { reads++; return []; });
  assert.equal(reads, 0);
});
