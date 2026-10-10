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
import { CANTEENS, MEALS, MENSAS, MENU_DATE, type Canteen, type MenuItem } from './canteens';
import { mensasSoldByWeight, withPriceUnits } from './priceUnits';
import { compareMealServiceAndKind, prepareMenu, type DisplayMenuItem } from './menu-display';
import { API_URL, apiGet, type BackendMealDetail } from './api';
import { DataError, hasOnlyOnePriceCategory, mergePrices, parseMealList, parseMensas, parseMeta } from './validate';
import { menuDateCandidates } from './menuDate';

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
  canteens: AppCanteen[];
}

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish', peanuts: 'Peanuts', soy: 'Soy', milk: 'Milk',
  nuts: 'Tree nuts', celery: 'Celery', mustard: 'Mustard', sesame: 'Sesame', sulphites: 'Sulphites', lupin: 'Lupin', molluscs: 'Molluscs',
};

/** Responses are reused for a minute, so one build or burst of requests does not refetch for every page. */
const CACHE_MS = 60_000;
let cache: { at: number; data: Promise<AppData> } | undefined;

export function loadAppData(): Promise<AppData> {
  if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), data: fetchAppData() };
  return cache.data;
}

/** Mensas whose buffet is sold per 100 g (the backend does not say, the bundled database does). */
const BY_WEIGHT = mensasSoldByWeight(MEALS);

/** Today's date (YYYY-MM-DD) in Zurich. */
function zurichToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function sampleData(sampleReason?: AppData['sampleReason']): AppData {
  return {
    source: 'sample', sampleReason, menuDate: MENU_DATE, today: zurichToday(), canteens: CANTEENS.map(canteen => ({
      ...canteen, menu: withPriceUnits(prepareMenu(canteen.menu, MENSAS.find(m => m.id === canteen.id), MENU_DATE), canteen.id, BY_WEIGHT),
    }))
  };
}

async function fetchAppData(): Promise<AppData> {
  if (!API_URL) return sampleData();
  try {
    // Everything the backend sends is checked first (validate.ts): bad values become "unknown", unusable meals are dropped.
    const meta = parseMeta(await apiGet<unknown>('/api/meta'));
    const mensas = parseMensas(await apiGet<unknown>('/api/mensas'));
    // Weekdays: today. Saturday/Sunday: the coming Monday (the backend's menuDate says the same; this also
    // covers an older backend that suggests Friday). If there are no meals for that day, use the backend's suggestion.
    let menuDate = meta.menuDate;
    let meals: BackendMealDetail[] = [];
    for (const day of menuDateCandidates(meta.today, meta.menuDate)) {
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
      today: meta.today,
<<<<<<< HEAD
      canteens: CANTEENS.map((canteen) => ({
        ...canteen,
        menu: withPriceUnits(prepareMenu(toMenu(menus.get(canteen.id) ?? []), MENSAS.find(m => m.id === canteen.id), menuDate), canteen.id, BY_WEIGHT),
        rating: ratings.get(canteen.id) ?? null,
      })),
=======
      canteens: CANTEENS.map((canteen) => {
        const backendMeals = toMenu(menus.get(canteen.id) ?? []);
        const menuToUse = backendMeals.length > 0 ? backendMeals : canteen.menu;
        return {
          ...canteen,
          menu: prepareMenu(menuToUse, MENSAS.find(m => m.id === canteen.id), menuDate),
          rating: ratings.get(canteen.id) ?? null,
        };
      }),
>>>>>>> feature/ai-dish-search
    };
  } catch (error) {
    // Invalid JSON (SyntaxError) and wrongly shaped data (DataError) mean the backend answered but cannot be used; anything else is unreachable.
    const invalid = error instanceof DataError || error instanceof SyntaxError;
    console.warn(`[campuseats] Backend at ${API_URL} ${invalid ? 'sent data this page cannot read' : 'is not reachable'}, showing the built-in sample menus: ${(error as Error).message}`);
    return sampleData(invalid ? 'invalid' : 'unreachable');
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
