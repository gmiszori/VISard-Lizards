import { matchesQuery } from '../search/fold';
import { isPriceTier, readPreferences, PREFERENCES_KEY, type Preferences } from '../preferences/state';
let preferences: Preferences;
try { preferences = readPreferences(); } catch { preferences = { vegan: true, vegetarian: true, meat: true, compact: false, openOnly: false, locations: ['zentrum', 'hoenggerberg', 'irchel'], priceTier: 'student', devMode: false }; }

function applyPreferences() {
  document.documentElement.dataset.density = preferences.compact ? 'compact' : 'standard';
  document.documentElement.dataset.devMode = String(preferences.devMode);
  document.querySelectorAll<HTMLElement>('[data-meal-price]').forEach(price => {
    const amount = price.querySelector<HTMLElement>('[data-price-amount]');
    const label = price.querySelector<HTMLElement>('[data-price-label]');
    const value = price.getAttribute(`data-price-${preferences.priceTier}`) ?? '–';
    if (amount) amount.textContent = `CHF ${value}`;
    if (label) {
      label.dataset.i18n = preferences.priceTier;
      const labels = document.documentElement.lang === 'de'
        ? { student: 'Studierende', worker: 'Mitarbeitende', external: 'Externe' }
        : { student: 'Student', worker: 'Worker', external: 'External' };
      label.textContent = labels[preferences.priceTier];
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

  const query = document.querySelector<HTMLInputElement>('#search-input')?.value ?? '';
  const campusChoice = document.querySelector<HTMLSelectElement>('#campus-select')?.value ?? 'preset';
  let visibleCanteens = 0;
  document.querySelectorAll<HTMLElement>('[data-canteen-card]').forEach((card) => {
    // "preset" = the campuses chosen in settings; the selector can override that for this visit only.
    const matchesCampus = campusChoice === 'all' ? true
      : campusChoice === 'preset' ? preferences.locations.includes(card.dataset.campusId ?? '')
      : card.dataset.campusId === campusChoice;
    const matchesOpen = !preferences.openOnly || card.dataset.isOpen === 'true';
    // Umlauts are optional: "zurich", "zuerich" and "Zürich" all find the same dishes.
    const matchesSearch = matchesQuery(`${card.dataset.name ?? ''} ${card.dataset.menu ?? ''}`, query);
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
document.querySelector<HTMLSelectElement>('#campus-select')?.addEventListener('change', applyPreferences);
// "Show all canteens" in the empty state: clears the search and looks at every campus for this visit. Settings stay as they are.
document.querySelector<HTMLElement>('[data-reset-filters]')?.addEventListener('click', () => {
  const search = document.querySelector<HTMLInputElement>('#search-input');
  const campus = document.querySelector<HTMLSelectElement>('#campus-select');
  if (search) search.value = '';
  if (campus) campus.value = 'all';
  applyPreferences();
  search?.focus();
});
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
