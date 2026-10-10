import { matchesQuery } from '../search/fold';
import { addSpeechPhraseHints, chooseFoodAwareTranscript, speechRecognitionConstructor, type SpeechRecognitionLike } from '../search/speech';
import { ALL_CAMPUS_IDS, isPriceTier, isViewMode, readPreferences, PREFERENCES_KEY, type Preferences } from '../preferences/state';
import { API_URL, ApiError, createRealtimeVoiceSession, searchHybridMeals, type HybridMealSearchResponse } from '../data/api';
import { RealtimeVoiceConnection, type RealtimeVoiceStatus } from '../search/realtime';
let aiMatchedIds: Set<string> | null = null;
let aiMatchedMealIds: Set<string> | null = null;
let aiQuery = '';
let realtimeResultsActive = false;
let latestHybridResponse: HybridMealSearchResponse | null = null;
let searchPending = false;
let searchVersion = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let userCoords: { lat: number; lng: number } | null = null;
let activeMensaIds: string[] = [];
let activeCampusId: string | null = null;
let speechSubmission = false;

function explicitlyRequestsCurrentMensa(query: string) {
  const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  return /(?:^|\s)(?:here|right here|this place|this canteen|this mensa|this cafeteria|this restaurant|at my location|where i am|current menu|current mensa|hier|hier vor ort|diese mensa|diese kantine|dieser ort|aktuelles menue|aktuelle mensa)(?:$|\s)/u.test(normalized);
}

if (typeof document !== 'undefined') {
  document.addEventListener('campuseats:user-located', ((event: CustomEvent<{
    fix?: { lat: number; lng: number };
    atMensaIds?: string[];
    nearby?: Array<{ id: string; campus: string }>;
  }>) => {
    if (event.detail?.fix) {
      userCoords = { lat: event.detail.fix.lat, lng: event.detail.fix.lng };
      activeMensaIds = event.detail.atMensaIds ?? [];
      activeCampusId = event.detail.nearby?.[0]?.campus ?? null;
    }
  }) as EventListener);
  document.addEventListener('campuseats:user-unlocated', () => {
    userCoords = null;
    activeMensaIds = [];
    activeCampusId = null;
  });
}

function currentSearchMensaId() {
  const nearestMensaId = activeMensaIds[0] ?? null;
  return preferences.priceTier === 'student' && nearestMensaId === 'dozentenfoyer'
    ? null : nearestMensaId;
}

function searchStatus(message: string) {
  const status = document.querySelector<HTMLElement>('#search-status');
  if (status) {
    status.textContent = message;
    status.hidden = !message;
  }
}

function showHybridResults(response: HybridMealSearchResponse | null) {
  const panel = document.querySelector<HTMLElement>('#ai-results');
  const list = document.querySelector<HTMLElement>('#ai-results-list');
  const count = document.querySelector<HTMLElement>('#ai-results-count');
  const intent = document.querySelector<HTMLElement>('#ai-results-intent');
  if (!panel || !list || !count || !intent) return;
  panel.hidden = response === null;
  list.replaceChildren();
  if (!response) return;
  const visibleResults = visibleHybridResults(response);
  const lang = document.documentElement.lang;
  count.textContent = `${visibleResults.length} ${lang === 'de' ? 'Treffer' : 'matches'}`;
  const criteria = response.criteria;
  const hints = [criteria.hardFilters.dietTag, criteria.semanticQuery,
    criteria.sortBy === 'PRICE_ASC' ? (lang === 'de' ? 'Günstigste zuerst' : 'Lowest price first') : null,
    criteria.sortBy === 'DISTANCE_ASC' ? (lang === 'de' ? 'Nächste zuerst' : 'Nearest first') : null]
    .filter((value): value is string => Boolean(value));
  intent.textContent = hints.length ? hints.join(' · ') : (lang === 'de' ? 'Passende Gerichte' : 'Matching dishes');
  if (!visibleResults.length) {
    const empty = document.createElement('p');
    empty.textContent = lang === 'de' ? 'Keine Gerichte erfüllen diese Kriterien.' : 'No dishes meet these criteria.';
    list.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const result of visibleResults) {
    const link = document.createElement('a');
    link.className = 'ai-result';
    link.href = `/canteen/${encodeURIComponent(result.mensaId)}/${result.date}`;
    const title = document.createElement('strong');
    title.textContent = result.meal.name;
    const venue = document.createElement('span');
    const tier = preferences.priceTier === 'worker' ? 'staff' : preferences.priceTier;
    const price = result.meal.prices[tier];
    venue.textContent = `${result.mensaName}${price != null ? ` · CHF ${price.toFixed(2)}` : ''}`;
    link.append(title, venue);
    if (result.meal.description) {
      const description = document.createElement('span');
      description.textContent = result.meal.description;
      link.append(description);
    }
    fragment.append(link);
  }
  list.append(fragment);
}

