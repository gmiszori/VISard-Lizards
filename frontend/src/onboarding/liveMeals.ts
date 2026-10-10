import type { AllergenId } from '../data/canteens.ts';
import type { DisplayMenuItem } from '../data/menu-display.ts';
import type { RecommendationMeal } from './pickTodaysDish.ts';

/**
 * The main dishes of the menus the home page shows (backend data), in the shape the "Today's pick"
 * ranking reads. The bundled database only holds an older snapshot, so using it would recommend dishes
 * that are no longer on the menu.
 *
 * The backend sends no origin details and no nutrition: "no pork" is judged from the dish text only, and
 * the health signal stays neutral. Sides, desserts and buffets (category "Side") are not recommended.
 */
export function liveRecommendationMeals(canteens: ReadonlyArray<{ id: string; menu: readonly DisplayMenuItem[] }>, date: string): RecommendationMeal[] {
  return canteens.flatMap(canteen => canteen.menu
    .filter(item => item.category !== 'Side')
    .map((item): RecommendationMeal => ({
      id: item.id,
      mensaId: canteen.id,
      date,
      title: item.name,
      titleDe: null,
      kind: 'main',
      service: item.service ?? 'lunch',
      dietTag: item.dietTag ?? item.dietary,
      allergens: (item.allergenIds ?? []) as AllergenId[],
      originDetail: null,
      components: item.description.split(',').map(part => part.trim()).filter(Boolean),
      price: { student: item.priceStudent, staff: item.priceWorker, external: item.priceExternal },
      nutrition: null,
    })));
}
