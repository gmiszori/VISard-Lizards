import { DEFAULT_MEAL_CAPITALIZATION, isMealCapitalization, type MealCapitalization } from '../data/presentation.ts';

export interface Preferences {
  vegan: boolean; vegetarian: boolean; meat: boolean; viewMode: 'standard' | 'compact' | 'list';
  locations: string[]; openOnly: boolean; distanceDefault: boolean; useAiVoiceSearch: boolean; priceTier: 'student' | 'worker' | 'external';
  devMode: boolean; mealCapitalization: MealCapitalization;
}
export const PREFERENCES_KEY = 'campuseats-preferences';
export const FAVOURITES_KEY = 'campuseats-favourites';
export const ALL_CAMPUS_IDS = ['zentrum', 'hoenggerberg', 'irchel', 'oerlikon', 'basel', 'toni-areal', 'europaallee'];
const legacy: Record<string, string> = { 'ETH Zentrum': 'zentrum', 'UZH Zentrum': 'zentrum', 'ETH Hönggerberg': 'hoenggerberg', 'UZH Irchel': 'irchel' };
export const isPriceTier = (value: unknown): value is Preferences['priceTier'] => value === 'student' || value === 'worker' || value === 'external';
export const isViewMode = (value: unknown): value is Preferences['viewMode'] => value === 'standard' || value === 'compact' || value === 'list';

/** Treat persisted JSON as untrusted input. An intentional empty campus list stays empty. */
export function normalizePreferences(value: unknown, profileTier: unknown = 'student', profileLocations?: unknown): Preferences {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const raw = Array.isArray(saved.locations) ? saved.locations
    : Array.isArray(profileLocations) ? profileLocations
      : typeof saved.campus === 'string' && saved.campus !== 'all' ? [saved.campus] : ALL_CAMPUS_IDS;
  const valid = raw.filter((v): v is string => typeof v === 'string').map(v => legacy[v] ?? v).filter(v => ALL_CAMPUS_IDS.includes(v));
  const locations = raw.length && !valid.length ? [...ALL_CAMPUS_IDS] : [...new Set(valid)];
  const bool = (key: string, fallback: boolean) => typeof saved[key] === 'boolean' ? saved[key] as boolean : fallback;
  // All three food categories off would hide every dish; an older save may hold that, so it means "all on".
  const diets = { vegan: bool('vegan', true), vegetarian: bool('vegetarian', true), meat: bool('meat', true) };
  if (!diets.vegan && !diets.vegetarian && !diets.meat) { diets.vegan = true; diets.vegetarian = true; diets.meat = true; }
  return { ...diets,
    viewMode: isViewMode(saved.viewMode) ? saved.viewMode : bool('compact', false) ? 'compact' : 'standard',
    openOnly: bool('openOnly', false),
    distanceDefault: bool('distanceDefault', false),
    useAiVoiceSearch: bool('useAiVoiceSearch', bool('useAiSearch', true)),
    priceTier: isPriceTier(saved.priceTier) ? saved.priceTier : isPriceTier(profileTier) ? profileTier : 'student',
    locations, devMode: bool('devMode', false),
    mealCapitalization: isMealCapitalization(saved.mealCapitalization) ? saved.mealCapitalization : DEFAULT_MEAL_CAPITALIZATION };
}
export function readPreferences(storage: Pick<Storage, 'getItem'> = localStorage): Preferences {
  try {
    let saved: unknown;
    try { saved = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? 'null'); } catch { saved = null; }
    let profile: Record<string, unknown> | null = null;
    try { profile = JSON.parse(storage.getItem('campuseats-profile') ?? 'null'); } catch { /* Defaults. */ }
    const profileLocations = profile && typeof profile.campus === 'string'
      ? [profile.campus, ...(Array.isArray(profile.campusSecondary) ? profile.campusSecondary : [])]
      : undefined;
    const preferences = normalizePreferences(saved, profile?.priceTier, profileLocations);
    if (!(saved && typeof saved === 'object' && !Array.isArray(saved) && typeof (saved as Record<string, unknown>).distanceDefault === 'boolean') &&
      storage.getItem('campuseats-near-me') === '1') preferences.distanceDefault = true;
    return preferences;
  } catch { return normalizePreferences(null); }
}
export function readFavourites(storage: Pick<Storage, 'getItem'> = localStorage): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(FAVOURITES_KEY) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))] : [];
  } catch { return []; }
}
