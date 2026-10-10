import { API_URL, apiGet, type BackendMeta } from '../data/api.ts';
import { PREFERENCES_KEY, readPreferences } from '../preferences/state.ts';
import { formatDistance } from '../location/distance.ts';
import { getPositionFix, LocationUnavailableError } from '../location/geolocation.ts';
import { locateUser, type MensaPlace, type PositionFix, type UserLocation } from '../location/locate.ts';
import { readVisits, VISITS_KEY } from '../location/visits.ts';
import { mountCrowdMockPanel, renderCrowdMockPanel } from './crowd-mock-panel.ts';
import { appNow, CLOCK_EVENT } from '../time/clock.ts';
import { mountClockPanel, renderClockPanel } from './clock-panel.ts';
import { mountPushPanel } from './push-panel.ts';
import { CROWD_MOCK_KEY } from '../crowd/survey-mock.ts';
import { LAST_REPORT_KEY } from '../crowd/survey-logic.ts';

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
interface DevMensa {
  id: string;
  name: string;
  institution: string;
  campusId: string;
  hasMenu: boolean;
  temporarilyClosed: boolean;
  coordinates: { lat: number; lng: number; source?: string | null } | null;
  openingHours: Record<Weekday, Array<{ service: 'lunch' | 'dinner'; open: string; close: string }>>;
  closures: Array<{ from: string; to: string; note?: string }>;
  source: { provider: string; facilityId?: number; url?: string | null } | null;
  state: { menuCount: number; rating: number | null; initialOpen: boolean; occupancy: string } | null;
}
interface DevData {
  apiUrl: string;
  source: 'backend' | 'sample';
  sampleReason: 'unreachable' | 'invalid' | null;
  menuDate: string;
  today: string;
  campuses: Record<string, string>;
  mensas: DevMensa[];
}

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

let mounted = false;
let lastFix: PositionFix | null = null;
let lastLocation: UserLocation | null = null;
let lastLocationError = '';
let permissionState = 'unknown';
let backendState = 'not checked';
let backendCheckedAt = '';

function dl(root: HTMLElement, rows: Array<[string, string]>) {
  root.replaceChildren(...rows.flatMap(([label, value]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    return [dt, dd];
  }));
}

