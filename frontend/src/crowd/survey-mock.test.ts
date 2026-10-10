import test from 'node:test';
import assert from 'node:assert/strict';
import { addMockReports, clearMockReports, CROWD_MOCK_KEY, EMPTY_MOCK, liveMockReports, readCrowdMock, writeCrowdMock } from './survey-mock.ts';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, clear: () => data.clear(), key: i => [...data.keys()][i] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
}
const NOW = Date.parse('2026-10-12T10:00:00Z');

test('read/write round trip; broken or missing storage gives the disabled default', () => {
  const storage = memoryStorage();
  assert.deepEqual(readCrowdMock(storage), EMPTY_MOCK);
  storage.setItem(CROWD_MOCK_KEY, 'not json');
  assert.deepEqual(readCrowdMock(storage), EMPTY_MOCK);
  const mock = { enabled: true, forceOpen: true, reports: { polyterrasse: [{ level: 4, timestamp: new Date(NOW).toISOString() }] } };
  writeCrowdMock(mock, storage);
  assert.deepEqual(readCrowdMock(storage), mock);
});

test('addMockReports spreads reports over the last minutes and caps the count', () => {
  const mock = addMockReports(EMPTY_MOCK, 'polyterrasse', 4, 3, NOW);
  assert.deepEqual(mock.reports.polyterrasse!.map(r => r.timestamp),
    ['2026-10-12T09:58:00.000Z', '2026-10-12T09:59:00.000Z', '2026-10-12T10:00:00.000Z']);
  assert.equal(addMockReports(EMPTY_MOCK, 'polyterrasse', 2, 500, NOW).reports.polyterrasse!.length, 50);
});

test('liveMockReports: last 30 minutes, newest first; old reports are dropped on add', () => {
  let mock = addMockReports(EMPTY_MOCK, 'polyterrasse', 2, 1, NOW - 40 * 60_000);
  mock = addMockReports(mock, 'polyterrasse', 5, 2, NOW);
  assert.equal(mock.reports.polyterrasse!.length, 2);
  assert.deepEqual(liveMockReports(mock, 'polyterrasse', NOW).map(r => r.timestamp),
    ['2026-10-12T10:00:00.000Z', '2026-10-12T09:59:00.000Z']);
  assert.deepEqual(liveMockReports(mock, 'polyterrasse', NOW + 31 * 60_000), []);
});

test('clearMockReports for one mensa or all', () => {
  const mock = addMockReports(addMockReports(EMPTY_MOCK, 'a', 3, 1, NOW), 'b', 3, 1, NOW);
  assert.deepEqual(Object.keys(clearMockReports(mock, 'a').reports), ['b']);
  assert.deepEqual(clearMockReports(mock).reports, {});
});
