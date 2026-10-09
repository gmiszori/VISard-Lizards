import type { Profile } from './profile.ts';
import { readStarredMeals } from '../meals/stars';

/** TODO(backend): replace this local mock with authenticated profile persistence. */
export function saveProfile(profile: Profile): void {
  localStorage.setItem('campuseats-profile', JSON.stringify({ ...profile, starredMeals: readStarredMeals() }));
  let raw: unknown;
  try { raw = JSON.parse(localStorage.getItem('campuseats-preferences') || '{}'); }
  catch { raw = {}; }
  const existing = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  localStorage.setItem('campuseats-preferences', JSON.stringify({ ...existing,
    priceTier: profile.priceTier,
    locations: [...new Set([profile.campus, ...profile.campusSecondary])],
    vegan: profile.diet !== 'carnivore', vegetarian: profile.diet !== 'vegan' && profile.diet !== 'carnivore',
    // Existing preferences group fish with meat; detailed diet filtering is in the payoff.
    meat: profile.diet !== 'vegan' && profile.diet !== 'vegetarian',
  }));
  localStorage.setItem('campuseats-language', profile.lang);
  const select = document.querySelector<HTMLSelectElement>('#language-select');
  if (select) { select.value = profile.lang; select.dispatchEvent(new Event('change', { bubbles: true })); }
  console.info('CampusEats profile', JSON.stringify(profile, null, 2));
}
