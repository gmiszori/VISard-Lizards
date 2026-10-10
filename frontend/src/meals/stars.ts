export const PROFILE_KEY = 'campuseats-profile';

export function normalizedName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

/** Save the dish name as shown, with whitespace tidied up. */
export function starName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/**
 * A star matches only the exact same dish name (ignoring case and spacing), so the
 * same dish is found on other days or at other canteens, but starring one dish never
 * stars a different dish that merely shares a word ("Pasta", "Ground Meat", "Bowl").
 */
export function matchesMeal(name: string, stars: string[]): boolean {
  const normalized = normalizedName(name);
  return normalized.length > 0 && stars.some(saved => normalizedName(saved) === normalized);
}

function readProfile(): Record<string, unknown> {
  const value: unknown = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readStarredMeals(): string[] {
  try {
    const saved = readProfile().starredMeals;
    if (!Array.isArray(saved)) return [];
    const meals = saved.map(item => typeof item === 'string' ? item : item?.name)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0).map(starName).filter(Boolean);
    return [...new Map(meals.map(name => [normalizedName(name), name])).values()];
  } catch { return []; }
}

export function writeStarredMeals(meals: string[]): void {
  let profile: Record<string, unknown>;
  try { profile = readProfile(); } catch { profile = {}; }
  // Stars can be saved before personalization; filling in the profile later preserves them.
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, starredMeals: meals }));
}
