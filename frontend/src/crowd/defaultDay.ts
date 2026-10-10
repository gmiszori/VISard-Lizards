/**
 * Which weekday the predicted-crowd chart opens on: today, except on Saturday and Sunday, when it
 * opens on Monday (the next day with normal service). If that day has no prediction, the first
 * weekday that has one. Pure, so it can be tested without a browser.
 */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const ORDER: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function defaultCrowdDay(today: string, hasData: (day: Weekday) => boolean): Weekday {
  const known = ORDER.includes(today as Weekday);
  const wanted: Weekday = !known || today === 'sat' || today === 'sun' ? 'mon' : (today as Weekday);
  if (hasData(wanted)) return wanted;
  return ORDER.find(hasData) ?? wanted;
}
