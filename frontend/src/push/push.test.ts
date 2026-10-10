import test from 'node:test';
import assert from 'node:assert/strict';
import { base64UrlToBytes, pushSupported, wasAsked } from './push.ts';

test('base64UrlToBytes decodes the VAPID key format (base64url, no padding)', () => {
  assert.deepEqual([...base64UrlToBytes('BP8A')], [4, 255, 0]);
  assert.deepEqual([...base64UrlToBytes('-_8')], [251, 255]);
  assert.equal(base64UrlToBytes('B'.repeat(86) + 'A').length, 65);
});

test('without a browser: no push, never asked', () => {
  assert.equal(pushSupported(), false);
  assert.equal(wasAsked(), false);
});
