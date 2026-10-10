import { matchesMeal, normalizedName, starName, PROFILE_KEY, readStarredMeals, writeStarredMeals } from '../meals/stars';
import { askForPushOnce, syncLater } from '../push/optin';

const copy = {
  en: { featured: 'Your starred meals', savedTitle: 'Starred meals', savedHint: 'When these dishes return to the menu, we’ll bring them to the top. Saved on this device.', empty: 'No starred meals yet. Tap the star next to a dish to save it.', star: 'Star meal', unstar: 'Unstar meal', remove: 'Remove', menuFor: 'On the menu for', added: 'Starred', removed: 'Unstarred', error: 'Could not save your starred meals on this device.' },
  de: { featured: 'Deine markierten Gerichte', savedTitle: 'Markierte Gerichte', savedHint: 'Wenn diese Gerichte wieder auf dem Menü stehen, zeigen wir sie ganz oben. Auf diesem Gerät gespeichert.', empty: 'Noch keine markierten Gerichte. Tippe auf den Stern neben einem Gericht, um es zu speichern.', star: 'Gericht markieren', unstar: 'Markierung entfernen', remove: 'Entfernen', menuFor: 'Auf dem Menü am', added: 'Markiert', removed: 'Markierung entfernt', error: 'Deine markierten Gerichte konnten auf diesem Gerät nicht gespeichert werden.' },
};
type Key = keyof typeof copy.en;
const language = () => document.documentElement.lang === 'de' ? 'de' : 'en';
const t = (key: Key) => copy[language()][key];
const rows = [...document.querySelectorAll<HTMLElement>('[data-meal-row]')];
const cards = [...document.querySelectorAll<HTMLElement>('[data-canteen-card]')];
const originalOrder = new WeakMap<HTMLElement, number>([...rows, ...cards].map((node, i) => [node, i]));
const featured = document.querySelector<HTMLElement>('[data-starred-meals-section]');
const featuredGrid = document.querySelector<HTMLElement>('[data-starred-meals-grid]');
const savedList = document.querySelector<HTMLElement>('[data-saved-meals-list]');
let stars = readStarredMeals();
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function rank(a: HTMLElement, b: HTMLElement) {
  return Number(a.dataset.mealsAvailable === 'false') - Number(b.dataset.mealsAvailable === 'false') ||
    Number(b.dataset.mealStarred === 'true' && !b.hidden) - Number(a.dataset.mealStarred === 'true' && !a.hidden) ||
    (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0);
}

