import { dev } from './store';
import type { Mensa, Service, ServiceHours, Weekday } from './types';

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** The app's "now". Honours the developer panel's simulated time. */
export function getNow(): Date {
  const sim = dev.get().simNow;
  if (sim) {
    const d = new Date(sim);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function weekdayOf(d: Date): Weekday {
  return WEEKDAYS[(d.getDay() + 6) % 7] as Weekday;
}

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Local `YYYY-MM-DD`. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Monday of the week containing `d` (local, noon). */
export function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  out.setDate(out.getDate() - ((d.getDay() + 6) % 7));
  return out;
}

/** Date of the given weekday in the same Mon–Sun week as `ref`. */
export function dateOfWeekday(ref: Date, day: Weekday): Date {
  const out = mondayOf(ref);
  out.setDate(out.getDate() + WEEKDAYS.indexOf(day));
  return out;
}

export function formatDateLong(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Lunch before 15:00, dinner afterwards. */
export function defaultService(now: Date): Service {
  return minutesOf(now) < 15 * 60 ? 'lunch' : 'dinner';
}

export function serviceHours(m: Mensa, day: Weekday, service: Service): ServiceHours | undefined {
  return m.hours[day].find((h) => h.service === service);
}

export type OpenState =
  | { kind: 'open'; closesAt: string }
  | { kind: 'opens'; opensAt: string }
  | { kind: 'closed' } // service existed today but is over
  | { kind: 'none' }; // no such service today

/** Open/closed state of one service at a given moment. */
export function openState(m: Mensa, now: Date, service: Service): OpenState {
  const h = serviceHours(m, weekdayOf(now), service);
  if (!h) return { kind: 'none' };
  const mins = minutesOf(now);
  if (mins < hhmmToMin(h.open)) return { kind: 'opens', opensAt: h.open };
  if (mins < hhmmToMin(h.close)) return { kind: 'open', closesAt: h.close };
  return { kind: 'closed' };
}

/** The service window that is open right now, if any. */
export function openNow(m: Mensa, now: Date): ServiceHours | undefined {
  const mins = minutesOf(now);
  return m.hours[weekdayOf(now)].find((h) => mins >= hhmmToMin(h.open) && mins < hhmmToMin(h.close));
}

export function openStateLabel(s: OpenState): string {
  switch (s.kind) {
    case 'open':
      return `Open until ${s.closesAt}`;
    case 'opens':
      return `Opens ${s.opensAt}`;
    case 'closed':
      return 'Closed now';
    case 'none':
      return 'Closed today';
  }
}

export function hoursLine(m: Mensa, day: Weekday): string {
  const list = m.hours[day];
  if (!list.length) return 'Closed';
  return list.map((h) => `${h.open}–${h.close}`).join(' · ');
}

/** Overall state of a mensa right now, across lunch and dinner. */
export function dayStatus(m: Mensa, now: Date): OpenState {
  const list = m.hours[weekdayOf(now)];
  if (!list.length) return { kind: 'none' };
  const mins = minutesOf(now);
  const current = list.find((h) => mins >= hhmmToMin(h.open) && mins < hhmmToMin(h.close));
  if (current) return { kind: 'open', closesAt: current.close };
  const next = list.find((h) => mins < hhmmToMin(h.open));
  if (next) return { kind: 'opens', opensAt: next.open };
  return { kind: 'closed' };
}
