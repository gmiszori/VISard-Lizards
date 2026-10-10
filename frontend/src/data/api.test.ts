import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, apiPost, resolveApiUrl, retryAfterMs } from './api.ts';

test('browser API requests use the page origin when no URL is configured', () => {
  assert.equal(resolveApiUrl(undefined, 'http://127.0.0.1:8080/'), 'http://127.0.0.1:8080');
  assert.equal(resolveApiUrl(undefined, 'https://campus.example.org'), 'https://campus.example.org');
});

test('build-time requests use the local backend by default', () => {
  assert.equal(resolveApiUrl(undefined), 'http://localhost:8080');
});

test('configured URL overrides the origin and empty means sample mode', () => {
  assert.equal(resolveApiUrl('https://api.example.org/', 'https://campus.example.org'), 'https://api.example.org');
  assert.equal(resolveApiUrl('', 'http://127.0.0.1:8080'), '');
});

test('Retry-After supports seconds and HTTP dates; invalid values use the caller fallback', () => {
  const now = Date.parse('2026-10-12T10:00:00Z');
  assert.equal(retryAfterMs('75', now), 75_000);
  assert.equal(retryAfterMs(' 0 ', now), 0);
  assert.equal(retryAfterMs('Mon, 12 Oct 2026 10:01:15 GMT', now), 75_000);
  assert.equal(retryAfterMs('Mon, 12 Oct 2026 09:59:00 GMT', now), 0);
  for (const bad of [null, '', 'garbage', '-1', '1.5', 'Infinity', '1e3', '9'.repeat(400)]) {
    assert.equal(retryAfterMs(bad, now), undefined, String(bad));
  }
});

test('a rejected API request preserves problem detail, status and retry interval', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ detail: 'Already reported recently' }), {
    status: 429, headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '75' },
  }));
  await assert.rejects(apiPost('/api/mensas/polyterrasse/crowd-reports', { level: 4 }, 'https://fixture.invalid'), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 429);
    assert.equal(error.message, 'Already reported recently');
    assert.equal(error.retryAfterMs, 75_000);
    return true;
  });
});
