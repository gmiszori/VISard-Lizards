import test from 'node:test';
import assert from 'node:assert/strict';
import { closingIn } from './closing.ts';

test('closing hint only appears in the last 30 minutes of an open period', () => {
  const windows = [[660, 840], [1050, 1140]] as const;
  assert.equal(closingIn(windows, 659), null);
  assert.equal(closingIn(windows, 809), null);
  assert.equal(closingIn(windows, 810), 30);
  assert.equal(closingIn(windows, 820), 20);
  assert.equal(closingIn(windows, 839), 1);
  assert.equal(closingIn(windows, 840), null);
  assert.equal(closingIn(windows, 900), null);
  assert.equal(closingIn(windows, 1120), 20);
  assert.equal(closingIn([], 820), null);
});

test('overlapping and adjoining hours do not trigger an early closing warning', () => {
  assert.equal(closingIn([[660, 840], [840, 900]], 820), null);
  assert.equal(closingIn([[660, 840], [830, 850]], 820), 30);
  assert.equal(closingIn([[660, 840], [850, 900]], 820), 20);
});
