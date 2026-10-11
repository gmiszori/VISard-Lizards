/**
 * The pages are built ahead of time, so "open now", today's opening hours and
 * the crowd level would be frozen at build time. This script recomputes them
 * in the browser (Zürich time) from the data embedded by BaseLayout
 * (#live-data, generated from src/data/canteens.ts) and refreshes every minute.
 *
 * Elements opt in with data-live="status | hours | crowd | open-count" and
 * data-live-id="<canteen id>".
 */
import { appNow, CLOCK_EVENT, zurichClock, type Weekday } from '../time/clock';
import { readPreferences } from '../preferences/state';
import { canShowCanteen } from '../preferences/canteenVisibility';
import { closingIn } from '../time/closing';

interface LiveInfo {
  temporarilyClosed: boolean;
  windows: Record<Weekday, Array<[number, number]>>;
  crowd: Partial<Record<Weekday, { start: number; pct: number[] }>>;
}

const data = JSON.parse(document.querySelector('#live-data')?.textContent || '{}') as Record<string, LiveInfo>;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const zurichNow = () => zurichClock(appNow());

function stateOf(info: LiveInfo, now: { weekday: Weekday; minutes: number }) {
  const windows = info.windows[now.weekday] ?? [];
  const isOpen = !info.temporarilyClosed && windows.some(([from, to]) => now.minutes >= from && now.minutes < to);
  const german = document.documentElement.lang === 'de';
  const hours = info.temporarilyClosed ? (german ? 'Vorübergehend geschlossen' : 'Temporarily closed') : windows.length ? windows.map(([from, to]) => `${hhmm(from)} - ${hhmm(to)}`).join(' · ') : (german ? 'Heute geschlossen' : 'Closed today');
  const crowd = info.crowd[now.weekday];
  const slot = crowd ? Math.floor((now.minutes - crowd.start) / 15) : -1;
  const pct = crowd && slot >= 0 ? (crowd.pct[slot] ?? 0) : 0;
  const occupancy = !isOpen ? 'closed' : pct < 40 ? 'low' : pct < 70 ? 'medium' : 'high';
  return { isOpen, hours, occupancy, closingMinutes: isOpen ? closingIn(windows, now.minutes) : null };
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
      const label = el.querySelector<HTMLElement>('span');
      const key = state.isOpen ? 'open' : 'closed';
      const german = document.documentElement.lang === 'de';
      const text = state.closingMinutes !== null
        ? german ? `Schliesst in ${state.closingMinutes} Min.` : `Closes in ${state.closingMinutes} min`
        : state.isOpen ? german ? 'Geöffnet' : 'Open' : german ? 'Geschlossen' : 'Closed';
      if (label && (label.textContent !== text || (state.closingMinutes === null && label.dataset.i18n !== key))) {
        if (state.closingMinutes === null) label.dataset.i18n = key;
        else delete label.dataset.i18n;
        label.textContent = text;
        el.classList.toggle('open', state.isOpen);
        el.classList.toggle('closed', !state.isOpen);
        changed = true;
      }
      const card = el.closest<HTMLElement>('[data-canteen-card]');
      if (card) card.dataset.isOpen = String(state.isOpen);
      if (!seen.has(id)) {
        seen.add(id);
        if (state.isOpen && canShowCanteen(id, readPreferences().priceTier)) openCount++;
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