function zurichNow(now = appNow()): { date: string; weekday: Weekday; minutes: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = WEEKDAYS.find((day) => day === get('weekday').toLowerCase().slice(0, 3)) ?? 'mon';
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday, minutes, label: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}` };
}

function liveState(mensa: DevMensa, now = zurichNow()) {
  const closedByDate = mensa.closures.some(closure => closure.from <= now.date && now.date <= closure.to);
  const windows = mensa.openingHours[now.weekday] ?? [];
  const active = windows.find(window => toMin(window.open) <= now.minutes && now.minutes < toMin(window.close));
  const isOpen = !mensa.temporarilyClosed && !closedByDate && Boolean(active);
  const next = windows.find(window => toMin(window.open) > now.minutes);
  const windowText = active ? `${active.service} ${active.open}-${active.close}` : next ? `next ${next.service} ${next.open}-${next.close}` : windows.length ? windows.map(w => `${w.service} ${w.open}-${w.close}`).join(', ') : 'closed today';
  return { isOpen, windowText, closedByDate };
}

function places(data: DevData): MensaPlace[] {
  return data.mensas.flatMap(mensa => mensa.coordinates
    ? [{ id: mensa.id, name: mensa.name, campus: mensa.campusId, lat: mensa.coordinates.lat, lng: mensa.coordinates.lng }]
    : []);
}

function nearestDistance(id: string): string {
  const distance = lastLocation?.nearby.find(mensa => mensa.id === id)?.distanceM;
  return distance === undefined ? 'n/a' : formatDistance(distance);
}

function canUseStorage(): string {
  try {
    const key = 'campuseats-dev-storage-test';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return 'ok';
  } catch {
    return 'blocked';
  }
}

function safeJson(key: string): string {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return 'not set';
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return 'unreadable';
  }
}

async function checkPermission() {
  try {
    if (!navigator.permissions) {
      permissionState = navigator.geolocation ? 'available, Permissions API missing' : 'unsupported';
      return;
    }
    const result = await navigator.permissions.query({ name: 'geolocation' });
    permissionState = result.state;
    result.onchange = () => { permissionState = result.state; renderAll(); };
  } catch {
    permissionState = navigator.geolocation ? 'available, permission unknown' : 'unsupported';
  }
}

async function pingBackend() {
  if (!API_URL) {
    backendState = 'disabled (PUBLIC_API_URL is empty)';
    backendCheckedAt = zurichNow().label;
    return;
  }
  try {
    const meta = await apiGet<BackendMeta>('/api/meta', API_URL, 2500);
    backendState = `ok: today ${meta.today}, menu ${meta.menuDate}`;
  } catch (error) {
    backendState = `failed: ${(error as Error).message}`;
  }
  backendCheckedAt = zurichNow().label;
}

function renderSummary(root: HTMLElement, data: DevData) {
  const now = zurichNow();
  const live = data.mensas.map(mensa => liveState(mensa, now));
  const open = live.filter(state => state.isOpen).length;
  const withSource = data.mensas.filter(mensa => mensa.hasMenu).length;
  const withRenderedMenu = data.mensas.filter(mensa => (mensa.state?.menuCount ?? 0) > 0).length;
  const visible = document.querySelectorAll('[data-canteen-card]:not([hidden])').length;
  const visits = readVisits().length;
  root.replaceChildren(...[
    ['Open now', `${open}/${data.mensas.length}`],
    ['Visible cards', String(visible)],
    ['Menus shown', `${withRenderedMenu}/${data.mensas.length}`],
    ['Sources configured', `${withSource}/${data.mensas.length}`],
    ['Saved visits', String(visits)],
  ].map(([label, value]) => {
    const item = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = value;
    item.append(strong, label);
    return item;
  }));
}

function renderBackend(root: HTMLElement, data: DevData) {
  const prefs = readPreferences();
  dl(root, [
    ['Page source', data.sampleReason ? `${data.source} (${data.sampleReason})` : data.source],
    ['Browser API URL', API_URL || '(disabled)'],
    ['Build API URL', data.apiUrl || '(disabled)'],
    ['Backend ping', backendState],
    ['Backend checked', backendCheckedAt || 'not yet'],
    ['Menu date', data.menuDate],
    ['Today', data.today],
    ['Zurich now', zurichNow().label],
    ['Stored dev mode', String(prefs.devMode)],
  ]);
}

function renderPosition(root: HTMLElement, nearestRoot: HTMLElement) {
  const fixAt = lastFix ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(lastFix.at)) : 'none';
  dl(root, [
    ['Permission', permissionState],
    ['Last fix', lastFix ? `${lastFix.lat.toFixed(6)}, ${lastFix.lng.toFixed(6)}` : 'none'],
    ['Accuracy', lastFix ? `${Math.round(lastFix.accuracyM)} m` : 'n/a'],
    ['Fix time', fixAt],
    ['Campus', lastLocation?.campus ? lastLocation.campus : 'n/a'],
    ['At mensas', lastLocation?.atMensaIds.length ? lastLocation.atMensaIds.join(', ') : 'none'],
    ['Error', lastLocationError || 'none'],
  ]);
  const items = (lastLocation?.nearby ?? []).slice(0, 6).map(mensa => {
    const li = document.createElement('li');
    li.textContent = `${mensa.name}: ${formatDistance(mensa.distanceM)} (${mensa.campus})`;
    return li;
  });
  nearestRoot.replaceChildren(...(items.length ? items : [Object.assign(document.createElement('li'), { textContent: 'No position fix yet.' })]));
}

function renderLiveTable(root: HTMLElement, data: DevData) {
  const now = zurichNow();
  const sorted = [...data.mensas].sort((a, b) => {
    const aState = liveState(a, now);
    const bState = liveState(b, now);
    return Number(bState.isOpen) - Number(aState.isOpen) || a.campusId.localeCompare(b.campusId) || a.name.localeCompare(b.name);
  });
  root.replaceChildren(...sorted.map(mensa => {
    const state = liveState(mensa, now);
    const tr = document.createElement('tr');
    const source = mensa.source?.provider ? `${mensa.source.provider}${mensa.source.facilityId ? ` #${mensa.source.facilityId}` : ''}` : 'snapshot';
    const cells = [
      mensa.name,
      data.campuses[mensa.campusId] ?? mensa.campusId,
      state.isOpen ? 'serving now' : state.closedByDate ? 'closed by date' : mensa.temporarilyClosed ? 'temporarily closed' : 'not serving',
      state.windowText,
      mensa.state ? `${mensa.state.menuCount} shown` : mensa.hasMenu ? 'has menu' : 'no menu',
      source,
      nearestDistance(mensa.id),
    ];
    cells.forEach((value, index) => {
      const td = document.createElement('td');
      td.textContent = value;
      if (index === 2) td.className = state.isOpen ? 'dev-live-open' : 'dev-live-closed';
      tr.append(td);
    });
    return tr;
  }));
}

function renderStorage(root: HTMLElement) {
  const visits = readVisits();
  const blocks: Array<[string, string]> = [
    ['Storage', canUseStorage()],
    ['Preferences', safeJson(PREFERENCES_KEY)],
    ['Visits', visits.length ? JSON.stringify(visits, null, 2) : '[]'],
    ['Near me', safeJson('campuseats-near-me')],
    ['Rating state', safeJson('campuseats-meal-rating-state')],
    ['Favourites', safeJson('campuseats-favourites')],
    ['Crowd survey mock', safeJson(CROWD_MOCK_KEY)],
    ['Crowd report lock', safeJson(LAST_REPORT_KEY)],
  ];
  root.replaceChildren(...blocks.map(([label, value]) => {
    const wrap = document.createElement('div');
    const title = document.createElement('strong');
    const pre = document.createElement('pre');
    title.textContent = label;
    pre.textContent = value;
    wrap.append(title, pre);
    return wrap;
  }));
}

function readDevData(): DevData | null {
  try {
    return JSON.parse(document.querySelector('[data-dev-data]')?.textContent ?? 'null') as DevData | null;
  } catch {
    return null;
  }
}

function shouldShow(): boolean {
  try { return readPreferences().devMode; } catch { return false; }
}

function renderAll() {
  const root = document.querySelector<HTMLElement>('[data-dev-tools]');
  const data = readDevData();
  if (!root || !data) return;
  const show = shouldShow();
  root.hidden = !show;
  if (!show) return;
  renderSummary(root.querySelector<HTMLElement>('[data-dev-summary]')!, data);
  renderBackend(root.querySelector<HTMLElement>('[data-dev-backend]')!, data);
  renderPosition(root.querySelector<HTMLElement>('[data-dev-position]')!, root.querySelector<HTMLElement>('[data-dev-nearest]')!);
  renderLiveTable(root.querySelector<HTMLElement>('[data-dev-live-table]')!, data);
  renderStorage(root.querySelector<HTMLElement>('[data-dev-storage]')!);
  renderCrowdMockPanel();
  renderClockPanel();
}

async function readPosition() {
  const data = readDevData();
  if (!data) return;
  lastLocationError = '';
  try {
    lastFix = await getPositionFix();
    lastLocation = locateUser(lastFix, places(data));
    document.dispatchEvent(new CustomEvent('campuseats:dev-position-read', { detail: lastLocation }));
  } catch (error) {
    lastFix = null;
    lastLocation = null;
    lastLocationError = error instanceof LocationUnavailableError ? error.reason : (error as Error).message;
  }
  await checkPermission();
  renderAll();
}

const COLLAPSED_KEY = 'campuseats-dev-tools-collapsed';

/** The developer tools fold down to their header; remembered on the device. */
function mountCollapse() {
  const root = document.querySelector<HTMLElement>('[data-dev-tools]');
  const button = root?.querySelector<HTMLButtonElement>('[data-dev-collapse]');
  if (!root || !button) return;
  const apply = (collapsed: boolean) => {
    root.classList.toggle('is-collapsed', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    button.textContent = collapsed ? 'Expand' : 'Collapse';
  };
  let collapsed = false;
  try { collapsed = localStorage.getItem(COLLAPSED_KEY) === 'true'; } catch { /* storage blocked */ }
  apply(collapsed);
  button.addEventListener('click', () => {
    collapsed = !collapsed;
    try { localStorage.setItem(COLLAPSED_KEY, String(collapsed)); } catch { /* storage blocked */ }
    apply(collapsed);
  });
}

const CLOSED_SECTIONS_KEY = 'campuseats-dev-sections-closed';

/** Each section folds on its own (<details>); the closed ones are remembered on the device. */
function mountSections() {
  let closed: string[] = [];
  try { closed = JSON.parse(localStorage.getItem(CLOSED_SECTIONS_KEY) ?? '[]'); } catch { /* storage blocked */ }
  if (!Array.isArray(closed)) closed = [];
  document.querySelectorAll<HTMLDetailsElement>('[data-dev-tools] details[data-dev-section]').forEach(section => {
    const id = section.dataset.devSection!;
    section.open = !closed.includes(id);
    section.addEventListener('toggle', () => {
      closed = section.open ? closed.filter(other => other !== id) : [...new Set([...closed, id])];
      try { localStorage.setItem(CLOSED_SECTIONS_KEY, JSON.stringify(closed)); } catch { /* storage blocked */ }
    });
  });
}

export function mountDevTools(): void {
  if (mounted) return;
  mounted = true;
  mountCollapse();
  mountSections();
  void checkPermission().then(renderAll);
  void pingBackend().then(renderAll);
  mountCrowdMockPanel(renderAll);
  mountPushPanel();
  mountClockPanel(renderAll);
  document.addEventListener(CLOCK_EVENT, renderAll);
  renderAll();

  document.querySelector('[data-dev-refresh]')?.addEventListener('click', () => {
    void pingBackend().then(renderAll);
    renderAll();
  });
  document.querySelector('[data-dev-locate]')?.addEventListener('click', () => { void readPosition(); });
  document.querySelector('[data-dev-clear-visits]')?.addEventListener('click', () => {
    try { localStorage.removeItem(VISITS_KEY); } catch { /* ignore */ }
    renderAll();
  });
  document.addEventListener('campuseats:preferences-applied', renderAll);
  document.addEventListener('campuseats:canteen-favourites-changed', renderAll);
  document.addEventListener('campuseats:user-located', event => {
    const detail = (event as CustomEvent<UserLocation>).detail;
    lastLocation = detail;
    lastFix = detail.fix;
    lastLocationError = '';
    renderAll();
  });
  window.addEventListener('storage', renderAll);
  setInterval(renderAll, 15_000);
}
