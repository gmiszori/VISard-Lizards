import { HARD, TIERS, type Profile } from './profile.ts';

export type EditableProfileSettings = Partial<Pick<Profile, 'hard' | 'priceTier' | 'maxPrice' | 'priceMode'>>;
const PROFILE_KEY = 'campuseats-profile';
const DRAFT_KEY = 'campuseats-onboarding';
const OVERRIDES_KEY = 'campuseats-profile-overrides';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readJson(store: Store, key: string): Record<string, unknown> | null {
  try { return object(JSON.parse(store.getItem(key) ?? 'null')); } catch { return null; }
}

function readProfilePart(value: unknown): EditableProfileSettings {
  const source = object(value);
  if (!source) return {};
  const result: EditableProfileSettings = {};
  if (Array.isArray(source.hard)) result.hard = source.hard.filter((entry): entry is Profile['hard'][number] =>
    typeof entry === 'string' && HARD.includes(entry as Profile['hard'][number]));
  if (TIERS.includes(source.priceTier as Profile['priceTier'])) result.priceTier = source.priceTier as Profile['priceTier'];
  if (source.maxPrice === null || (typeof source.maxPrice === 'number' && Number.isFinite(source.maxPrice) && source.maxPrice >= 0)) {
    result.maxPrice = source.maxPrice as number | null;
  }
  if (source.priceMode === 'soft' || source.priceMode === 'hard') result.priceMode = source.priceMode;
  return result;
}

/** Read persisted onboarding-specific settings, including edits made before the first completed onboarding. */
export function readProfileSettings(store: Store = localStorage): EditableProfileSettings {
  const profile = readJson(store, PROFILE_KEY);
  const draft = readJson(store, DRAFT_KEY);
  const draftProfile = object(draft?.profile);
  const overrides = readJson(store, OVERRIDES_KEY);
  return { ...readProfilePart(profile), ...readProfilePart(draftProfile), ...readProfilePart(overrides) };
}

/** Keep the saved profile, in-progress onboarding draft, and pre-onboarding overrides aligned. */
export function writeProfileSettings(patch: EditableProfileSettings, store: Store = localStorage): void {
  const overrides = readJson(store, OVERRIDES_KEY) ?? {};
  store.setItem(OVERRIDES_KEY, JSON.stringify({ ...overrides, ...patch }));

  const profile = readJson(store, PROFILE_KEY);
  if (profile?.v === 1) store.setItem(PROFILE_KEY, JSON.stringify({ ...profile, ...patch }));

  const draft = readJson(store, DRAFT_KEY);
  const draftProfile = object(draft?.profile);
  if (draft && draftProfile) store.setItem(DRAFT_KEY, JSON.stringify({ ...draft, profile: { ...draftProfile, ...patch } }));
}

export function clearProfileSettingsOverrides(store: Store = localStorage): void {
  try { store.removeItem(OVERRIDES_KEY); } catch { /* Keep the saved profile as the source of truth. */ }
}
