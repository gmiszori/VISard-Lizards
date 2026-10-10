import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultCrowdDay, type Weekday } from './defaultDay.ts';

const all = () => true;

test('weekdays open on today', () => {
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) assert.equal(defaultCrowdDay(day, all), day);
});

test('Saturday and Sunday open on Monday, even if the weekend has predictions', () => {
  assert.equal(defaultCrowdDay('sat', all), 'mon');
  assert.equal(defaultCrowdDay('sun', all), 'mon');
});

test('falls back to the first weekday that has data', () => {
  const onlyThuFri = (day: Weekday) => day === 'thu' || day === 'fri';
  assert.equal(defaultCrowdDay('tue', onlyThuFri), 'thu');
  assert.equal(defaultCrowdDay('sat', onlyThuFri), 'thu');
});

test('no data at all keeps the wanted day instead of throwing', () => {
  assert.equal(defaultCrowdDay('wed', () => false), 'wed');
  assert.equal(defaultCrowdDay('sun', () => false), 'mon');
});

test('unknown weekday text opens on Monday', () => {
  for (const value of ['', 'xyz', 'MON', undefined as unknown as string]) assert.equal(defaultCrowdDay(value, all), 'mon');
});
