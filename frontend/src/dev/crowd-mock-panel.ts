import { LAST_REPORT_KEY, RETRY_UNTIL_KEY, summarize, type CrowdLevel } from '../crowd/survey-logic.ts';
import { addMockReports, clearMockReports, liveMockReports, readCrowdMock, writeCrowdMock, type CrowdMock } from '../crowd/survey-mock.ts';

/**
 * Developer tools section "Crowd survey mock": switches the canteen pages' crowd survey to device-only
 * mock reports (src/crowd/survey-mock.ts), adds or clears reports and resets the 5-minute report lock.
 */
const LEVEL_NAMES: Record<CrowdLevel, string> = { 1: 'Empty', 2: 'Quiet', 3: 'Some queue', 4: 'Busy', 5: 'Packed' };

export function mountCrowdMockPanel(onChange: () => void): void {
  const root = document.querySelector<HTMLElement>('[data-dev-crowd-mock]');
  if (!root) return;
  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const enabled = q<HTMLInputElement>('[data-dev-crowd-enabled]');
  const forceOpen = q<HTMLInputElement>('[data-dev-crowd-force-open]');
  const mensa = q<HTMLSelectElement>('[data-dev-crowd-mensa]');
  const level = q<HTMLSelectElement>('[data-dev-crowd-level]');
  const count = q<HTMLInputElement>('[data-dev-crowd-count]');
  const status = q<HTMLElement>('[data-dev-crowd-status]');
  const mensaName = () => mensa.selectedOptions[0]?.textContent ?? mensa.value;

  function save(mock: CrowdMock, message: string) {
    try {
      writeCrowdMock(mock);
      status.textContent = message;
    } catch {
      status.textContent = 'Device storage is unavailable, so mock data cannot be saved.';
    }
    renderCrowdMockPanel();
    onChange();
  }

  enabled.addEventListener('change', () => save({ ...readCrowdMock(), enabled: enabled.checked },
    enabled.checked ? 'Mock on: canteen pages use these reports instead of the backend.' : 'Mock off: canteen pages use the backend again.'));
  forceOpen.addEventListener('change', () => save({ ...readCrowdMock(), forceOpen: forceOpen.checked },
    forceOpen.checked ? 'The survey also shows when a mensa is closed (only while the mock is on).' : 'The survey shows only during opening hours.'));
  mensa.addEventListener('change', renderCrowdMockPanel);
  q('[data-dev-crowd-add]').addEventListener('click', () => {
    const lvl = Number(level.value) as CrowdLevel;
    const n = Math.max(1, Math.min(50, Number(count.value) || 1));
    save(addMockReports(readCrowdMock(), mensa.value, lvl, n, Date.now()),
      `Added ${n} "${LEVEL_NAMES[lvl]}" report${n === 1 ? '' : 's'} to ${mensaName()}.`);
  });
  q('[data-dev-crowd-clear]').addEventListener('click', () =>
    save(clearMockReports(readCrowdMock(), mensa.value), `Cleared the mock reports of ${mensaName()}.`));
  q('[data-dev-crowd-clear-all]').addEventListener('click', () =>
    save(clearMockReports(readCrowdMock()), 'Cleared all mock reports.'));
  q('[data-dev-crowd-reset-lock]').addEventListener('click', () => {
    try {
      localStorage.removeItem(LAST_REPORT_KEY);
      localStorage.removeItem(RETRY_UNTIL_KEY);
      window.dispatchEvent(new Event('campuseats:crowd-lock-reset'));
      status.textContent = 'Report lock reset: this device can report every mensa again.';
    } catch { status.textContent = 'Device storage is unavailable.'; }
    onChange();
  });
  renderCrowdMockPanel();
}

export function renderCrowdMockPanel(): void {
  const root = document.querySelector<HTMLElement>('[data-dev-crowd-mock]');
  if (!root) return;
  const mock = readCrowdMock();
  root.querySelector<HTMLInputElement>('[data-dev-crowd-enabled]')!.checked = mock.enabled;
  const forceOpen = root.querySelector<HTMLInputElement>('[data-dev-crowd-force-open]')!;
  forceOpen.checked = mock.forceOpen;
  forceOpen.disabled = !mock.enabled;
  const mensa = root.querySelector<HTMLSelectElement>('[data-dev-crowd-mensa]')!;
  root.querySelector<HTMLAnchorElement>('[data-dev-crowd-open]')!.href = `/canteen/${encodeURIComponent(mensa.value)}`;

  const now = Date.now();
  const names = new Map([...mensa.options].map(o => [o.value, o.textContent ?? o.value]));
  const rows = Object.keys(mock.reports)
    .map(id => ({ id, live: liveMockReports(mock, id, now) }))
    .filter(row => row.live.length > 0);
  const list = root.querySelector<HTMLElement>('[data-dev-crowd-list]')!;
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No mock reports in the last 30 minutes.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...rows.map(({ id, live }) => {
    const summary = summarize(live)!;
    const item = document.createElement('li');
    item.textContent = `${names.get(id) ?? id}: ${live.length} report${live.length === 1 ? '' : 's'} → ${LEVEL_NAMES[summary.level]} (level ${summary.level})`;
    return item;
  }));
}

