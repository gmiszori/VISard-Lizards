import { normalizeAvoid, type AllergenId } from '../allergens/allergens.ts';
export interface Preferences {
  vegan: boolean; vegetarian: boolean; meat: boolean; compact: boolean;
  locations: string[]; openOnly: boolean; priceTier: 'student' | 'worker' | 'external';
  /** Allergen ids (allergens/allergens.ts) whose dishes are hidden. */
  avoid: AllergenId[];
}
export const PREFERENCES_KEY = 'campuseats-preferences';
export const FAVOURITES_KEY = 'campuseats-favourites';
const campuses = ['zentrum', 'hoenggerberg', 'irchel'];
const legacy: Record<string, string> = { 'ETH Zentrum': 'zentrum', 'UZH Zentrum': 'zentrum', 'ETH Hönggerberg': 'hoenggerberg', 'UZH Irchel': 'irchel' };
export const isPriceTier = (value: unknown): value is Preferences['priceTier'] => value === 'student' || value === 'worker' || value === 'external';

/** Treat persisted JSON as untrusted input. An intentional empty campus list stays empty. */
export function normalizePreferences(value: unknown, profileTier: unknown = 'student'): Preferences {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const raw = Array.isArray(saved.locations) ? saved.locations : typeof saved.campus === 'string' && saved.campus !== 'all' ? [saved.campus] : campuses;
  const valid = raw.filter((v): v is string => typeof v === 'string').map(v => legacy[v] ?? v).filter(v => campuses.includes(v));
  const locations = raw.length && !valid.length ? campuses : [...new Set(valid)];
  const bool = (key: string, fallback: boolean) => typeof saved[key] === 'boolean' ? saved[key] as boolean : fallback;
  return { vegan: bool('vegan', true), vegetarian: bool('vegetarian', true), meat: bool('meat', true), compact: bool('compact', false),
    openOnly: bool('openOnly', false), priceTier: isPriceTier(saved.priceTier) ? saved.priceTier : isPriceTier(profileTier) ? profileTier : 'student', locations,
    avoid: normalizeAvoid(saved.avoid) };
}
export function readPreferences(storage: Pick<Storage, 'getItem'> = localStorage): Preferences {
  try {
    let saved: unknown;
    try { saved = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? 'null'); } catch { saved = null; }
    let profile: { priceTier?: unknown } | null = null;
    try { profile = JSON.parse(storage.getItem('campuseats-profile') ?? 'null'); } catch { /* Defaults. */ }
    return normalizePreferences(saved, profile?.priceTier);
  } catch { return normalizePreferences(null); }
}
export function readFavourites(storage: Pick<Storage, 'getItem'> = localStorage): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(FAVOURITES_KEY) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))] : [];
  } catch { return []; }
}
