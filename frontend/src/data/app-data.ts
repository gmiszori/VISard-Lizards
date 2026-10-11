/**
 * The data the pages render: canteens with today's menu and ratings.
 *
 * Mensa details (names, photos, addresses, opening windows) come from the bundled database in
 * canteens.ts. Menus and ratings come from the backend (see api.ts); when it is not reachable, the
 * pages fall back to the bundled sample menus, so the site always builds and renders.
 *
 * Pages call loadAppData() in their frontmatter: in `astro dev` that runs per request, so menus stay
 * current; a static build takes the data of build time.
 */
import { CANTEENS, MEALS, MENSAS, MENU_DATE, mealsOf, type Canteen, type MenuItem } from './canteens';
import { mensasSoldByWeight, withPriceUnits } from './priceUnits';
import { compareMealServiceAndKind, prepareMenu, type DisplayMenuItem } from './menu-display';
import { API_URL, apiGet, type BackendMealDetail } from './api';
import { DataError, hasOnlyOnePriceCategory, mergePrices, parseMealList, parseMensas, parseMeta } from './validate';
import { isIsoDate, latestToday, menuDateCandidates, selectableMenuDays } from './menuDate';
import { zurichParts } from '../time/clock';

/** A canteen as the pages show it. rating is null when nobody has rated it yet. */
export type AppCanteen = Omit<Canteen, 'rating' | 'menu'> & { rating: number | null; menu: DisplayMenuItem[] };

export interface AppData {
  /** Where menus and ratings come from. */
  source: 'backend' | 'sample';
  /** Why sample data is shown: the backend could not be reached, or it answered with data this page cannot read. */
  sampleReason?: 'unreachable' | 'invalid';
  /** The day whose menu is shown: today, else the next day with menus (e.g. Monday on weekends). */
  menuDate: string;
  /** Today in Zurich, to tell whether menuDate is today. */
  today: string;
  /** Days people can pick a menu for (day pages /day/<date>/ exist for these). */
  days: string[];
  /** true when the page was asked for a specific day (a /day/ or /canteen/<id>/<date>/ page). */
  chosenDay: boolean;
  canteens: AppCanteen[];
}

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish', peanuts: 'Peanuts', soy: 'Soy', milk: 'Milk',
  nuts: 'Tree nuts', celery: 'Celery', mustard: 'Mustard', sesame: 'Sesame', sulphites: 'Sulphites', lupin: 'Lupin', molluscs: 'Molluscs',
};

/** Responses are reused for a minute, so one build or burst of requests does not refetch for every page. */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; data: Promise<AppData> }>();

/** The data for the default menu day, or for `date` (YYYY-MM-DD) when a day page asks for one. */
export function loadAppData(date?: string): Promise<AppData> {
  const day = date && isIsoDate(date) ? date : undefined;
  const key = day ?? '';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= CACHE_MS) return hit.data;
  const data = fetchAppData(day);
  cache.set(key, { at: Date.now(), data });
  return data;
}

/** Mensas whose buffet is sold per 100 g (the backend does not say, the bundled database does). */
const BY_WEIGHT = mensasSoldByWeight(MEALS);

/** Today's date (YYYY-MM-DD) in Zurich. */
function zurichToday(): string {
  return zurichParts(new Date()).date;
}

/** The bundled sample menu of one mensa on one day, in the same shape as the default sample menu. */
function sampleMenu(mensaId: string, date: string): MenuItem[] {
  return mealsOf(mensaId, date)
    .sort((a, b) => Number(a.kind !== 'main') - Number(b.kind !== 'main'))
    .map((meal, i) => ({
      id: meal.id,
      name: meal.title,
      description: meal.components.join(', '),
      priceStudent: meal.price.student,
      priceWorker: meal.price.staff,
      priceExternal: meal.price.external,
      dietary: meal.dietTag === 'fish' ? 'meat' : meal.dietTag,
      allergens: meal.allergens.map((id) => ALLERGEN_LABELS[id] ?? id),
      category: meal.kind !== 'main' ? 'Side' : i === 0 ? 'Daily Special' : 'Classic',
      service: meal.service,
      imageUrl: meal.imageUrl,
      kcal: meal.nutrition?.perPortion?.kcal ?? null,
      proteinG: meal.nutrition?.perPortion?.proteinG ?? null,
    }));
}

function sampleData(sampleReason?: AppData['sampleReason'], date?: string): AppData {
  const menuDate = date ?? MENU_DATE;
  return {
    source: 'sample', sampleReason, menuDate, today: zurichToday(), chosenDay: date !== undefined,
    // The bundled data has fixed days; offer the ones it has.
    days: [...new Set(MEALS.map(meal => meal.date))].sort(),
    canteens: CANTEENS.map(canteen => ({
      ...canteen,
      menu: withPriceUnits(prepareMenu(menuDate === MENU_DATE ? canteen.menu : sampleMenu(canteen.id, menuDate),
        MENSAS.find(m => m.id === canteen.id), menuDate), canteen.id, BY_WEIGHT),
    }))
  };
}

