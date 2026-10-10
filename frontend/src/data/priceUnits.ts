import type { DisplayMenuItem } from './menu-display.ts';

export const PER_100G = '100 g';

/**
 * Some counters sell by weight: at Dozentenfoyer and FUSION meal the buffet price (CHF 3.20 / 2.50) is for
 * 100 g, not for a plate, so showing it bare looks four times cheaper than it is. The backend does not send the
 * unit, but the bundled database knows it: a mensa counts as "by weight" when all its buffet dishes in the
 * database are priced per 100 g.
 */
export function mensasSoldByWeight(meals: ReadonlyArray<{ mensaId: string; kind: string; priceUnit: string }>): Set<string> {
  const byMensa = new Map<string, { weight: number; other: number }>();
  for (const meal of meals) {
    if (meal.kind !== 'buffet') continue;
    const entry = byMensa.get(meal.mensaId) ?? { weight: 0, other: 0 };
    if (meal.priceUnit.replace(/\s+/g, '').toLowerCase() === '100g') entry.weight++; else entry.other++;
    byMensa.set(meal.mensaId, entry);
  }
  return new Set([...byMensa].filter(([, e]) => e.weight > 0 && e.other === 0).map(([id]) => id));
}

/** Marks the sides/buffets of a by-weight mensa with their price unit. Mains and other mensas are untouched. */
export function withPriceUnits<T extends DisplayMenuItem>(menu: T[], mensaId: string, byWeight: ReadonlySet<string>): T[] {
  if (!byWeight.has(mensaId)) return menu;
  return menu.map(item => (item.category === 'Side' ? { ...item, priceUnit: PER_100G } : item));
}
