import test from 'node:test';
import assert from 'node:assert/strict';
import { cooldownLeft, isOpenAt, LIVE_REPORT_WINDOW_MS, occupancyOf, REPORT_COOLDOWN_MS, summarize, zurichClock } from './survey-logic.ts';

const now = Date.parse('2026-10-12T10:00:00Z');
const recent = (level: number) => ({ level, timestamp: new Date(now - 60_000).toISOString() });

test('summarize: rounded mean of valid levels, null without reports', () => {
  assert.equal(summarize([], now), null);
  assert.deepEqual(summarize([recent(4), recent(5), recent(3)], now), { level: 4, count: 3 });
  assert.deepEqual(summarize([recent(2), recent(3)], now), { level: 3, count: 2 });
  assert.deepEqual(summarize([recent(9), recent(1)], now), { level: 1, count: 1 });
});

test('live summary expires at the backend cutoff, even without another request', () => {
  const reports = [recent(5)];
  assert.deepEqual(summarize(reports, now), { level: 5, count: 1 });
  assert.equal(summarize(reports, now + LIVE_REPORT_WINDOW_MS - 60_000), null);
  assert.equal(summarize(reports, now + LIVE_REPORT_WINDOW_MS), null);
});

test('live summary ignores invalid, future and expired timestamps', () => {
  const reports = [
    recent(2),
    { level: 5, timestamp: 'invalid' },
    { level: 5, timestamp: new Date(now + 1).toISOString() },
    { level: 5, timestamp: new Date(now - LIVE_REPORT_WINDOW_MS).toISOString() },
  ];
  assert.deepEqual(summarize(reports, now), { level: 2, count: 1 });
  assert.deepEqual(summarize([{ level: 3, timestamp: new Date(now).toISOString() }], now), { level: 3, count: 1 });
});

test('summarize follows a change after a few new reports, not after outweighing all old ones', () => {
  const at = (minutesAgo: number, level: number) => ({ level, timestamp: new Date(now - minutesAgo * 60_000).toISOString() });
  // 20 "quiet" reports over the last 25 minutes ...
  const quiet = Array.from({ length: 20 }, (_, i) => at(25 - i, 2));
  assert.deepEqual(summarize(quiet, now), { level: 2, count: 20 });
  // ... then people report "empty": two are not enough, four flip it.
  assert.equal(summarize([...quiet, at(1, 1), at(0, 1)], now)!.level, 2);
  assert.equal(summarize([...quiet, at(3, 1), at(2, 1), at(1, 1), at(0, 1)], now)!.level, 1);
  assert.equal(summarize([...quiet, at(3, 1), at(2, 1), at(1, 1), at(0, 1)], now)!.count, 24);
});

test('summarize: one outlier moves the level by at most one step', () => {
  const at = (minutesAgo: number, level: number) => ({ level, timestamp: new Date(now - minutesAgo * 60_000).toISOString() });
  const quiet = [at(10, 2), at(8, 2), at(6, 2), at(4, 2), at(2, 2)];
  assert.equal(summarize([...quiet, at(0, 5)], now)!.level, 3);
});

test('summarize: older reports count less', () => {
  const at = (minutesAgo: number, level: number) => ({ level, timestamp: new Date(now - minutesAgo * 60_000).toISOString() });
  // Plain mean would be 3 (some queue); the fresh "packed" weighs more than the 25-minute-old "empty".
  assert.equal(summarize([at(25, 1), at(0, 5)], now)!.level, 4);
});

test('occupancyOf maps levels to the Current crowd labels', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(l => occupancyOf(l as 1)), ['low', 'low', 'medium', 'high', 'high']);
});

test('cooldownLeft mirrors the backend 5-minute window', () => {
  const t = Date.parse('2026-10-12T10:00:00Z');
  assert.equal(cooldownLeft(null, t), 0);
  assert.equal(cooldownLeft(t, t + 60_000), REPORT_COOLDOWN_MS - 60_000);
  assert.equal(cooldownLeft(t, t + REPORT_COOLDOWN_MS), 0);
  assert.equal(cooldownLeft(NaN, t), 0);
  assert.equal(cooldownLeft(Infinity, t), 0);
  assert.equal(cooldownLeft(t + 24 * 60 * 60_000, t), 0, 'a corrupt future timestamp does not freeze reporting');
});

test('isOpenAt uses Zurich time and the opening windows', () => {
  const lunch = { mon: [[660, 840]] as Array<[number, number]> };
  // 12:00 Zurich (UTC+2 in October) on Monday 12 Oct 2026
  assert.deepEqual(zurichClock(new Date('2026-10-12T10:00:00Z')), { weekday: 'mon', minutes: 720 });
  assert.equal(isOpenAt(lunch, false, new Date('2026-10-12T10:00:00Z')), true);
  assert.equal(isOpenAt(lunch, true, new Date('2026-10-12T10:00:00Z')), false);
  assert.equal(isOpenAt(lunch, false, new Date('2026-10-12T12:00:00Z')), false); // 14:00 closes
  assert.equal(isOpenAt(lunch, false, new Date('2026-10-13T10:00:00Z')), false); // Tuesday: no window
});
