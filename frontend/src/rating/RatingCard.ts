import { zurichTime, type MensaChoice, type RatingPrompt } from './getRatingPrompt.ts';
import { appNow } from '../time/clock.ts';
import { mensaCandidates, STATE_KEY, useRatingPrompt } from './useRatingPrompt.ts';
import { loadMeals } from './mealSource.ts';
import { anonymousUserId, DuplicateMealRatingError, RATINGS_KEY, saveMealRating, undoMealRating, type Stars } from './saveMealRating.ts';
import { API_URL, apiGet, type BackendMealDetail } from '../data/api.ts';
import type { Profile } from '../onboarding/profile';
import { ratingText, translateRating, type RatingText } from './i18n';
import { readVisits } from '../location/visits.ts';
import { NEAR_ME_KEY } from '../location/near-me.ts';
import { visitCandidates } from './visitCandidates.ts';

interface MealOption { id: string; mensaId: string; date: string; name: string }
interface CardData { mensas: MensaChoice[]; meals: MealOption[] }
function readOptional<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; }
  catch { return null; }
}

export function mountRatingCard(): void {
  // Browsers that block site data throw when localStorage is touched; the card then simply stays hidden.
  try { void localStorage; } catch { return; }
  const root = document.querySelector<HTMLElement>('[data-rating-card]');
  const source = document.querySelector('[data-rating-data]');
  if (!root || !source) return;
  let data: CardData;
  try { data = JSON.parse(source.textContent ?? '{}') as CardData; } catch { return; }
  if (!Array.isArray(data.mensas)) data.mensas = [];
  if (!Array.isArray(data.meals)) data.meals = [];
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const status = query('[data-rating-status]');
  const setStatus = (key: RatingText) => { status.dataset.ratingText = key; status.textContent = ratingText(key); };
  const clearStatus = () => { delete status.dataset.ratingText; status.textContent = ''; };
  translateRating(root);
  let storage: Storage;
  try { storage = localStorage; }
  catch {
    root.hidden = false;
    root.querySelectorAll<HTMLElement>('[data-rating-step]').forEach(el => { el.hidden = true; });
    setStatus('storage');
    query('[data-rating-dismiss]').addEventListener('click', () => { root.hidden = true; });
    return;
  }
  // The override and isolated simulator storage are removed from production bundles.
  const override = import.meta.env.DEV ? new URL(location.href).searchParams.get('ratingNow') : null;
  const simulated = Boolean(override && /(?:Z|[+-]\d{2}:\d{2})$/.test(override) && Number.isFinite(Date.parse(override)));
  const now = () => simulated ? new Date(override!) : appNow();
  const stateKey = `${STATE_KEY}${simulated ? ':dev' : ''}`;
  const ratingsKey = `${RATINGS_KEY}${simulated ? ':dev' : ''}`;
  /** Users who never share their location get "Where did you eat today?" with suggestions instead. */
  const usesLocation = (visits: ReturnType<typeof readVisits>) =>
    storage.getItem(NEAR_ME_KEY) === '1' || visits.some(visit => (visit.source ?? 'location') === 'location');
  const candidates = () => {
    const visits = readVisits(storage);
    const visited = visitCandidates(data.mensas, visits);
    if (!simulated && usesLocation(visits)) return visited;
    const profile = readOptional<Partial<Profile>>('campuseats-profile');
    const rawFavourites = readOptional<unknown>('campuseats-favourites');
    const favourites = Array.isArray(rawFavourites) ? rawFavourites.filter((id): id is string => typeof id === 'string') : [];
    const preferred = mensaCandidates(data.mensas, profile, favourites);
    const seen = new Set<string>();
    return [...visited, ...preferred].filter(choice => {
      const key = `${choice.date ?? ''}:${choice.mensaId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const store = useRatingPrompt(now, candidates, storage, stateKey);
  let prompt: RatingPrompt | null = null;
  let mensa: MensaChoice | undefined;
  let meal: MealOption | undefined;
  let busy = false;
  let closing = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function hide() {
    if (root!.contains(document.activeElement)) document.querySelector<HTMLInputElement>('#search-input')?.focus();
    root!.hidden = true;
    closing = false;
    // A meal request that is still running must not draw a step into the hidden card or move focus.
    mensa = undefined;
    meal = undefined;
    if (closeTimer) clearTimeout(closeTimer);
    query('[data-rating-undo]').hidden = true;
  }
  function step(name: 'mensa' | 'meal' | 'rate', focus = true) {
    root!.querySelectorAll<HTMLElement>('[data-rating-step]').forEach(el => { el.hidden = el.dataset.ratingStep !== name; });
    clearStatus();
    if (focus) query(name === 'mensa' ? '#meal-rating-title' : `[data-rating-${name === 'meal' ? 'meal' : 'rate'}-heading]`).focus();
  }
  /** undoable: after a new rating, offer "Undo" and keep the card open a little longer. */
  function feedback(message: RatingText, undoable = false) {
    closing = true;
    root!.querySelectorAll<HTMLElement>('[data-rating-step]').forEach(el => { el.hidden = true; });
    setStatus(message);
    query('[data-rating-undo]').hidden = !undoable;
    status.tabIndex = -1;
    status.focus();
    closeTimer = setTimeout(hide, undoable ? 8000 : 2200);
  }
  function resolve(dismissed: boolean) {
    if (!prompt) return;
    try { store.resolve(prompt.date, dismissed); hide(); }
    catch { setStatus('choiceError'); }
  }
  // Meals of the target day from the backend, so ids match what it stores; the bundled list is the fallback.
  const mealsByDate = new Map<string, Promise<MealOption[]>>();
  function mealsOn(date: string): Promise<MealOption[]> {
    if (!mealsByDate.has(date)) {
      // With a backend the meal ids must come from it (see mealSource.ts); only the device-only simulator may fall back.
      mealsByDate.set(date, loadMeals<MealOption>(API_URL
        ? () => apiGet<BackendMealDetail[]>(`/api/meals?date=${encodeURIComponent(date)}`)
          // The API orders by id; show lunch before dinner like the menus.
          .then(list => [...list]
            .sort((a, b) => Number(a.meal.classification[2] === 'dinner') - Number(b.meal.classification[2] === 'dinner'))
            .map(m => ({ id: m.meal.id, mensaId: m.mensaId, date: m.date, name: m.meal.name })))
        : null, () => data.meals.filter(m => m.date === date), simulated)
        // A failed request is not cached, so choosing the mensa again retries it.
        .catch((error) => { mealsByDate.delete(date); throw error; }));
    }
    return mealsByDate.get(date)!;
  }
  /** skipped: the card opened straight on this (only visited) mensa's meals, with "I ate somewhere else". */
  async function chooseMensa(choice: MensaChoice, skipped = false) {
    if (!prompt) return;
    mensa = choice;
    meal = undefined;
    const target = prompt.date;
    setStatus('loading');
    let loaded: MealOption[];
    try { loaded = await mealsOn(target); }
    catch {
      // The backend could not be reached: say so and let the user choose again. Do not treat it as "no menu".
      if (prompt?.date === target && mensa === choice) setStatus('mealsError');
      return;
    }
    const meals = loaded.filter(m => m.mensaId === choice.mensaId);
    clearStatus();
    if (prompt?.date !== target || mensa !== choice) return;
    if (!meals.length) {
      try { store.resolve(prompt.date); feedback('noMenu'); }
      catch { setStatus('choiceError'); }
      return;
    }
    query('[data-rating-mensa-name]').textContent = choice.name;
    query('[data-rating-back="mensa"]').hidden = skipped;
    query('[data-rating-elsewhere]').hidden = !skipped;
    const list = query('[data-rating-meals]');
    list.replaceChildren();
    meals.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = option.name;
      button.addEventListener('click', () => {
        meal = option;
        query('[data-rating-meal-name]').textContent = option.name;
        step('rate');
      });
      list.append(button);
    });
    step('meal', !skipped);
  }
  /** Whether today has a menu: true / false, or undefined while it is loading. */
  const menuChecks = new Map<string, 'pending' | 'yes' | 'no'>();
  function hadMenu(date: string): boolean | undefined {
    const known = menuChecks.get(date);
    if (known === 'yes') return true;
    if (known === 'no') return false;
    if (known === 'pending') return undefined;
    menuChecks.set(date, 'pending');
    // If the menus cannot be loaded we do not know: treat the day as served, so nothing changes (choosing a mensa reports the problem).
    void mealsOn(date).then(list => { menuChecks.set(date, list.length ? 'yes' : 'no'); }, () => { menuChecks.set(date, 'yes'); }).then(() => refresh());
    return undefined;
  }
  /** No question on days without a menu. Never fall back to a previous day. */
  function chooseDayToAskAbout(): 'ok' | 'wait' | 'none' {
    if (store.current()?.kind === 'visit') return 'ok';
    const today = zurichTime(now()).date;
    const todayServed = hadMenu(today);
    if (todayServed === undefined) return 'wait';
    return todayServed ? 'ok' : 'none';
  }
  function refresh() {
    if (busy || closing) return;
    try {
      if (chooseDayToAskAbout() !== 'ok') { hide(); prompt = null; return; }
      const next = store.current();
      if (!next) { hide(); prompt = null; return; }
      store.shown(next.date);
      if (prompt?.date === next.date && !root!.hidden && (query('[data-rating-step="mensa"]').hidden ||
        JSON.stringify(prompt.mensaChoices) === JSON.stringify(next.mensaChoices))) return;
      prompt = next;
      mensa = undefined; meal = undefined;
      renderDate();
      const list = query('[data-rating-mensas]');
      list.replaceChildren();
      if (!next.mensaChoices.length) {
        const hint = document.createElement('p');
        hint.textContent = 'No suggestions yet. Choose a mensa below.';
        list.append(hint);
      }
      next.mensaChoices.forEach(choice => {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = choice.name;
        button.addEventListener('click', () => chooseMensa(choice));
        list.append(button);
      });
      query('[data-rating-other-picker]').hidden = true;
      // Only dinner visits: ask about dinner.
      const dinner = next.kind === 'visit' && next.mensaChoices.every(choice => choice.service === 'dinner');
      query('.meal-rating-eyebrow').dataset.ratingText = dinner ? 'eyebrowDinner' : 'eyebrow';
      query('#meal-rating-title').dataset.ratingText = dinner ? 'titleDinner' : 'title';
      const question = query('[data-rating-step="mensa"] [data-rating-text^="question"]');
      question.dataset.ratingText = next.kind === 'guess' ? 'questionGuess' : 'question';
      const skip = query('[data-rating-skip]');
      skip.dataset.ratingText = next.kind === 'guess' ? 'nowhere' : 'skip';
      translateRating(root!);
      root!.hidden = false;
      step('mensa', false);
      // One visited mensa (located there or reported its crowd): straight to its meals.
      if (next.kind === 'visit' && next.mensaChoices.length === 1) void chooseMensa(next.mensaChoices[0]!, true);
    } catch {
      // Do not reset corrupt/unavailable storage and accidentally prompt twice.
      root!.hidden = false;
      root!.querySelectorAll<HTMLElement>('[data-rating-step]').forEach(el => { el.hidden = true; });
      setStatus('storage');
    }
  }
  const select = query<HTMLSelectElement>('[data-rating-mensa-select]');
  data.mensas.forEach(m => { const option = document.createElement('option'); option.value = m.mensaId; option.textContent = m.name; select.append(option); });
  query('[data-rating-other]').addEventListener('click', () => { query('[data-rating-other-picker]').hidden = false; select.focus(); });
  query('[data-rating-mensa-confirm]').addEventListener('click', () => {
    const choice = data.mensas.find(m => m.mensaId === select.value);
    if (choice) chooseMensa(choice); else { setStatus('chooseError'); select.focus(); }
  });
  // "Nowhere today" on a guess question also pauses guess questions for three days.
  query('[data-rating-skip]').addEventListener('click', () => {
    if (!prompt) return;
    try { store.resolve(prompt.date, true, prompt.kind === 'guess' ? 3 : 0); hide(); }
    catch { setStatus('choiceError'); }
  });
  query('[data-rating-elsewhere]').addEventListener('click', () => {
    mensa = undefined;
    step('mensa');
    query('[data-rating-other-picker]').hidden = false;
    select.focus();
  });
  query('[data-rating-dismiss]').addEventListener('click', () => { if (busy) return; if (prompt) resolve(true); else hide(); });
  root.querySelectorAll<HTMLElement>('[data-rating-back]').forEach(button => button.addEventListener('click', () => step(button.dataset.ratingBack as 'mensa' | 'meal')));
  root.querySelectorAll<HTMLButtonElement>('[data-rating-score]').forEach(button => button.addEventListener('click', async () => {
    if (!prompt || !mensa || !meal || busy) return;
    try {
      if (store.current()?.date !== prompt.date) { refresh(); return; }
      busy = true;
      root.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
      setStatus('saving');
      let duplicate = false;
      try {
        await saveMealRating({ userId: anonymousUserId(), mealId: meal.id, mensaId: mensa.mensaId,
          rating: Number(button.dataset.ratingScore) as Stars, ratedAt: now().toISOString(), mealDate: prompt.date,
          // A mensa picked from the list or "Other mensa" without a visit is a guess.
          source: mensa.source ?? 'guess', mealName: meal.name, mensaName: mensa.name }, localStorage, ratingsKey,
          simulated ? '' : API_URL);
      } catch (error) { if (error instanceof DuplicateMealRatingError) duplicate = true; else throw error; }
      store.resolve(prompt.date);
      feedback(duplicate ? 'duplicate' : simulated || !API_URL ? 'saved' : 'savedBackend', !duplicate);
    } catch { setStatus('saveError'); }
    finally { busy = false; root.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = false; }); }
  }));
  // Undo: delete the rating, open the date again and go back to the stars of the same meal.
  query<HTMLButtonElement>('[data-rating-undo]').addEventListener('click', async event => {
    const undo = event.currentTarget as HTMLButtonElement;
    if (!prompt || !meal || busy) return;
    if (closeTimer) clearTimeout(closeTimer);
    busy = true;
    undo.disabled = true;
    try {
      await undoMealRating({ userId: anonymousUserId(), mealId: meal.id }, localStorage, ratingsKey, simulated ? '' : API_URL);
      store.reopen(prompt.date);
      closing = false;
      undo.hidden = true;
      step('rate');
      setStatus('undone');
    } catch {
      setStatus('undoError');
      closeTimer = setTimeout(hide, 8000);
    } finally { busy = false; undo.disabled = false; }
  });
  // The simulator controls live in the developer tools (dev/DevTools.astro).
  const dev = import.meta.env.DEV ? document.querySelector<HTMLElement>('[data-rating-dev]') : null;
  if (dev) {
    const input = dev.querySelector<HTMLInputElement>('#rating-now')!;
    const devStatus = dev.querySelector<HTMLElement>('[data-rating-dev-status]')!;
    input.value = override ?? now().toISOString();
    devStatus.textContent = simulated ? 'Simulation active. Ratings and prompt state are isolated from normal use.' : 'Using the real clock. Apply a timestamp to enter isolated simulation.';
    dev.querySelector('[data-rating-open]')!.addEventListener('click', () => {
      try {
        // Open a fresh prompt with real fixture menus, keeping any simulated ratings.
        const date = data.meals.reduce((latest, option) => option.date > latest ? option.date : latest, '') || new Date().toISOString().slice(0, 10);
        localStorage.removeItem(`${STATE_KEY}:dev`);
        const url = new URL(location.href);
        // 13:00 UTC is inside the Zurich afternoon window in winter and summer.
        url.searchParams.set('ratingNow', `${date}T13:00:00Z`);
        location.assign(url);
      } catch { devStatus.textContent = 'Device storage is unavailable.'; (dev as HTMLDetailsElement).open = true; }
    });
    dev.querySelector('[data-rating-clock]')!.addEventListener('click', () => {
      if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(input.value) || !Number.isFinite(Date.parse(input.value))) { devStatus.textContent = 'Enter an ISO timestamp including Z or an explicit offset, such as +02:00.'; return; }
      const url = new URL(location.href); url.searchParams.set('ratingNow', input.value); location.assign(url);
    });
    dev.querySelector('[data-rating-reset]')!.addEventListener('click', () => {
      try { localStorage.removeItem(`${STATE_KEY}:dev`); localStorage.removeItem(`${RATINGS_KEY}:dev`); location.reload(); }
      catch { devStatus.textContent = 'Device storage is unavailable.'; }
    });
  }
  refresh();
  function renderDate() {
    if (prompt) query('[data-rating-date]').textContent = new Intl.DateTimeFormat(document.documentElement.lang === 'de' ? 'de-CH' : 'en-GB', { timeZone: 'Europe/Zurich', dateStyle: 'full' }).format(new Date(`${prompt.date}T12:00:00Z`));
  }
  document.addEventListener('languagechange', () => { translateRating(root!); renderDate(); });
  const interval = setInterval(refresh, 30_000);
  window.addEventListener('storage', refresh);
  document.addEventListener('campuseats:canteen-favourites-changed', refresh);
  document.addEventListener('campuseats:user-located', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', () => { clearInterval(interval); if (closeTimer) clearTimeout(closeTimer); }, { once: true });
}
