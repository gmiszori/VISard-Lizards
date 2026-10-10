import type { Profile } from '../onboarding/profile';
import { getRatingPrompt, zurichTime, type MensaChoice, type RatingPromptState } from './getRatingPrompt.ts';
export const STATE_KEY = 'campuseats-meal-rating-state';
const empty = (): RatingPromptState => ({ resolvedDates: [], dismissedDates: [], promptedDays: {} });
const dates = (value: unknown): value is string[] => Array.isArray(value) && value.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));

/** Shown to users who have not picked any mensa yet, so the card is never an empty list. */
export const DEFAULT_MENSA_IDS: readonly string[] = ['polyterrasse', 'uzh-untere-mensa'];

/**
 * Up to four mensas to suggest: favourites first, then the best profile ratings. Without either, a preview
 * of the default mensas (Polyterrasse, UZH Untere Mensa); if one of them serves no meals it is replaced by
 * the next mensa that does. Unreadable input (corrupt profile, non-array favourites) is ignored, never thrown on.
 */
export function mensaCandidates(mensas: MensaChoice[], profile: Partial<Profile> | null, favourites: string[]): MensaChoice[] {
  const known = Array.isArray(mensas) ? mensas.filter(m => m && typeof m.mensaId === 'string' && typeof m.name === 'string') : [];
  const favs = Array.isArray(favourites) ? favourites.filter((id): id is string => typeof id === 'string') : [];
  const rawRatings = Array.isArray(profile?.mensaRatings) ? profile.mensaRatings : [];
  const ratings = new Map(rawRatings.filter(r => r && typeof r.mensaId === 'string' && [1, 2, 3, 4, 5].includes(r.rating)).map(r => [r.mensaId, r.rating]));
  const chosen = [...new Map(known.filter(m => favs.includes(m.mensaId) || ratings.has(m.mensaId)).map(m => [m.mensaId, m])).values()]
    .sort((a, b) => Number(favs.includes(b.mensaId)) - Number(favs.includes(a.mensaId)) ||
      (ratings.get(b.mensaId) ?? 0) - (ratings.get(a.mensaId) ?? 0)).slice(0, 4);
  if (chosen.length) return chosen;
  // First use: preview the defaults, then top up with other mensas that serve meals.
  const serving = [...new Map(known.filter(m => m.hasMenu !== false).map(m => [m.mensaId, m])).values()];
  const defaults = DEFAULT_MENSA_IDS.flatMap(id => serving.filter(m => m.mensaId === id));
  return [...defaults, ...serving.filter(m => !defaults.includes(m))].slice(0, DEFAULT_MENSA_IDS.length);
}

/** Framework-free state controller; every storage failure is surfaced to the card. */
export function useRatingPrompt(now: () => Date, candidates: MensaChoice[] | (() => MensaChoice[]), storage: Storage = localStorage, key = STATE_KEY) {
  function read(): RatingPromptState {
    const value: unknown = JSON.parse(storage.getItem(key) ?? 'null');
    if (value === null) return empty();
    const s = value as RatingPromptState;
    if (!s || !dates(s.resolvedDates) || !dates(s.dismissedDates) || !s.promptedDays || Array.isArray(s.promptedDays) || typeof s.promptedDays !== 'object' ||
        !Object.entries(s.promptedDays).every(([d, target]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && typeof target === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(target))) {
      throw new Error('Stored rating prompt state could not be read.');
    }
    return s;
  }
  return {
    current: () => getRatingPrompt(now(), typeof candidates === 'function' ? candidates() : candidates, read()),
    shown(date: string) {
      const state = read();
      const today = zurichTime(now()).date;
      if (state.promptedDays[today] === date) return;
      state.promptedDays[today] = date;
      storage.setItem(key, JSON.stringify(state));
    },
    resolve(date: string, dismissed = false) {
      const state = read();
      const field = dismissed ? 'dismissedDates' : 'resolvedDates';
      state[field] = [...new Set([...state[field], date])];
      storage.setItem(key, JSON.stringify(state));
    },
  };
}