function visibleHybridResults(response: HybridMealSearchResponse) {
  return preferences.priceTier === 'student'
    ? response.results.filter(result => result.mensaId !== 'dozentenfoyer')
    : response.results;
}

function displayHybridResponse(response: HybridMealSearchResponse, query: string, fromRealtime = false) {
  latestHybridResponse = response;
  aiQuery = query;
  realtimeResultsActive = fromRealtime;
  const visibleResults = visibleHybridResults(response);
  aiMatchedIds = new Set(visibleResults.map(result => result.mensaId));
  aiMatchedMealIds = new Set(visibleResults.map(result => result.meal.id));
  applyPreferences();
  const grid = document.querySelector<HTMLElement>('#canteen-grid');
  if (grid) {
    const ranks = new Map<string, number>();
    visibleResults.forEach((result, index) => { if (!ranks.has(result.mensaId)) ranks.set(result.mensaId, index); });
    [...grid.querySelectorAll<HTMLElement>(':scope > [data-canteen-card]')]
      .sort((a, b) => (ranks.get(a.dataset.canteenId ?? '') ?? 9999) - (ranks.get(b.dataset.canteenId ?? '') ?? 9999))
      .forEach(card => grid.append(card));
  }
}

function activeCampusScope() {
  const choice = document.querySelector<HTMLSelectElement>('#campus-select')?.value;
  return choice === 'all' ? null
    : choice && choice !== 'preset' ? [choice] : preferences.locations;
}

function activeCampusFilter() {
  const choice = document.querySelector<HTMLSelectElement>('#campus-select')?.value;
  return choice && choice !== 'all' && choice !== 'preset' ? choice : null;
}

function priceCategory() {
  return preferences.priceTier === 'worker' ? 'STAFF' as const
    : preferences.priceTier === 'external' ? 'EXTERNAL' as const : 'STUDENT' as const;
}

function statusText(status: RealtimeVoiceStatus, detail?: string) {
  if (status === 'error') return detail ?? 'Voice connection failed. Try again.';
  const de = document.documentElement.lang === 'de';
  return status === 'connecting' ? (de ? 'Verbinde Sprachassistent …' : 'Connecting voice assistant…')
    : status === 'thinking' ? (de ? 'Suche nach passenden Gerichten …' : 'Searching for dishes…')
    : status === 'speaking' ? (de ? 'Antwort wird gesprochen …' : 'Speaking…')
    : (de ? 'Ich höre zu …' : 'Listening… speak naturally.');
}

let preferences: Preferences;
try {
  preferences = readPreferences();
} catch { preferences = { vegan: true, vegetarian: true, meat: true, viewMode: 'standard', openOnly: false, useAiVoiceSearch: true, locations: [...ALL_CAMPUS_IDS], priceTier: 'student', devMode: false }; }
let showWithoutMenu = false;

