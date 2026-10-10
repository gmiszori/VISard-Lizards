/**
 * Pure helpers for the "How busy is it right now?" survey (CrowdSurvey.astro, survey.ts).
 * Levels are the backend's crowd report levels (backend/API.md, crowd-reports):
 * 1 empty, 2 quiet, 3 some queue, 4 busy, 5 packed.
 */
export type CrowdLevel = 1 | 2 | 3 | 4 | 5;
export const CROWD_LEVELS: readonly CrowdLevel[] = [1, 2, 3, 4, 5];

/** The backend accepts one report per mensa and client every 5 minutes (app.rate-limit.crowd-report-window). */
export const REPORT_COOLDOWN_MS = 5 * 60_000;
/** Device storage of the last report time per mensa id (enforces the cooldown on this device). */
export const LAST_REPORT_KEY = 'campuseats-crowd-last-report';
export const RETRY_UNTIL_KEY = 'campuseats-crowd-retry-until';
export const LIVE_REPORT_WINDOW_MS = 30 * 60_000;

export interface LiveReport { level: number; timestamp: string }
export interface CrowdSummary { level: CrowdLevel; count: number }

/** Only the newest reports decide the current level, so it follows a change after a few reports. */
export const RECENT_REPORTS = 6;
/** A report this old counts half as much as a fresh one. */
export const REPORT_HALF_LIFE_MS = 10 * 60_000;

/**
 * The current level from the reports of the last 30 minutes: the mean of the RECENT_REPORTS newest
 * reports, each weighted by its age (half-life REPORT_HALF_LIFE_MS), rounded. count is the number of
 * all reports of the last 30 minutes. null without reports.
 */
export function summarize(reports: readonly LiveReport[], now = Date.now()): CrowdSummary | null {
  const valid = reports
    .map(report => ({ level: report?.level, at: Date.parse(report?.timestamp) }))
    .filter(({ level, at }) => Number.isInteger(level) && level >= 1 && level <= 5
      && Number.isFinite(at) && at > now - LIVE_REPORT_WINDOW_MS && at <= now)
    .sort((a, b) => b.at - a.at);
  if (!valid.length) return null;
  let weighted = 0;
  let weights = 0;
  for (const { level, at } of valid.slice(0, RECENT_REPORTS)) {
    const weight = 0.5 ** ((now - at) / REPORT_HALF_LIFE_MS);
    weighted += level * weight;
    weights += weight;
  }
  return { level: Math.min(5, Math.max(1, Math.round(weighted / weights))) as CrowdLevel, count: valid.length };
}

/** The "Current crowd" box's three labels (translation keys low/medium/high). */
export function occupancyOf(level: CrowdLevel): 'low' | 'medium' | 'high' {
  return level <= 2 ? 'low' : level === 3 ? 'medium' : 'high';
}

/** Milliseconds until this device may report again; 0 when it may report now. */
export function cooldownLeft(lastReportedAt: number | null, now: number): number {
  if (lastReportedAt === null || !Number.isFinite(lastReportedAt) || lastReportedAt > now) return 0;
  return Math.max(0, lastReportedAt + REPORT_COOLDOWN_MS - now);
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
/** Opening windows per weekday in minutes since midnight, as in #live-data (src/data/canteens.ts LIVE_DATA). */
export type OpeningWindows = Partial<Record<Weekday, Array<[number, number]>>>;

/** Weekday and minutes since midnight in Zurich, independent of the device's time zone. */
export function zurichClock(now: Date): { weekday: Weekday; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { weekday: get('weekday').toLowerCase().slice(0, 3) as Weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Reports only make sense while the mensa serves food. */
export function isOpenAt(windows: OpeningWindows, temporarilyClosed: boolean, now: Date): boolean {
  if (temporarilyClosed) return false;
  const { weekday, minutes } = zurichClock(now);
  return (windows[weekday] ?? []).some(([from, to]) => minutes >= from && minutes < to);
}
