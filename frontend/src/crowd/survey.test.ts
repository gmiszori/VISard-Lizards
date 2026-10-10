import test from 'node:test';
import assert from 'node:assert/strict';
import { cooldownLeft, isOpenAt, occupancyOf, REPORT_COOLDOWN_MS, summarize, zurichClock } from './survey-logic.ts';

test('summarize: rounded mean of valid levels, null without reports', () => {
  assert.equal(summarize([]), null);
  assert.deepEqual(summarize([{ level: 4, timestamp: '' }, { level: 5, timestamp: '' }, { level: 3, timestamp: '' }]), { level: 4, count: 3 });
  assert.deepEqual(summarize([{ level: 2, timestamp: '' }, { level: 3, timestamp: '' }]), { level: 3, count: 2 });
  assert.deepEqual(summarize([{ level: 9, timestamp: '' }, { level: 1, timestamp: '' }]), { level: 1, count: 1 });
});

test('occupancyOf maps levels to the Current crowd labels', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(l => occupancyOf(l as 1)), ['low', 'low', 'medium', 'high', 'high']);
});

test('cooldownLeft mirrors the backend 5-minute window', () => {
  const t = Date.parse('2026-10-12T10:00:00Z');
  assert.equal(cooldownLeft(null, t), 0);
  assert.equal(cooldownLeft(t, t + 60_000), REPORT_COOLDOWN_MS - 60_000);
  assert.equal(cooldownLeft(t, t + REPORT_COOLDOWN_MS), 0);
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
