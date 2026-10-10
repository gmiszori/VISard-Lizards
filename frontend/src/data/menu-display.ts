import type { Mensa, MenuItem, Weekday } from './canteens.ts';

export type DisplayMenuItem = MenuItem & {
  servingWindows?: Array<{ open: string; close: string }>;
  /** Live menus only (the sample menus lack them): the exact diet class (fish stays fish) and the allergen ids. */
  dietTag?: 'vegan' | 'vegetarian' | 'meat' | 'fish';
  allergenIds?: string[];
};

/** Match meal-service hours to the menu date, never today's building opening hours. */
export function prepareMenu<T extends MenuItem>(menu: T[], mensa: Mensa | undefined, date: string): Array<T & DisplayMenuItem> {
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T12:00:00Z`).getUTCDay()] as Weekday;
  const closed = !mensa || mensa.temporarilyClosed || mensa.closures.some(c => c.from <= date && date <= c.to);
  const hours = closed ? [] : mensa.openingHours[weekday] ?? [];
  const seen = new Set<string>();
  return menu.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).map(item => ({
    ...item,
    servingWindows: Array.from(new Map(hours.filter(h => h.service === item.service)
      .map(h => [`${h.open}-${h.close}`, { open: h.open, close: h.close }])).values()),
  }));
}
