/**
 * Checks what the backend sends before the pages use it. TypeScript types do not exist at runtime, so a
 * wrong value (a price that is "n/a", a missing field, an unknown diet) would otherwise reach the
 * ranking and the markup. Rules:
 *  - a value that cannot be trusted becomes "unknown" (null / empty), never 0 or NaN
 *  - a meal that cannot be identified or classified is dropped and counted, the rest still shows
 *  - a response with the wrong overall shape throws DataError ("the backend answered, but not with data
 *    this page can read"), which is different from the backend being unreachable
 */
import type { BackendMealDetail, BackendMensa, BackendMeta } from './api.ts';
import { isIsoDate } from './menuDate.ts';

export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataError';
  }
}

const DIETS = ['vegan', 'vegetarian', 'meat', 'fish'];
const KINDS = ['main', 'buffet', 'dessert', 'drink'];
const SERVICES = ['lunch', 'dinner'];
const MAX_MEALS = 5000;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number): string | null => (typeof value === 'string' && value.trim() !== '' && value.length <= max ? value : null);

/** A price in CHF: finite, above 0 and at most 1000. Everything else (0.00 included) means "not published". */
export function price(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1000 ? value : null;
}

/** An average rating from 0 to 5, or null. */
export function average(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 5 ? value : null;
}

export function parseMeta(value: unknown): BackendMeta {
  if (!isObject(value) || !isIsoDate(value.today) || !isIsoDate(value.menuDate)) throw new DataError('Invalid /api/meta response');
  return { today: value.today, menuDate: value.menuDate };
}

/** Ratings are optional extras, so an unreadable list means "no ratings", not an error. */
export function parseMensas(value: unknown): BackendMensa[] {
  if (!Array.isArray(value)) return [];
  const out: BackendMensa[] = [];
  for (const item of value.slice(0, 500)) {
    if (!isObject(item)) continue;
    const id = text(item.id, 100);
    if (id) out.push({ id, title: text(item.title, 200) ?? id, avgRating: average(item.avgRating) });
  }
  return out;
}

/** One meal, cleaned. Returns null when it cannot be identified or classified. */
export function parseMeal(value: unknown): BackendMealDetail | null {
  if (!isObject(value) || !isObject(value.meal)) return null;
  const meal = value.meal;
  const mensaId = text(value.mensaId, 100);
  const date = isIsoDate(value.date) ? value.date : null;
  const id = text(meal.id, 200);
  const name = text(meal.name, 300);
  const classification = meal.classification;
  if (!mensaId || !date || !id || !name || !Array.isArray(classification) || classification.length < 3) return null;
  const [diet, kind, service] = classification as unknown[];
  if (typeof diet !== 'string' || typeof kind !== 'string' || typeof service !== 'string') return null;
  if (!DIETS.includes(diet) || !KINDS.includes(kind) || !SERVICES.includes(service)) return null;
  const prices = isObject(meal.prices) ? meal.prices : {};
  return {
    mensaId,
    date,
    avgRating: average(value.avgRating),
    meal: {
      id,
      name,
      description: typeof meal.description === 'string' ? meal.description.slice(0, 2000) : null,
      prices: { student: price(prices.student), staff: price(prices.staff), external: price(prices.external) },
      allergens: Array.isArray(meal.allergens) ? meal.allergens.filter((a): a is string => typeof a === 'string' && a.length > 0 && a.length <= 40).slice(0, 30) : [],
      classification: [diet, kind, service],
    },
  };
}

/** The meals of one day. Unusable meals are dropped and counted; a response that is not a list throws DataError. */
export function parseMealList(value: unknown): { meals: BackendMealDetail[]; rejected: number } {
  if (!Array.isArray(value)) throw new DataError('Invalid /api/meals response: expected a list');
  if (value.length > MAX_MEALS) throw new DataError(`Invalid /api/meals response: ${value.length} meals is too many`);
  const meals: BackendMealDetail[] = [];
  let rejected = 0;
  for (const item of value) {
    const meal = parseMeal(item);
    if (meal) meals.push(meal);
    else rejected++;
  }
  return { meals, rejected };
}
