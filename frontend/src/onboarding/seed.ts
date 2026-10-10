import type { CampusId } from '../data/canteens';
import type { Preferences } from '../preferences/state.ts';
import { DIETS, HARD, PRIORITIES, TIERS, type Profile } from './profile.ts';

/**
 * The answers "Replay onboarding" starts from: the saved profile, with the current Settings winning wherever
 * Settings can change the same choice (price category, campuses). Without this, replaying silently reset
 * those choices to the defaults. Anything missing or invalid is left out, so the defaults apply to it.
 */
export function seedProfile(saved: unknown, preferences: Pick<Preferences, 'priceTier' | 'locations'>, campuses: readonly CampusId[]): Partial<Profile> {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || (saved as { v?: unknown }).v !== 1) return {};
  const p = saved as Partial<Profile>;
  const seed: Partial<Profile> = {};
  const known = (id: unknown): id is CampusId => typeof id === 'string' && (campuses as readonly string[]).includes(id);
  const profileCampus = known(p.campus) ? p.campus : undefined;
  const fromSettings = preferences.locations.filter(known);
  const fromProfile = [profileCampus, ...(Array.isArray(p.campusSecondary) ? p.campusSecondary : [])].filter(known);
  const chosen = [...new Set(fromSettings.length ? fromSettings : fromProfile)];
  if (chosen.length) {
    const campus = profileCampus && chosen.includes(profileCampus) ? profileCampus : chosen[0]!;
    seed.campus = campus;
    seed.campusSecondary = chosen.filter(id => id !== campus);
  }
  if (TIERS.includes(preferences.priceTier)) seed.priceTier = preferences.priceTier;
  if (p.diet && DIETS.includes(p.diet)) seed.diet = p.diet;
  if (Array.isArray(p.hard)) seed.hard = p.hard.filter(value => HARD.includes(value));
  if (p.priceMode === 'soft' || p.priceMode === 'hard') seed.priceMode = p.priceMode;
  if (p.maxPrice === null || (typeof p.maxPrice === 'number' && Number.isFinite(p.maxPrice) && p.maxPrice >= 0)) seed.maxPrice = p.maxPrice;
  if (Array.isArray(p.priority) && p.priority.length === PRIORITIES.length && new Set(p.priority).size === PRIORITIES.length &&
    p.priority.every(value => PRIORITIES.includes(value))) seed.priority = [...p.priority];
  return seed;
}
