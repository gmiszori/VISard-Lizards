import { getNow, hhmmToMin, minutesOf, weekdayOf } from './time';
import type { CrowdInfo, CrowdLevel, Mensa } from './types';

export const CROWD_LABEL: Record<CrowdLevel, string> = {
  1: 'Empty',
  2: 'Quiet',
  3: 'Some queue',
  4: 'Busy',
  5: 'Packed',
};

/** Words for the "Usually … at this time" sentence. */
export const CROWD_USUALLY: Record<CrowdLevel, string> = {
  1: 'Usually not busy',
  2: 'Usually not too busy',
  3: 'Usually a little busy',
  4: 'Usually busy',
  5: 'Usually as busy as it gets',
};

/** Histogram value 0–100 → 5-step level. */
export function levelFromPct(p: number): CrowdLevel {
  if (p < 20) return 1;
  if (p < 40) return 2;
  if (p < 60) return 3;
  if (p < 80) return 4;
  return 5;
}

/** Level → representative histogram height, used to draw the "Live" marker. */
export function pctFromLevel(l: CrowdLevel): number {
  return l * 20 - 10;
}

export interface CrowdNow {
  level: CrowdLevel;
  /** `live` = from reports in the last 30 minutes; `typical` = from the histogram. */
  source: 'live' | 'typical';
}

const LIVE_WINDOW_MS = 30 * 60 * 1000;

export function liveLevel(info: CrowdInfo, now: Date = getNow()): CrowdLevel | null {
  const recent = info.live.filter((r) => {
    const age = now.getTime() - new Date(r.timestamp).getTime();
    return age >= -60_000 && age <= LIVE_WINDOW_MS;
  });
  if (!recent.length) return null;
  const avg = recent.reduce((s, r) => s + r.level, 0) / recent.length;
  return Math.min(5, Math.max(1, Math.round(avg))) as CrowdLevel;
}

export function typicalPct(info: CrowdInfo, now: Date = getNow()): number | null {
  const h = info.histogram;
  if (!h.sufficient || !h.byWeekday) return null;
  return h.byWeekday[weekdayOf(now)][now.getHours()] ?? null;
}

/**
 * Crowd right now. Live reports win; otherwise the typical pattern.
 * Returns null when the mensa is not serving or nothing is known.
 */
export function crowdNow(info: CrowdInfo | undefined, mensa: Mensa, now: Date = getNow()): CrowdNow | null {
  if (!info) return null;
  const mins = minutesOf(now);
  const serving = mensa.hours[weekdayOf(now)].some((h) => mins >= hhmmToMin(h.open) && mins < hhmmToMin(h.close));
  if (!serving) return null;
  const live = liveLevel(info, now);
  if (live) return { level: live, source: 'live' };
  const pct = typicalPct(info, now);
  if (pct === null) return null;
  return { level: levelFromPct(pct), source: 'typical' };
}
