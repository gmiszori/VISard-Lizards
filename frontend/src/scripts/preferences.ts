import { matchesQuery } from '../search/fold';
import { ALL_CAMPUS_IDS, isPriceTier, isViewMode, readPreferences, PREFERENCES_KEY, type Preferences } from '../preferences/state';
import { API_URL, apiPost } from '../data/api';
let aiMatchedIds: Set<string> | null = null;
let aiQuery = '';
let searchVersion = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function searchStatus(message: string) {
  const status = document.querySelector<HTMLElement>('#search-status');
  if (status) {
    status.textContent = message;
    status.hidden = !message;
  }
}
let preferences: Preferences;
try {
  preferences = readPreferences();
} catch { preferences = { vegan: true, vegetarian: true, meat: true, viewMode: 'standard', openOnly: false, locations: [...ALL_CAMPUS_IDS], priceTier: 'student', devMode: false }; }
let showWithoutMenu = false;
/** "Show all canteens" in the empty state also looks past "Only show open canteens" for this visit (Settings stay as they are). */
let ignoreOpenOnly = false;

/** Why the list is empty, so the message names the real cause instead of always blaming the search. */
const EMPTY_MESSAGES = {
  en: {
    search: 'No canteens match your search. Try another dish or campus.',
    closed: 'No canteen is open right now, and “Only show open canteens” is on in Settings.',
    campus: 'No campus is selected in Settings.',
    other: 'No canteens to show here. Try another campus.',
  },
  de: {
    search: 'Keine Mensen gefunden. Suche ein anderes Gericht oder einen anderen Campus.',
    closed: 'Gerade ist keine Mensa geöffnet, und in den Einstellungen ist «Nur geöffnete Mensen anzeigen» aktiv.',
    campus: 'In den Einstellungen ist kein Campus ausgewählt.',
    other: 'Hier gibt es keine Mensen zu zeigen. Probiere einen anderen Campus.',
  },
} as const;

