/**
 * Mensa visits recorded from the user's location: when the user is located at a mensa during one of
 * its meal services, that is a visit. The rating card can offer the visited mensas for that day
 * (dated candidates of getRatingPrompt). Pure functions plus a small localStorage store.
 */

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export interface ServiceWindow { service: 'lunch' | 'dinner'; open: string; close: string }
export interface MensaHours {
  id: string;
  temporarilyClosed: boolean;
  openingHours: Record<Weekday, ServiceWindow[]>;
  closures: Array<{ from: string; to: string }>;
}
export interface Visit { mensaId: string; date: string; service: 'lunch' | 'dinner' }

export const VISITS_KEY = 'campuseats-visits';
/** Visits older than this many days are dropped. */
const KEEP_DAYS = 30;
/** People queue before opening and finish eating after closing. */
const GRACE_MIN = 15;

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Date, weekday and minutes since midnight in Zurich, independent of the device timezone. */
export function zurichNow(now: Date): { date: string; weekday: Weekday; minutes: number } {
  const p = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  const weekday = WEEKDAYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)];
  return { date: `${p.year}-${p.month}-${p.day}`, weekday, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * The visits implied by being at these mensas now: one per mensa that is serving (with a grace period).
 * Mensas that share a building and both serve give one visit each; the rating card asks which one.
 */
export function visitsAt(atMensaIds: readonly string[], mensas: readonly MensaHours[], now: Date): Visit[] {
  const { date, weekday, minutes } = zurichNow(now);
  return atMensaIds.flatMap(id => {
    const mensa = mensas.find(m => m.id === id);
    if (!mensa || mensa.temporarilyClosed || mensa.closures.some(c => c.from <= date && date <= c.to)) return [];
    const window = (mensa.openingHours[weekday] ?? [])
      .find(w => toMin(w.open) - GRACE_MIN <= minutes && minutes <= toMin(w.close) + GRACE_MIN);
    return window ? [{ mensaId: id, date, service: window.service }] : [];
  });
}

/** Adds visits without duplicates and drops the ones older than KEEP_DAYS. Newest first. */
export function mergeVisits(existing: readonly Visit[], added: readonly Visit[], now: Date): Visit[] {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const key = (v: Visit) => `${v.date} ${v.service} ${v.mensaId}`;
  const seen = new Set<string>();
  return [...added, ...existing]
    .filter(v => v.date >= cutoff && !seen.has(key(v)) && Boolean(seen.add(key(v))))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function readVisits(storage: Storage = localStorage): Visit[] {
  try {
    const value = JSON.parse(storage.getItem(VISITS_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is Visit =>
      typeof v?.mensaId === 'string' && typeof v?.date === 'string' && (v?.service === 'lunch' || v?.service === 'dinner')) : [];
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
