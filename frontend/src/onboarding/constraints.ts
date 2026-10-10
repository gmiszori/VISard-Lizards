import type { Meal } from '../data/canteens';
import type { Profile } from './profile.ts';

export type ConstraintMeal = Pick<Meal, 'dietTag' | 'allergens' | 'originDetail' | 'components'>;
const pork = /\b(?:pork|schwein\w*|speck\w*|bacon|ham|schinken\w*|salami|chorizo|\w*wurst)\b/i;

export function matchesConstraints(meal: ConstraintMeal, profile: Pick<Profile, 'diet' | 'hard'>): boolean {
  if (profile.diet === 'vegan' && meal.dietTag !== 'vegan') return false;
  if (profile.diet === 'vegetarian' && !['vegan', 'vegetarian'].includes(meal.dietTag)) return false;
  if (profile.diet === 'pescetarian' && meal.dietTag === 'meat') return false;
  if (profile.diet === 'carnivore' && meal.dietTag !== 'meat' && meal.dietTag !== 'fish') return false;
  return profile.hard.every(constraint => {
    switch (constraint) {
      case 'no_pork': return !meal.originDetail?.meat.some(origin => origin.type.toLowerCase() === 'pork')
        && !meal.components.some(component => pork.test(component));
      case 'lactose_free': return !meal.allergens.includes('milk');
      case 'gluten_free': return !meal.allergens.includes('gluten');
      case 'nut_free': return !meal.allergens.some(allergen => allergen === 'nuts' || allergen === 'peanuts');
      // Constraints removed from the app (halal, kosher: not determinable from the menu data) never exclude a dish.
      default: return true;
    }
  });
}
