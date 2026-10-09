type Preferences = {
  vegan: boolean;
  vegetarian: boolean;
  meat: boolean;
  compact: boolean;
  locations: string[];
  openOnly: boolean;
  priceTier: 'student' | 'worker' | 'external';
};

const STORAGE_KEY = 'campuseats-preferences';
const allLocations = ['zentrum', 'hoenggerberg', 'irchel'];
// Older versions saved display labels; map them to the campus ids used now.
const legacyLocations: Record<string, string> = { 'ETH Zentrum': 'zentrum', 'UZH Zentrum': 'zentrum', 'ETH Hönggerberg': 'hoenggerberg', 'UZH Irchel': 'irchel' };
const defaults: Preferences = { vegan: true, vegetarian: true, meat: true, compact: false, locations: allLocations, openOnly: false, priceTier: 'student' };
const isPriceTier = (value: unknown): value is Preferences['priceTier'] => value === 'student' || value === 'worker' || value === 'external';
function profilePriceTier(): Preferences['priceTier'] {
  try {
    const profile = JSON.parse(localStorage.getItem('campuseats-profile') || '{}');
    return isPriceTier(profile?.priceTier) ? profile.priceTier : 'student';
  } catch { return 'student'; }
}

function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Preferences> & { campus?: string };
    const locations = Array.isArray(saved.locations)
      ? saved.locations
      : saved.campus && saved.campus !== 'all'
        ? [saved.campus]
        : allLocations;
    return { ...defaults, ...saved, priceTier: isPriceTier(saved.priceTier) ? saved.priceTier : profilePriceTier(), locations: [...new Set(locations.map((location) => legacyLocations[location] ?? location))] };
  } catch {
    return defaults;
  }
}

let preferences = readPreferences();

function applyPreferences() {
  document.documentElement.dataset.density = preferences.compact ? 'compact' : 'standard';
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

  const query = document.querySelector<HTMLInputElement>('#search-input')?.value.trim().toLocaleLowerCase() ?? '';
  let visibleCanteens = 0;
  document.querySelectorAll<HTMLElement>('[data-canteen-card]').forEach((card) => {
    const matchesCampus = preferences.locations.includes(card.dataset.campusId ?? '');
    const matchesOpen = !preferences.openOnly || card.dataset.isOpen === 'true';
    const searchText = `${card.dataset.name ?? ''} ${card.dataset.menu ?? ''}`.toLocaleLowerCase();
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  applyPreferences();
  showSavedState();
});

document.querySelector<HTMLInputElement>('#search-input')?.addEventListener('input', applyPreferences);
document.addEventListener('languagechange', applyPreferences);

function showSavedState() {
  const saved = document.querySelector<HTMLElement>('#settings-saved');
  if (!saved) return;
  saved.hidden = false;
  saved.textContent = document.documentElement.lang === 'de' ? 'Gespeichert' : 'Saved';
}

applyPreferences();
