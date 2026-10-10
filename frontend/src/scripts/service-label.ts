import { appNow, CLOCK_EVENT } from '../time/clock';

type ServiceWindow = { service: 'lunch' | 'dinner'; open: string; close: string };

function zurichNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(appNow());
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minute: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

function translated(key: string) {
  const de = document.documentElement.lang === 'de';
  return key === 'lunch' ? (de ? 'Mittagessen' : 'Lunch')
    : key === 'dinner' ? (de ? 'Abendessen' : 'Dinner')
      : de ? 'Geschlossen' : 'Closed';
}

function refresh() {
  const local = zurichNow();
  document.querySelectorAll<HTMLElement>('[data-service-label]').forEach(label => {
    const name = label.querySelector<HTMLElement>('[data-service-name]');
    if (label.dataset.serviceLive !== 'true' || label.dataset.serviceDate !== local.date) {
      if (name) name.textContent = translated(label.dataset.service ?? 'closed');
      return;
    }
    let service = label.dataset.service ?? 'closed';
    let time: string | undefined;
    let windows: ServiceWindow[] = [];
    try { windows = JSON.parse(label.dataset.serviceWindows ?? '[]'); } catch { /* preserve the rendered label */ }
    windows.sort((a, b) => a.open.localeCompare(b.open));
    const minuteOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const chosen = windows.find(window => minuteOf(window.open) <= local.minute && local.minute < minuteOf(window.close))
      ?? windows.find(window => minuteOf(window.open) > local.minute);
    service = chosen?.service ?? 'closed';
    if (chosen) time = `${chosen.open}–${chosen.close}`;
    const changed = label.dataset.service !== service;
    label.dataset.service = service;
    if (name) {
      name.textContent = translated(service);
      if (service === 'closed') name.dataset.i18n = 'closed';
      else name.dataset.i18n = service;
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
    if (changed) document.dispatchEvent(new Event('campuseats:service-filter-changed'));
  });
}

refresh();
window.setTimeout(() => document.dispatchEvent(new Event('campuseats:service-filter-changed')), 0);
window.setInterval(refresh, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
document.addEventListener('languagechange', refresh);
// Dev mode can simulate the time; the service line follows it like the open/closed status does.
document.addEventListener(CLOCK_EVENT, refresh);
