import test from 'node:test';
import assert from 'node:assert/strict';
import { appNow, parseSimulatedClock, simulatedNow, zurichParts, zurichToEpoch } from './clock.ts';

test('parseSimulatedClock accepts valid clocks only; running is the default', () => {
  assert.equal(parseSimulatedClock(null), null);
  assert.equal(parseSimulatedClock('nope'), null);
  assert.equal(parseSimulatedClock('{"at":"x","setAt":1}'), null);
  assert.deepEqual(parseSimulatedClock('{"at":5,"setAt":1}'), { at: 5, setAt: 1, running: true });
  assert.deepEqual(parseSimulatedClock('{"at":5,"setAt":1,"running":false}'), { at: 5, setAt: 1, running: false });
});

test('simulatedNow: running clocks move on, frozen clocks stay', () => {
  const at = Date.parse('2026-10-12T10:00:00Z');
  assert.equal(simulatedNow({ at, setAt: 1000, running: true }, 61_000).toISOString(), '2026-10-12T10:01:00.000Z');
  assert.equal(simulatedNow({ at, setAt: 1000, running: false }, 61_000).toISOString(), '2026-10-12T10:00:00.000Z');
});

test('zurichToEpoch handles summer and winter time', () => {
  assert.equal(new Date(zurichToEpoch('2026-10-12', '12:00')!).toISOString(), '2026-10-12T10:00:00.000Z'); // CEST
  assert.equal(new Date(zurichToEpoch('2026-11-02', '12:00')!).toISOString(), '2026-11-02T11:00:00.000Z'); // CET
  assert.equal(zurichToEpoch('2026-10-12', '25:00'), null);
  assert.equal(zurichToEpoch('12.10.2026', '12:00'), null);
});

test('zurichParts formats the Zurich wall clock', () => {
  assert.deepEqual(zurichParts(Date.parse('2026-10-12T16:30:00Z')), { date: '2026-10-12', time: '18:30', weekday: 'mon' });
});

test('appNow is the real time without browser storage', () => {
  assert.ok(Math.abs(appNow().getTime() - Date.now()) < 1000);
});
