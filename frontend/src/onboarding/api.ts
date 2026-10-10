import type { Profile } from './profile.ts';
import { readStarredMeals } from '../meals/stars';

/** TODO(backend): replace this local mock with authenticated profile persistence. */
export function saveProfile(profile: Profile): void {
  try { writeProfile(profile); }
  catch (error) { console.warn('CampusEats could not save your profile on this device:', (error as Error).message); }
  const select = document.querySelector<HTMLSelectElement>('#language-select');
  if (select) { select.value = profile.lang; select.dispatchEvent(new Event('change', { bubbles: true })); }
  console.info('CampusEats profile', JSON.stringify(profile, null, 2));
}

function writeProfile(profile: Profile): void {
  let starred: ReturnType<typeof readStarredMeals> = [];
  try { starred = readStarredMeals(); } catch { /* unreadable starred meals: start empty */ }
  localStorage.setItem('campuseats-profile', JSON.stringify({ ...profile, starredMeals: starred }));
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
}
