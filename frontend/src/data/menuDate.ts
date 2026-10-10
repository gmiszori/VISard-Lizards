/**
 * Which day's menu the pages show.
 *
 * Rule: today on weekdays; on Saturday and Sunday the coming Monday. If the data has nothing for that
 * day, fall back to the day the backend suggests (today, or the latest earlier day with menus).
 * All functions are pure and work on plain `YYYY-MM-DD` strings, so they behave the same in every
 * timezone and can be tested without a backend.
 */

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Parses `YYYY-MM-DD` at noon UTC (immune to DST); returns null for anything else. */
function parse(iso: string): Date | null {
  if (typeof iso !== 'string' || !ISO.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? date : null;
}

/** True only for a real calendar date written as `YYYY-MM-DD` (rejects 2026-02-31 and 2026-13-01). */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parse(value) !== null;
}

/** 0 = Sunday ... 6 = Saturday, or null for an invalid date. */
export function weekdayIndex(iso: string): number | null {
  return parse(iso)?.getUTCDay() ?? null;
}

export function isWeekend(iso: string): boolean {
  const day = weekdayIndex(iso);
  return day === 0 || day === 6;
}

export function addDays(iso: string, days: number): string | null {
  const date = parse(iso);
  return date ? new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10) : null;
}

/** Today on weekdays, the next Monday on Saturday and Sunday. Invalid input is returned unchanged. */
export function wantedMenuDate(today: string): string {
  const day = weekdayIndex(today);
  if (day === null) return today;
  if (day === 6) return addDays(today, 2) ?? today;
  if (day === 0) return addDays(today, 1) ?? today;
  return today;
}

/**
 * The days people can pick a menu for: weekdays from the wanted day (today, or Monday on weekends)
 * up to the last day with data (dataTo, else one week), at most `max`, plus the shown menu day.
 */
export function selectableMenuDays(today: string, menuDate: string, dataTo: string | undefined, max = 10): string[] {
  const start = wantedMenuDate(today);
  const end = dataTo && parse(dataTo) ? dataTo : addDays(start, 6) ?? start;
  const days = new Set<string>();
  let day: string | null = start;
  for (let i = 0; day && day <= end && days.size < max && i < 60; i++, day = addDays(day, 1)) {
    if (!isWeekend(day)) days.add(day);
  }
  if (parse(menuDate)) days.add(menuDate);
  return [...days].sort();
}

/**
 * Dates to try in order: the wanted day, then the backend's suggestion (no duplicates).
 * The first one with meals wins; if none has meals the last one is shown (an honest empty menu).
 */
export function menuDateCandidates(today: string, backendMenuDate: string): string[] {
  return [...new Set([wantedMenuDate(today), backendMenuDate].filter((date) => typeof date === 'string' && date !== ''))];
}

/**
 * Same rule for the bundled sample data, whose days are fixed: on weekends the latest Monday it has
 * (not after today); otherwise today, or the latest earlier day; before all data its first day.
 */
export function pickSampleMenuDate(dates: readonly string[], today: string): string {
  const sorted = [...new Set(dates)].filter((date) => parse(date) !== null).sort();
  if (!sorted.length) return today;
  const earlier = sorted.filter((date) => date <= today);
  if (isWeekend(today)) {
    const monday = [...earlier].reverse().find((date) => weekdayIndex(date) === 1);
    if (monday) return monday;
  }
  if (sorted.includes(today)) return today;
  return earlier[earlier.length - 1] ?? sorted[0] ?? today; // before all data: its first day, like the backend
}
