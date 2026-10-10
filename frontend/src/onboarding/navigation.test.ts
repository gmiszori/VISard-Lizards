import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentStepIndex, visibleStepIndices } from './navigation.ts';

const ids = ['language', 'campus', 'diet', 'theme', 'price', 'ratings', 'install'];

test('empty ratings step is omitted in both directions and from progress', () => {
  const visible = visibleStepIndices(ids, false);
  assert.deepEqual(visible, [0, 1, 2, 3, 4, 6]);
  assert.equal(adjacentStepIndex(visible, 4, 1), 6);
  assert.equal(adjacentStepIndex(visible, 6, -1), 4);
  assert.equal(adjacentStepIndex(visible, 6, 1), null);
});

test('ratings step remains when candidates exist', () => {
  const visible = visibleStepIndices(ids, true);
  assert.deepEqual(visible, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(adjacentStepIndex(visible, 4, 1), 5);
});
