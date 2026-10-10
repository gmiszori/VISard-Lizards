import type { CampusId } from '../data/canteens';
import { syncChipSelect, mountChipSelect } from './chipSelect';
import { mountRankList, renderRankList } from './rankList';
import { mountBudgetSlider } from './budgetSlider';
import { t, translate, type Key } from './i18n';
import { pickMensas } from './pickMensas';
import type { MensaRating, Profile } from './profile';
import type { OnboardingStore } from './onboardingStore';
import type { RecommendationMeal, RecommendationMensa } from './pickTodaysDish';

export interface OnboardingData {
  campuses: { id: CampusId; name: string }[];
  menuDate: string;
  mensas: RecommendationMensa[];
  meals: RecommendationMeal[];
  ratingCounts: Record<string, number>;
  ranges: Record<Profile['priceTier'], { min: number; max: number }>;
}
export interface Context {
  store: OnboardingStore;
  data: OnboardingData;
  update(patch: Partial<Profile>): void;
  refresh(): void;
  /** Go to the next step, or finish on the last one (like the Next/Finish button). */
  advance(): void;
}
interface Step { id: string; titleKey: Key; skippable: boolean; mount(root: HTMLElement, ctx: Context): () => void }

const sync = (root: HTMLElement, name: string, values: string[]) => {
  const group = root.querySelector<HTMLElement>(`[data-chip-group="${name}"]`);
  if (group) syncChipSelect(group, values);
};

function mountLanguage(root: HTMLElement, ctx: Context) {
  const select = root.querySelector<HTMLSelectElement>('#language-select')!;
  return () => { select.value = ctx.store.state.profile.lang; };
}

