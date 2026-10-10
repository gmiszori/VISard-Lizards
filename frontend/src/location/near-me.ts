/**
 * "Sort by distance" on the home page: locates the user, sorts the canteen cards nearest first, shows
 * the distance on each card and records mensa visits (visits.ts). The choice is remembered; when the
 * browser already granted location access, the next visit sorts again without asking.
 */
import { formatDistance } from './distance.ts';
import { locateUserNow, LocationUnavailableError, type LocationError } from './geolocation.ts';
import type { MensaPlace, UserLocation } from './locate.ts';
import { recordVisits, visitsAt, type MensaHours } from './visits.ts';

export const NEAR_ME_KEY = 'campuseats-near-me';

interface NearMeData { places: MensaPlace[]; hours: MensaHours[]; campusNames: Record<string, string> }

const TEXT = {
  en: {
    label: 'Sort by distance',
    locating: 'Finding your location…',
    at: (mensa: string, campus: string) => `You are at ${mensa} (${campus}). Canteens sorted by distance.`,
    campus: (campus: string, mensa: string, distance: string) => `You are on campus ${campus}. Nearest: ${mensa}, ${distance}.`,
    away: (mensa: string, distance: string) => `Nearest canteen: ${mensa}, ${distance}.`,
    errors: {
      denied: 'Location access is blocked. Allow it in your browser’s site settings to sort by distance.',
      unsupported: 'This browser cannot share your location.',
      unavailable: 'Your location is not available right now.',
      timeout: 'Finding your location took too long. Try again.',
    } satisfies Record<LocationError, string>,
  },
  de: {
    label: 'Nach Entfernung sortieren',
    locating: 'Standort wird ermittelt…',
    at: (mensa: string, campus: string) => `Du bist in ${mensa} (${campus}). Mensen nach Entfernung sortiert.`,
    campus: (campus: string, mensa: string, distance: string) => `Du bist auf dem Campus ${campus}. Am nächsten: ${mensa}, ${distance}.`,
    away: (mensa: string, distance: string) => `Nächste Mensa: ${mensa}, ${distance}.`,
    errors: {
      denied: 'Der Standortzugriff ist blockiert. Erlaube ihn in den Website-Einstellungen des Browsers.',
      unsupported: 'Dieser Browser kann deinen Standort nicht teilen.',
      unavailable: 'Dein Standort ist gerade nicht verfügbar.',
      timeout: 'Die Standortsuche hat zu lange gedauert. Versuch es nochmal.',
    } satisfies Record<LocationError, string>,
  },
};
const lang = () => (document.documentElement.lang === 'de' ? 'de' : 'en');
const text = () => TEXT[lang()];

function readPreference(): boolean {
  try { return localStorage.getItem(NEAR_ME_KEY) === '1'; } catch { return false; }
}
function writePreference(on: boolean) {
  try { if (on) localStorage.setItem(NEAR_ME_KEY, '1'); else localStorage.removeItem(NEAR_ME_KEY); } catch { /* not stored */ }
}

