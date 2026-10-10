import type { Mensa, MenuItem, Service, Weekday } from './canteens.ts';

export type DisplayMenuItem = MenuItem & {
  servingWindows?: Array<{ open: string; close: string }>;
  /** Live menus only (the sample menus lack them): the exact diet class (fish stays fish) and the allergen ids. */
  dietTag?: 'vegan' | 'vegetarian' | 'meat' | 'fish';
  allergenIds?: string[];
};

export function groupMenuByService<T extends Pick<MenuItem, 'service'>>(menu: T[]): Array<{ service: Service | undefined; items: T[] }> {
  return (['lunch', 'dinner', undefined] as const)
    .map(service => ({ service, items: menu.filter(item => item.service === service) }))
    .filter(group => group.items.length > 0);
}

export function compareMealServiceAndKind(a: { classification: readonly string[] }, b: { classification: readonly string[] }): number {
  return Number(a.classification[2] === 'dinner') - Number(b.classification[2] === 'dinner') ||
    Number(a.classification[1] !== 'main') - Number(b.classification[1] !== 'main');
}

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
