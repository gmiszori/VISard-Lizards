import type { Meal, Mensa } from '../data/canteens';
import type { Profile } from './profile.ts';
import { matchesConstraints } from './constraints.ts';
import { tierPrice } from './priceRange.ts';
import { canShowCanteen } from '../preferences/canteenVisibility.ts';

/** Below this price (CHF, in the visitor's own price category) a dish labelled "main" is almost always a soup, starter or dessert. */
export const MIN_MAIN_PRICE = 4;
const starter = /suppe|soup|dessert|nachtisch/i;
const looksLikeMain = (meal: RecommendationMeal, tier: Profile['priceTier']) => {
  const price = tierPrice(meal, tier);
  return (price === null || price >= MIN_MAIN_PRICE) && !starter.test(meal.title);
};

/** closedOnMenuDay: the mensa has no service on the weekday of the menu (or is closed for good). */
export type RecommendationMensa = Pick<Mensa, 'id' | 'name' | 'campusId' | 'hasMenu' | 'temporarilyClosed'> & { closedOnMenuDay?: boolean };
export type RecommendationMeal = Pick<Meal, 'id' | 'mensaId' | 'date' | 'title' | 'titleDe' | 'kind' | 'service' |
  'dietTag' | 'allergens' | 'originDetail' | 'components' | 'price' | 'nutrition'>;

/** meals is the MENU_DATE slice supplied by the page. No clock, random state or DB imports.
 * Speed uses published service (lunch), health uses non-suspect portion nutrition;
 * neither implies measured queues or a medical assessment. Cuisines stay unscored.
 */
export function pickTodaysDish(profile: Profile, mensas: RecommendationMensa[], meals: RecommendationMeal[]) {
  const campuses = new Set([profile.campus, ...profile.campusSecondary]);
  const places = new Map(mensas.filter(m => campuses.has(m.campusId) && m.hasMenu && !m.temporarilyClosed &&
    canShowCanteen(m.id, profile.priceTier)).map(m => [m.id, m]));
  const ratings = new Map(profile.mensaRatings.map(r => [r.mensaId, r.rating]));
  const eligible = meals.filter(meal => meal.kind === 'main' && places.has(meal.mensaId) && matchesConstraints(meal, profile))
    .filter(meal => profile.priceMode !== 'hard' || profile.maxPrice === null ||
      (tierPrice(meal, profile.priceTier) !== null && tierPrice(meal, profile.priceTier)! <= profile.maxPrice))
    .filter(meal => !profile.dislikes.some(dislike => `${meal.title} ${meal.titleDe ?? ''} ${meal.components.join(' ')}`
      .toLocaleLowerCase().includes(dislike.toLocaleLowerCase())));
  // A soup priced CHF 1.80 is not "today's pick for lunch"; only if nothing else fits is it still offered.
  const realMains = eligible.filter(meal => looksLikeMain(meal, profile.priceTier));
  const ranked = (realMains.length ? realMains : eligible)
    .map(meal => {
      const price = tierPrice(meal, profile.priceTier);
      const text = `${meal.title} ${meal.titleDe ?? ''} ${meal.components.join(' ')}`.toLowerCase();
      const portion = meal.nutrition?.suspect ? null : meal.nutrition?.perPortion;
      const health = portion?.proteinG != null ? Math.min(portion.proteinG / 40, 1) : 0;
      const signals = { taste: ((ratings.get(meal.mensaId) ?? 3) - 1) / 4,
        price: price === null ? 0 : 1 / (1 + price / 10), speed: meal.service === 'lunch' ? 0.5 : 0, health };
      let score = profile.priority.reduce((sum, priority, i) => sum + (profile.priority.length - i) * signals[priority], 0);
      if (profile.diet === 'flexitarian' && meal.dietTag === 'meat') score -= 2;
      for (const soft of profile.soft) {
        if (soft === 'high_protein') score += health;
        if (soft === 'healthy') score += health + (meal.dietTag === 'vegan' ? 0.25 : 0);
        if (soft === 'spicy' && /chili|chilli|spicy|scharf|curry/.test(text)) score += 1;
        if (soft === 'comfort_food' && /pasta|pizza|burger|kartoffel|potato|macaroni/.test(text)) score += 1;
      }
      if (profile.priceMode === 'soft' && profile.maxPrice !== null) {
        score -= price === null ? 1 : Math.max(0, price - profile.maxPrice) / 2;
      }
      return { meal, mensa: places.get(meal.mensaId)!, price, score };
    }).sort((a, b) => b.score - a.score || a.meal.id.localeCompare(b.meal.id));
  return ranked[0] ?? null;
}

/**
 * The pick, preferring mensas that serve on the menu's weekday (closedOnMenuDay = false). Only when no open mensa has a
 * fitting dish are closed ones considered, and the result says so (closed = true) so the page can warn instead of sending
 * someone to a mensa that cannot serve that lunch.
 */
export function pickTodaysDishOpenFirst(profile: Profile, mensas: RecommendationMensa[], meals: RecommendationMeal[]) {
  const open = pickTodaysDish(profile, mensas.filter(mensa => !mensa.closedOnMenuDay), meals);
  if (open) return { pick: open, closed: false };
  const any = pickTodaysDish(profile, mensas, meals);
  return { pick: any, closed: any !== null };
}
