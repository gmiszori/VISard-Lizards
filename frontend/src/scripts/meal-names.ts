import { DEFAULT_MEAL_CAPITALIZATION, dishName, type MealCapitalization } from '../data/presentation';
import { readPreferences } from '../preferences/state';

let capitalization: MealCapitalization = DEFAULT_MEAL_CAPITALIZATION;
try { capitalization = readPreferences().mealCapitalization; } catch { /* Storage blocked: keep the default. */ }

/** Keep the name separate from its display so changing case never changes meal identity. */
export function setMealName(element: HTMLElement, name: string) {
  element.dataset.dishName = name;
  element.textContent = dishName(name, capitalization);
}

export function applyMealCapitalization(value: MealCapitalization) {
  capitalization = value;
  document.querySelectorAll<HTMLElement>('[data-dish-name]').forEach(element => {
    element.textContent = dishName(element.dataset.dishName ?? '', capitalization);
  });
}
