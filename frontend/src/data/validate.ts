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

/**
 * All three prices of a meal. Current backends send `prices: {student, staff, external}`. Older ones only
 * send `price: {price, cat}` (the one category that was asked for, student by default); ignoring that field
 * made every meal look unpriced, so it is used for the category it names.
 */
export function parsePrices(meal: Record<string, unknown>): { student: number | null; staff: number | null; external: number | null } {
  const all = isObject(meal.prices) ? meal.prices : {};
  const prices = { student: price(all.student), staff: price(all.staff), external: price(all.external) };
  const single = isObject(meal.price) ? meal.price : null;
  const category = typeof single?.cat === 'string' ? single.cat.toLowerCase() : 'student';
  if (single && (category === 'student' || category === 'staff' || category === 'external') && prices[category] === null) {
    prices[category] = price(single.price);
  }
  return prices;
}

/** True when the meals carry only one price category each (an older backend): a price exists but staff and external never do. */
export function hasOnlyOnePriceCategory(meals: BackendMealDetail[]): boolean {
  const priced = meals.filter(m => m.meal.prices.student !== null || m.meal.prices.staff !== null || m.meal.prices.external !== null);
  return priced.length > 0 && priced.every(m => m.meal.prices.staff === null && m.meal.prices.external === null);
}

/** Copies the prices that `from` knows into `into` (matched by meal id) where `into` has none. Returns new meals. */
export function mergePrices(into: BackendMealDetail[], from: BackendMealDetail[]): BackendMealDetail[] {
  const known = new Map(from.map(m => [m.meal.id, m.meal.prices]));
  return into.map(m => {
    const other = known.get(m.meal.id);
    if (!other) return m;
    const p = m.meal.prices;
    return { ...m, meal: { ...m.meal, prices: { student: p.student ?? other.student, staff: p.staff ?? other.staff, external: p.external ?? other.external } } };
  });
}

/** An average rating from 0 to 5, or null. */
export function average(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 5 ? value : null;
}

export function parseMeta(value: unknown): BackendMeta {
  if (!isObject(value) || !isIsoDate(value.today) || !isIsoDate(value.menuDate)) throw new DataError('Invalid /api/meta response');
  return { today: value.today, menuDate: value.menuDate, ...(isIsoDate(value.dataTo) ? { dataTo: value.dataTo } : {}) };
}

/** Ratings are optional extras, so an unreadable list means "no ratings", not an error. */
type ParsedMensa = Pick<BackendMensa, 'id' | 'title' | 'campus' | 'coordinates' | 'avgRating'>;
export function parseMensas(value: unknown): ParsedMensa[] {
  if (!Array.isArray(value)) return [];
  const out: ParsedMensa[] = [];
  for (const item of value.slice(0, 500)) {
    if (!isObject(item)) continue;
    const id = text(item.id, 100);
    const coordinates = isObject(item.coordinates) &&
      typeof item.coordinates.lat === 'number' && Number.isFinite(item.coordinates.lat) &&
      typeof item.coordinates.lng === 'number' && Number.isFinite(item.coordinates.lng)
      ? { lat: item.coordinates.lat, lng: item.coordinates.lng }
      : null;
    if (id) out.push({
      id,
      title: text(item.title, 200) ?? id,
      campus: text(item.campus, 100) ?? '',
      coordinates,
      avgRating: average(item.avgRating),
    });
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
  if (!mensaId || !date || !id || !name) return null;
  const rawClassification = Array.isArray(meal.classification) ? (meal.classification as unknown[]) : [];
  const rawDiet = typeof rawClassification[0] === 'string' ? rawClassification[0].toLowerCase() : 'meat';
  const rawKind = typeof rawClassification[1] === 'string' ? rawClassification[1].toLowerCase() : 'main';
  const rawService = typeof rawClassification[2] === 'string' ? rawClassification[2].toLowerCase() : 'lunch';
  const diet = DIETS.includes(rawDiet) ? rawDiet : (rawDiet.includes('veg') ? 'vegetarian' : 'meat');
  const kind = KINDS.includes(rawKind) ? rawKind : 'main';
  const service = SERVICES.includes(rawService) ? rawService : 'lunch';
  return {
    mensaId,
    date,
    avgRating: average(value.avgRating),
    meal: {
      id,
      name,
      description: typeof meal.description === 'string' ? meal.description.slice(0, 2000) : null,
      prices: parsePrices(meal),
      allergens: Array.isArray(meal.allergens) ? meal.allergens.filter((a): a is string => typeof a === 'string' && a.length > 0 && a.length <= 40).slice(0, 30) : [],
      ...(Array.isArray(meal.traceAllergens) ? { traceAllergens: meal.traceAllergens.filter((a): a is string => typeof a === 'string' && a.length > 0 && a.length <= 40).slice(0, 30) } : {}),
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
