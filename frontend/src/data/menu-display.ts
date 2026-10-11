import type { Mensa, MenuItem, Service, Weekday } from './canteens.ts';
import { cuisineForDish, type CuisineCategory } from './cuisine.ts';
import { minutesOfDay, zurichParts } from '../time/clock.ts';
import { dishName } from './presentation.ts';

export type DisplayMenuItem = MenuItem & {
  cuisine?: CuisineCategory;
  servingWindows?: Array<{ open: string; close: string }>;
  /** Live menus only (the sample menus lack them): the exact diet class (fish stays fish) and the allergen ids. */
  dietTag?: 'vegan' | 'vegetarian' | 'meat' | 'fish';
  allergenIds?: string[];
  /** Set when the price is not for a plate, e.g. '100 g' at by-weight buffets (priceUnits.ts). */
  priceUnit?: string;
  services?: Service[];
};

export type ServiceWindow = { service: Service; open: string; close: string };
export type CurrentServiceLine = { service: Service | 'closed'; time: string };

export function serviceWindowsForDate(mensa: Mensa | undefined, date: string): ServiceWindow[] {
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T12:00:00Z`).getUTCDay()] as Weekday;
  const closed = !mensa || mensa.temporarilyClosed || mensa.closures.some(c => c.from <= date && date <= c.to);
  return closed || !mensa ? [] : [...(mensa.openingHours[weekday] ?? [])].sort((a, b) => a.open.localeCompare(b.open));
}

function zurichDateAndMinute(now = new Date()): { date: string; minute: number } {
  const { date, time } = zurichParts(now);
  return { date, minute: minutesOfDay(time) };
}

export function currentServiceLine(windows: readonly ServiceWindow[], date: string, now = new Date()): CurrentServiceLine {
  const sorted = [...windows].sort((a, b) => a.open.localeCompare(b.open));
  const local = zurichDateAndMinute(now);
  if (date !== local.date) {
    const first = sorted[0];
    return first ? { service: first.service, time: `${first.open}–${first.close}` } : { service: 'closed', time: 'Closed' };
  }
  const active = sorted.find(window => minutesOfDay(window.open) <= local.minute && local.minute < minutesOfDay(window.close));
  const next = sorted.find(window => minutesOfDay(window.open) > local.minute);
  const chosen = active ?? next;
  return chosen
    ? { service: chosen.service, time: `${chosen.open}–${chosen.close}` }
    : { service: 'closed', time: 'Closed' };
}

export function groupMenuByService<T extends Pick<MenuItem, 'service'> & { services?: Service[] }>(menu: T[]): Array<{ service: Service | 'lunch dinner' | undefined; items: T[] }> {
  return (['lunch', 'lunch dinner', 'dinner', undefined] as const)
    .map(service => ({ service, items: menu.filter(item => (item.services?.length === 2 ? 'lunch dinner' : item.service) === service) }))
    .filter(group => group.items.length > 0);
}

export function compareMealServiceAndKind(a: { classification: readonly string[] }, b: { classification: readonly string[] }): number {
  return Number(a.classification[2] === 'dinner') - Number(b.classification[2] === 'dinner') ||
    Number(a.classification[1] !== 'main') - Number(b.classification[1] !== 'main');
}

/** Match meal-service hours to the menu date, never today's building opening hours. */
export function prepareMenu<T extends MenuItem>(menu: T[], mensa: Mensa | undefined, date: string): Array<T & DisplayMenuItem> {
  const hours = serviceWindowsForDate(mensa, date);
  const seen = new Set<string>();
  const offerings = new Map<string, T & DisplayMenuItem>();
  for (const item of menu) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const name = dishName(item.name, 'upper');
    const description = item.description.replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
    // Merge only identical published offerings; different prices, ingredients or diets stay separate.
    const key = JSON.stringify([name, description, item.priceStudent, item.priceWorker, item.priceExternal,
      item.dietary, [...(item.allergens ?? [])].sort(), item.kcal, item.proteinG, (item as DisplayMenuItem).priceUnit,
      (item as DisplayMenuItem).dietTag, item.service ? 'known-service' : 'unknown-service']);
    const existing = offerings.get(key);
    if (existing) {
      if (item.service && !existing.services!.includes(item.service)) existing.services!.push(item.service);
    } else offerings.set(key, { ...item, name, description, services: item.service ? [item.service] : [],
      cuisine: cuisineForDish(item.id, name, description) });
  }
  return [...offerings.values()].map(item => ({
    ...item,
    servingWindows: Array.from(new Map(hours.filter(h => item.services!.includes(h.service))
      .map(h => [`${h.open}-${h.close}`, { open: h.open, close: h.close }])).values()),
  }));
}
