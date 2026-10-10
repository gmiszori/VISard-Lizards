import type { Meal } from '../data/canteens';
import type { Profile } from './profile.ts';

export function tierPrice(meal: Pick<Meal, 'price'>, tier: Profile['priceTier']): number | null {
  return meal.price[tier === 'worker' ? 'staff' : tier];
}

/** Linear-interpolated 5th / 95th percentiles, rounded to the nearest CHF 0.50.
 * The UI reserves max + 0.50 for null (No limit), so max itself remains selectable.
 */
export function priceRange(meals: Pick<Meal, 'kind' | 'price'>[], tier: Profile['priceTier']): { min: number; max: number } {
  const values = meals.filter(meal => meal.kind === 'main').map(meal => tierPrice(meal, tier))
    .filter((price): price is number => price !== null && Number.isFinite(price) && price > 0).sort((a, b) => a - b);
  if (!values.length) return { min: 0, max: 0 };
  const percentile = (p: number) => {
    const index = (values.length - 1) * p;
    const lower = values[Math.floor(index)]!;
    return Math.round((lower + (values[Math.ceil(index)]! - lower) * (index % 1)) * 2) / 2;
  };
  return { min: percentile(0.05), max: percentile(0.95) };
}