function applyPreferences() {
  document.documentElement.dataset.density = preferences.viewMode;
  document.documentElement.dataset.devMode = String(preferences.devMode);
  document.documentElement.dataset.priceTier = preferences.priceTier;
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
  if (latestHybridResponse && (realtimeResultsActive || aiQuery === query)) {
    const visibleResults = visibleHybridResults(latestHybridResponse);
    aiMatchedIds = new Set(visibleResults.map(result => result.mensaId));
    aiMatchedMealIds = new Set(visibleResults.map(result => result.meal.id));
    showHybridResults(latestHybridResponse);
  }
  const hybridResultsActive = realtimeResultsActive || aiQuery === query;
  const useTextQuery = !searchPending && !(aiMatchedIds && hybridResultsActive);
  const aiResultsActive = aiMatchedMealIds !== null && hybridResultsActive;
  const aiMenuHint = document.querySelector<HTMLElement>('#ai-menu-hint');
  if (aiMenuHint) aiMenuHint.hidden = !aiResultsActive;
  // Lunch / dinner choice of the day picker (components/DayPicker.astro); unset shows both.
  const service = document.documentElement.dataset.serviceFilter;
  document.querySelectorAll<HTMLElement>('[data-diet]').forEach((meal) => {
    const diet = meal.dataset.diet as keyof Pick<Preferences, 'vegan' | 'vegetarian' | 'meat'>;
    const card = meal.closest<HTMLElement>('[data-canteen-card]');
    const matchesName = card && matchesQuery(card.dataset.name ?? '', query);
    const otherService = !!service && meal.closest<HTMLElement>('[data-meal-group]')?.dataset.service === (service === 'lunch' ? 'dinner' : 'lunch');
    const isAiMatch = aiResultsActive && aiMatchedMealIds?.has(meal.dataset.mealId ?? '');
    const textMatchesMeal = matchesQuery(meal.dataset.mealSearch ?? meal.dataset.mealName ?? '', query);
    meal.hidden = !preferences[diet] || otherService
      || (aiResultsActive ? !isAiMatch : !!(useTextQuery && card && !matchesName && !textMatchesMeal));
  });

  document.querySelectorAll<HTMLElement>('[data-meal-group]').forEach(group => {
    group.hidden = group.querySelector('[data-meal-row]:not([hidden])') === null;
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
    const matchesOpen = !preferences.openOnly || card.dataset.isOpen === 'true';
    const fallbackSearch = matchesQuery(card.dataset.name ?? '', query) || card.querySelector('[data-meal-row]:not([hidden])') !== null;
    const matchesSearch = aiMatchedIds && hybridResultsActive
      ? aiMatchedIds.has(card.dataset.canteenId ?? '') : searchPending || fallbackSearch;
    // With lunch or dinner picked, a canteen without that service counts as having no menu.
    const servesChoice = !service || card.querySelector(`[data-meal-group][data-service="${service}"], [data-meal-group]:not([data-service])`) !== null;
    const hasMenu = preferences.viewMode === 'list'
      ? card.querySelector('[data-meal-row]:not([hidden])') !== null
      : card.dataset.hasMenu === 'true' && servesChoice;
    const excludedForStudent = preferences.priceTier === 'student' && card.dataset.canteenId === 'dozentenfoyer';
    return { card, matches: !excludedForStudent && matchesCampus && matchesOpen && matchesSearch, hasMenu };
  });
  const withMenuCount = candidates.filter(candidate => candidate.matches && candidate.hasMenu).length;
  const withoutMenuCount = candidates.filter(candidate => candidate.matches && !candidate.hasMenu).length;
  const collapseWithoutMenu = preferences.viewMode === 'list' || searchPending || (!showWithoutMenu && !query.trim() && withMenuCount > 0);
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

  document.querySelectorAll<HTMLInputElement>('#preferences-form input[type="checkbox"]').forEach((input) => {
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
      preferences = { ...preferences, [input.name]: input.checked };
    }
  } else return;
  applyPreferences();
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); showSavedState(); }
  catch { showSavedState(false); }
});

