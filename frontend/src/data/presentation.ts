/** Consistent display text; source names and meal IDs remain available for matching. */
export type MealCapitalization = 'upper' | 'title' | 'sentence' | 'lower';
export const DEFAULT_MEAL_CAPITALIZATION: MealCapitalization = 'title';

export const isMealCapitalization = (value: unknown): value is MealCapitalization =>
  value === 'upper' || value === 'title' || value === 'sentence' || value === 'lower';

export function dishName(name: string, capitalization: MealCapitalization = DEFAULT_MEAL_CAPITALIZATION): string {
  const clean = name.replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (capitalization === 'upper') return clean.toLocaleUpperCase('de-CH');
  const lower = clean.toLocaleLowerCase('de-CH');
  if (capitalization === 'title') return lower.replace(/\p{L}[\p{L}\p{M}\p{N}'’]*/gu,
    word => word[0]!.toLocaleUpperCase('de-CH') + word.slice(1));
  if (capitalization === 'sentence') return lower.replace(/\p{L}/u, letter => letter.toLocaleUpperCase('de-CH'));
  return lower;
}

export function formatMenuDay(date: string, language: 'en' | 'de' = 'en'): string {
  return new Intl.DateTimeFormat(language === 'de' ? 'de-CH' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`)).replace(/,/g, '');
}
