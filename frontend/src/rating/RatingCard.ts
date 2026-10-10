import { type MensaChoice, type RatingPrompt } from './getRatingPrompt.ts';
import { mensaCandidates, STATE_KEY, useRatingPrompt } from './useRatingPrompt.ts';
import { anonymousUserId, DuplicateMealRatingError, RATINGS_KEY, saveMealRating, type Stars } from './saveMealRating.ts';
import { API_URL, apiGet, type BackendMealDetail } from '../data/api.ts';
import type { Profile } from '../onboarding/profile';

interface MealOption { id: string; mensaId: string; date: string; name: string }
interface CardData { mensas: MensaChoice[]; meals: MealOption[] }
function readOptional<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; }
  catch { return null; }
}

export function mountRatingCard(): void {
  const root = document.querySelector<HTMLElement>('[data-rating-card]');
  const source = document.querySelector('[data-rating-data]');
  if (!root || !source) return;
  const data = JSON.parse(source.textContent ?? '{}') as CardData;
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const status = query('[data-rating-status]');
  // The override and isolated simulator storage are removed from production bundles.
  const override = import.meta.env.DEV ? new URL(location.href).searchParams.get('ratingNow') : null;
  const simulated = Boolean(override && /(?:Z|[+-]\d{2}:\d{2})$/.test(override) && Number.isFinite(Date.parse(override)));
  const now = () => simulated ? new Date(override!) : new Date();
  const stateKey = `${STATE_KEY}${simulated ? ':dev' : ''}`;
  const ratingsKey = `${RATINGS_KEY}${simulated ? ':dev' : ''}`;
  const profile = readOptional<Partial<Profile>>('campuseats-profile');
  const rawFavourites = readOptional<unknown>('campuseats-favourites');
  const favourites = Array.isArray(rawFavourites) ? rawFavourites.filter((id): id is string => typeof id === 'string') : [];
  const safeProfile = Array.isArray(profile?.mensaRatings) ? profile : null;
  const store = useRatingPrompt(now, mensaCandidates(data.mensas, safeProfile, favourites), localStorage, stateKey);
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
    if (closeTimer) clearTimeout(closeTimer);
  }
  function step(name: 'mensa' | 'meal' | 'rate', focus = true) {
    root!.querySelectorAll<HTMLElement>('[data-rating-step]').forEach(el => { el.hidden = el.dataset.ratingStep !== name; });
    status.textContent = '';
    if (focus) query(name === 'mensa' ? '#meal-rating-title' : `[data-rating-${name === 'meal' ? 'meal' : 'rate'}-heading]`).focus();
  }
  function feedback(message: string) {
    closing = true;
    root!.querySelectorAll<HTMLElement>('[data-rating-step]').forEach(el => { el.hidden = true; });
    status.textContent = message;
    status.tabIndex = -1;
    status.focus();
    closeTimer = setTimeout(hide, 2200);
  }
  function resolve(dismissed: boolean) {
    if (!prompt) return;
    try { store.resolve(prompt.date, dismissed); hide(); }
    catch { status.textContent = 'Could not save your choice on this device. Please try again.'; }
  }
  // Meals of the target day from the backend, so ids match what it stores; the bundled list is the fallback.
  const mealsByDate = new Map<string, Promise<MealOption[]>>();
  function mealsOn(date: string): Promise<MealOption[]> {
    if (!mealsByDate.has(date)) {
      mealsByDate.set(date, API_URL
        ? apiGet<BackendMealDetail[]>(`/api/meals?date=${encodeURIComponent(date)}`)
          // The API orders by id; show lunch before dinner like the menus.
          .then(list => [...list]
            .sort((a, b) => Number(a.meal.classification[2] === 'dinner') - Number(b.meal.classification[2] === 'dinner'))
            .map(m => ({ id: m.meal.id, mensaId: m.mensaId, date: m.date, name: m.meal.name })))
          .catch(() => { mealsByDate.delete(date); return data.meals.filter(m => m.date === date); })
        : Promise.resolve(data.meals.filter(m => m.date === date)));
    }
    return mealsByDate.get(date)!;
  }
  async function chooseMensa(choice: MensaChoice) {
    if (!prompt) return;
    mensa = choice;
    meal = undefined;
    const target = prompt.date;
    status.textContent = 'Loading meals…';
    const meals = (await mealsOn(target)).filter(m => m.mensaId === choice.mensaId);
    status.textContent = '';
    if (prompt?.date !== target || mensa !== choice) return;
    if (!meals.length) {
      try { store.resolve(prompt.date); feedback('No menu available for this date.'); }
      catch { status.textContent = 'Could not save your choice on this device. Please try again.'; }
      return;
    }
    query('[data-rating-mensa-name]').textContent = choice.name;
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
    step('meal');
  }
  function refresh() {
    if (busy || closing) return;
    try {
      const next = store.current();
      if (!next) { hide(); prompt = null; return; }
      store.shown(next.date);
      if (prompt?.date === next.date && !root!.hidden) return;
      prompt = next;
      mensa = undefined; meal = undefined;
      query('[data-rating-date]').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', dateStyle: 'full' }).format(new Date(`${next.date}T12:00:00Z`));
      const list = query('[data-rating-mensas]');
      list.replaceChildren();
      next.mensaChoices.forEach(choice => {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = choice.name;
        button.addEventListener('click', () => chooseMensa(choice));
        list.append(button);
      });
      query('[data-rating-other-picker]').hidden = true;
      root!.hidden = false;
      step('mensa', false);
    } catch {
      // Do not reset corrupt/unavailable storage and accidentally prompt twice.
      root!.hidden = false;
      root!.querySelectorAll<HTMLElement>('[data-rating-step]').forEach(el => { el.hidden = true; });
      status.textContent = 'Meal feedback needs device storage. Please enable it or dismiss this card.';
    }
  }
  const select = query<HTMLSelectElement>('[data-rating-mensa-select]');
  data.mensas.forEach(m => { const option = document.createElement('option'); option.value = m.mensaId; option.textContent = m.name; select.append(option); });
  query('[data-rating-other]').addEventListener('click', () => { query('[data-rating-other-picker]').hidden = false; select.focus(); });
  query('[data-rating-mensa-confirm]').addEventListener('click', () => {
    const choice = data.mensas.find(m => m.mensaId === select.value);
    if (choice) chooseMensa(choice); else { status.textContent = 'Choose a mensa to continue.'; select.focus(); }
  });
  query('[data-rating-skip]').addEventListener('click', () => resolve(true));
  query('[data-rating-dismiss]').addEventListener('click', () => { if (busy) return; if (prompt) resolve(true); else hide(); });
  root.querySelectorAll<HTMLElement>('[data-rating-back]').forEach(button => button.addEventListener('click', () => step(button.dataset.ratingBack as 'mensa' | 'meal')));
  root.querySelectorAll<HTMLButtonElement>('[data-rating-score]').forEach(button => button.addEventListener('click', async () => {
    if (!prompt || !mensa || !meal || busy) return;
    try {
      if (store.current()?.date !== prompt.date) { refresh(); return; }
      busy = true;
      root.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
      status.textContent = 'Saving…';
      let duplicate = false;
      try {
        await saveMealRating({ userId: anonymousUserId(), mealId: meal.id, mensaId: mensa.mensaId,
          rating: Number(button.dataset.ratingScore) as Stars, ratedAt: now().toISOString(), mealDate: prompt.date }, localStorage, ratingsKey,
          simulated ? '' : API_URL);
      } catch (error) { if (error instanceof DuplicateMealRatingError) duplicate = true; else throw error; }
      store.resolve(prompt.date);
      feedback(duplicate ? 'You already rated this meal. Thank you!'
        : simulated || !API_URL ? 'Thanks! Your meal rating is saved on this device.' : 'Thanks! Your meal rating is saved.');
    } catch { status.textContent = 'Could not save your rating. Please check your connection and try again.'; }
    finally { busy = false; root.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = false; }); }
  }));
  if (import.meta.env.DEV) {
    const dev = document.querySelector<HTMLElement>('[data-rating-dev]')!;
    const input = dev.querySelector<HTMLInputElement>('#rating-now')!;
    const devStatus = dev.querySelector<HTMLElement>('[data-rating-dev-status]')!;
    input.value = override ?? now().toISOString();
    devStatus.textContent = simulated ? 'Simulation active. Ratings and prompt state are isolated from normal use.' : 'Using the real clock. Apply a timestamp to enter isolated simulation.';
    document.querySelector('[data-rating-open]')!.addEventListener('click', () => {
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
  const interval = setInterval(refresh, 30_000);
  window.addEventListener('storage', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', () => { clearInterval(interval); if (closeTimer) clearTimeout(closeTimer); }, { once: true });
}
