import { pickPrice, type PriceTier } from '../data/priceDisplay';
import { isPriceTier, readPreferences, PREFERENCES_KEY, type Preferences } from '../preferences/state';
let preferences: Preferences;
try { preferences = readPreferences(); } catch { preferences = { vegan: true, vegetarian: true, meat: true, compact: false, openOnly: false, locations: ['zentrum', 'hoenggerberg', 'irchel'], priceTier: 'student' }; }

function applyPreferences() {
  document.documentElement.dataset.density = preferences.compact ? 'compact' : 'standard';
  document.querySelectorAll<HTMLElement>('[data-meal-price]').forEach(price => {
    const amount = price.querySelector<HTMLElement>('[data-price-amount]');
    const label = price.querySelector<HTMLElement>('[data-price-label]');
    // The chosen tier, or another tier's price (labelled as such) when the source publishes none for it.
    const read = (tier: PriceTier) => { const n = Number.parseFloat(price.getAttribute(`data-price-${tier}`) ?? ''); return Number.isFinite(n) ? n : null; };
    const shown = pickPrice({ student: read('student'), worker: read('worker'), external: read('external') }, preferences.priceTier);
    if (amount) amount.textContent = shown.tier ? `CHF ${shown.value!.toFixed(2)}` : '–';
    if (label) {
      const de = document.documentElement.lang === 'de';
      const labels = de
        ? { student: 'Studierende', worker: 'Mitarbeitende', external: 'Externe' }
        : { student: 'Student', worker: 'Worker', external: 'External' };
      label.dataset.i18n = shown.tier ?? 'priceUnavailable';
      label.textContent = shown.tier ? labels[shown.tier] : (de ? 'Preis nicht veröffentlicht' : 'Price not published');
    }
  });
  document.querySelectorAll<HTMLSelectElement>('[data-price-tier]').forEach(select => select.value = preferences.priceTier);

  document.querySelectorAll<HTMLElement>('[data-diet]').forEach((meal) => {
    const diet = meal.dataset.diet as keyof Pick<Preferences, 'vegan' | 'vegetarian' | 'meat'>;
    meal.hidden = !preferences[diet];
  });

  document.querySelectorAll<HTMLElement>('[data-preference-list]').forEach((list) => {
    const hasVisibleMeals = list.querySelectorAll<HTMLElement>('[data-diet]:not([hidden])').length > 0;
    let emptyMessage = list.querySelector<HTMLElement>('[data-no-preference-meals]');
    if (!emptyMessage && list.nextElementSibling?.matches('[data-no-preference-meals]')) {
      emptyMessage = list.nextElementSibling as HTMLElement;
    }
    if (emptyMessage) emptyMessage.hidden = hasVisibleMeals;
  });

  const query = document.querySelector<HTMLInputElement>('#search-input')?.value.trim().normalize('NFKC').toLocaleLowerCase() ?? '';
  let visibleCanteens = 0;
  document.querySelectorAll<HTMLElement>('[data-canteen-card]').forEach((card) => {
    const matchesCampus = preferences.locations.includes(card.dataset.campusId ?? '');
    const matchesOpen = !preferences.openOnly || card.dataset.isOpen === 'true';
    const searchText = `${card.dataset.name ?? ''} ${card.dataset.menu ?? ''}`.normalize('NFKC').toLocaleLowerCase();
    const matchesSearch = searchText.includes(query);
    card.hidden = !(matchesCampus && matchesOpen && matchesSearch);
    if (!card.hidden) visibleCanteens++;
  });

  const favouritesSection = document.querySelector<HTMLElement>('#favourites-section');
  const visibleFavourites = document.querySelectorAll<HTMLElement>('#favourites-grid [data-canteen-card]:not([hidden])').length;
  if (favouritesSection) favouritesSection.hidden = visibleFavourites === 0;
  const emptyState = document.querySelector<HTMLElement>('#empty-state');
  if (emptyState) emptyState.style.display = visibleCanteens === 0 ? 'block' : 'none';
  const visibleCount = document.querySelector<HTMLElement>('#visible-count');
  if (visibleCount) {
    const lang = document.documentElement.lang;
    visibleCount.textContent = `${visibleCanteens} ${lang === 'de' ? (visibleCanteens === 1 ? 'Mensa' : 'Mensen') : (visibleCanteens === 1 ? 'canteen' : 'canteens')}`;
  }

  document.querySelectorAll<HTMLInputElement>('#preferences-form input[type="checkbox"]').forEach((input) => {
    input.checked = input.name === 'locations'
      ? preferences.locations.includes(input.value)
      : preferences[input.name as keyof Omit<Preferences, 'locations'>] as boolean;
  });
  document.dispatchEvent(new Event('campuseats:preferences-applied'));
}

document.querySelector<HTMLFormElement>('#preferences-form')?.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement | HTMLSelectElement;
  if (input instanceof HTMLSelectElement && input.name === 'priceTier' && isPriceTier(input.value)) {
    preferences = { ...preferences, priceTier: input.value };
  } else if (input instanceof HTMLInputElement && input.type === 'checkbox' && input.name in preferences) {
    if (input.name === 'locations') {
      const locations = new Set(preferences.locations);
      if (input.checked) locations.add(input.value);
      else locations.delete(input.value);
      preferences = { ...preferences, locations: [...locations] };
    } else {
      preferences = { ...preferences, [input.name]: input.checked };
    }
  } else return;
  applyPreferences();
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); showSavedState(); }
  catch { showSavedState(false); }
});

document.querySelector<HTMLInputElement>('#search-input')?.addEventListener('input', applyPreferences);
document.addEventListener('languagechange', applyPreferences);

function showSavedState(success = true) {
  const saved = document.querySelector<HTMLElement>('#settings-saved');
  if (!saved) return;
  saved.hidden = false;
  saved.textContent = success ? (document.documentElement.lang === 'de' ? 'Gespeichert' : 'Saved') :
    (document.documentElement.lang === 'de' ? 'Nur für diese Seite angewendet. Speichern nicht möglich.' : 'Applied for this page only. Could not save on this device.');
  // Prevent a subsequent language switch from falsely announcing "Saved".
  if (success) saved.dataset.i18n = 'settingsSaved'; else delete saved.dataset.i18n;
}

window.addEventListener('storage', event => {
  if (event.key === PREFERENCES_KEY || event.key === 'campuseats-profile' || event.key === null) {
    try { preferences = readPreferences(); applyPreferences(); } catch { /* Keep the current working preferences. */ }
  }
});

applyPreferences();
