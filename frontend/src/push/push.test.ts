import test from 'node:test';
import assert from 'node:assert/strict';
import { base64UrlToBytes, PushPermissionUnavailableError, PushSubscriptionUnavailableError, PushWorkerUnavailableError,
  pushSupported, waitForPermission, waitForSubscriptionReady, waitForWorkerReady, wasAsked } from './push.ts';

test('base64UrlToBytes decodes the VAPID key format (base64url, no padding)', () => {
  assert.deepEqual([...base64UrlToBytes('BP8A')], [4, 255, 0]);
  assert.deepEqual([...base64UrlToBytes('-_8')], [251, 255]);
  assert.equal(base64UrlToBytes('B'.repeat(86) + 'A').length, 65);
});

test('without a browser: no push, never asked', () => {
  assert.equal(pushSupported(), false);
  assert.equal(wasAsked(), false);
});

test('push activation waits return successful and rejected browser results', async () => {
  assert.equal(await waitForWorkerReady(Promise.resolve('active'), 10), 'active');
  assert.equal(await waitForSubscriptionReady(Promise.resolve('subscribed'), 10), 'subscribed');
  await assert.rejects(waitForWorkerReady(Promise.reject(new Error('registration failed')), 10), /registration failed/);
});

test('push activation waits fail with a specific error instead of hanging forever', async () => {
  const pending = new Promise<never>(() => {});
  await assert.rejects(waitForWorkerReady(pending, 5), PushWorkerUnavailableError);
  await assert.rejects(waitForSubscriptionReady(pending, 5), PushSubscriptionUnavailableError);
  await assert.rejects(waitForPermission(pending, 5), PushPermissionUnavailableError);
});
