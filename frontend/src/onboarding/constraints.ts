import type { Meal } from '../data/canteens';
import type { Profile } from './profile.ts';

export type ConstraintMeal = Pick<Meal, 'dietTag' | 'allergens' | 'originDetail' | 'components'>;
const pork = /pork|schwein|speck|bacon|ham|schinken|salami|chorizo|wurst/i;

export function matchesConstraints(meal: ConstraintMeal, profile: Pick<Profile, 'diet' | 'hard'>): boolean {
  if (profile.diet === 'vegan' && meal.dietTag !== 'vegan') return false;
  if (profile.diet === 'vegetarian' && !['vegan', 'vegetarian'].includes(meal.dietTag)) return false;
  if (profile.diet === 'pescetarian' && meal.dietTag === 'meat') return false;
  return profile.hard.every(constraint => {
    switch (constraint) {
      case 'no_pork': return !meal.originDetail?.meat.some(origin => origin.type.toLowerCase() === 'pork')
        && !meal.components.some(component => pork.test(component));
      case 'lactose_free': return !meal.allergens.includes('milk');
      case 'gluten_free': return !meal.allergens.includes('gluten');
      case 'nut_free': return !meal.allergens.some(allergen => allergen === 'nuts' || allergen === 'peanuts');
      // TODO(data): halal and kosher cannot be inferred from published fields.
      case 'halal': case 'kosher': return true;
    }
  });
}
