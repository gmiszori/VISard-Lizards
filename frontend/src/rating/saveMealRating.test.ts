import assert from 'node:assert/strict';
import test from 'node:test';
import { anonymousUserId, DuplicateMealRatingError, saveMealRating, type MealRating } from './saveMealRating.ts';

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

const ANON = /^anon:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test('F22: a valid stored anonymous id is kept', () => {
  const storage = memoryStorage({ 'campuseats-rating-anon-id': rating.userId });
  assert.equal(anonymousUserId(storage), rating.userId);
  assert.equal(anonymousUserId(storage), rating.userId);
});

test('F22: a missing or malformed stored id is replaced by one the backend accepts, and then kept', () => {
  for (const bad of ['', 'x', 'anon:', 'anon:123', 'user:00000000-0000-4000-8000-000000000000', ' anon:00000000-0000-4000-8000-000000000000', '{"a":1}', 'x'.repeat(5000)]) {
    const storage = memoryStorage({ 'campuseats-rating-anon-id': bad });
    const id = anonymousUserId(storage);
    assert.match(id, ANON);
    assert.equal(anonymousUserId(storage), id);
    assert.equal(storage.getItem('campuseats-rating-anon-id'), id);
  }
  assert.match(anonymousUserId(memoryStorage()), ANON);
});

test('F22: blocked or full storage still gives a valid id, the same one within a visit', () => {
  const blocked = { getItem() { throw new DOMException('denied', 'SecurityError'); }, setItem() { throw new DOMException('denied', 'SecurityError'); } } as unknown as Storage;
  const first = anonymousUserId(blocked);
  assert.match(first, ANON);
  assert.equal(anonymousUserId(blocked), first);
  const full = memoryStorage({}, true);
  assert.match(anonymousUserId(full), ANON);
  assert.match(anonymousUserId(() => { throw new DOMException('denied', 'SecurityError'); }), ANON);
});

test('F23: impossible calendar dates are rejected, real ones (including a leap day) are accepted', async () => {
  for (const mealDate of ['2026-02-31', '2026-13-01', '2026-00-10', '2026-04-31', '2027-02-29', '26-10-09', '', 'garbage']) {
    await assert.rejects(saveMealRating({ ...rating, mealDate }, memoryStorage(), 'ratings', ''), /Invalid meal rating/, mealDate);
  }
  for (const mealDate of ['2028-02-29', '2026-10-09', '2026-12-31']) {
    await saveMealRating({ ...rating, mealDate, mealId: `m-${mealDate}` }, memoryStorage(), 'ratings', '');
  }
});
