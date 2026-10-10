import { distanceMeters, formatDistance, walkingMinutes, type Point } from '../location/distance';

// "Near me": sorts the canteen cards by distance from the visitor. The position is read once in the
// browser, used for this page only and never stored or sent anywhere.
const button = document.querySelector<HTMLButtonElement>('#near-me');
const status = document.querySelector<HTMLElement>('#near-me-status');
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-canteen-card]')];
const lang = () => (document.documentElement.lang === 'de' ? 'de' : 'en');
const words = {
  en: { on: 'Nearest first', off: 'Near me', walk: (m: number) => `${m} min walk`, denied: 'Location is blocked. Allow it in your browser settings to sort by distance.', unavailable: 'Your position could not be found. Try again outdoors or check that location is on.', timeout: 'Finding your position took too long. Try again.', unsupported: 'This browser cannot share your location.', wait: 'Finding you…' },
  de: { on: 'Nächste zuerst', off: 'In meiner Nähe', walk: (m: number) => `${m} Min. zu Fuss`, denied: 'Der Standort ist blockiert. Erlaube ihn in den Browsereinstellungen, um nach Distanz zu sortieren.', unavailable: 'Dein Standort konnte nicht ermittelt werden. Versuche es draussen oder prüfe, ob der Standort aktiv ist.', timeout: 'Die Standortsuche hat zu lange gedauert. Versuche es erneut.', unsupported: 'Dieser Browser kann deinen Standort nicht teilen.', wait: 'Standort wird gesucht…' },
};
let position: Point | null = null;
let active = false;

function say(message: string) { if (status) { status.hidden = message === ''; status.textContent = message; } }

function render() {
  if (!button) return;
  const w = words[lang()];
  button.setAttribute('aria-pressed', String(active));
  button.querySelector('[data-near-label]')!.textContent = active ? w.on : w.off;
  cards().forEach((card) => {
    const badge = card.querySelector<HTMLElement>('[data-distance]');
    const lat = Number.parseFloat(card.dataset.lat ?? '');
    const lng = Number.parseFloat(card.dataset.lng ?? '');
    const meters = active && position ? distanceMeters(position, { lat, lng }) : NaN;
    card.dataset.distanceM = Number.isNaN(meters) ? '' : String(Math.round(meters));
    if (badge) {
      const minutes = walkingMinutes(meters);
      badge.hidden = Number.isNaN(meters);
      badge.textContent = Number.isNaN(meters) ? '' : ` · ${formatDistance(meters)}${minutes === null ? '' : ` · ${w.walk(minutes)}`}`;
    }
  });
  // CSS `order` on the grid items; cards without coordinates (and everything when switched off) keep their place.
  const ranked = cards().filter(card => card.dataset.distanceM).sort((a, b) => Number(a.dataset.distanceM) - Number(b.dataset.distanceM));
  cards().forEach(card => { card.style.order = ''; });
  if (active) ranked.forEach((card, index) => { card.style.order = String(index - ranked.length); });
}

function locate() {
  const w = words[lang()];
  if (!('geolocation' in navigator)) { say(w.unsupported); return; }
  say(w.wait);
  button!.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (result) => {
      position = { lat: result.coords.latitude, lng: result.coords.longitude };
      active = true; say(''); button!.disabled = false; render();
    },
    (error) => {
      button!.disabled = false;
      say(error.code === error.PERMISSION_DENIED ? w.denied : error.code === error.TIMEOUT ? w.timeout : w.unavailable);
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
  );
}

button?.addEventListener('click', () => {
  if (active) { active = false; say(''); render(); } else locate();
});
document.addEventListener('languagechange', render);
// Favourite cards move between two grids; the order must survive that.
document.addEventListener('campuseats:canteen-favourites-changed', () => { if (active) render(); });
render();
