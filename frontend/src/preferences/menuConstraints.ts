import { matchesConstraints, type ConstraintMeal } from '../onboarding/constraints.ts';
import type { Profile } from '../onboarding/profile.ts';
import type { DisplayMenuItem } from '../data/menu-display.ts';
import type { BackendMeal } from '../data/api.ts';

export function displayMealConstraints(item: DisplayMenuItem): ConstraintMeal {
  return { title: item.name, components: [item.description], dietTag: item.dietTag ?? item.dietary,
    allergens: [...(item.allergenIds ?? []), ...(item.allergens ?? [])],
    traceAllergens: item.traceAllergens ?? [], originDetail: null };
}
export function backendMealConstraints(meal: BackendMeal): ConstraintMeal {
  return { title: meal.name, components: meal.components ?? [meal.description ?? ''],
    dietTag: meal.classification[0] as ConstraintMeal['dietTag'], allergens: meal.allergens,
    traceAllergens: meal.traceAllergens ?? [], originDetail: null };
}
export function matchesMenuExclusions(meal: ConstraintMeal, hard: Profile['hard']): boolean {
  return matchesConstraints(meal, { diet: 'omnivore', hard });
}
