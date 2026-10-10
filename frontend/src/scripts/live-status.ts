/**
 * The pages are built ahead of time, so "open now", today's opening hours and
 * the crowd level would be frozen at build time. This script recomputes them
 * in the browser (Zürich time) from the data embedded by BaseLayout
 * (#live-data, generated from src/data/canteens.ts) and refreshes every minute.
 *
 * Elements opt in with data-live="status | hours | crowd | open-count" and
 * data-live-id="<canteen id>".
 */
import { appNow, CLOCK_EVENT } from '../time/clock';

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
interface LiveInfo {
  temporarilyClosed: boolean;
  windows: Record<Weekday, Array<[number, number]>>;
  crowd: Partial<Record<Weekday, { start: number; pct: number[] }>>;
}

const data = JSON.parse(document.querySelector('#live-data')?.textContent || '{}') as Record<string, LiveInfo>;
const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function zurichNow(): { weekday: Weekday; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(appNow());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = WEEKDAYS.find((day) => day === get('weekday').toLowerCase().slice(0, 3)) ?? 'mon';
  return { weekday, minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

function stateOf(info: LiveInfo, now: { weekday: Weekday; minutes: number }) {
  const windows = info.windows[now.weekday] ?? [];
  const isOpen = !info.temporarilyClosed && windows.some(([from, to]) => now.minutes >= from && now.minutes < to);
  const german = document.documentElement.lang === 'de';
  const hours = info.temporarilyClosed ? (german ? 'Vorübergehend geschlossen' : 'Temporarily closed') : windows.length ? windows.map(([from, to]) => `${hhmm(from)} - ${hhmm(to)}`).join(' · ') : (german ? 'Heute geschlossen' : 'Closed today');
  const crowd = info.crowd[now.weekday];
  const slot = crowd ? Math.floor((now.minutes - crowd.start) / 15) : -1;
  const pct = crowd && slot >= 0 ? (crowd.pct[slot] ?? 0) : 0;
  const occupancy = !isOpen ? 'closed' : pct < 40 ? 'low' : pct < 70 ? 'medium' : 'high';
  return { isOpen, hours, occupancy };
}

/** Returns true when anything on the page changed. */
function refresh(): boolean {
  const now = zurichNow();
  let changed = false;
  let openCount = 0;
  const seen = new Set<string>();

  document.querySelectorAll<HTMLElement>('[data-live][data-live-id]').forEach((el) => {
    const id = el.dataset.liveId ?? '';
    const info = data[id];
    if (!info) return;
    const state = stateOf(info, now);
    if (el.dataset.live === 'status') {
      const label = el.querySelector<HTMLElement>('[data-i18n]');
      const key = state.isOpen ? 'open' : 'closed';
      if (label && label.dataset.i18n !== key) {
        label.dataset.i18n = key;
        label.textContent = state.isOpen ? 'Open now' : 'Closed';
        el.classList.toggle('open', state.isOpen);
        el.classList.toggle('closed', !state.isOpen);
        changed = true;
      }
      const card = el.closest<HTMLElement>('[data-canteen-card]');
      if (card) card.dataset.isOpen = String(state.isOpen);
      if (!seen.has(id)) {
        seen.add(id);
        if (state.isOpen) openCount++;
      }
    } else if (el.dataset.live === 'hours' && el.textContent !== state.hours) {
      el.textContent = state.hours;
    } else if (el.dataset.live === 'crowd' && !el.dataset.crowdReported) {
      // crowdReported: the crowd survey (src/crowd/survey.ts) shows real reports instead of the illustrative value.
      const label = el.querySelector<HTMLElement>('[data-crowd-label]');
      if (label && (el.dataset.occupancy !== state.occupancy || label.dataset.i18n !== state.occupancy)) {
        el.dataset.occupancy = state.occupancy;
        label.dataset.i18n = state.occupancy;
        label.textContent = state.occupancy[0].toUpperCase() + state.occupancy.slice(1);
        changed = true;
      }
    }
  });

  const total = document.querySelector<HTMLElement>('[data-live="open-count"]');
  if (total && seen.size > 0) {
    if (total.textContent !== String(openCount)) total.textContent = String(openCount);
    if (total.parentElement) total.parentElement.hidden = openCount === 0;
  }
  return changed;
}

function run() {
  if (!refresh()) return;
  // Re-apply the selected language to the new labels and re-run the preference filters.
  document.querySelector<HTMLSelectElement>('#language-select')?.dispatchEvent(new Event('change'));
}

run();
document.addEventListener('languagechange', refresh);
document.addEventListener(CLOCK_EVENT, run);
document.addEventListener('campuseats:crowd-reset', run);
setInterval(run, 60_000);
