import type { Profile } from './profile.ts';
import { readStarredMeals } from '../meals/stars.ts';

const PROFILE_KEY = 'campuseats-profile';
const PREFERENCES_KEY = 'campuseats-preferences';
const LANGUAGE_KEY = 'campuseats-language';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Saves the finished profile on this device and applies the language. Returns false when it could not be
 * saved (storage full or blocked); nothing is half-written in that case, see writeProfile.
 * TODO(backend): replace this local mock with authenticated profile persistence.
 */
export function saveProfile(profile: Profile): boolean {
  let saved = true;
  try { writeProfile(profile, localStorage, starredMeals()); }
  catch { saved = false; console.warn('CampusEats could not save the profile on this device.'); }
  const select = document.querySelector<HTMLSelectElement>('#language-select');
  if (select) { select.value = profile.lang; select.dispatchEvent(new Event('change', { bubbles: true })); }
  return saved;
}

function starredMeals(): string[] {
  try { return readStarredMeals(); } catch { return []; } // unreadable starred meals: start empty
}

function readOrNull(store: Store, key: string): string | null {
  try { return store.getItem(key); } catch { return null; }
}

/**
 * Writes the profile, the matching preferences and the language as one unit. If a write fails (storage full
 * or blocked), the keys that were already replaced are put back, so the device never ends up with a profile
 * whose preferences or language belong to an older answer. The error is rethrown.
 */
export function writeProfile(profile: Profile, store: Store, starred: string[]): void {
  let raw: unknown;
  try { raw = JSON.parse(store.getItem(PREFERENCES_KEY) || '{}'); } catch { raw = {}; }
  const existing = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const writes: Array<[string, string]> = [
    [PROFILE_KEY, JSON.stringify({ ...profile, starredMeals: starred })],
    [PREFERENCES_KEY, JSON.stringify({ ...existing,
      priceTier: profile.priceTier,
      locations: [...new Set([profile.campus, ...profile.campusSecondary])],
      vegan: profile.diet !== 'carnivore', vegetarian: profile.diet !== 'vegan' && profile.diet !== 'carnivore',
      // Existing preferences group fish with meat; detailed diet filtering is in the payoff.
      meat: profile.diet !== 'vegan' && profile.diet !== 'vegetarian',
    })],
    [LANGUAGE_KEY, profile.lang],
  ];
  const previous = new Map(writes.map(([key]) => [key, readOrNull(store, key)]));
  const replaced: string[] = [];
  try {
    for (const [key, value] of writes) { store.setItem(key, value); replaced.push(key); }
  } catch (error) {
    for (const key of replaced) {
      const old = previous.get(key) ?? null;
      try { if (old === null) store.removeItem(key); else store.setItem(key, old); } catch { /* best effort */ }
    }
    throw error;
  }
}