function render() {
  document.querySelectorAll<HTMLElement>('[data-meal-copy]').forEach(el => el.textContent = t(el.dataset.mealCopy as Key));
  rows.forEach(row => row.dataset.mealStarred = String(matchesMeal(row.querySelector<HTMLElement>('[data-meal-star]')?.dataset.mealName ?? '', stars)));
  document.querySelectorAll<HTMLElement>('[data-meal-list], [data-meal-group]').forEach(list => {
    const children = [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches('[data-meal-row]'));
    const after = children.length ? children[children.length - 1]!.nextElementSibling : null;
    children.sort(rank).forEach(row => list.insertBefore(row, after));
  });
  cards.forEach(card => {
    const available = [...card.querySelectorAll<HTMLElement>('[data-meal-row]')].filter(row => !row.hidden);
    card.dataset.mealsAvailable = String(available.length > 0);
    card.dataset.mealStarred = String(available.some(row => row.dataset.mealStarred === 'true'));
  });
  for (const id of ['canteen-grid', 'favourites-grid']) {
    const grid = document.getElementById(id);
    if (grid) [...grid.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches('[data-canteen-card]'))
      .sort(rank).forEach(card => grid.append(card));
  }

  if (featured && featuredGrid) {
    const current = rows.filter(row => row.dataset.mealStarred === 'true' && !row.hidden &&
      row.closest<HTMLElement>('[data-canteen-card]')?.hidden === false);
    featuredGrid.replaceChildren(...current.map(row => {
      const card = row.closest<HTMLElement>('[data-canteen-card]')!;
      const article = document.createElement('article');
      article.className = 'starred-today-meal';
      const clone = row.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-meal-row');
      article.append(clone);
      const location = document.createElement('a');
      location.className = 'starred-today-location';
      location.href = `/canteen/${encodeURIComponent(card.dataset.canteenId!)}`;
      location.textContent = card.dataset.name ?? '';
      const arrow = document.createElement('span');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '\u2197\uFE0E';
      location.append(' ', arrow);
      article.append(location);
      return article;
    }));
    featured.hidden = current.length === 0;
    const dateLabel = featured.querySelector<HTMLElement>('[data-starred-menu-date]');
    if (dateLabel) {
      const date = new Date(`${dateLabel.dataset.starredMenuDate}T12:00:00Z`);
      dateLabel.textContent = `${t('menuFor')} ${new Intl.DateTimeFormat(language(), { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'Europe/Zurich' }).format(date)}`;
    }
  }

  document.querySelectorAll<HTMLButtonElement>('[data-meal-star]').forEach(button => {
    const selected = matchesMeal(button.dataset.mealName ?? '', stars);
    button.setAttribute('aria-pressed', String(selected));
    const label = `${t(selected ? 'unstar' : 'star')}: ${button.dataset.mealName}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('span')!.textContent = selected ? '★' : '☆';
  });
  if (savedList) {
    savedList.replaceChildren(...stars.map(meal => {
      const li = document.createElement('li');
      const name = document.createElement('strong'); name.textContent = meal;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'saved-meal-remove'; remove.dataset.mealRemove = meal;
      remove.textContent = t('remove'); remove.setAttribute('aria-label', `${t('unstar')}: ${meal}`);
      li.append(name, remove); return li;
    }));
    const empty = document.querySelector<HTMLElement>('[data-starred-meals-empty]');
    if (empty) empty.hidden = stars.length > 0;
  }
}

function announce(message: string) {
  let notice = document.querySelector<HTMLElement>('[data-meal-stars-notice]');
  if (!notice) {
    notice = document.createElement('p'); notice.className = 'meal-stars-notice';
    notice.dataset.mealStarsNotice = ''; notice.setAttribute('role', 'status'); document.body.append(notice);
  }
  notice.textContent = message; notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 3500);
}

document.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-meal-star], [data-meal-remove]');
  if (!button) return;
  const removedName = button.dataset.mealRemove;
  const fullName = button.dataset.mealName;
  const name = removedName ?? (fullName ? starName(fullName) : '');
  if (!name) return;
  stars = readStarredMeals();
  const previous = removedName !== undefined ? stars.some(saved => normalizedName(saved) === normalizedName(removedName)) : matchesMeal(fullName!, stars);
  const next = previous ? stars.filter(saved => removedName !== undefined
    ? normalizedName(saved) !== normalizedName(removedName) : !matchesMeal(fullName!, [saved])) : [...stars, name];
  try { writeStarredMeals(next); }
  catch { announce(t('error')); return; }
  stars = next;
  render();
  if (button.isConnected) button.focus({ preventScroll: true });
  else {
    const counterpart = [...document.querySelectorAll<HTMLButtonElement>('[data-meal-star], [data-meal-remove]')]
      .find(el => fullName ? el.dataset.mealName === fullName : el.dataset.mealRemove === name);
    const fallback = document.querySelector<HTMLElement>('#saved-meals-title');
    if (counterpart) counterpart.focus({ preventScroll: true });
    else if (fallback) { fallback.tabIndex = -1; fallback.focus({ preventScroll: true }); }
  }
  announce(`${t(previous ? 'removed' : 'added')}: ${name}`);
  // Push for starred dishes: offered once on the first star; the server's list follows the stars.
  syncLater();
  if (!previous && removedName === undefined) void askForPushOnce(announce);
});
document.addEventListener('languagechange', render);
document.addEventListener('campuseats:preferences-applied', render);
document.addEventListener('campuseats:canteen-favourites-changed', render);
window.addEventListener('storage', event => {
  if (event.key === PROFILE_KEY || event.key === null) { stars = readStarredMeals(); render(); syncLater(); }
});
render();
// Catches changes made elsewhere (onboarding, another tab) and the language; skipped when nothing changed.
syncLater();
document.addEventListener('languagechange', syncLater);
