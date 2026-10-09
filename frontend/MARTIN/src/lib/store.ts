import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type {
  CampusId,
  CrowdReport,
  DietTag,
  LastEaten,
  MealRating,
  MensaRating,
  PriceCategory,
} from './types';

/**
 * User state shared across all islands, persisted in localStorage.
 * Nothing here leaves the device. When accounts exist, these atoms are the
 * natural place to sync with the backend.
 */

export type DietFilter = 'all' | 'vegan' | 'vegetarian' | 'meat';
export type SortMode = 'recommended' | 'protein' | 'price' | 'rating' | 'distance';

/** Slider position that means "no kcal limit". */
export const KCAL_OFF = 1200;
export const KCAL_MIN = 300;
export const PROTEIN_MAX = 60;

const json = { encode: JSON.stringify, decode: JSON.parse } as const;
const KEY = (k: string) => `tablett:${k}`;

function store<T>(key: string, initial: T) {
  return persistentAtom<T>(KEY(key), initial, json);
}

export const favouriteMensaIds = store<string[]>('favouriteMensaIds', []);
export const hiddenMensaIds = store<string[]>('hiddenMensaIds', []);
export const dietFilter = store<DietFilter>('dietFilter', 'all');
export const minProtein = store<number>('minProtein', 0);
export const maxKcal = store<number>('maxKcal', KCAL_OFF);
export const priceCategory = store<PriceCategory>('priceCategory', 'student');
/** null = detect automatically (geolocation), otherwise the user's pick. */
export const campus = store<CampusId | null>('campus', null);
export const sortMode = store<SortMode>('sortMode', 'recommended');
export const lastEaten = store<LastEaten | null>('lastEaten', null);
export const myMealRatings = store<Record<string, MealRating>>('myMealRatings', {});
export const myMensaRatings = store<Record<string, MensaRating>>('myMensaRatings', {});
export const myCrowdReports = store<CrowdReport[]>('myCrowdReports', []);
/** Epoch ms (real clock, never simulated) of the last check-in popup. */
export const lastCheckInPromptAt = store<number>('lastCheckInPromptAt', 0);

/** Developer-panel state. Lets every feature be tested on a laptop. */
export interface DevState {
  /** ISO local datetime that replaces "now" everywhere, or null. */
  simNow: string | null;
  /** Pretend the user stands at this mensa. */
  simMensaId: string | null;
  /** Make every API call throw, to test error states. */
  apiFail: boolean;
}
export const dev = store<DevState>('dev', { simNow: null, simMensaId: null, apiFail: false });

// ───────── Ephemeral (not persisted) ─────────

/** Bumped after every submission so data hooks refetch and the UI updates at once. */
export const dataVersion = atom(0);
export const bumpData = () => dataVersion.set(dataVersion.get() + 1);

/** Opens the check-in sheet. `force` ignores the 45 minute cooldown. */
export interface CheckInRequest {
  mensaId: string;
  nonce: number;
  /** Only ask the crowd question, skip the "how was your last meal" step. */
  onlyCrowd: boolean;
}
export const checkInRequest = atom<CheckInRequest | null>(null);
export function requestCheckIn(mensaId: string, onlyCrowd = false) {
  checkInRequest.set({ mensaId, nonce: Date.now(), onlyCrowd });
}

/** Text announced to screen readers and shown as a short toast. */
export const announcement = atom<{ text: string; nonce: number } | null>(null);
export function announce(text: string) {
  announcement.set({ text, nonce: Date.now() });
}

// ───────── Actions ─────────

const without = (list: string[], id: string) => list.filter((x) => x !== id);

export function toggleFavourite(id: string) {
  const favs = favouriteMensaIds.get();
  if (favs.includes(id)) {
    favouriteMensaIds.set(without(favs, id));
  } else {
    favouriteMensaIds.set([...favs, id]);
    hiddenMensaIds.set(without(hiddenMensaIds.get(), id));
  }
}

export function toggleHidden(id: string) {
  const hidden = hiddenMensaIds.get();
  if (hidden.includes(id)) {
    hiddenMensaIds.set(without(hidden, id));
  } else {
    hiddenMensaIds.set([...hidden, id]);
    favouriteMensaIds.set(without(favouriteMensaIds.get(), id));
  }
}

export function setLastEaten(value: LastEaten | null) {
  lastEaten.set(value);
}

export function resetFilters() {
  dietFilter.set('all');
  minProtein.set(0);
  maxKcal.set(KCAL_OFF);
}

export function recordMealRating(r: MealRating) {
  myMealRatings.set({ ...myMealRatings.get(), [r.mealId]: r });
}
export function recordMensaRating(r: MensaRating) {
  myMensaRatings.set({ ...myMensaRatings.get(), [r.mensaId]: r });
}
export function recordCrowdReport(r: CrowdReport) {
  myCrowdReports.set([r, ...myCrowdReports.get()].slice(0, 100));
}

/** Wipes every Tablett key from localStorage (including the mock database). */
export function resetAllLocalData() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('tablett:')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
  favouriteMensaIds.set([]);
  hiddenMensaIds.set([]);
  dietFilter.set('all');
  minProtein.set(0);
  maxKcal.set(KCAL_OFF);
  priceCategory.set('student');
  campus.set(null);
  sortMode.set('recommended');
  lastEaten.set(null);
  myMealRatings.set({});
  myMensaRatings.set({});
  myCrowdReports.set([]);
  lastCheckInPromptAt.set(0);
  dev.set({ simNow: null, simMensaId: null, apiFail: false });
  bumpData();
}

export const DIET_LABEL: Record<DietTag, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  meat: 'Meat',
  fish: 'Fish',
};