function applyPreferences() {
  document.documentElement.dataset.density = preferences.viewMode;
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
        : { student: 'Student', worker: 'Staff', external: 'External' };
      label.textContent = labels[preferences.priceTier];
    }
  });
  document.querySelectorAll<HTMLSelectElement>('[data-price-tier]').forEach(select => select.value = preferences.priceTier);

  const query = document.querySelector<HTMLInputElement>('#search-input')?.value ?? '';
  // Lunch / dinner choice of the day picker (components/DayPicker.astro); unset shows both.
  const service = document.documentElement.dataset.serviceFilter;
  document.querySelectorAll<HTMLElement>('[data-diet]').forEach((meal) => {
    const diet = meal.dataset.diet as keyof Pick<Preferences, 'vegan' | 'vegetarian' | 'meat'>;
    const card = meal.closest<HTMLElement>('[data-canteen-card]');
    const matchesName = card && matchesQuery(card.dataset.name ?? '', query);
    const otherService = !!service && meal.closest<HTMLElement>('[data-meal-group]')?.dataset.service === (service === 'lunch' ? 'dinner' : 'lunch');
    meal.hidden = !preferences[diet] || otherService || !!(card && !matchesName && !matchesQuery(meal.dataset.mealName ?? '', query));
  });

  document.querySelectorAll<HTMLElement>('[data-meal-group]').forEach(group => {
    group.hidden = group.querySelector('[data-meal-row]:not([hidden])') === null;
  });

  // Canteen page: the dish count in the heading follows the filters ("1 of 3 dishes"), not just the full menu.
  document.querySelectorAll<HTMLElement>('[data-dish-count]').forEach(count => {
    const total = Number(count.dataset.total ?? 0);
    const shown = (count.closest('section') ?? document).querySelectorAll('[data-meal-row]:not([hidden])').length;
    const de = document.documentElement.lang === 'de';
    count.textContent = shown === total
      ? `· ${total} ${de ? 'Gerichte' : total === 1 ? 'dish' : 'dishes'}`
      : de ? `· ${shown} von ${total} Gerichten` : `· ${shown} of ${total} ${total === 1 ? 'dish' : 'dishes'}`;
  });

  document.querySelectorAll<HTMLElement>('[data-canteen-card]').forEach(card => {
    const dishSearch = query.trim() !== '' && !matchesQuery(card.dataset.name ?? '', query);
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
    if (emptyMessage) emptyMessage.hidden = hasVisibleMeals;
  });

  const campusChoice = document.querySelector<HTMLSelectElement>('#campus-select')?.value ?? 'preset';
  const candidates = [...document.querySelectorAll<HTMLElement>('[data-canteen-card]')].map((card) => {
    // "preset" = the campuses chosen in settings; the selector can override that for this visit only.
    const matchesCampus = campusChoice === 'all' ? true
      : campusChoice === 'preset' ? preferences.locations.includes(card.dataset.campusId ?? '')
        : card.dataset.campusId === campusChoice;
    const matchesOpen = !preferences.openOnly || ignoreOpenOnly || card.dataset.isOpen === 'true';
    const fallbackSearch = matchesQuery(card.dataset.name ?? '', query) || card.querySelector('[data-meal-row]:not([hidden])') !== null;
    const matchesSearch = aiMatchedIds && aiQuery === query
      ? aiMatchedIds.has(card.dataset.canteenId ?? '') : fallbackSearch;
    // With lunch or dinner picked, a canteen without that service counts as having no menu.
    const servesChoice = !service || card.querySelector(`[data-meal-group][data-service="${service}"], [data-meal-group]:not([data-service])`) !== null;
    const hasMenu = preferences.viewMode === 'list'
      ? card.querySelector('[data-meal-row]:not([hidden])') !== null
      : card.dataset.hasMenu === 'true' && servesChoice;
    return { card, matches: matchesCampus && matchesOpen && matchesSearch, hasMenu };
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

document.querySelector<HTMLInputElement>('#search-input')?.addEventListener('input', (event) => {
  const query = (event.target as HTMLInputElement).value.trim();
  const version = ++searchVersion;
  clearTimeout(searchTimer);
  aiMatchedIds = null;
  aiQuery = '';
  searchStatus('');
  applyPreferences();
  if (query.length < 2 || !API_URL) return;

  searchTimer = setTimeout(async () => {
    const candidates = [...document.querySelectorAll<HTMLElement>('[data-canteen-card]')].map(card => ({
      id: card.dataset.canteenId ?? '',
      name: card.dataset.name ?? '',
      campus: card.dataset.campus ?? '',
      menu: card.dataset.menu ?? '',
      diets: card.dataset.diets ?? '',
    }));
    if (!candidates.length) return;
    searchStatus(document.documentElement.lang === 'de' ? 'Suche nach passenden Mensen …' : 'Finding matching canteens…');
    try {
      const result = await apiPost<{ ids: string[] }>('/api/search', { query, candidates }, API_URL, 15000);
      if (version !== searchVersion) return;
      aiMatchedIds = new Set(result.ids);
      aiQuery = query.normalize('NFKC').toLocaleLowerCase();
      applyPreferences();
      searchStatus('');
    } catch {
      if (version !== searchVersion) return;
      searchStatus(document.documentElement.lang === 'de'
        ? 'KI-Suche nicht verfügbar. Textsuche wird angezeigt.'
        : 'AI search unavailable. Showing text matches.');
    }
  }, 650);
});
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
// Browser Back/Forward: the browser puts the search text and the campus choice back into their fields (or brings the
// whole page back from its cache) without firing any input event, so the list kept showing the unfiltered result.
// pageshow comes after that restoring, on a fresh load, on Back and on a page restored from the cache.
window.addEventListener('pageshow', () => {
  try { preferences = readPreferences(); } catch { /* Keep the current working preferences. */ }
  applyPreferences();
});