document.querySelector<HTMLInputElement>('#search-input')?.addEventListener('input', (event) => {
  const query = (event.target as HTMLInputElement).value.trim();
  const fromVoice = speechSubmission;
  speechSubmission = false;
  const version = ++searchVersion;
  clearTimeout(searchTimer);
  if (!fromVoice) {
    aiMatchedIds = null;
    aiMatchedMealIds = null;
    aiQuery = '';
    latestHybridResponse = null;
    realtimeResultsActive = false;
  }
  searchPending = fromVoice && query.length >= 2 && !!API_URL && preferences.useAiVoiceSearch;
  searchStatus('');
  showHybridResults(null);
  applyPreferences();
  if (!fromVoice || query.length < 2 || !API_URL) return;
  if (!preferences.useAiVoiceSearch) {
    searchStatus(document.documentElement.lang === 'de'
      ? 'KI für die Sprachsuche ist ausgeschaltet. Zeige Worttreffer.'
      : 'AI voice search is off. Showing word matches.');
    return;
  }

  searchTimer = setTimeout(async () => {
    searchStatus(document.documentElement.lang === 'de' ? 'Suche nach passenden Gerichten …' : 'Finding matching dishes…');

    // The hybrid endpoint performs one intent extraction, hard filtering, and vector ranking.
    try {
      const priceCategory = preferences.priceTier === 'worker' ? 'STAFF' : preferences.priceTier === 'external' ? 'EXTERNAL' : 'STUDENT';
      const campusSelect = document.querySelector<HTMLSelectElement>('#campus-select')?.value;
      const campusParam = campusSelect && campusSelect !== 'all' && campusSelect !== 'preset' ? campusSelect : null;
      const wantsCurrentPlace = explicitlyRequestsCurrentMensa(query);
      const mensaId = wantsCurrentPlace ? currentSearchMensaId() : null;
      const useCurrentCampus = wantsCurrentPlace && !mensaId && activeCampusId !== null;
      const campusIds = useCurrentCampus ? [activeCampusId!]
        : campusSelect === 'all' ? null
        : campusParam ? [campusParam] : preferences.locations;
      const campusId = campusParam ?? (useCurrentCampus ? activeCampusId : null);
      const date = document.querySelector<HTMLElement>('[data-day-picker]')?.dataset.pickerDate ?? null;

      const hybridRes = await searchHybridMeals({
        query,
        // GPS gives us context for explicit "here" requests; it must not narrow every voice query.
        mensaId,
        date,
        userLat: userCoords?.lat ?? null,
        userLng: userCoords?.lng ?? null,
        campusId,
        campusIds,
        priceCategory,
        limit: 10,
      }, API_URL, 15000);

      if (version !== searchVersion) return;
      searchPending = false;
      displayHybridResponse(hybridRes, query);
      searchStatus('');
      return;
    } catch (error) {
      if (version !== searchVersion) return;
      searchPending = false;
      applyPreferences();
      const de = document.documentElement.lang === 'de';
      const message = error instanceof ApiError
        ? error.status === 503
          ? (de ? 'KI-Suche benötigt einen konfigurierten OpenAI-API-Schlüssel im Backend.' : 'AI search needs an OpenAI API key configured in the backend.')
          : error.status === 404
            ? (de ? 'Das Backend unterstützt die KI-Suche noch nicht.' : 'The backend does not have the AI search endpoint yet.')
            : (de ? `KI-Suche fehlgeschlagen: ${error.message}` : `AI search failed: ${error.message}`)
        : (de ? 'Backend auf localhost:8080 nicht erreichbar. Lokale Textsuche wird angezeigt.'
          : 'Backend at localhost:8080 is unreachable. Showing local text matches.');
      searchStatus(message);
    }
  }, 650);
});

