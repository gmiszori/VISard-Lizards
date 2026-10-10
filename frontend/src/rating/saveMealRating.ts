import { API_URL, ApiError, apiDelete, apiPost, type BackendMealRating } from '../data/api.ts';
import { isIsoDate } from '../data/menuDate.ts';
import type { RatingSource } from './getRatingPrompt.ts';

export type Stars = 1 | 2 | 3 | 4 | 5;
export interface MealRating {
  userId: string;
  mealId: string;
  mensaId: string;
  rating: Stars;
  ratedAt: string;
  mealDate: string;
  /** How the app knows the user ate there; crowd and guess ratings count half in the backend's average. */
  source?: RatingSource;
  /** Shown in Settings, "Your meal ratings" (device copy only, not sent). */
  mealName?: string;
  mensaName?: string;
}
export const RATINGS_KEY = 'campuseats-meal-ratings';
export class DuplicateMealRatingError extends Error {
  constructor() { super('This meal has already been rated.'); }
}
/** The anonymous id the backend identifies this device by: "anon:" + UUID (backend/API.md). */
const ANON_ID = /^anon:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let sessionId: string | undefined;
/** The stored id if it has the format the backend accepts; a new one otherwise. Works when storage is blocked. */
export function anonymousUserId(storage: Storage | (() => Storage) = () => localStorage): string {
  const key = 'campuseats-rating-anon-id';
  let store: Storage | undefined;
  try { store = typeof storage === 'function' ? storage() : storage; } catch { store = undefined; }
  let existing: string | null = null;
  try { existing = store?.getItem(key) ?? null; } catch { /* unreadable: make a new id */ }
  if (existing && ANON_ID.test(existing)) return existing;
  // Without usable storage the id lives for this visit only, but stays the same within it.
  const id = sessionId ?? `anon:${crypto.randomUUID()}`;
  try { store?.setItem(key, id); sessionId = undefined; } catch { sessionId = id; }
  return id;
}

/**
 * The only rating save boundary. With a backend (apiUrl, default PUBLIC_API_URL) the rating goes to
 * POST /api/meals/{id}/ratings, which enforces one rating per user and meal (409 -> DuplicateMealRatingError)
 * and stamps ratedAt. Every saved rating is also kept on this device, so the duplicate check works offline.
 * Without a backend (apiUrl ''), only the device copy is written. When the reverse proxy supplies
 * X-User-Id, the backend uses that trusted identity and returns it with the saved rating.
 */
export async function saveMealRating(value: MealRating, storage: Storage = localStorage, key = RATINGS_KEY,
  apiUrl = API_URL): Promise<void> {
  if (!value.userId || !value.mealId || !value.mensaId || ![1, 2, 3, 4, 5].includes(value.rating) ||
      !isIsoDate(value.mealDate) || !Number.isFinite(Date.parse(value.ratedAt))) {
    throw new Error('Invalid meal rating.');
  }
  let saved = value;
  if (apiUrl) {
    try {
      const response = await apiPost<BackendMealRating>(`/api/meals/${encodeURIComponent(value.mealId)}/ratings`,
        { userId: value.userId, stars: value.rating, ...(value.source ? { source: value.source } : {}) }, apiUrl);
      saved = { ...value, userId: response.userId, mensaId: response.mensaId, mealDate: response.mealDate, ratedAt: response.ratedAt };
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

/**
 * Takes a rating back ("Undo"): deletes it on the backend (DELETE /api/meals/{id}/ratings?userId=) and
 * from the device copy, so the meal can be rated again. A rating the backend no longer has counts as undone.
 */
export async function undoMealRating(value: Pick<MealRating, 'userId' | 'mealId'>, storage: Storage = localStorage,
  key = RATINGS_KEY, apiUrl = API_URL): Promise<void> {
  if (apiUrl) {
    try {
      await apiDelete(`/api/meals/${encodeURIComponent(value.mealId)}/ratings?userId=${encodeURIComponent(value.userId)}`, undefined, apiUrl);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
  try {
    const raw: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    if (Array.isArray(raw)) storage.setItem(key, JSON.stringify(raw.filter(r => !(r && r.userId === value.userId && r.mealId === value.mealId))));
  } catch { /* the device copy is only a cache */ }
}
