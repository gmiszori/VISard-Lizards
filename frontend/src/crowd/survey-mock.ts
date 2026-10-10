/**
 * Device-only mock data for testing the crowd survey without a backend (developer tools, src/dev/).
 * While enabled, the survey on canteen pages reads and writes these reports instead of calling
 * /api/mensas/{id}/crowd and /crowd-reports, and can be shown outside opening hours (forceOpen).
 * Nothing here reaches the backend or other people.
 */
import type { CrowdLevel, LiveReport } from './survey-logic.ts';

export const CROWD_MOCK_KEY = 'campuseats-dev-crowd-mock';
/** Same window as the backend's "live" reports. */
export const LIVE_WINDOW_MS = 30 * 60_000;

export interface CrowdMock {
  enabled: boolean;
  /** Show the survey even when the mensa is closed. */
  forceOpen: boolean;
  /** Mock reports per mensa id, oldest first. */
  reports: Record<string, LiveReport[]>;
}

export const EMPTY_MOCK: CrowdMock = { enabled: false, forceOpen: false, reports: {} };

export function readCrowdMock(storage: Storage = localStorage): CrowdMock {
  try {
    const raw = JSON.parse(storage.getItem(CROWD_MOCK_KEY) ?? 'null') as Partial<CrowdMock> | null;
    if (!raw || typeof raw !== 'object') return EMPTY_MOCK;
    const reports = raw.reports && typeof raw.reports === 'object' && !Array.isArray(raw.reports) ? raw.reports : {};
    return { enabled: raw.enabled === true, forceOpen: raw.forceOpen === true, reports };
  } catch { return EMPTY_MOCK; }
}

export function writeCrowdMock(mock: CrowdMock, storage: Storage = localStorage): void {
  storage.setItem(CROWD_MOCK_KEY, JSON.stringify(mock));
}

/** Adds count reports of one level, spread over the last minutes (newest now), and drops expired ones. */
export function addMockReports(mock: CrowdMock, mensaId: string, level: CrowdLevel, count: number, now: number): CrowdMock {
  const n = Math.max(1, Math.min(50, Math.floor(count)));
  const added = Array.from({ length: n }, (_, i) => ({ level, timestamp: new Date(now - (n - 1 - i) * 60_000).toISOString() }));
  const kept = (mock.reports[mensaId] ?? []).filter(r => now - Date.parse(r.timestamp) < LIVE_WINDOW_MS);
  return { ...mock, reports: { ...mock.reports, [mensaId]: [...kept, ...added] } };
}

/** Removes the mock reports of one mensa, or of all mensas. */
export function clearMockReports(mock: CrowdMock, mensaId?: string): CrowdMock {
  if (!mensaId) return { ...mock, reports: {} };
  const reports = { ...mock.reports };
  delete reports[mensaId];
  return { ...mock, reports };
}

/** Reports of the last 30 minutes, newest first, like the backend's `live`. */
export function liveMockReports(mock: CrowdMock, mensaId: string, now: number): LiveReport[] {
  return (mock.reports[mensaId] ?? [])
    .filter(r => { const age = now - Date.parse(r.timestamp); return age >= 0 && age < LIVE_WINDOW_MS; })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}
