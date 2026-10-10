import test from 'node:test';
import assert from 'node:assert/strict';
import { MENSAS } from '../data/canteens.ts';
import { formatDistance } from './distance.ts';
import { crowdVisit, mergeVisits, readVisits, readyAt, recordVisits, visitsAt, VISITS_KEY, waitForCrowdLevel, zurichNow, type Visit } from './visits.ts';

// Monday 2026-10-12, times in Zurich (UTC+2 in October).
const at = (hhmm: string) => new Date(`2026-10-12T${hhmm}:00+02:00`);

test('zurichNow uses Zurich, not the device timezone', () => {
  assert.deepEqual(zurichNow(new Date('2026-10-11T22:30:00Z')), { date: '2026-10-12', weekday: 'mon', minutes: 30 });
});

test('a visit needs a serving mensa, with 15 minutes grace', () => {
  const polyterrasse = MENSAS.find(m => m.id === 'polyterrasse')!;
  const lunch = polyterrasse.openingHours.mon.find(w => w.service === 'lunch')!;
  const open = Number(lunch.open.slice(0, 2)) * 60 + Number(lunch.open.slice(3));
  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const when = at(hhmm(open + 30));
  assert.deepEqual(visitsAt(['polyterrasse'], MENSAS, when, () => 7),
    [{ mensaId: 'polyterrasse', date: '2026-10-12', service: 'lunch', at: when.getTime(), waitMin: 7, source: 'location' }]);
  assert.equal(visitsAt(['polyterrasse'], MENSAS, at(hhmm(open - 15))).length, 1);
  assert.deepEqual(visitsAt(['polyterrasse'], MENSAS, at(hhmm(open - 16))), []);
  assert.deepEqual(visitsAt(['polyterrasse'], MENSAS, at('03:00')), []);
});

test('no visit on a closed day or at a temporarily closed mensa', () => {
  const sunday = new Date('2026-10-11T12:15:00+02:00');
  assert.deepEqual(visitsAt(['polyterrasse'], MENSAS, sunday), []);
  const closed = MENSAS.filter(m => m.temporarilyClosed).map(m => m.id);
  assert.deepEqual(visitsAt(closed, MENSAS, at('12:15')), []);
  assert.deepEqual(visitsAt(['uzh-obere-mensa'], MENSAS, new Date('2026-12-22T12:15:00+01:00')), []);
  assert.deepEqual(visitsAt(['unknown'], MENSAS, at('12:15')), []);
});

test('mensas sharing a building each get a visit when both serve', () => {
  assert.deepEqual(visitsAt(['uzh-obere-mensa', 'uzh-untere-mensa'], MENSAS, at('12:15')).map(v => v.mensaId),
    ['uzh-obere-mensa', 'uzh-untere-mensa']);
  // Only Untere Mensa serves dinner.
  assert.deepEqual(visitsAt(['uzh-obere-mensa', 'uzh-untere-mensa'], MENSAS, at('18:00')).map(v => [v.mensaId, v.service]),
    [['uzh-untere-mensa', 'dinner']]);
});

test('mergeVisits dedupes, keeps 30 days, newest first', () => {
  const now = at('12:00');
  const old: Visit = { mensaId: 'a', date: '2026-09-01', service: 'lunch' };
  const kept: Visit = { mensaId: 'b', date: '2026-10-01', service: 'lunch' };
  const today: Visit = { mensaId: 'c', date: '2026-10-12', service: 'lunch' };
  assert.deepEqual(mergeVisits([kept, old, today], [today], now), [today, kept]);
});

test('mergeVisits keeps the first arrival; a location visit stays one', () => {
  const now = at('13:00');
  const crowd = crowdVisit('polyterrasse', 4, at('12:05'));
  const located: Visit = { mensaId: 'polyterrasse', date: '2026-10-12', service: 'lunch', at: at('12:20').getTime(), waitMin: 2, source: 'location' };
  assert.deepEqual(mergeVisits([crowd], [located], now), [{ ...crowd, source: 'location' }]);
  assert.deepEqual(mergeVisits([], [crowd, crowdVisit('polyterrasse', 1, at('12:30'))], now), [crowd]);
});

test('readyAt: arrival + queue wait + 20 minutes eating', () => {
  assert.equal(waitForCrowdLevel(1), 0);
  assert.equal(waitForCrowdLevel(5), 15);
  const visit = crowdVisit('polyterrasse', 4, at('12:10'));
  assert.deepEqual([visit.service, visit.source, visit.waitMin], ['lunch', 'crowd', 10]);
  assert.equal(readyAt(visit), at('12:40').getTime());
  assert.equal(readyAt({ mensaId: 'x', date: '2026-10-12', service: 'lunch' }), null);
  assert.equal(crowdVisit('polyterrasse', 2, at('18:30')).service, 'dinner');
});

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
  } as Storage;
}

test('recordVisits stores, readVisits ignores garbage', () => {
  const storage = memoryStorage({ [VISITS_KEY]: '{"not":"a list"}' });
  assert.deepEqual(readVisits(storage), []);
  const visit: Visit = { mensaId: 'polyterrasse', date: '2026-10-12', service: 'lunch' };
  recordVisits([visit], at('12:00'), storage);
  recordVisits([visit], at('12:05'), storage);
  assert.deepEqual(readVisits(storage), [visit]);
  assert.deepEqual(readVisits(memoryStorage({ [VISITS_KEY]: 'not json' })), []);
});

test('formatDistance', () => {
  assert.equal(formatDistance(3), '10 m');
  assert.equal(formatDistance(347), '350 m');
  assert.equal(formatDistance(1234), '1.2 km');
  assert.equal(formatDistance(1234, 'de'), '1,2 km');
  assert.equal(formatDistance(12_345), '12 km');
});
