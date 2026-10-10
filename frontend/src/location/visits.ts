/**
 * Mensa visits: when the user is located at a mensa during one of its meal services, or reports its
 * crowd, that is a visit. A visit keeps its arrival time and the expected queue wait, so the rating card
 * asks only once the meal is probably eaten (readyAt). Pure functions plus a small localStorage store.
 */

import { minutesOfDay, zurichClock, zurichParts, type Weekday } from '../time/clock.ts';
export type { Weekday };
export interface ServiceWindow { service: 'lunch' | 'dinner'; open: string; close: string }
export interface MensaHours {
  id: string;
  temporarilyClosed: boolean;
  openingHours: Record<Weekday, ServiceWindow[]>;
  closures: Array<{ from: string; to: string }>;
}
/** location: the user was located there; crowd: the user reported its crowd (no location proof). */
export type VisitSource = 'location' | 'crowd';
export interface Visit {
  mensaId: string;
  date: string;
  service: 'lunch' | 'dinner';
  /** Arrival, epoch ms. Missing on visits stored before arrival times were kept. */
  at?: number;
  /** Expected queue wait at arrival, minutes. */
  waitMin?: number;
  /** Missing means location (older visits). */
  source?: VisitSource;
}

export const VISITS_KEY = 'campuseats-visits';
/** Visits older than this many days are dropped. */
const KEEP_DAYS = 30;
/** People queue before opening and finish eating after closing. */
const GRACE_MIN = 15;
/** Time to eat after the queue. */
export const EATING_MIN = 20;
/** Queue wait when nothing is known about the crowd. */
const DEFAULT_WAIT_MIN = 5;

/** Date, weekday and minutes since midnight in Zurich, independent of the device timezone. */
export function zurichNow(now: Date): { date: string; weekday: Weekday; minutes: number } {
  const { weekday, minutes } = zurichClock(now);
  return { date: zurichParts(now).date, weekday, minutes };
}

/** Expected queue wait for a crowd survey level (1 empty ... 5 packed). */
export function waitForCrowdLevel(level: number): number {
  return [0, 0, 2, 5, 10, 15][Math.round(level)] ?? DEFAULT_WAIT_MIN;
}

/** Expected queue wait for the crowd indicator's occupancy (low, medium, high). */
export function waitForOccupancy(occupancy: string | undefined): number {
  return occupancy === 'low' ? 2 : occupancy === 'medium' ? 7 : occupancy === 'high' ? 15 : DEFAULT_WAIT_MIN;
}

/** When the meal of this visit is probably eaten: arrival + queue + eating. null for visits without an arrival time. */
export function readyAt(visit: Visit): number | null {
  return visit.at === undefined ? null : visit.at + ((visit.waitMin ?? DEFAULT_WAIT_MIN) + EATING_MIN) * 60_000;
}

/** Lunch before 16:00, dinner after; for a crowd report, which needs no opening hours (the survey only shows while open). */
export function crowdVisit(mensaId: string, level: number, now: Date): Visit {
  const { date, minutes } = zurichNow(now);
  return { mensaId, date, service: minutes < 16 * 60 ? 'lunch' : 'dinner', at: now.getTime(), waitMin: waitForCrowdLevel(level), source: 'crowd' };
}

/**
 * The visits implied by being at these mensas now: one per mensa that is serving (with a grace period).
 * Mensas that share a building and both serve give one visit each; the rating card asks which one.
 * waitMin gives each mensa's expected queue wait (e.g. from the crowd indicator on the page).
 */
export function visitsAt(atMensaIds: readonly string[], mensas: readonly MensaHours[], now: Date,
  waitMin: (mensaId: string) => number = () => DEFAULT_WAIT_MIN): Visit[] {
  const { date, weekday, minutes } = zurichNow(now);
  return atMensaIds.flatMap(id => {
    const mensa = mensas.find(m => m.id === id);
    if (!mensa || mensa.temporarilyClosed || mensa.closures.some(c => c.from <= date && date <= c.to)) return [];
    const window = (mensa.openingHours[weekday] ?? [])
      .find(w => minutesOfDay(w.open) - GRACE_MIN <= minutes && minutes <= minutesOfDay(w.close) + GRACE_MIN);
    return window ? [{ mensaId: id, date, service: window.service, at: now.getTime(), waitMin: waitMin(id), source: 'location' as const }] : [];
  });
}

/**
 * Adds visits and drops the ones older than KEEP_DAYS. Newest first. One visit per mensa, day and service:
 * it keeps the first arrival (the queue started then) and is a location visit if either one was.
 */
export function mergeVisits(existing: readonly Visit[], added: readonly Visit[], now: Date): Visit[] {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const key = (v: Visit) => `${v.date} ${v.service} ${v.mensaId}`;
  const merged = new Map<string, Visit>();
  for (const visit of [...existing, ...added]) {
    if (visit.date < cutoff) continue;
    const before = merged.get(key(visit));
    if (!before) { merged.set(key(visit), visit); continue; }
    const first = (visit.at ?? -Infinity) < (before.at ?? -Infinity) ? visit : before;
    const location = (before.source ?? 'location') === 'location' || (visit.source ?? 'location') === 'location';
    merged.set(key(visit), location && first.source === 'crowd' ? { ...first, source: 'location' } : first);
  }
  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function readVisits(storage: Storage = localStorage): Visit[] {
  try {
    const value = JSON.parse(storage.getItem(VISITS_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is Visit =>
      typeof v?.mensaId === 'string' && typeof v?.date === 'string' && (v?.service === 'lunch' || v?.service === 'dinner') &&
      (v.at === undefined || Number.isFinite(v.at)) && (v.waitMin === undefined || Number.isFinite(v.waitMin)) &&
      (v.source === undefined || v.source === 'location' || v.source === 'crowd')) : [];
  } catch { return []; }
}

/** Records the visits and returns the stored list. Storage failures keep the old list. */
export function recordVisits(added: readonly Visit[], now: Date, storage: Storage = localStorage): Visit[] {
  const visits = mergeVisits(readVisits(storage), added, now);
  if (added.length) {
    try { storage.setItem(VISITS_KEY, JSON.stringify(visits)); } catch { /* private mode or full */ }
  }
  return visits;
}
