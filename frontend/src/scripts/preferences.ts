import { matchesQuery } from '../search/fold';
import { isPriceTier, readPreferences, PREFERENCES_KEY, type Preferences } from '../preferences/state';
let preferences: Preferences;
try { preferences = readPreferences(); } catch { preferences = { vegan: true, vegetarian: true, meat: true, compact: false, openOnly: false, locations: ['zentrum', 'hoenggerberg', 'irchel'], priceTier: 'student', devMode: false }; }
let showWithoutMenu = false;

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

  const query = document.querySelector<HTMLInputElement>('#search-input')?.value ?? '';
  document.querySelectorAll<HTMLElement>('[data-diet]').forEach((meal) => {
    const diet = meal.dataset.diet as keyof Pick<Preferences, 'vegan' | 'vegetarian' | 'meat'>;
    const card = meal.closest<HTMLElement>('[data-canteen-card]');
    const matchesName = card && matchesQuery(card.dataset.name ?? '', query);
    meal.hidden = !preferences[diet] || !!(card && !matchesName && !matchesQuery(meal.dataset.mealName ?? '', query));
  });

  document.querySelectorAll<HTMLElement>('[data-meal-group]').forEach(group => {
    group.hidden = group.querySelector('[data-meal-row]:not([hidden])') === null;
  });

  document.querySelectorAll<HTMLElement>('[data-canteen-card]').forEach(card => {
    const dishSearch = query.trim() !== '' && !matchesQuery(card.dataset.name ?? '', query);
    const rows = [...card.querySelectorAll<HTMLElement>('[data-meal-row]:not([hidden])')];
    rows.forEach((row, index) => row.classList.toggle('preview-clipped', !dishSearch && index >= 2));
    card.querySelectorAll<HTMLElement>('[data-meal-group]').forEach(group => {
      group.classList.toggle('preview-empty', !group.querySelector('[data-meal-row]:not([hidden]):not(.preview-clipped)'));
    });
    const fullMenu = card.querySelector<HTMLAnchorElement>('[data-preview-link]');
    if (fullMenu) {
      fullMenu.hidden = dishSearch || rows.length <= 2;
      const lang = document.documentElement.lang;
      fullMenu.textContent = lang === 'de' ? `Alle ${rows.length} Gerichte ansehen` : `View all ${rows.length} dishes`;
    }
  });

  document.querySelectorAll<HTMLElement>('[data-preference-list]').forEach((list) => {
    const hasVisibleMeals = list.querySelectorAll<HTMLElement>('[data-diet]:not([hidden])').length > 0;
    let emptyMessage = list.querySelector<HTMLElement>('[data-no-preference-meals]');
    if (!emptyMessage && list.nextElementSibling?.matches('[data-no-preference-meals]')) {
      emptyMessage = list.nextElementSibling as HTMLElement;
    }
    if (emptyMessage) emptyMessage.hidden = hasVisibleMeals;
  });

  const campusChoice = document.querySelector<HTMLSelectElement>('#campus-select')?.value ?? 'preset';
  const candidates = [...document.querySelectorAll<HTMLElement>('[data-canteen-card]')].map((card) => {
    // "preset" = the campuses chosen in settings; the selector can override that for this visit only.
    const matchesCampus = campusChoice === 'all' ? true
      : campusChoice === 'preset' ? preferences.locations.includes(card.dataset.campusId ?? '')
      : card.dataset.campusId === campusChoice;
    const matchesOpen = !preferences.openOnly || card.dataset.isOpen === 'true';
    // Umlauts are optional: "zurich", "zuerich" and "Zürich" all find the same dishes.
    const matchesSearch = matchesQuery(card.dataset.name ?? '', query) || card.querySelector('[data-meal-row]:not([hidden])') !== null;
    return { card, matches: matchesCampus && matchesOpen && matchesSearch, hasMenu: card.dataset.hasMenu === 'true' };
  });
  const withMenuCount = candidates.filter(candidate => candidate.matches && candidate.hasMenu).length;
  const withoutMenuCount = candidates.filter(candidate => candidate.matches && !candidate.hasMenu).length;
  const collapseWithoutMenu = !showWithoutMenu && !query.trim() && withMenuCount > 0;
  let visibleCanteens = 0;
  candidates.forEach(({ card, matches, hasMenu }) => {
    card.hidden = !matches || (!hasMenu && collapseWithoutMenu);
    if (!card.hidden) visibleCanteens++;
  });
  const noMenuToggle = document.querySelector<HTMLButtonElement>('#no-menu-toggle');
  if (noMenuToggle) {
    noMenuToggle.hidden = withoutMenuCount === 0 || withMenuCount === 0 || !!query.trim();
    noMenuToggle.setAttribute('aria-pressed', String(showWithoutMenu));
    const lang = document.documentElement.lang;
    noMenuToggle.textContent = lang === 'de'
      ? `${withoutMenuCount} ohne Menü ${showWithoutMenu ? 'ausblenden' : 'anzeigen'}`
      : `${showWithoutMenu ? 'Hide' : 'Show'} ${withoutMenuCount} without menus`;
  }

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
document.querySelector<HTMLButtonElement>('#no-menu-toggle')?.addEventListener('click', () => {
  showWithoutMenu = !showWithoutMenu;
  applyPreferences();
});
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
