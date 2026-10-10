import test from 'node:test';
import assert from 'node:assert/strict';
import { slotsForDay, type CrowdPrediction } from './prediction.ts';
const base: CrowdPrediction = { mensaId: 'polyterrasse', source: 'backend', intervalMinutes: 15, timeZone: 'Europe/Zurich', byWeekday: {} };
test('crowd preserves sparse quarter-hours as gaps and real zero values', () => {
  assert.deepEqual(slotsForDay({ ...base, byWeekday: { mon: { '12:00': 0, '12:30': 100 } } }, 'mon'), [
    { startMinute: 720, occupancyPct: 0 }, { startMinute: 735, occupancyPct: null }, { startMinute: 750, occupancyPct: 100 }]);
  assert.deepEqual(slotsForDay(base, 'tue'), []);
});
test('crowd rejects invalid times and treats invalid values as missing', () => {
  assert.deepEqual(slotsForDay({ ...base, byWeekday: { mon: { '24:00': 50, '12:01': 20, 'garbage': 20 } } }, 'mon'), []);
  assert.deepEqual(slotsForDay({ ...base, byWeekday: { mon: { '12:00': -1, '12:15': 101, '12:30': NaN, '12:45': null } } }, 'mon').map(v => v.occupancyPct), [null, null, null, null]);
});