const voiceSearchButton = document.querySelector<HTMLButtonElement>('#voice-search-button');
const searchInput = document.querySelector<HTMLInputElement>('#search-input');
const SpeechRecognition = speechRecognitionConstructor(window);
let speechRecognition: SpeechRecognitionLike | null = null;
let realtimeVoice: RealtimeVoiceConnection | null = null;
const voiceCaption = document.querySelector<HTMLElement>('#voice-agent-caption');
if (voiceSearchButton && !SpeechRecognition) {
  voiceSearchButton.disabled = !preferences.useAiVoiceSearch;
  voiceSearchButton.title = document.documentElement.lang === 'de'
    ? 'Dieser Browser unterstützt keine Sprachsuche.' : 'Voice search is not supported in this browser.';
}
voiceSearchButton?.addEventListener('click', () => {
  if (preferences.useAiVoiceSearch) {
    if (realtimeVoice) {
      realtimeVoice.close();
      realtimeVoice = null;
      voiceSearchButton.setAttribute('aria-pressed', 'false');
      voiceSearchButton.disabled = false;
      searchStatus('');
      return;
    }
    if (!API_URL) {
      searchStatus(document.documentElement.lang === 'de' ? 'Backend für Sprachsuche nicht erreichbar.' : 'Voice search backend is unavailable.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      searchStatus(document.documentElement.lang === 'de' ? 'Dieser Browser unterstützt keine Echtzeit-Sprachsuche.' : 'This browser does not support realtime voice search.');
      return;
    }
    aiMatchedIds = null;
    aiMatchedMealIds = null;
    aiQuery = '';
    latestHybridResponse = null;
    realtimeResultsActive = false;
    if (voiceCaption) { voiceCaption.textContent = ''; voiceCaption.hidden = true; }
    showHybridResults(null);
    applyPreferences();
    voiceSearchButton.disabled = true;
    voiceSearchButton.setAttribute('aria-pressed', 'true');
    searchStatus(statusText('connecting'));
    let assistantCaptionOpen = false;
    const captionDelta = (text: string) => {
      if (!voiceCaption) return;
      if (!text) { assistantCaptionOpen = false; return; }
      if (!assistantCaptionOpen) {
        voiceCaption.textContent += `${voiceCaption.textContent ? '\n' : ''}UniEats: `;
        assistantCaptionOpen = true;
      }
      voiceCaption.textContent += text;
      if (voiceCaption.textContent.length > 1600) voiceCaption.textContent = voiceCaption.textContent.slice(-1600);
      voiceCaption.hidden = !voiceCaption.textContent;
    };
    const userCaption = (text: string) => {
      if (!voiceCaption || !text.trim()) return;
      assistantCaptionOpen = false;
      voiceCaption.textContent += `${voiceCaption.textContent ? '\n' : ''}You: ${text.trim()}`;
      if (voiceCaption.textContent.length > 1600) voiceCaption.textContent = voiceCaption.textContent.slice(-1600);
      voiceCaption.hidden = !voiceCaption.textContent;
    };
    const callbacks = {
      onStatus: (status: RealtimeVoiceStatus, detail?: string) => {
        searchStatus(statusText(status, detail));
        if (status === 'listening' || status === 'speaking' || status === 'thinking') voiceSearchButton.disabled = false;
        if (status === 'error') {
          realtimeVoice?.close();
          realtimeVoice = null;
          voiceSearchButton.disabled = false;
          voiceSearchButton.setAttribute('aria-pressed', 'false');
        }
      },
      onUserText: userCaption,
      onAssistantText: captionDelta,
      onSearch: async (query: string) => {
        searchStatus(document.documentElement.lang === 'de' ? 'Suche nach passenden Gerichten …' : 'Finding matching dishes…');
        const explicitDate = /\b(today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|heute|heute abend|morgen|gestern|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b|\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/iu.test(query);
        try {
          const response = await searchHybridMeals({
            query,
            mensaId: currentSearchMensaId(),
            campusId: activeCampusFilter(),
            campusIds: activeCampusScope(),
            date: explicitDate ? null : document.querySelector<HTMLElement>('[data-day-picker]')?.dataset.pickerDate ?? null,
            userLat: userCoords?.lat ?? null,
            userLng: userCoords?.lng ?? null,
            priceCategory: priceCategory(),
            limit: 10,
          }, API_URL, 20000);
          displayHybridResponse(response, '', true);
          return response;
        } finally {
          searchStatus('');
        }
      },
    };
    void (async () => {
      try {
        const session = await createRealtimeVoiceSession({
          activeMensaId: currentSearchMensaId(),
          activeCampusId,
          priceCategory: priceCategory(),
        }, API_URL);
        const connection = await RealtimeVoiceConnection.connect(session.clientSecret, session.instructions, callbacks);
        realtimeVoice = connection;
        voiceSearchButton.disabled = false;
      } catch (error) {
        voiceSearchButton.disabled = false;
        voiceSearchButton.setAttribute('aria-pressed', 'false');
        const detail = error instanceof ApiError ? error.message : (error instanceof Error ? error.message : 'Connection failed.');
        searchStatus(document.documentElement.lang === 'de' ? `Sprachsuche fehlgeschlagen: ${detail}` : `Voice search failed: ${detail}`);
      }
    })();
    return;
  }
  if (!SpeechRecognition || !searchInput) {
    searchStatus(document.documentElement.lang === 'de'
      ? 'Dieser Browser unterstützt keine Sprachsuche.' : 'Voice search is not supported in this browser.');
    return;
  }
  if (speechRecognition && voiceSearchButton.getAttribute('aria-pressed') === 'true') {
    speechRecognition.stop();
    return;
  }
  aiMatchedIds = null;
  aiMatchedMealIds = null;
  aiQuery = '';
  latestHybridResponse = null;
  searchStatus('');
  showHybridResults(null);
  applyPreferences();
  const startRecognition = (withHints: boolean) => {
    const recognition = new SpeechRecognition();
    speechRecognition = recognition;
    recognition.lang = document.documentElement.lang === 'de' ? 'de-CH' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;
    const canteenCards = [...document.querySelectorAll<HTMLElement>('[data-canteen-card]')];
    const placePhrases = [
      ...canteenCards.flatMap(card => [card.dataset.name ?? '', card.dataset.campus ?? '', card.dataset.campusId ?? '']),
    ].filter(Boolean);
    const centerLabel = canteenCards.find(card => card.dataset.campusId === 'zentrum')?.dataset.campus
      ?.trim().split(/\s+/).at(-1);
    const placeAliases = centerLabel
      ? [{ alias: 'center', canonical: centerLabel }, { alias: 'centre', canonical: centerLabel }]
      : [];
    const placeHints = [...placePhrases,
      ...placeAliases.map(alias => alias.alias)];
    const contextPhrases = [
      'food', 'dish', 'meal', 'menu', 'chicken', 'chicken curry', 'chicken breast', 'poulet', 'Hähnchen',
      'egg', 'eggs', 'Ei', 'Eier', 'chickpea', 'chickpeas', 'Kichererbsen', 'fish', 'salmon', 'beef', 'pork',
      'tofu', 'rice', 'pasta', 'vegetarian', 'vegan', 'vegetarisch', 'gluten-free', 'lactose-free',
      'CHF', 'Swiss francs', 'francs', 'Franken', 'ten francs', '10 francs', 'zehn Franken', '10 Franken',
      'under ten francs', 'under 10 francs', 'unter zehn Franken', 'unter 10 Franken',
      ...placeHints,
      ...[...document.querySelectorAll<HTMLElement>('[data-meal-row]')]
        .flatMap(row => [row.dataset.mealName ?? '', row.dataset.mealSearch ?? '']),
    ];
    if (withHints) {
      addSpeechPhraseHints(window, recognition, contextPhrases);
    }
    let retryWithoutHints = false;
    recognition.onstart = () => {
      voiceSearchButton.setAttribute('aria-pressed', 'true');
      searchStatus(document.documentElement.lang === 'de' ? 'Höre zu … Sag, wonach du suchst.' : 'Listening… say what you are looking for.');
    };
    recognition.onresult = (event) => {
      const finalResult = Array.from({ length: event.results.length - event.resultIndex }, (_, index) =>
        event.results[event.resultIndex + index]).find(result => result.isFinal);
      const transcript = finalResult
        ? chooseFoodAwareTranscript(Array.from({ length: finalResult.length }, (_, index) => finalResult[index]), contextPhrases, placePhrases, placeAliases)
        : null;
      if (!transcript) {
        searchStatus(document.documentElement.lang === 'de' ? 'Keine Sprache erkannt. Bitte versuche es erneut.' : 'No speech was heard. Try again.');
        return;
      }
      speechSubmission = true;
      searchInput.value = transcript;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    };
    recognition.onerror = (event) => {
      if (withHints && event.error === 'phrases-not-supported') {
        retryWithoutHints = true;
        return;
      }
      const de = document.documentElement.lang === 'de';
      searchStatus(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? (de ? 'Erlaube den Mikrofonzugriff für die Sprachsuche.' : 'Allow microphone access to search by voice.')
        : event.error === 'no-speech'
          ? (de ? 'Keine Sprache erkannt. Bitte versuche es erneut.' : 'No speech was heard. Try again.')
          : (de ? 'Mikrofonzugriff fehlgeschlagen. Prüfe die Browserberechtigungen.' : 'Microphone access failed. Check browser permissions and try again.'));
    };
    recognition.onend = () => {
      voiceSearchButton.setAttribute('aria-pressed', 'false');
      if (retryWithoutHints) startRecognition(false);
    };
    try { recognition.start(); }
    catch {
      voiceSearchButton.setAttribute('aria-pressed', 'false');
      searchStatus(document.documentElement.lang === 'de' ? 'Sprachsuche konnte nicht gestartet werden.' : 'Could not start voice search. Try again.');
    }
  };
  startRecognition(true);
});
document.addEventListener('campuseats:preferences-applied', () => {
  if (!preferences.useAiVoiceSearch && realtimeVoice) {
    realtimeVoice.close();
    realtimeVoice = null;
    voiceSearchButton?.setAttribute('aria-pressed', 'false');
    searchStatus('');
  }
  if (voiceSearchButton && !realtimeVoice && !speechRecognition)
    voiceSearchButton.disabled = !preferences.useAiVoiceSearch && !SpeechRecognition;
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
  applyPreferences();
  search?.focus();
});
document.addEventListener('languagechange', applyPreferences);
document.addEventListener('campuseats:service-filter-changed', applyPreferences);

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
