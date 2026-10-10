import { appNow, CLOCK_EVENT, zurichParts } from '../time/clock';

type ServiceWindow = { service: 'lunch' | 'dinner'; open: string; close: string };

const minuteOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

function zurichNow() {
  const { date, time } = zurichParts(appNow());
  return { date, minute: minuteOf(time) };
}

function translated(key: string) {
  const de = document.documentElement.lang === 'de';
  return key === 'lunch' ? (de ? 'Mittagessen' : 'Lunch')
    : key === 'dinner' ? (de ? 'Abendessen' : 'Dinner')
      : de ? 'Geschlossen' : 'Closed';
}

const range = (window: ServiceWindow) => `${window.open}–${window.close}`;

/** Writes the service name and its time range into the line; no time removes the range. */
function show(label: HTMLElement, service: string, time?: string) {
  label.dataset.service = service;
  const name = label.querySelector<HTMLElement>('[data-service-name]');
  if (name) {
    name.textContent = translated(service);
    name.dataset.i18n = service === 'closed' ? 'closed' : service;
  }
  let timeElement = label.querySelector<HTMLElement>('[data-service-time]');
  if (time) {
    if (!timeElement) {
      timeElement = document.createElement('span');
      timeElement.dataset.serviceTime = '';
      label.append(timeElement);
    }
    timeElement.textContent = time;
    timeElement.hidden = false;
  } else if (timeElement) {
    timeElement.remove();
  }
}

/**
 * announce: tell scripts/preferences.ts when a live line starts or stops being "Closed" (that hides the dishes).
 * The Lunch / Dinner pill of the day picker decides which service the line names, so the heading never says
 * "Lunch" above dinner dishes; a closed canteen stays "Closed".
 */
function refresh(announce = true) {
  const local = zurichNow();
  const pill = document.documentElement.dataset.serviceFilter;
  let closedChanged = false;
  document.querySelectorAll<HTMLElement>('[data-service-label]').forEach(label => {
    let windows: ServiceWindow[] = [];
    try { windows = JSON.parse(label.dataset.serviceWindows ?? '[]'); } catch { /* keep the rendered line */ }
    windows.sort((a, b) => a.open.localeCompare(b.open));
    // What the server rendered, for when no pill is picked and the line is not live.
    if (label.dataset.initialService === undefined) {
      label.dataset.initialService = label.dataset.service ?? 'closed';
      label.dataset.initialTime = label.querySelector('[data-service-time]')?.textContent ?? '';
    }
    const live = label.dataset.serviceLive === 'true' && label.dataset.serviceDate === local.date;
    let service = label.dataset.initialService;
    let time: string | undefined = label.dataset.initialTime || undefined;
    if (live) {
      const chosen = windows.find(window => minuteOf(window.open) <= local.minute && local.minute < minuteOf(window.close))
        ?? windows.find(window => minuteOf(window.open) > local.minute);
      service = chosen?.service ?? 'closed';
      time = chosen && range(chosen);
    }
    if ((pill === 'lunch' || pill === 'dinner') && service !== 'closed') {
      const picked = windows.find(window => window.service === pill);
      service = pill;
      time = picked && range(picked);
    }
    const wasClosed = label.dataset.service === 'closed';
    show(label, service, time);
    if (live && wasClosed !== (service === 'closed')) closedChanged = true;
  });
  if (announce && closedChanged) document.dispatchEvent(new Event('campuseats:service-filter-changed'));
}

refresh();
window.setTimeout(() => document.dispatchEvent(new Event('campuseats:service-filter-changed')), 0);
window.setInterval(() => refresh(), 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
document.addEventListener('languagechange', () => refresh());
// Dev mode can simulate the time; the service line follows it like the open/closed status does.
document.addEventListener(CLOCK_EVENT, () => refresh());
// The day picker's Lunch / Dinner / All pills: only the heading changes here, preferences.ts filters the dishes itself.
document.addEventListener('campuseats:service-filter-changed', () => refresh(false));
