import type { Profile } from '../onboarding/profile';
import { getRatingPrompt, zurichTime, type MensaChoice, type RatingPromptState } from './getRatingPrompt.ts';
export const STATE_KEY = 'campuseats-meal-rating-state';
const empty = (): RatingPromptState => ({ resolvedDates: [], dismissedDates: [], promptedDays: {} });
const dates = (value: unknown): value is string[] => Array.isArray(value) && value.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));

export function mensaCandidates(mensas: MensaChoice[], profile: Partial<Profile> | null, favourites: string[]): MensaChoice[] {
  const ratings = new Map((Array.isArray(profile?.mensaRatings) ? profile.mensaRatings : []).filter(r => r && typeof r.mensaId === 'string' && [1, 2, 3, 4, 5].includes(r.rating)).map(r => [r.mensaId, r.rating]));
  const choices = [...new Map(mensas.filter(m => favourites.includes(m.mensaId) || ratings.has(m.mensaId)).map(m => [m.mensaId, m])).values()]
    .sort((a, b) => Number(favourites.includes(b.mensaId)) - Number(favourites.includes(a.mensaId)) ||
      (ratings.get(b.mensaId) ?? 0) - (ratings.get(a.mensaId) ?? 0)).slice(0, 4);
  if (choices.length) return choices;
  // First use still has useful suggestions; Other mensa / skip are always shown.
  const defaults = ['polyterrasse', 'uzh-untere-mensa'];
  return defaults.flatMap(id => { const mensa = mensas.find(m => m.mensaId === id); return mensa ? [mensa] : []; });
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
