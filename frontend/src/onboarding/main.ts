import { saveProfile } from './api';
import { defaults } from './profile';
import { createOnboardingStore } from './onboardingStore';
import { pickTodaysDish } from './pickTodaysDish';
import { steps, skipStep, type Context, type OnboardingData } from './steps';
import { t, translate } from './i18n';
import { ONBOARDING_AUTO_START } from './config';

const root = document.querySelector<HTMLElement>('#onboarding');
if (root) initialise(root);

function initialise(root: HTMLElement) {
  const error = root.querySelector<HTMLElement>('[data-error]')!;
  const showError = () => { error.hidden = false; error.textContent = t('saveError'); };
  try {
    const data = JSON.parse(document.querySelector('#onboarding-data')!.textContent!) as OnboardingData;
    const store = createOnboardingStore(data.campuses.map(c => c.id), steps.length);
    const initial = defaults(data.campuses[0]!.id, localStorage.getItem('campuseats-language') === 'de' ? 'de' : 'en');
    const sections = steps.map(step => root.querySelector<HTMLElement>(`[data-step="${step.id}"]`)!);
    const flow = root.querySelector<HTMLElement>('[data-flow]')!;
    const payoff = root.querySelector<HTMLElement>('[data-payoff]')!;
    const next = root.querySelector<HTMLButtonElement>('[data-next]')!;
    const skip = root.querySelector<HTMLButtonElement>('[data-skip]')!;
    const progress = root.querySelector<HTMLProgressElement>('[data-progress]')!;
    let completed = false;
    const guard = (action: () => void) => { try { error.hidden = true; action(); } catch { showError(); } };
    const ctx: Context = { store, data,
      update(patch) { guard(() => { store.update(patch); refresh(); }); },
      refresh() { refresh(); },
    };
    const renders = steps.map((step, i) => step.mount(sections[i]!, ctx));

    function renderPayoff() {
      const p = store.state.profile;
      const pick = pickTodaysDish(p, data.mensas, data.meals);
      root.querySelector<HTMLElement>('[data-pick]')!.hidden = !pick;
      root.querySelector<HTMLElement>('[data-pick-empty]')!.hidden = !!pick;
      if (!pick) return;
      root.querySelector<HTMLElement>('[data-pick-title]')!.textContent = p.lang === 'de' ? pick.meal.titleDe ?? pick.meal.title : pick.meal.title;
      root.querySelector<HTMLElement>('[data-pick-mensa]')!.textContent = pick.mensa.name;
      root.querySelector<HTMLElement>('[data-pick-components]')!.textContent = pick.meal.components.join(' · ');
      root.querySelector<HTMLElement>('[data-pick-price]')!.textContent = pick.price === null ? t('unavailablePrice') : `CHF ${pick.price.toFixed(2)} · ${t(p.priceTier)}`;
      root.querySelector<HTMLAnchorElement>('[data-pick-link]')!.href = `/canteen/${encodeURIComponent(pick.mensa.id)}`;
    }
    function refresh() {
      translate(root);
      flow.hidden = completed; payoff.hidden = !completed;
      if (completed) { renderPayoff(); return; }
      const index = store.state.step;
      sections.forEach((section, i) => { section.hidden = i !== index; });
      renders.forEach(render => render());
      progress.max = steps.length; progress.value = index + 1;
      const label = `${t('step')} ${index + 1} ${t('of')} ${steps.length} · ${t(steps[index]!.titleKey)}`;
      root.querySelector<HTMLElement>('[data-progress-label]')!.textContent = label;
      progress.setAttribute('aria-label', label);
      next.dataset.obI18n = index === steps.length - 1 ? 'finish' : 'next';
      next.textContent = t(index === steps.length - 1 ? 'finish' : 'next');
      skip.hidden = !steps[index]!.skippable;
    }
    function move(step: number) {
      store.setStep(step); refresh();
      sections[step]!.querySelector<HTMLElement>('h1')!.focus();
      root.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    function finish() {
      saveProfile(store.state.profile);
      store.clear(); completed = true; refresh();
      payoff.querySelector<HTMLElement>('h1')!.focus();
      root.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    function advance() { if (store.state.step < steps.length - 1) move(store.state.step + 1); else finish(); }
    next.addEventListener('click', () => guard(advance));
    root.querySelector('[data-back]')!.addEventListener('click', () => guard(() => {
      if (store.state.step > 0) move(store.state.step - 1);
      else window.location.assign('/settings');
    }));
    skip.addEventListener('click', () => guard(() => {
      if (steps[store.state.step]!.id === 'campus') store.setPicks([]);
      store.update(skipStep(steps[store.state.step]!.id, { ...initial,
        lang: localStorage.getItem('campuseats-language') === 'de' ? 'de' : 'en' })); advance();
    }));
    root.querySelector('[data-edit]')!.addEventListener('click', () => guard(() => { completed = false; move(0); }));
    root.addEventListener('keydown', event => {
      // Native button, input and radio keys remain intact; Alt+arrows navigate steps.
      if (!event.altKey || completed) return;
      if (event.key === 'ArrowLeft' && store.state.step > 0) { event.preventDefault(); guard(() => move(store.state.step - 1)); }
      if (event.key === 'ArrowRight') { event.preventDefault(); guard(advance); }
    });
    document.addEventListener('languagechange', () => guard(() => {
      if (!completed) store.update({ lang: document.documentElement.lang === 'de' ? 'de' : 'en' });
      else store.state.profile.lang = document.documentElement.lang === 'de' ? 'de' : 'en';
      refresh();
    }));
    // Explicit /onboarding entry works regardless of this flag. No default redirect.
    root.dataset.autoStart = String(ONBOARDING_AUTO_START);
    const languageSelect = document.querySelector<HTMLSelectElement>('#language-select');
    if (languageSelect && languageSelect.value !== store.state.profile.lang) {
      languageSelect.value = store.state.profile.lang;
      languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    refresh();
  } catch { showError(); }
}