export function mountNearMe(): void {
  const root = document.querySelector<HTMLElement>('[data-near-me]');
  const source = document.querySelector('[data-near-me-data]');
  if (!root || !source) return;
  const data = JSON.parse(source.textContent ?? '{}') as NearMeData;
  const button = root.querySelector<HTMLButtonElement>('[data-near-me-toggle]')!;
  const status = root.querySelector<HTMLElement>('[data-near-me-status]')!;
  const cards = [...document.querySelectorAll<HTMLElement>('[data-canteen-card]')];
  const originalOrder = new Map(cards.map((card, index) => [card, index]));
  let location: UserLocation | null = null;
  let message: (() => string) | null = null;
  let requestId = 0;

  function show(next: (() => string) | null) {
    message = next;
    status.textContent = next ? next() : '';
    status.hidden = !next;
  }
  /** Like scripts/meal-stars.ts: canteens without meals stay last; distance replaces the page order. */
  function sortByDistance() {
    const noMeals = (card: HTMLElement) => Number(card.dataset.mealsAvailable === 'false');
    for (const grid of document.querySelectorAll<HTMLElement>('#canteen-grid, #favourites-grid')) {
      [...grid.querySelectorAll<HTMLElement>(':scope > [data-canteen-card]')]
        .sort((a, b) => noMeals(a) - noMeals(b) || distanceOf(a) - distanceOf(b))
        .forEach(card => grid.append(card));
    }
  }
  /** Other handlers (meal-stars.ts) re-sort the cards on these events; sort after them. */
  const resortLater = () => queueMicrotask(() => { if (location) sortByDistance(); });
  function distanceOf(card: HTMLElement): number {
    return location?.nearby.find(m => m.id === card.dataset.canteenId)?.distanceM ?? Number.POSITIVE_INFINITY;
  }
  function render() {
    for (const card of cards) {
      card.querySelector('[data-distance-chip]')?.remove();
      const distance = distanceOf(card);
      if (!location || !Number.isFinite(distance)) continue;
      const chip = document.createElement('span');
      chip.className = 'distance-chip';
      chip.dataset.distanceChip = '';
      chip.textContent = formatDistance(distance, lang());
      card.querySelector('.canteen-photo-title')?.append(chip);
    }
    if (location) sortByDistance();
    button.setAttribute('aria-pressed', String(Boolean(location)));
    button.querySelector('[data-near-me-label]')!.textContent = text().label;
  }
  function describe(found: UserLocation): () => string {
    const campusName = (id: string) => data.campusNames[id] ?? id;
    const nearest = found.nearby[0];
    const here = found.nearby.find(m => m.id === found.atMensaIds[0]);
    if (here) return () => text().at(found.atMensaIds.map(id => found.nearby.find(m => m.id === id)!.name).join(' / '), campusName(here.campus));
    if (found.campus && nearest) return () => text().campus(campusName(found.campus!), nearest.name, formatDistance(nearest.distanceM, lang()));
    return () => (nearest ? text().away(nearest.name, formatDistance(nearest.distanceM, lang())) : '');
  }
  function captureVisit(found: UserLocation) {
    const now = new Date();
    recordVisits(visitsAt(found.atMensaIds, data.hours, now), now);
    document.dispatchEvent(new CustomEvent('campuseats:user-located', { detail: found }));
  }
  async function locate() {
    const id = ++requestId;
    button.disabled = true;
    show(() => text().locating);
    try {
      const found = await locateUserNow(data.places);
      if (id !== requestId) return;
      location = found;
      writePreference(true);
      captureVisit(found);
      show(describe(found));
    } catch (error) {
      if (id !== requestId) return;
      location = null;
      const reason = error instanceof LocationUnavailableError ? error.reason : 'unavailable';
      if (reason === 'denied') writePreference(false);
      show(() => text().errors[reason]);
    } finally {
      if (id === requestId) { button.disabled = false; render(); }
    }
  }
  function turnOff() {
    requestId++;
    location = null;
    writePreference(false);
    show(null);
    render();
    // Back to the page's own order: restore the markup order, then let meal-stars.ts rank it again.
    for (const card of [...cards].sort((a, b) => (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0))) card.parentElement?.append(card);
    document.dispatchEvent(new Event('campuseats:canteen-favourites-changed'));
  }

  button.addEventListener('click', () => (location ? turnOff() : locate()));
  // The home page re-appends cards when favourites or preferences change; keep the distance order.
  document.addEventListener('campuseats:canteen-favourites-changed', resortLater);
  document.addEventListener('campuseats:preferences-applied', resortLater);
  document.addEventListener('languagechange', () => { if (message) status.textContent = message(); render(); resortLater(); });

  render();
  // A granted permission can capture a meal visit without enabling distance sorting.
  if (navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' })
      .then(permission => {
        if (permission.state !== 'granted') return;
        if (readPreference()) { void locate(); return; }
        const id = requestId;
        void locateUserNow(data.places)
          .then(found => { if (id === requestId) captureVisit(found); })
          .catch(() => { /* A passive location check never interrupts the page. */ });
      })
      .catch(() => { /* Permissions API not available for geolocation */ });
  }
}
