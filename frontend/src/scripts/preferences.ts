import { createSearch } from '../search/dishSearch';
import { ALL_CAMPUS_IDS, isPriceTier, isViewMode, readPreferences, PREFERENCES_KEY, type Preferences } from '../preferences/state';
import { canShowCanteen } from '../preferences/canteenVisibility';
let preferences: Preferences;
try {
  preferences = readPreferences();
} catch { preferences = { vegan: true, vegetarian: true, meat: true, viewMode: 'standard', openOnly: false, distanceDefault: false, locations: [...ALL_CAMPUS_IDS], priceTier: 'student', devMode: false }; }
let showWithoutMenu = false;
/** "Show all canteens" in the empty state also looks past "Only show open canteens" for this visit (Settings stay as they are). */
let ignoreOpenOnly = false;

/** Why the list is empty, so the message names the real cause instead of always blaming the search. */
const EMPTY_MESSAGES = {
  en: {
    search: 'No matching canteens or dishes. Try another search or adjust your filters.',
    closed: 'No canteen is open right now, and “Only show open canteens” is on in Settings.',
    campus: 'No campus is selected in Settings.',
    other: 'No canteens to show here. Try another campus.',
  },
  de: {
    search: 'Keine passenden Mensen oder Gerichte. Suche anders oder passe die Filter an.',
    closed: 'Gerade ist keine Mensa geöffnet, und in den Einstellungen ist «Nur geöffnete Mensen anzeigen» aktiv.',
    campus: 'In den Einstellungen ist kein Campus ausgewählt.',
    other: 'Hier gibt es keine Mensen zu zeigen. Probiere einen anderen Campus.',
  },
} as const;

/**
 * The meal service a card shows: the Lunch / Dinner pick of the day picker (unset = both services), except that
 * a live service line saying "Closed" hides the dishes whatever was picked (components/ServiceLabel.astro).
 */
function cardService(card: Element | null | undefined, picked: string | undefined): string | undefined {
  const live = card?.querySelector<HTMLElement>('[data-service-label][data-service-live="true"]')?.dataset.service;
  return live === 'closed' ? 'closed' : picked || undefined;
}

/** What a dish row is searched on: its canteen's name (so "polyterrasse pizza" works) and its own search text. */
const searchTextOf = (row: HTMLElement, card: HTMLElement) => `${card.dataset.name ?? ''} ${row.dataset.search ?? row.dataset.mealName ?? ''}`;

