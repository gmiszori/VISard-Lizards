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
import { CANTEENS, MENU_DATE, type Canteen, type MenuItem } from './canteens';
import { API_URL, apiGet, type BackendMealDetail, type BackendMensa, type BackendMeta } from './api';

/** A canteen as the pages show it. rating is null when nobody has rated it yet. */
export type AppCanteen = Omit<Canteen, 'rating'> & { rating: number | null };

export interface AppData {
  /** Where menus and ratings come from. */
  source: 'backend' | 'sample';
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

/** Today's date (YYYY-MM-DD) in Zurich. */
function zurichToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function sampleData(): AppData {
  return { source: 'sample', menuDate: MENU_DATE, today: zurichToday(), canteens: CANTEENS };
}

async function fetchAppData(): Promise<AppData> {
  if (!API_URL) return sampleData();
  try {
    const meta = await apiGet<BackendMeta>('/api/meta');
    const [meals, mensas] = await Promise.all([
      apiGet<BackendMealDetail[]>(`/api/meals?date=${encodeURIComponent(meta.menuDate)}`),
      apiGet<BackendMensa[]>('/api/mensas'),
    ]);
    const ratings = new Map(mensas.map((mensa) => [mensa.id, mensa.avgRating]));
    const menus = new Map<string, BackendMealDetail[]>();
    for (const meal of meals) menus.set(meal.mensaId, [...(menus.get(meal.mensaId) ?? []), meal]);
    return {
      source: 'backend',
      menuDate: meta.menuDate,
      today: meta.today,
      canteens: CANTEENS.map((canteen) => ({
        ...canteen,
        menu: toMenu(menus.get(canteen.id) ?? []),
        rating: ratings.get(canteen.id) ?? null,
      })),
    };
  } catch (error) {
    console.warn(`[campuseats] Backend at ${API_URL} not reachable, showing the built-in sample menus: ${(error as Error).message}`);
    return sampleData();
  }
}

/** Same order and categories as the sample menus: lunch before dinner, main dishes first. */
function toMenu(meals: BackendMealDetail[]): MenuItem[] {
  return meals
    .map((detail) => detail.meal)
    .sort((a, b) => Number(a.classification[2] === 'dinner') - Number(b.classification[2] === 'dinner'))
    .sort((a, b) => Number(a.classification[1] !== 'main') - Number(b.classification[1] !== 'main'))
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
        category: kind !== 'main' ? 'Side' : index === 0 ? 'Daily Special' : 'Classic',
        service: service === 'dinner' ? 'dinner' : 'lunch',
      } satisfies MenuItem;
    });
}
