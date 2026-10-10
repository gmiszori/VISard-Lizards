import assert from 'node:assert/strict';
import test from 'node:test';
import { canShowCanteen } from './canteenVisibility.ts';

test('only student pricing hides Dozentenfoyer', () => {
  assert.equal(canShowCanteen('dozentenfoyer', 'student'), false);
  assert.equal(canShowCanteen('dozentenfoyer', 'worker'), true);
  assert.equal(canShowCanteen('dozentenfoyer', 'external'), true);
  assert.equal(canShowCanteen('polyterrasse', 'student'), true);
});