function applyPreferences() {
  document.documentElement.dataset.density = preferences.viewMode;
  document.documentElement.dataset.devMode = String(preferences.devMode);
  document.querySelectorAll<HTMLElement>('[data-meal-price]').forEach(price => {
    const amount = price.querySelector<HTMLElement>('[data-price-amount]');
    const value = price.getAttribute(`data-price-${preferences.priceTier}`) ?? '–';
    const row = price.closest<HTMLElement>('[data-meal-row]');
    if (row) row.dataset.mealPriceMissing = String(value === '–');
    if (amount) amount.textContent = value === '–'
      ? document.documentElement.lang === 'de' ? 'Preis nicht verfügbar' : 'Price unavailable'
      : `CHF ${value}`;
    const unit = price.querySelector<HTMLElement>('[data-price-unit]');
    if (unit) unit.hidden = value === '–';
  });
  const categoryLabels = document.documentElement.lang === 'de'
    ? { student: 'Preise für Studierende', worker: 'Preise für Mitarbeitende', external: 'Preise für Externe' }
    : { student: 'Student prices', worker: 'Staff prices', external: 'External prices' };
  document.querySelectorAll<HTMLElement>('[data-price-category]').forEach(label => {
    label.textContent = categoryLabels[preferences.priceTier];
  });
  document.querySelectorAll<HTMLSelectElement>('[data-price-tier]').forEach(select => select.value = preferences.priceTier);

  // Sort before clipping overview previews, so their first dishes have published prices.
  document.querySelectorAll<HTMLElement>('[data-meal-list], [data-meal-group]').forEach(list => {
    const rows = [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches('[data-meal-row]'));
    const after = rows.length ? rows[rows.length - 1]!.nextElementSibling : null;
    rows.sort((a, b) => Number(a.dataset.mealPriceMissing === 'true') - Number(b.dataset.mealPriceMissing === 'true'))
      .forEach(row => list.insertBefore(row, after));
  });

  const query = document.querySelector<HTMLInputElement>('#search-input')?.value ?? '';
  const search = createSearch(query);
  // Lunch / dinner choice of the day picker (components/DayPicker.astro); unset shows both.
  const service = document.documentElement.dataset.serviceFilter;
  document.querySelectorAll<HTMLElement>('[data-diet]').forEach((meal) => {
    const diet = meal.dataset.diet as keyof Pick<Preferences, 'vegan' | 'vegetarian' | 'meat'>;
    const card = meal.closest<HTMLElement>('[data-canteen-card]');
    const effectiveService = cardService(card, service);
    const groupService = meal.closest<HTMLElement>('[data-meal-group]')?.dataset.service;
    const otherService = effectiveService === 'closed' || (!!effectiveService && !!groupService && !groupService.split(' ').includes(effectiveService));
    meal.hidden = !preferences[diet] || otherService || !!(card && !search.test(searchTextOf(meal, card), meal.dataset.diet));
  });

  document.querySelectorAll<HTMLElement>('[data-meal-group]').forEach(group => {
    group.hidden = group.querySelector('[data-meal-row]:not([hidden])') === null;
  });

  document.querySelectorAll<HTMLElement>('[data-canteen-card]').forEach(card => {
    const dishSearch = search.active && !search.test(card.dataset.name ?? '');
    const rows = [...card.querySelectorAll<HTMLElement>('[data-meal-row]:not([hidden])')];
    rows.forEach((row, index) => row.classList.toggle('preview-clipped', preferences.viewMode !== 'list' && !dishSearch && index >= 2));
    card.querySelectorAll<HTMLElement>('[data-meal-group]').forEach(group => {
      group.classList.toggle('preview-empty', !group.querySelector('[data-meal-row]:not([hidden]):not(.preview-clipped)'));
    });
    const fullMenu = card.querySelector<HTMLAnchorElement>('[data-preview-link]');
    if (fullMenu) {
      fullMenu.hidden = preferences.viewMode === 'list' || dishSearch || rows.length <= 2;
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
    if (emptyMessage) {
      const card = list.closest<HTMLElement>('[data-canteen-card]');
      const effectiveService = cardService(card, service);
      const hasDishForService = effectiveService === 'closed' ? false
        : !effectiveService || list.querySelector(`[data-meal-group][data-service~="${effectiveService}"], [data-meal-group]:not([data-service])`) !== null;
      const hasAnyDish = list.querySelector('[data-meal-row]') !== null;
      const key = !hasAnyDish || !hasDishForService ? 'noDishesAvailable' : 'noPreferenceMeals';
      emptyMessage.dataset.i18n = key;
      const german = document.documentElement.lang === 'de';
      emptyMessage.textContent = key === 'noDishesAvailable'
        ? german ? 'Keine Gerichte verfügbar' : 'No dishes available'
        : german ? 'Keine Gerichte entsprechen deinen Essenspräferenzen.' : 'No dishes match your food preferences.';
      emptyMessage.hidden = hasVisibleMeals;
    }
  });

  const campusChoice = document.querySelector<HTMLSelectElement>('#campus-select')?.value ?? 'preset';
  const candidates = [...document.querySelectorAll<HTMLElement>('[data-canteen-card]')].map((card) => {
    // "preset" = the campuses chosen in settings; the selector can override that for this visit only.
    const matchesCampus = campusChoice === 'all' ? true
      : campusChoice === 'preset' ? preferences.locations.includes(card.dataset.campusId ?? '')
        : card.dataset.campusId === campusChoice;
    const matchesOpen = !preferences.openOnly || ignoreOpenOnly || card.dataset.isOpen === 'true';
    const matchesSearch = search.test(card.dataset.name ?? '') || card.querySelector('[data-meal-row]:not([hidden])') !== null;
    // With lunch or dinner picked, a canteen without that service counts as having no menu.
    const effectiveService = cardService(card, service);
    const servesChoice = !effectiveService || (effectiveService !== 'closed' && card.querySelector(`[data-meal-group][data-service~="${effectiveService}"], [data-meal-group]:not([data-service])`) !== null);
    const hasMenu = preferences.viewMode === 'list'
      ? card.querySelector('[data-meal-row]:not([hidden])') !== null
      : card.dataset.hasMenu === 'true' && servesChoice;
    return { card, matches: canShowCanteen(card.dataset.canteenId ?? '', preferences.priceTier) && matchesCampus && matchesOpen && matchesSearch, hasMenu };
  });
  const withMenuCount = candidates.filter(candidate => candidate.matches && candidate.hasMenu).length;
  const withoutMenuCount = candidates.filter(candidate => candidate.matches && !candidate.hasMenu).length;
  const collapseWithoutMenu = preferences.viewMode === 'list' || (!showWithoutMenu && !query.trim() && withMenuCount > 0);
  let visibleCanteens = 0;
  candidates.forEach(({ card, matches, hasMenu }) => {
    card.hidden = !matches || (!hasMenu && collapseWithoutMenu);
    if (!card.hidden) visibleCanteens++;
  });
  const noMenuToggle = document.querySelector<HTMLButtonElement>('#no-menu-toggle');
  if (noMenuToggle) {
    noMenuToggle.hidden = preferences.viewMode === 'list' || withoutMenuCount === 0 || withMenuCount === 0 || !!query.trim();
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
  const emptyMessage = document.querySelector<HTMLElement>('#empty-message');
  if (emptyMessage && visibleCanteens === 0) {
    const reason = query.trim() ? 'search'
      : preferences.openOnly && !ignoreOpenOnly && candidates.some(c => c.card.dataset.isOpen !== 'true') ? 'closed'
        : campusChoice === 'preset' && preferences.locations.length === 0 ? 'campus' : 'other';
    emptyMessage.textContent = EMPTY_MESSAGES[document.documentElement.lang === 'de' ? 'de' : 'en'][reason];
  }
  const visibleCount = document.querySelector<HTMLElement>('#visible-count');
  if (visibleCount) {
    const lang = document.documentElement.lang;
    const canteenLabel = lang === 'de' ? (visibleCanteens === 1 ? 'Mensa' : 'Mensen') : (visibleCanteens === 1 ? 'canteen' : 'canteens');
    const visibleDishes = candidates.filter(({ card }) => !card.hidden)
      .reduce((count, { card }) => count + card.querySelectorAll('[data-meal-row]:not([hidden])').length, 0);
    const dishLabel = lang === 'de' ? (visibleDishes === 1 ? 'Gericht' : 'Gerichte') : (visibleDishes === 1 ? 'dish' : 'dishes');
    visibleCount.textContent = preferences.viewMode === 'list'
      ? `${visibleDishes} ${dishLabel} · ${visibleCanteens} ${canteenLabel}`
      : `${visibleCanteens} ${canteenLabel}`;
  }
  const openCount = document.querySelector<HTMLElement>('[data-live="open-count"]');
  if (openCount) {
    const count = candidates.filter(({ card }) => canShowCanteen(card.dataset.canteenId ?? '', preferences.priceTier) && card.dataset.isOpen === 'true').length;
    openCount.textContent = String(count);
    if (openCount.parentElement) openCount.parentElement.hidden = count === 0;
  }

  document.querySelectorAll<HTMLInputElement>('#preferences-form input[type="checkbox"]:not([data-profile-hard])').forEach((input) => {
    input.checked = input.name === 'locations'
      ? preferences.locations.includes(input.value)
      : preferences[input.name as keyof Omit<Preferences, 'locations'>] as boolean;
  });
  document.querySelectorAll<HTMLInputElement>('#preferences-form input[name="viewMode"]').forEach((input) => {
    input.checked = input.value === preferences.viewMode;
  });
  document.dispatchEvent(new Event('campuseats:preferences-applied'));
}

document.querySelector<HTMLFormElement>('#preferences-form')?.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement | HTMLSelectElement;
  if (input instanceof HTMLSelectElement && input.name === 'priceTier' && isPriceTier(input.value)) {
    preferences = { ...preferences, priceTier: input.value };
  } else if (input instanceof HTMLInputElement && input.type === 'radio' && input.name === 'viewMode' && isViewMode(input.value)) {
    preferences = { ...preferences, viewMode: input.value };
  } else if (input instanceof HTMLInputElement && input.type === 'checkbox' && input.name in preferences) {
    if (input.name === 'locations') {
      const locations = new Set(preferences.locations);
      if (input.checked) locations.add(input.value);
      else locations.delete(input.value);
      preferences = { ...preferences, locations: [...locations] };
    } else {
      // Keep at least one food category on: with none, every canteen would only say "No dishes match".
      const diets = ['vegan', 'vegetarian', 'meat'] as const;
      if (!input.checked && (diets as readonly string[]).includes(input.name) && diets.every(key => key === input.name || !preferences[key])) {
        input.checked = true;
        showSettingsNote('Keep at least one food category on, otherwise there would be nothing to show.', 'Mindestens eine Essensart muss aktiv bleiben, sonst gäbe es nichts anzuzeigen.');
        return;
      }
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
  ignoreOpenOnly = true;
  applyPreferences();
  // The button disappears with the empty state: move focus to the result count (right above the list), not to the far-away search box.
  const count = document.querySelector<HTMLElement>('#visible-count');
  if (count) { count.tabIndex = -1; count.focus(); }
});
document.addEventListener('languagechange', applyPreferences);
document.addEventListener('campuseats:service-filter-changed', applyPreferences);

function showSettingsNote(en: string, de: string) {
  const note = document.querySelector<HTMLElement>('#settings-saved');
  if (!note) return;
  note.hidden = false;
  delete note.dataset.i18n; // a language switch must not turn this note back into "Saved"
  note.textContent = document.documentElement.lang === 'de' ? de : en;
}

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
// The settings are applied: show what was kept invisible meanwhile (see the style in layouts/BaseLayout.astro).
document.documentElement.setAttribute('data-ui-ready', '');
// Browser Back/Forward: the browser puts the search text and the campus choice back into their fields (or brings the
// whole page back from its cache) without firing any input event, so the list kept showing the unfiltered result.
// pageshow comes after that restoring, on a fresh load, on Back and on a page restored from the cache.
window.addEventListener('pageshow', () => {
  try { preferences = readPreferences(); } catch { /* Keep the current working preferences. */ }
  applyPreferences();
});
