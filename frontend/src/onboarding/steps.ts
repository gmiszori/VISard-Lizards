import type { CampusId } from '../data/canteens';
import { syncChipSelect, mountChipSelect } from './chipSelect';
import { mountRankList, renderRankList } from './rankList';
import { t, translate, type Key } from './i18n';
import { pickMensas } from './pickMensas';
import { CUISINES, normaliseDislikes, type Profile } from './profile';
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
}
interface Step { id: string; titleKey: Key; skippable: boolean; mount(root: HTMLElement, ctx: Context): () => void }

const sync = (root: HTMLElement, name: string, values: string[]) => {
  const group = root.querySelector<HTMLElement>(`[data-chip-group="${name}"]`);
  if (group) syncChipSelect(group, values);
};

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
  slider.addEventListener('input', () => ctx.update({ maxPrice: Number(slider.value) === Number(slider.max) ? null : Number(slider.value) }));
  const rank = root.querySelector<HTMLElement>('[data-rank-list]')!;
  mountRankList(rank, () => ctx.store.state.profile.priority, priority => ctx.update({ priority }));
  return () => {
    const p = ctx.store.state.profile;
    const range = ctx.data.ranges[p.priceTier];
    sync(root, 'priceTier', [p.priceTier]); sync(root, 'priceMode', [p.priceMode]);
    slider.min = String(range.min); slider.max = String(range.max + 0.5);
    slider.value = String(p.maxPrice ?? range.max + 0.5);
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
      { mensaId, rating: Number(values[0]) as 1 | 2 | 3 }] });
  });
  root.querySelector('[data-no-ratings]')!.addEventListener('click', () => ctx.update({ mensaRatings: [] }));
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
    for (const id of picks) sync(root, `rating:${id}`, p.mensaRatings.filter(r => r.mensaId === id).map(r => String(r.rating)));
    root.querySelector<HTMLElement>('[data-ratings-empty]')!.hidden = picks.length > 0;
    root.querySelector('[data-no-ratings]')!.setAttribute('aria-pressed', String(p.mensaRatings.length === 0));
  };
}
function mountFinish(root: HTMLElement, ctx: Context) {
  const input = root.querySelector<HTMLInputElement>('#ob-dislike')!;
  const dislikes = root.querySelector<HTMLElement>('[data-dislikes]')!;
  const lunchTime = root.querySelector<HTMLInputElement>('#ob-lunch-time')!;
  const notify = root.querySelector<HTMLInputElement>('#ob-notify')!;
  mountChipSelect(root, ({ name, values }) => {
    const p = ctx.store.state.profile;
    if (name === 'lang') {
      const lang = values[0] as Profile['lang'];
      ctx.update({ lang });
      const select = document.querySelector<HTMLSelectElement>('#language-select');
      if (select) { select.value = lang; select.dispatchEvent(new Event('change', { bubbles: true })); }
    } else {
      const isCuisine = name === 'cuisines';
      ctx.update({ soft: [...p.soft.filter(value => CUISINES.includes(value) !== isCuisine), ...values] });
    }
  });
  root.querySelector('[data-dislike-form]')!.addEventListener('submit', event => {
    event.preventDefault();
    ctx.update({ dislikes: normaliseDislikes([...ctx.store.state.profile.dislikes, input.value]) });
    input.value = ''; input.focus();
  });
  dislikes.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-dislike-remove]');
    if (!button) return;
    ctx.update({ dislikes: ctx.store.state.profile.dislikes.filter(value => value !== button.dataset.dislikeRemove) });
    input.focus();
  });
  lunchTime.addEventListener('input', () => ctx.update({ lunchTime: lunchTime.value || null }));
  notify.addEventListener('change', () => ctx.update({ notifyDaily: notify.checked }));
  return () => {
    const p = ctx.store.state.profile;
    sync(root, 'soft', p.soft); sync(root, 'cuisines', p.soft); sync(root, 'lang', [p.lang]);
    lunchTime.value = p.lunchTime ?? ''; notify.checked = p.notifyDaily;
    dislikes.replaceChildren(...p.dislikes.map(value => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'ob-chip'; button.dataset.dislikeRemove = value;
      button.textContent = `${value} ×`; button.setAttribute('aria-label', `${t('remove')}: ${value}`);
      return button;
    }));
    root.querySelector<HTMLElement>('[data-dislikes-limit]')!.hidden = p.dislikes.length < 10;
  };
}

export const steps: Step[] = [
  { id: 'campus', titleKey: 'campusTitle', skippable: true, mount: mountCampus },
  { id: 'diet', titleKey: 'dietTitle', skippable: true, mount: mountDiet },
  { id: 'price', titleKey: 'priceTitle', skippable: true, mount: mountPrice },
  { id: 'ratings', titleKey: 'ratingsTitle', skippable: true, mount: mountRatings },
  { id: 'finish', titleKey: 'finishTitle', skippable: true, mount: mountFinish },
];

/** Skip resets this step to its documented defaults, including partially entered answers. */
export function skipStep(id: string, initial: Profile): Partial<Profile> {
  switch (id) {
    case 'campus': return { campus: initial.campus, campusSecondary: [], mensaRatings: [] };
    case 'diet': return { diet: initial.diet, hard: [] };
    case 'price': return { priceTier: initial.priceTier, maxPrice: null, priceMode: 'soft', priority: [...initial.priority] };
    case 'ratings': return { mensaRatings: [] };
    case 'finish': return { lang: initial.lang, soft: [], dislikes: [], lunchTime: null, notifyDaily: false };
    default: return {};
  }
}