async function fetchAppData(date?: string): Promise<AppData> {
  if (!API_URL) return sampleData(undefined, date);
  try {
    // Everything the backend sends is checked first (validate.ts): bad values become "unknown", unusable meals are dropped.
    const meta = parseMeta(await apiGet<unknown>('/api/meta'));
    const mensas = parseMensas(await apiGet<unknown>('/api/mensas'));
    // Weekdays: today. Saturday/Sunday: the coming Monday (the backend's menuDate says the same; this also
    // covers an older backend that suggests Friday). If there are no meals for that day, use the backend's suggestion.
    let menuDate = meta.menuDate;
    let meals: BackendMealDetail[] = [];
    // The backend's "today" can lag behind the real date; never present an older day as today.
    const today = latestToday(meta.today, zurichToday());
    // A day page shows exactly its day; otherwise the wanted day, falling back to the backend's suggestion.
    for (const day of date ? [date] : menuDateCandidates(today, meta.menuDate)) {
      menuDate = day;
      const parsed = parseMealList(await apiGet<unknown>(`/api/meals?date=${encodeURIComponent(day)}`));
      if (parsed.rejected) console.warn(`[campuseats] ${parsed.rejected} meal(s) for ${day} were skipped because the backend sent them in a form this page cannot read.`);
      meals = parsed.meals;
      if (meals.length) break;
    }
    // An older backend returns one price category per request (student by default). Ask for the other two so
    // staff and external prices are not shown as missing. A failure here only leaves those prices unknown.
    if (hasOnlyOnePriceCategory(meals)) {
      for (const category of ['STAFF', 'EXTERNAL']) {
        try {
          const other = parseMealList(await apiGet<unknown>(`/api/meals?date=${encodeURIComponent(menuDate)}&priceCategory=${category}`));
          meals = mergePrices(meals, other.meals);
        } catch { /* keep what we have */ }
      }
    }
    const ratings = new Map(mensas.map((mensa) => [mensa.id, mensa.avgRating]));
    const menus = new Map<string, BackendMealDetail[]>();
    for (const meal of meals) menus.set(meal.mensaId, [...(menus.get(meal.mensaId) ?? []), meal]);
    return {
      source: 'backend',
      menuDate,
      today,
      days: selectableMenuDays(today, menuDate, meta.dataTo),
      chosenDay: date !== undefined,
      canteens: CANTEENS.map((canteen) => ({
        ...canteen,
        menu: withPriceUnits(prepareMenu(toMenu(menus.get(canteen.id) ?? []), MENSAS.find(m => m.id === canteen.id), menuDate), canteen.id, BY_WEIGHT),
        rating: ratings.get(canteen.id) ?? null,
      })),
    };
  } catch (error) {
    // Invalid JSON (SyntaxError) and wrongly shaped data (DataError) mean the backend answered but cannot be used; anything else is unreachable.
    const invalid = error instanceof DataError || error instanceof SyntaxError;
    console.warn(`[campuseats] Backend ${invalid ? 'sent data this page cannot read' : 'is not reachable'}, showing the built-in sample menus.`);
    return sampleData(invalid ? 'invalid' : 'unreachable', date);
  }
}

/** Same order and categories as the sample menus: lunch before dinner, main dishes first. */
function toMenu(meals: BackendMealDetail[]): Array<MenuItem & Pick<DisplayMenuItem, 'dietTag' | 'allergenIds'>> {
  return meals
    .map((detail) => detail.meal)
    .sort(compareMealServiceAndKind)
    .map((meal, index) => {
      const [diet, kind, service] = meal.classification;
      return {
        id: meal.id,
        name: meal.name,
        description: meal.description ?? '',
        priceStudent: meal.prices.student,
        priceWorker: meal.prices.staff,
        priceExternal: meal.prices.external,
        // The pages group fish with meat, like the sample data.
        dietary: diet === 'vegan' || diet === 'vegetarian' ? diet : 'meat',
        allergens: meal.allergens.map((id) => ALLERGEN_LABELS[id] ?? id),
        allergenIds: meal.allergens,
        dietTag: diet === 'vegan' || diet === 'vegetarian' || diet === 'fish' ? diet : 'meat',
        category: kind !== 'main' ? 'Side' : index === 0 ? 'Daily Special' : 'Classic',
        service: service === 'dinner' ? 'dinner' : 'lunch',
      } satisfies MenuItem & Pick<DisplayMenuItem, 'dietTag' | 'allergenIds'>;
    });
}
