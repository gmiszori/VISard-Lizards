import { crowdNow, type CrowdNow } from './crowd';
import { haversineM } from './geo';
import { KCAL_OFF, type DietFilter, type SortMode } from './store';
import { openState, type OpenState } from './time';
import type { CrowdInfo, LatLng, Meal, Mensa, PriceCategory, Service } from './types';

export interface Prefs {
  favourites: string[];
  diet: DietFilter;
  minProtein: number;
  maxKcal: number;
  price: PriceCategory;
  sort: SortMode;
}

export interface MealView {
  meal: Meal;
  mensa: Mensa;
  distanceM: number;
  crowd: CrowdNow | null;
  open: OpenState;
  isFavourite: boolean;
}

export interface MensaGroup {
  mensa: Mensa;
  distanceM: number;
  open: OpenState;
  crowd: CrowdNow | null;
  isFavourite: boolean;
  /** The mensa serves this service today (even if currently closed). */
  offered: boolean;
  views: MealView[];
}

export const nutritionFilterActive = (p: Prefs) => p.minProtein > 0 || p.maxKcal < KCAL_OFF;
export const dietFilterActive = (p: Prefs) => p.diet !== 'all';
export const anyFilterActive = (p: Prefs) => dietFilterActive(p) || nutritionFilterActive(p);

export function matchesDiet(meal: Meal, diet: DietFilter): boolean {
  switch (diet) {
    case 'all':
      return true;
    case 'vegan':
      return meal.dietTag === 'vegan';
    case 'vegetarian':
      return meal.dietTag === 'vegan' || meal.dietTag === 'vegetarian';
    case 'meat':
      return meal.dietTag === 'meat' || meal.dietTag === 'fish';
  }
}

/** 'pass' | 'fail' | 'nodata'. No data never counts as a pass. */
function nutritionVerdict(meal: Meal, p: Prefs): 'pass' | 'fail' | 'nodata' {
  let nodata = false;
  if (p.minProtein > 0) {
    const g = meal.nutrition?.proteinG;
    if (g === undefined) nodata = true;
    else if (g < p.minProtein) return 'fail';
  }
  if (p.maxKcal < KCAL_OFF) {
    const k = meal.nutrition?.kcal;
    if (k === undefined) nodata = true;
    else if (k > p.maxKcal) return 'fail';
  }
  return nodata ? 'nodata' : 'pass';
}

/**
 * "Recommended for you" score, higher is better. Weights are deliberately
 * simple and readable; tune here.
 *   favourite mensa     +30
 *   distance            up to +25, halves every ~550 m
 *   crowd right now     up to +12 (empty) … 0 (packed); unknown = +5
 *   rating              ±16, scaled by how many people rated
 *   filter fit          protein headroom, diet match, kcal headroom
 *   price               cheaper is slightly better
 */
export function scoreMeal(v: MealView, p: Prefs): number {
  let s = 0;
  if (v.isFavourite) s += 30;
  s += 25 * Math.exp(-v.distanceM / 800);
  s += v.crowd ? (5 - v.crowd.level) * 3 : 5;
  const r = v.meal.rating;
  if (r.count > 0) s += (r.average - 3) * 8 * Math.min(1, r.count / 20);
  const protein = v.meal.nutrition?.proteinG;
  const kcal = v.meal.nutrition?.kcal;
  if (protein !== undefined) s += p.minProtein > 0 ? Math.min(10, Math.max(0, (protein - p.minProtein) / 3) + 3) : protein * 0.1;
  if (kcal !== undefined && p.maxKcal < KCAL_OFF) s += Math.min(6, Math.max(0, (p.maxKcal - kcal) / 60));
  if (p.diet !== 'all') s += 4;
  s += (10 - v.meal.price[p.price]) * 0.8;
  return s;
}

function sortValue(v: MealView, p: Prefs): number {
  // Always "higher is better" so one comparator works.
  switch (p.sort) {
    case 'protein':
      return v.meal.nutrition?.proteinG ?? -1;
    case 'price':
      return -v.meal.price[p.price];
    case 'rating':
      return v.meal.rating.count ? v.meal.rating.average + Math.min(v.meal.rating.count, 30) / 100 : 0;
    case 'distance':
    case 'recommended':
      return scoreMeal(v, p);
  }
}

export interface BoardInput {
  mensas: Mensa[];
  menus: Record<string, Meal[]>;
  crowds: Record<string, CrowdInfo>;
  ref: LatLng;
  now: Date;
  service: Service;
  prefs: Prefs;
}

export interface Board {
  groups: MensaGroup[];
  /** Meals dropped only because nutrition data is missing while a nutrition filter is on. */
  hiddenNoNutrition: number;
  /** Meals currently shown. */
  shown: number;
  /** Meals that exist for this service before any filter. */
  total: number;
  /** At least one mensa serves this service today. */
  anyOffered: boolean;
}

export function buildBoard(i: BoardInput): Board {
  const { prefs: p } = i;
  let hiddenNoNutrition = 0;
  let shown = 0;
  let total = 0;
  const groups: MensaGroup[] = [];

  for (const mensa of i.mensas) {
    const distanceM = haversineM(i.ref, mensa.coordinates);
    const open = openState(mensa, i.now, i.service);
    const crowd = crowdNow(i.crowds[mensa.id], mensa, i.now);
    const isFavourite = p.favourites.includes(mensa.id);
    const all = (i.menus[mensa.id] ?? []).filter((m) => m.service === i.service);
    total += all.length;
    const views: MealView[] = [];
    for (const meal of all) {
      if (!matchesDiet(meal, p.diet)) continue;
      const verdict = nutritionVerdict(meal, p);
      if (verdict === 'nodata') {
        hiddenNoNutrition++;
        continue;
      }
      if (verdict === 'fail') continue;
      views.push({ meal, mensa, distanceM, crowd, open, isFavourite });
    }
    shown += views.length;
    views.sort((a, b) => sortValue(b, p) - sortValue(a, p));
    groups.push({ mensa, distanceM, open, crowd, isFavourite, offered: open.kind !== 'none', views });
  }

  const best = (g: MensaGroup) => (g.views[0] ? sortValue(g.views[0], p) : -Infinity);
  groups.sort((a, b) => {
    if (a.offered !== b.offered) return a.offered ? -1 : 1;
    if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1;
    if (a.offered && (a.views.length === 0) !== (b.views.length === 0)) return a.views.length ? -1 : 1;
    if (p.sort === 'distance') return a.distanceM - b.distanceM;
    const d = best(b) - best(a);
    return Number.isFinite(d) && d !== 0 ? d : a.distanceM - b.distanceM;
  });

  return {
    groups,
    hiddenNoNutrition,
    shown,
    total,
    anyOffered: groups.some((g) => g.offered),
  };
}

/** Top picks across all mensas that are open now or open later today. Max two per mensa. */
export function topRecommendations(groups: MensaGroup[], p: Prefs, n = 3): MealView[] {
  const pool = groups
    .filter((g) => g.open.kind === 'open' || g.open.kind === 'opens')
    .flatMap((g) => g.views)
    .map((v) => ({ v, s: scoreMeal(v, p) }))
    .sort((a, b) => b.s - a.s);
  const perMensa = new Map<string, number>();
  const out: MealView[] = [];
  for (const { v } of pool) {
    const used = perMensa.get(v.mensa.id) ?? 0;
    if (used >= 2) continue;
    perMensa.set(v.mensa.id, used + 1);
    out.push(v);
    if (out.length === n) break;
  }
  return out;
}