function mountCampus(root: HTMLElement, ctx: Context) {
  mountChipSelect(root, ({ name, values }) => {
    if (name === 'campus') {
      const campus = values[0] as CampusId;
      ctx.store.setPicks([]);
      ctx.update({ campus, campusSecondary: ctx.store.state.profile.campusSecondary.filter(id => id !== campus), mensaRatings: [] });
    } else {
      ctx.store.setPicks([]);
      ctx.update({ campusSecondary: values as CampusId[], mensaRatings: [] });
    }
  });
  return () => {
    const p = ctx.store.state.profile;
    sync(root, 'campus', [p.campus]); sync(root, 'campusSecondary', p.campusSecondary);
    root.querySelectorAll<HTMLButtonElement>('[data-chip-group="campusSecondary"] [data-value]').forEach(button => {
      button.disabled = button.dataset.value === p.campus;
    });
  };
}
function mountDiet(root: HTMLElement, ctx: Context) {
  mountChipSelect(root, ({ name, values }) => ctx.update(name === 'diet' ? { diet: values[0] as Profile['diet'] } : { hard: values as Profile['hard'] }));
  return () => { const p = ctx.store.state.profile; sync(root, 'diet', [p.diet]); sync(root, 'hard', p.hard); };
}
function mountTheme(root: HTMLElement, ctx: Context) {
  mountChipSelect(root, ({ values }) => {
    const theme = values[0] as Profile['theme'];
    ctx.update({ theme });
  });
  return () => sync(root, 'theme', [ctx.store.state.profile.theme]);
}
function mountPrice(root: HTMLElement, ctx: Context) {
  const slider = root.querySelector<HTMLInputElement>('#ob-budget')!;
  mountChipSelect(root, ({ name, values }) => {
    if (name === 'priceTier') {
      const priceTier = values[0] as Profile['priceTier'];
      const range = ctx.data.ranges[priceTier];
      const old = ctx.store.state.profile.maxPrice;
      ctx.update({ priceTier, maxPrice: old === null ? null : Math.min(range.max, Math.max(range.min, old)) });
    } else ctx.update({ priceMode: values[0] as Profile['priceMode'] });
  });
  mountBudgetSlider(slider, value => ctx.update({ maxPrice: value === Number(slider.max) ? null : value }));
  const rank = root.querySelector<HTMLElement>('[data-rank-list]')!;
  mountRankList(rank, () => ctx.store.state.profile.priority, priority => ctx.update({ priority }));
  return () => {
    const p = ctx.store.state.profile;
    const range = ctx.data.ranges[p.priceTier];
    sync(root, 'priceTier', [p.priceTier]); sync(root, 'priceMode', [p.priceMode]);
    // Reassigning range bounds during input can interrupt an active mobile drag.
    const min = String(range.min), max = String(range.max + 0.5);
    const value = String(p.maxPrice ?? range.max + 0.5);
    if (slider.min !== min) slider.min = min;
    if (slider.max !== max) slider.max = max;
    if (slider.value !== value) slider.value = value;
    slider.style.setProperty('--ob-budget-fill', `${(Number(slider.value) - range.min) / (range.max + 0.5 - range.min) * 100}%`);
    const label = p.maxPrice === null ? t('noLimit') : `CHF ${p.maxPrice.toFixed(2)}`;
    slider.setAttribute('aria-valuetext', label);
    root.querySelector<HTMLOutputElement>('[data-budget-value]')!.textContent = label;
    root.querySelector<HTMLElement>('[data-budget-min]')!.textContent = `CHF ${range.min.toFixed(2)}`;
    renderRankList(rank, p.priority);
  };
}
function mountRatings(root: HTMLElement, ctx: Context) {
  const rows = root.querySelector<HTMLElement>('[data-rating-rows]')!;
  const template = root.querySelector<HTMLTemplateElement>('#ob-rating-template')!;
  let rendered = '';
  mountChipSelect(rows, ({ name, values }) => {
    const mensaId = name.slice('rating:'.length);
    ctx.update({ mensaRatings: [...ctx.store.state.profile.mensaRatings.filter(r => r.mensaId !== mensaId),
      { mensaId, rating: Number(values[0]) as MensaRating }] });
  });
  // "I haven't been to any of these" answers the step: no ratings, then continue (finish on the last step).
  root.querySelector('[data-no-ratings]')!.addEventListener('click', () => { ctx.update({ mensaRatings: [] }); ctx.advance(); });
  return () => {
    if (ctx.store.state.step !== steps.findIndex(step => step.id === 'ratings')) return;
    const p = ctx.store.state.profile;
    const allowed = new Set([p.campus, ...p.campusSecondary]);
    const eligible = ctx.data.mensas.filter(m => m.hasMenu && !m.temporarilyClosed && allowed.has(m.campusId));
    const oldPicks = ctx.store.state.picks;
    if (!oldPicks.length || oldPicks.some(id => !eligible.some(m => m.id === id))) {
      ctx.store.setPicks(pickMensas(eligible, ctx.data.ratingCounts, p, Math.random).map(m => m.id));
    }
    const picks = ctx.store.state.picks;
    const signature = picks.join('|');
    if (signature !== rendered) {
      rows.replaceChildren();
      for (const id of picks) {
        const fragment = template.content.cloneNode(true) as DocumentFragment;
        const name = ctx.data.mensas.find(m => m.id === id)!.name;
        fragment.querySelector<HTMLElement>('[data-mensa-name]')!.textContent = name;
        const group = fragment.querySelector<HTMLElement>('[data-chip-group]')!;
        group.dataset.chipGroup = `rating:${id}`;
        group.querySelector('[role="radiogroup"]')!.setAttribute('aria-label', name);
        group.querySelector('[role="radiogroup"]')!.removeAttribute('data-ob-aria');
        rows.append(fragment);
      }
      rendered = signature;
    }
    translate(rows);
    for (const id of picks) {
      const rating = p.mensaRatings.find(r => r.mensaId === id)?.rating;
      sync(root, `rating:${id}`, rating ? [String(rating)] : []);
      const group = root.querySelector<HTMLElement>(`[data-chip-group="rating:${id}"]`)!;
      group.querySelectorAll<HTMLButtonElement>('[data-value]').forEach(button => {
        const filled = Number(button.dataset.value) <= (rating ?? 0);
        button.dataset.filled = String(filled);
        button.querySelector('[data-star]')!.textContent = filled ? '★' : '☆';
        button.setAttribute('aria-label', `${button.dataset.value} ${t('outOfFiveStars')}`);
      });
      group.querySelector<HTMLElement>('[data-rating-value]')!.textContent = rating ? `${rating} / 5` : t('notRated');
    }
    root.querySelector<HTMLElement>('[data-ratings-empty]')!.hidden = picks.length > 0;
    root.querySelector('[data-no-ratings]')!.setAttribute('aria-pressed', String(p.mensaRatings.length === 0));
  };
}
export const steps: Step[] = [
  { id: 'language', titleKey: 'languageTitle', skippable: true, mount: mountLanguage },
  { id: 'campus', titleKey: 'campusTitle', skippable: true, mount: mountCampus },
  { id: 'diet', titleKey: 'dietTitle', skippable: true, mount: mountDiet },
  { id: 'theme', titleKey: 'themeTitle', skippable: true, mount: mountTheme },
  { id: 'price', titleKey: 'priceTitle', skippable: true, mount: mountPrice },
  { id: 'ratings', titleKey: 'ratingsTitle', skippable: true, mount: mountRatings },
];

/** Skip resets this step to its documented defaults, including partially entered answers. */
export function skipStep(id: string, initial: Profile): Partial<Profile> {
  switch (id) {
    case 'campus': return { campus: initial.campus, campusSecondary: [], mensaRatings: [] };
    case 'diet': return { diet: initial.diet, hard: [] };
    case 'theme': return { theme: initial.theme };
    case 'price': return { priceTier: initial.priceTier, maxPrice: null, priceMode: 'soft', priority: [...initial.priority] };
    case 'ratings': return { mensaRatings: [] };
    default: return {};
  }
}
