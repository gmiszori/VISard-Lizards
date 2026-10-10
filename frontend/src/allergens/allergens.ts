export type Lang = 'en' | 'de';

/** The 14 EU allergens as the backend names them, with the labels the pages show. */
export const ALLERGENS = [
  { id: 'gluten', en: 'Gluten', de: 'Gluten' },
  { id: 'crustaceans', en: 'Crustaceans', de: 'Krebstiere' },
  { id: 'eggs', en: 'Eggs', de: 'Eier' },
  { id: 'fish', en: 'Fish', de: 'Fisch' },
  { id: 'peanuts', en: 'Peanuts', de: 'Erdnüsse' },
  { id: 'soy', en: 'Soy', de: 'Soja' },
  { id: 'milk', en: 'Milk', de: 'Milch' },
  { id: 'nuts', en: 'Tree nuts', de: 'Schalenfrüchte' },
  { id: 'celery', en: 'Celery', de: 'Sellerie' },
  { id: 'mustard', en: 'Mustard', de: 'Senf' },
  { id: 'sesame', en: 'Sesame', de: 'Sesam' },
  { id: 'sulphites', en: 'Sulphites', de: 'Sulfite' },
  { id: 'lupin', en: 'Lupin', de: 'Lupinen' },
  { id: 'molluscs', en: 'Molluscs', de: 'Weichtiere' },
] as const;

export type AllergenId = (typeof ALLERGENS)[number]['id'];

const BY_ID = new Map<string, (typeof ALLERGENS)[number]>(ALLERGENS.map(a => [a.id, a]));
const BY_LABEL = new Map<string, AllergenId>(ALLERGENS.flatMap(a => [[a.en.toLowerCase(), a.id], [a.de.toLowerCase(), a.id]] as Array<[string, AllergenId]>));

export const isAllergenId = (value: unknown): value is AllergenId => typeof value === 'string' && BY_ID.has(value);

/** "Tree nuts" for en, "Schalenfrüchte" for de; an unknown id is shown as it is. */
export function allergenLabel(id: string, lang: Lang): string {
  return BY_ID.get(id)?.[lang] ?? id;
}

/** Ids for a list of ids or display labels (any language). Unknown entries are dropped, order and uniqueness kept. */
export function allergenIds(values: readonly unknown[]): AllergenId[] {
  const out: AllergenId[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const id = isAllergenId(value) ? value : BY_LABEL.get(value.trim().toLowerCase());
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The avoided allergens a dish contains. An empty result means: nothing the user avoids is listed. */
export function conflicts(dishAllergens: readonly AllergenId[], avoid: readonly string[]): AllergenId[] {
  return dishAllergens.filter(id => avoid.includes(id));
}

/** Reads a stored "avoid" list defensively: only known ids, no duplicates, at most 14. */
export function normalizeAvoid(value: unknown): AllergenId[] {
  return Array.isArray(value) ? allergenIds(value.filter((v): v is string => typeof v === 'string' && isAllergenId(v))) : [];
}

/** What the onboarding answers "milk / gluten / nuts & peanuts" mean as allergen ids. */
const HARD_TO_ALLERGENS: Record<string, AllergenId[]> = {
  lactose_free: ['milk'],
  gluten_free: ['gluten'],
  nut_free: ['nuts', 'peanuts'],
};

/** Adds the allergens implied by the onboarding "never show me" answers to the stored avoid list. Never removes any. */
export function mergeAvoidFromProfile(existing: unknown, hard: readonly string[]): AllergenId[] {
  const merged = normalizeAvoid(existing);
  for (const answer of hard) for (const id of HARD_TO_ALLERGENS[answer] ?? []) if (!merged.includes(id)) merged.push(id);
  return merged;
}
