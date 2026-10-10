import type { CampusId } from '../data/canteens';
import { DIETS, HARD, PRIORITIES, TIERS, defaults, type MensaRating, type Profile } from './profile.ts';

export interface Draft { profile: Profile; step: number; picks: string[]; ratingScale: 5 }
const KEY = 'campuseats-onboarding';
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string');

export function createOnboardingStore(campuses: CampusId[], stepCount: number, restart = false) {
  // This factory is called only by main.ts in the browser, never during SSR.
  const lang = localStorage.getItem('campuseats-language') === 'de' ? 'de' : 'en';
  const initial = defaults(campuses[0]!, lang);
  let state: Draft = { profile: initial, step: 0, picks: [], ratingScale: 5 };
  if (restart) localStorage.removeItem(KEY);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Draft | null;
    const p = saved?.profile;
    if (p?.v === 1 && campuses.includes(p.campus) && [...DIETS, 'flexitarian', 'pescetarian'].includes(p.diet) && TIERS.includes(p.priceTier) &&
      (p.lang === 'en' || p.lang === 'de') && (p.priceMode === 'soft' || p.priceMode === 'hard') &&
      (p.maxPrice === null || (typeof p.maxPrice === 'number' && Number.isFinite(p.maxPrice) && p.maxPrice >= 0)) &&
      strings(p.campusSecondary) && strings(p.hard) && strings(p.soft) && strings(p.dislikes) &&
      strings(p.priority) && p.priority.length === PRIORITIES.length && new Set(p.priority).size === PRIORITIES.length &&
      p.priority.every(v => PRIORITIES.includes(v)) && typeof p.notifyDaily === 'boolean' &&
      (p.lunchTime === null || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(p.lunchTime)) &&
      Array.isArray(p.mensaRatings) && p.mensaRatings.every(r => typeof r.mensaId === 'string' &&
        [1, 2, 3, 4, 5].includes(r.rating) && (saved.ratingScale === 5 || r.rating <= 3))) {
      state = { profile: { ...p,
        // Preserve the rest of a draft made before the diet choices were simplified.
        diet: DIETS.includes(p.diet) ? p.diet : 'omnivore',
        campusSecondary: [...new Set(p.campusSecondary.filter(id => campuses.includes(id) && id !== p.campus))],
        hard: p.hard.filter(v => HARD.includes(v)),
        // The finishing-preferences step is deferred; don't apply its older answers silently.
        soft: [], dislikes: [], lunchTime: null, notifyDaily: false,
        // Preserve previous avoid / fine / love answers as 1 / 3 / 5 stars.
        mensaRatings: p.mensaRatings.map(r => ({ ...r,
          rating: (saved.ratingScale === 5 ? r.rating : r.rating * 2 - 1) as MensaRating })) },
        step: Number.isInteger(saved.step) ? Math.max(0, Math.min(stepCount - 1, saved.step)) : 0,
        picks: strings(saved.picks) ? [...new Set(saved.picks)] : [], ratingScale: 5 };
    }
  } catch { /* Invalid or older drafts start with safe defaults. */ }
  const persist = () => localStorage.setItem(KEY, JSON.stringify(state));
  return {
    get state() { return state; },
    update(patch: Partial<Profile>) { state = { ...state, profile: { ...state.profile, ...patch } }; persist(); },
    setStep(step: number) { state.step = step; persist(); },
    setPicks(picks: string[]) { state.picks = picks; persist(); },
    clear() { localStorage.removeItem(KEY); },
  };
}
export type OnboardingStore = ReturnType<typeof createOnboardingStore>;
