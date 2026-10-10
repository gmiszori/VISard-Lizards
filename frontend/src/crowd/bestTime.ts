import { formatTime, type CrowdSlot } from './prediction.ts';

export interface QuietWindow { startMinute: number; endMinute: number; occupancyPct: number }
/** When meals are served (not when the building is open): minutes since midnight. */
export interface ServingWindow { service: 'lunch' | 'dinner'; from: number; to: number }

/** Lunch is when most people eat; a quiet window outside it is no use for planning lunch. */
const LUNCH_FROM = 11 * 60;
const LUNCH_TO = 14 * 60 + 30;
/** Two quarter-hours: long enough to eat in, short enough to be a real recommendation. */
const WINDOW_SLOTS = 2;
/** If the quietest and the busiest window are this close, the tip would be noise. */
const MIN_DIFFERENCE_PCT = 10;

/**
 * The quietest half hour to go, from the predicted occupancy of the day. Only windows where both quarter
 * hours have a prediction count (a gap is "unknown", never "empty"). Prefers the lunch hours; for a mensa
 * that only serves outside them (dinner only), the whole day is used. Returns null when there is nothing
 * useful to say: no complete window, or the day is about equally busy all the time.
 */
export function quietestWindow(slots: readonly CrowdSlot[], serving?: readonly ServingWindow[]): QuietWindow | null {
  // The building can be open longer than the kitchen serves: never recommend a time after lunch has ended.
  if (serving && serving.length === 0) return null;
  const windows = (from: number, to: number) => {
    const found: QuietWindow[] = [];
    for (let i = 0; i + WINDOW_SLOTS <= slots.length; i++) {
      const group = slots.slice(i, i + WINDOW_SLOTS);
      const start = group[0]!.startMinute;
      const consecutive = group.every((slot, k) => slot.startMinute === start + k * 15);
      if (!consecutive || start < from || start + WINDOW_SLOTS * 15 > to) continue;
      if (group.some(slot => slot.occupancyPct === null)) continue;
      const mean = group.reduce((sum, slot) => sum + slot.occupancyPct!, 0) / group.length;
      found.push({ startMinute: start, endMinute: start + WINDOW_SLOTS * 15, occupancyPct: Math.round(mean) });
    }
    return found;
  };
  const within = (list: readonly ServingWindow[]) => list.flatMap(w => windows(w.from, w.to));
  const lunchPool = serving ? within(serving.filter(w => w.service === 'lunch')) : windows(LUNCH_FROM, LUNCH_TO);
  const pool = lunchPool.length ? lunchPool : serving ? within(serving) : windows(0, 24 * 60);
  if (!pool.length) return null;
  const best = pool.reduce((a, b) => (b.occupancyPct < a.occupancyPct ? b : a));
  const worst = pool.reduce((a, b) => (b.occupancyPct > a.occupancyPct ? b : a));
  return worst.occupancyPct - best.occupancyPct < MIN_DIFFERENCE_PCT ? null : best;
}

/** "13:15–13:45" */
export const windowLabel = (window: QuietWindow) => `${formatTime(window.startMinute)}–${formatTime(window.endMinute)}`;
