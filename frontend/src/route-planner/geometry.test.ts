import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeRoute } from './geometry.ts';
test('decodes real route vertices including negative longitude', () => {
  assert.deepEqual(decodeRoute('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [
    { lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 },
  ]);
});
test('missing and malformed geometry does not produce invented routes', () => {
  for (const value of [undefined, '', '_', 'a'.repeat(100_001), '\u0000\u0000']) assert.deepEqual(decodeRoute(value), []);
});
