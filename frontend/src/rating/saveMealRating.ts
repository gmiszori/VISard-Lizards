import { API_URL, ApiError, apiPost, type BackendMealRating } from '../data/api.ts';

export type Stars = 1 | 2 | 3 | 4 | 5;
export interface MealRating {
  userId: string;
  mealId: string;
  mensaId: string;
  rating: Stars;
  ratedAt: string;
  mealDate: string;
}
export const RATINGS_KEY = 'campuseats-meal-ratings';
export class DuplicateMealRatingError extends Error {
  constructor() { super('This meal has already been rated.'); }
}
/** The anonymous id the backend identifies this device by: "anon:" + UUID (backend/API.md). */
export function anonymousUserId(storage: Storage = localStorage): string {
  const key = 'campuseats-rating-anon-id';
  const existing = storage.getItem(key);
  if (existing) return existing;
  const id = `anon:${crypto.randomUUID()}`;
  storage.setItem(key, id);
  return id;
}

/**
 * The only rating save boundary. With a backend (apiUrl, default PUBLIC_API_URL) the rating goes to
 * POST /api/meals/{id}/ratings, which enforces one rating per user and meal (409 -> DuplicateMealRatingError)
 * and stamps ratedAt. Every saved rating is also kept on this device, so the duplicate check works offline.
 * Without a backend (apiUrl ''), only the device copy is written.
 * The anonymous id is not authentication; a real account integration must provide a trusted identity here.
 */
export async function saveMealRating(value: MealRating, storage: Storage = localStorage, key = RATINGS_KEY,
  apiUrl = API_URL): Promise<void> {
  if (!value.userId || !value.mealId || !value.mensaId || ![1, 2, 3, 4, 5].includes(value.rating) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.mealDate) || !Number.isFinite(Date.parse(value.ratedAt))) {
    throw new Error('Invalid meal rating.');
  }
  let saved = value;
  if (apiUrl) {
    try {
      const response = await apiPost<BackendMealRating>(`/api/meals/${encodeURIComponent(value.mealId)}/ratings`,
        { userId: value.userId, stars: value.rating }, apiUrl);
      saved = { ...value, mensaId: response.mensaId, mealDate: response.mealDate, ratedAt: response.ratedAt };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) throw new DuplicateMealRatingError();
      throw error;
    }
  }
  const save = () => {
    const raw: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    if (!Array.isArray(raw)) throw new Error('Stored ratings could not be read.');
    const duplicate = raw.some(r => r && r.userId === value.userId && r.mealId === value.mealId);
    // The backend already accepted it, so a stale device copy is not a reason to fail.
    if (duplicate && !apiUrl) throw new DuplicateMealRatingError();
    if (!duplicate) storage.setItem(key, JSON.stringify([...raw, saved]));
  };
  // Serialize the device copy across browser tabs where Web Locks are available.
  const writeDeviceCopy = async () => {
    if (typeof window !== 'undefined' && navigator.locks) await navigator.locks.request(key, save);
    else save();
  };
  if (apiUrl) {
    // The server has already accepted the rating, so the device copy is only a cache for the offline
    // duplicate check. If it cannot be written (corrupt data, full storage) the rating still counts and
    // the user must not be told that saving failed.
    try { await writeDeviceCopy(); } catch { /* best effort */ }
    return;
  }
  await writeDeviceCopy();
}
