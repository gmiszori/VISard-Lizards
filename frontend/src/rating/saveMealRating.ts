export interface MealRating {
  userId: string;
  mealId: string;
  mensaId: string;
  rating: 1 | 2 | 3;
  ratedAt: string;
  mealDate: string;
}
export const RATINGS_KEY = 'campuseats-meal-ratings';
export class DuplicateMealRatingError extends Error {
  constructor() { super('This meal has already been rated.'); }
}
export function anonymousUserId(storage: Storage = localStorage): string {
  const key = 'campuseats-rating-anon-id';
  const existing = storage.getItem(key);
  if (existing) return existing;
  const id = `anon:${crypto.randomUUID()}`;
  storage.setItem(key, id);
  return id;
}

/** TODO(backend): replace the local mock with the real authenticated rating endpoint.
 * Enforce UNIQUE(userId, mealId) server-side, and validate meal/mensa/date membership.
 * The demo login is deliberately not an authenticated user identity.
 */
export async function saveMealRating(value: MealRating, storage: Storage = localStorage, key = RATINGS_KEY): Promise<void> {
  if (!value.userId || !value.mealId || !value.mensaId || ![1, 2, 3].includes(value.rating) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.mealDate) || !Number.isFinite(Date.parse(value.ratedAt))) {
    throw new Error('Invalid meal rating.');
  }
  const save = () => {
    const raw: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    if (!Array.isArray(raw)) throw new Error('Stored ratings could not be read.');
    if (raw.some(r => r && r.userId === value.userId && r.mealId === value.mealId)) throw new DuplicateMealRatingError();
    storage.setItem(key, JSON.stringify([...raw, value]));
  };
  // Serialize this local mock across browser tabs where Web Locks are available.
  if (typeof window !== 'undefined' && navigator.locks) await navigator.locks.request(key, save);
  else save();
}
