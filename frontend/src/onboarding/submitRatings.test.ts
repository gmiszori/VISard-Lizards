import test from 'node:test';
import assert from 'node:assert/strict';
import { submitMensaRatings } from './submitRatings.ts';

test('canteen ratings are submitted once and successful partial batches survive retries', async () => {
  const original = globalThis.fetch;
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  const calls: string[] = [];
  let fail = true;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.body, JSON.stringify({ stars: 4 }));
    return String(url).includes('second') && fail ? new Response('{}', { status: 503 }) : new Response(null, { status: 201 });
  };
  try {
    const ratings = [{ mensaId: 'first-test', rating: 4 as const }, { mensaId: 'second-test', rating: 4 as const }];
    await assert.rejects(submitMensaRatings(ratings, storage, 'http://api'));
    fail = false;
    await submitMensaRatings(ratings, storage, 'http://api');
    await submitMensaRatings(ratings, storage, 'http://api');
    assert.equal(calls.filter(url => url.includes('first')).length, 1);
    assert.equal(calls.filter(url => url.includes('second')).length, 2);
  } finally { globalThis.fetch = original; }
});

test('offline onboarding does not submit ratings', async () => {
  await submitMensaRatings([{ mensaId: 'offline', rating: 3 }], { getItem: () => null, setItem: () => assert.fail('must not write') }, '');
});
