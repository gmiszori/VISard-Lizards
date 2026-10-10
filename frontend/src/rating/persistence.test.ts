import test from 'node:test';
import assert from 'node:assert/strict';
import { DuplicateMealRatingError, saveMealRating, type MealRating } from './saveMealRating.ts';
import { mensaCandidates, useRatingPrompt } from './useRatingPrompt.ts';
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, clear: () => data.clear(), key: i => [...data.keys()][i] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
}
const rating: MealRating = { userId: 'anon:a', mealId: 'archimedes.2026-10-09.lunch.1', mensaId: 'archimedes', rating: 3,
  ratedAt: '2026-10-09T12:00:00.000Z', mealDate: '2026-10-09' };
test('saves exact rating payload; rejects same user + meal; another user may rate it', async () => {
  const storage = memoryStorage();
  await saveMealRating(rating, storage, 'ratings');
  assert.deepEqual(JSON.parse(storage.getItem('ratings')!), [rating]);
  await assert.rejects(saveMealRating({ ...rating, rating: 1 }, storage, 'ratings'), DuplicateMealRatingError);
  await saveMealRating({ ...rating, userId: 'anon:b' }, storage, 'ratings');
  assert.equal(JSON.parse(storage.getItem('ratings')!).length, 2);
});
test('rejects invalid ratings and surfaces persistence failures', async () => {
  const storage = memoryStorage();
  await assert.rejects(saveMealRating({ ...rating, rating: 5 as 3 }, storage, 'ratings'));
  storage.setItem('ratings', 'broken');
  await assert.rejects(saveMealRating(rating, storage, 'ratings'));
  storage.setItem('ratings', '[]'); storage.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(saveMealRating(rating, storage, 'ratings'), /Quota/);
});
test('state survives reload; morning resolution blocks a second afternoon prompt', () => {
  const storage = memoryStorage(); let now = new Date('2026-10-10T10:00:00+02:00');
  const first = useRatingPrompt(() => now, [], storage, 'state');
  const date = first.current()!.date; first.shown(date); first.resolve(date);
  now = new Date('2026-10-10T14:00:00+02:00');
  assert.equal(useRatingPrompt(() => now, [], storage, 'state').current(), null);
});
test('dismissal persists permanently and state failures do not resolve', () => {
  const storage = memoryStorage(); const now = () => new Date('2026-10-09T14:00:00+02:00');
  const store = useRatingPrompt(now, [], storage, 'state');
  store.shown('2026-10-09'); store.resolve('2026-10-09', true);
  assert.equal(useRatingPrompt(now, [], storage, 'state').current(), null);
  assert.deepEqual(JSON.parse(storage.getItem('state')!).dismissedDates, ['2026-10-09']);
  storage.setItem('state', 'bad'); assert.throws(() => store.current());
  storage.setItem('state', JSON.stringify({ resolvedDates: [], dismissedDates: [], promptedDays: [] }));
  assert.throws(() => store.current());
});
test('favourites first, highest mensa ratings next, maximum four unique choices', () => {
  const mensas = [1, 2, 3, 4, 5, 6].map(i => ({ mensaId: String(i), name: String(i) }));
  assert.deepEqual(mensaCandidates(mensas, { mensaRatings: [{ mensaId: '1', rating: 2 }, { mensaId: '2', rating: 5 },
    { mensaId: '3', rating: 4 }, { mensaId: '4', rating: 3 }, { mensaId: '5', rating: 1 }] }, ['6', '3']).map(m => m.mensaId), ['3', '6', '2', '4']);
});
