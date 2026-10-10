import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, formatSwissDate, isWeekend, menuDateCandidates, pickSampleMenuDate, weekdayIndex, wantedMenuDate, zurichDate } from './menuDate.ts';

// 2026-10-10 is a Saturday.
test('weekday numbers and weekend detection', () => {
  assert.equal(weekdayIndex('2026-10-10'), 6);
  assert.equal(weekdayIndex('2026-10-11'), 0);
  assert.equal(weekdayIndex('2026-10-12'), 1);
  assert.equal(isWeekend('2026-10-10'), true);
  assert.equal(isWeekend('2026-10-11'), true);
  assert.equal(isWeekend('2026-10-09'), false);
});

test('weekdays keep today', () => {
  for (const day of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']) assert.equal(wantedMenuDate(day), day);
});

test('Saturday and Sunday show the coming Monday', () => {
  assert.equal(wantedMenuDate('2026-10-10'), '2026-10-12');
  assert.equal(wantedMenuDate('2026-10-11'), '2026-10-12');
});

test('month, year and leap-day boundaries', () => {
  assert.equal(wantedMenuDate('2026-12-26'), '2026-12-28');
  assert.equal(wantedMenuDate('2026-12-27'), '2026-12-28');
  assert.equal(wantedMenuDate('2027-01-02'), '2027-01-04');
  assert.equal(wantedMenuDate('2026-02-28'), '2026-03-02');
  assert.equal(wantedMenuDate('2028-02-26'), '2028-02-28');
  assert.equal(wantedMenuDate('2028-02-27'), '2028-02-28');
});

test('the DST change Sunday (2026-10-25) still gives Monday', () => {
  assert.equal(wantedMenuDate('2026-10-24'), '2026-10-26');
  assert.equal(wantedMenuDate('2026-10-25'), '2026-10-26');
});

test('invalid input is returned unchanged and never throws', () => {
  for (const value of ['', 'garbage', '2026-13-40', '2026-02-30', '10/10/2026', '2026-10-10T12:00:00Z']) {
    assert.equal(wantedMenuDate(value), value);
    assert.equal(weekdayIndex(value), null);
    assert.equal(addDays(value, 1), null);
    assert.equal(isWeekend(value), false);
  }
  assert.equal(wantedMenuDate(undefined as unknown as string), undefined);
  assert.equal(wantedMenuDate(null as unknown as string), null);
});

test('candidates: wanted day first, then the backend suggestion, without duplicates', () => {
  assert.deepEqual(menuDateCandidates('2026-10-10', '2026-10-09'), ['2026-10-12', '2026-10-09']);
  assert.deepEqual(menuDateCandidates('2026-10-11', '2026-10-09'), ['2026-10-12', '2026-10-09']);
  assert.deepEqual(menuDateCandidates('2026-10-07', '2026-10-07'), ['2026-10-07']);
  assert.deepEqual(menuDateCandidates('2026-10-07', '2026-10-06'), ['2026-10-07', '2026-10-06']);
  assert.deepEqual(menuDateCandidates('2026-10-10', '2026-10-12'), ['2026-10-12']);
  assert.deepEqual(menuDateCandidates('2026-10-10', ''), ['2026-10-12']);
});

const sample = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

test('sample data: weekends show the latest Monday the data has', () => {
  assert.equal(pickSampleMenuDate(sample, '2026-10-10'), '2026-10-05');
  assert.equal(pickSampleMenuDate(sample, '2026-10-11'), '2026-10-05');
  assert.equal(pickSampleMenuDate(sample, '2026-10-03'), '2026-09-28');
});

test('sample data: weekdays keep today, otherwise the latest earlier day', () => {
  assert.equal(pickSampleMenuDate(sample, '2026-10-07'), '2026-10-07');
  assert.equal(pickSampleMenuDate(sample, '2026-10-14'), '2026-10-09');
  assert.equal(pickSampleMenuDate(sample, '2026-09-01'), '2026-09-28');
});

test('sample data: weekend without any Monday falls back to the latest earlier day', () => {
  const noMonday = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  assert.equal(pickSampleMenuDate(noMonday, '2026-10-10'), '2026-10-09');
});

test('sample data: empty or invalid lists return today', () => {
  assert.equal(pickSampleMenuDate([], '2026-10-10'), '2026-10-10');
  assert.equal(pickSampleMenuDate(['x', '2026-99-99'], '2026-10-10'), '2026-10-10');
  assert.equal(pickSampleMenuDate(['2026-10-05', '2026-10-05', 'bad'], '2026-10-10'), '2026-10-05');
});

test('formatSwissDate formats valid dates and leaves anything else alone', () => {
  assert.equal(formatSwissDate('2026-10-12'), '12.10.2026');
  assert.equal(formatSwissDate('2028-02-29'), '29.02.2028');
  for (const value of ['', 'garbage', '2026-02-30', '12.10.2026']) assert.equal(formatSwissDate(value), value);
});

test('zurichDate uses Zurich, not the host timezone', () => {
  assert.equal(zurichDate(new Date('2026-10-10T21:59:00Z')), '2026-10-10'); // 23:59 in Zurich (CEST)
  assert.equal(zurichDate(new Date('2026-10-10T22:00:00Z')), '2026-10-11'); // 00:00 in Zurich
  assert.equal(zurichDate(new Date('2026-10-25T23:30:00Z')), '2026-10-26'); // after the DST change
  assert.equal(zurichDate(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.equal(zurichDate(new Date('not a date')), '');
});
