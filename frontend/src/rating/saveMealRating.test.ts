import assert from 'node:assert/strict';
import test from 'node:test';
import { DuplicateMealRatingError, saveMealRating, type MealRating } from './saveMealRating.ts';

const rating: MealRating = { userId: 'anon:00000000-0000-4000-8000-000000000000', mealId: 'archimedes.2026-10-09.lunch.1', mensaId: 'archimedes', rating: 4, ratedAt: '2026-10-09T12:00:00Z', mealDate: '2026-10-09' };

function memoryStorage(initial: Record<string, string> = {}, failWrites = false): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; }, clear: () => data.clear(), key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => { data.delete(k); },
    setItem: (k: string, v: string) => { if (failWrites) throw new DOMException('full', 'QuotaExceededError'); data.set(k, v); },
  };
}

async function withBackend<T>(respond: () => Response, run: () => Promise<T>): Promise<{ result: T; calls: number }> {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return respond(); }) as typeof fetch;
  try { return { result: await run(), calls }; } finally { globalThis.fetch = original; }
}
const accepted = () => new Response(JSON.stringify({ mealId: rating.mealId, mensaId: 'archimedes', mealDate: '2026-10-09', userId: rating.userId, stars: 4, ratedAt: '2026-10-09T12:00:05Z' }), { status: 201, headers: { 'Content-Type': 'application/json' } });

test('F05: a rating the server accepted is a success even if the device copy cannot be written', async () => {
  for (const storage of [memoryStorage({}, true), memoryStorage({ ratings: '{not json' }), memoryStorage({ ratings: '{"a":1}' })]) {
    const { calls } = await withBackend(accepted, () => saveMealRating(rating, storage, 'ratings', 'http://backend'));
    assert.equal(calls, 1);
  }
});

test('F05: without a backend the same storage failures are still real failures', async () => {
  await assert.rejects(saveMealRating(rating, memoryStorage({}, true), 'ratings', ''));
  await assert.rejects(saveMealRating(rating, memoryStorage({ ratings: '{not json' }), 'ratings', ''));
});

test('F05: server errors are still reported, and 409 still means already rated', async () => {
  await assert.rejects(withBackend(() => new Response('{"detail":"boom"}', { status: 500 }), () => saveMealRating(rating, memoryStorage(), 'ratings', 'http://backend')), /boom|500/);
  await assert.rejects(withBackend(() => new Response('{"detail":"dup"}', { status: 409 }), () => saveMealRating(rating, memoryStorage(), 'ratings', 'http://backend')), DuplicateMealRatingError);
});
