/**
 * The app's "now". Normally the real time; with Dev mode on, the developer tools can set a simulated
 * date and time (Zurich), frozen or running from there, to test weekdays and service hours on a weekend.
 * Everything in the browser that depends on the time (open/closed, opening hours, crowd chart and survey,
 * rating prompt, visits) reads appNow() instead of new Date().
 */
import { readPreferences } from '../preferences/state.ts';

export const CLOCK_KEY = 'campuseats-dev-clock';
/** Dispatched on document when the simulated clock is set or reset. */
export const CLOCK_EVENT = 'campuseats:clock-changed';

export interface SimulatedClock {
  /** Simulated epoch ms at the moment it was set. */
  at: number;
  /** Real epoch ms when it was set. */
  setAt: number;
  /** true: time moves on from `at`; false: frozen at `at`. */
  running: boolean;
}

export function parseSimulatedClock(raw: string | null): SimulatedClock | null {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<SimulatedClock> | null;
    if (!value || !Number.isFinite(value.at) || !Number.isFinite(value.setAt)) return null;
    return { at: value.at!, setAt: value.setAt!, running: value.running !== false };
  } catch { return null; }
}

/** The simulated time at the real time realNow. */
export function simulatedNow(clock: SimulatedClock, realNow: number): Date {
  return new Date(clock.running ? clock.at + (realNow - clock.setAt) : clock.at);
}

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The simulated clock if one is set and Dev mode is on, else null. */
export function activeSimulatedClock(): SimulatedClock | null {
  const store = storage();
  if (!store) return null;
  try {
    if (!readPreferences(store).devMode) return null;
    return parseSimulatedClock(store.getItem(CLOCK_KEY));
  } catch { return null; }
}

/** The app's current time: simulated (Dev mode) or real. */
export function appNow(): Date {
  const clock = activeSimulatedClock();
  return clock ? simulatedNow(clock, Date.now()) : new Date();
}

function announce() {
  if (typeof document !== 'undefined') document.dispatchEvent(new Event(CLOCK_EVENT));
}

export function setSimulatedClock(at: number, running: boolean): void {
  storage()?.setItem(CLOCK_KEY, JSON.stringify({ at, setAt: Date.now(), running } satisfies SimulatedClock));
  announce();
}

export function clearSimulatedClock(): void {
  storage()?.removeItem(CLOCK_KEY);
  announce();
}

/** Zurich wall-clock parts of an instant: date YYYY-MM-DD, time HH:mm, weekday mon..sun. */
export function zurichParts(at: Date | number): { date: string; time: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}`, weekday: get('weekday').toLowerCase().slice(0, 3) };
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Minutes since midnight of an "HH:mm" time. */
export const minutesOfDay = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Weekday and minutes since midnight in Zurich, independent of the device's time zone. */
export function zurichClock(at: Date | number): { weekday: Weekday; minutes: number } {
  const { time, weekday } = zurichParts(at);
  return { weekday: weekday as Weekday, minutes: minutesOfDay(time) };
}

/** The instant (epoch ms) of a Zurich wall-clock date (YYYY-MM-DD) and time (HH:mm), DST-aware. */
export function zurichToEpoch(date: string, time: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  // Zurich is UTC+1 or UTC+2; try both offsets and keep the one that maps back to the wall time.
  for (const offsetHours of [2, 1]) {
    const candidate = wall - offsetHours * 3_600_000;
    const back = zurichParts(candidate);
    if (back.date === date && back.time === time) return candidate;
  }
  return null;
}
