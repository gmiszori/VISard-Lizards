import type { Mensa, MenuItem, Service, Weekday } from './canteens.ts';
import { cuisineForDish, type CuisineCategory } from './cuisine';

export type DisplayMenuItem = MenuItem & {
  cuisine?: CuisineCategory;
  servingWindows?: Array<{ open: string; close: string }>;
  /** Live menus only (the sample menus lack them): the exact diet class (fish stays fish) and the allergen ids. */
  dietTag?: 'vegan' | 'vegetarian' | 'meat' | 'fish';
  allergenIds?: string[];
  /** Set when the price is not for a plate, e.g. '100 g' at by-weight buffets (priceUnits.ts). */
  priceUnit?: string;
};

export type ServiceWindow = { service: Service; open: string; close: string };
export type CurrentServiceLine = { service: Service | 'closed'; time: string };

export function serviceWindowsForDate(mensa: Mensa | undefined, date: string): ServiceWindow[] {
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T12:00:00Z`).getUTCDay()] as Weekday;
  const closed = !mensa || mensa.temporarilyClosed || mensa.closures.some(c => c.from <= date && date <= c.to);
  return closed || !mensa ? [] : [...(mensa.openingHours[weekday] ?? [])].sort((a, b) => a.open.localeCompare(b.open));
}

function zurichDateAndMinute(now = new Date()): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minute: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

export function currentServiceLine(windows: readonly ServiceWindow[], date: string, now = new Date()): CurrentServiceLine {
  const sorted = [...windows].sort((a, b) => a.open.localeCompare(b.open));
  const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const local = zurichDateAndMinute(now);
  if (date !== local.date) {
    const first = sorted[0];
    return first ? { service: first.service, time: `${first.open}–${first.close}` } : { service: 'closed', time: 'Closed' };
  }
  const active = sorted.find(window => minuteOf(window.open) <= local.minute && local.minute < minuteOf(window.close));
  const next = sorted.find(window => minuteOf(window.open) > local.minute);
  const chosen = active ?? next;
  return chosen
    ? { service: chosen.service, time: `${chosen.open}–${chosen.close}` }
    : { service: 'closed', time: 'Closed' };
}

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
  const hours = serviceWindowsForDate(mensa, date);
  const seen = new Set<string>();
  return menu.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).map(item => ({
    ...item,
    cuisine: cuisineForDish(item.id, item.name, item.description),
    servingWindows: Array.from(new Map(hours.filter(h => h.service === item.service)
      .map(h => [`${h.open}-${h.close}`, { open: h.open, close: h.close }])).values()),
  }));
}
