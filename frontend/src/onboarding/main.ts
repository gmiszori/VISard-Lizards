import { saveProfile } from './api';
import { createOnboardingStore } from './onboardingStore';
import { pickTodaysDishOpenFirst } from './pickTodaysDish';
import { steps, type Context, type OnboardingData } from './steps';
import { eligibleRatingMensas } from './pickMensas';
import { adjacentStepIndex, visibleStepIndices } from './navigation';
import { t, translate } from './i18n';
import { ONBOARDING_AUTO_START } from './config';
import { appNow, zurichParts } from '../time/clock';
import { WELCOME_KEY } from '../welcome/state';

const root = document.querySelector<HTMLElement>('#onboarding');

/** A double-click or double-tap must not skip a step the visitor has not seen yet. */
const STEP_COOLDOWN_MS = 400;

/** Back on the first step: return to where the visitor came from, else to the overview (never to a page they did not visit). */
function leaveOnboarding() {
  let cameFromThisSite = false;
  try {
    const referrer = new URL(document.referrer);
    cameFromThisSite = referrer.origin === window.location.origin && referrer.pathname.replace(/\/+$/, '') !== '/onboarding';
  } catch { /* no referrer: go to the overview */ }
  if (cameFromThisSite && window.history.length > 1) window.history.back();
  else window.location.assign('/');
}

if (root) initialise(root);

function initialise(root: HTMLElement) {
  const error = root.querySelector<HTMLElement>('[data-error]')!;
  const showError = () => { error.hidden = false; error.textContent = t('saveError'); };
  try {
    const data = JSON.parse(document.querySelector('#onboarding-data')!.textContent!) as OnboardingData;
    const url = new URL(window.location.href);
    const restart = url.searchParams.get('restart') === '1';
    const editSavedProfile = url.searchParams.get('edit') === '1';
    const inWelcomeTour = !restart && !editSavedProfile && localStorage.getItem(WELCOME_KEY) === 'personalise';
    const flowSteps = steps;
    const store = createOnboardingStore(data.campuses.map(c => c.id), flowSteps.length, restart, editSavedProfile);
    if (restart || editSavedProfile) {
      // Consume the command so reloads resume this draft rather than resetting it.
      url.searchParams.delete('restart');
      url.searchParams.delete('edit');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    const sections = flowSteps.map(step => root.querySelector<HTMLElement>(`[data-step="${step.id}"]`)!);
    const flow = root.querySelector<HTMLElement>('[data-flow]')!;
    const payoff = root.querySelector<HTMLElement>('[data-payoff]')!;
    const next = root.querySelector<HTMLButtonElement>('[data-next]')!;
    const skip = root.querySelector<HTMLButtonElement>('[data-skip]')!;
    const progress = root.querySelector<HTMLProgressElement>('[data-progress]')!;
    let completed = false;
    let lastMoveAt = -Infinity;
    const settled = () => performance.now() - lastMoveAt >= STEP_COOLDOWN_MS;
    const guard =(action: () => void) => { try { error.hidden = true; action(); } catch { showError(); } };
    const ctx: Context = { store, data,
      update(patch) { guard(() => { store.update(patch); refresh(); }); },
      refresh() { refresh(); },
      advance() { guard(advance); },
    };
    const renders = flowSteps.map((step, i) => step.mount(sections[i]!, ctx));
    const availableSteps = () => visibleStepIndices(flowSteps.map(step => step.id),
      eligibleRatingMensas(data.mensas, store.state.profile).length > 0);

    function renderPayoff() {
      const p = store.state.profile;
      // "Today's pick" only when the menu is today's; the date line below the title names the day otherwise.
      const title = root.querySelector<HTMLElement>('[data-payoff] h1');
      if (title) {
        title.dataset.obI18n = data.menuDate === zurichParts(appNow()).date ? 'payoffTitle' : 'payoffTitleOtherDay';
        title.textContent = t(title.dataset.obI18n as 'payoffTitle' | 'payoffTitleOtherDay');
      }
      // Mensas without service on the menu's weekday only come into question when nothing else fits, and then with a warning.
      const { pick, closed } = pickTodaysDishOpenFirst(p, data.mensas, data.meals);
      const closedNote = root.querySelector<HTMLElement>('[data-pick-closed]');
      if (closedNote) closedNote.hidden = !closed;
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
      if (!completed) document.dispatchEvent(new CustomEvent('themepreferencechange', { detail: store.state.profile.theme }));
      flow.hidden = completed; payoff.hidden = !completed;
      if (completed) { renderPayoff(); return; }
      const visible = availableSteps();
      if (!visible.includes(store.state.step)) {
        store.setStep(adjacentStepIndex(visible, store.state.step, 1) ?? visible.at(-1)!);
      }
      const index = store.state.step;
      sections.forEach((section, i) => { section.hidden = i !== index; });
      renders.forEach(render => render());
      progress.max = visible.length; progress.value = visible.indexOf(index) + 1;
      const label = `${t('step')} ${progress.value} ${t('of')} ${visible.length} · ${t(flowSteps[index]!.titleKey)}`;
      root.querySelector<HTMLElement>('[data-progress-label]')!.textContent = label;
      progress.setAttribute('aria-label', label);
      next.dataset.obI18n = index === visible.at(-1) ? 'finish' : 'next';
      next.textContent = t(index === visible.at(-1) ? 'finish' : 'next');
    }
    function move(step: number) {
      lastMoveAt = performance.now();
      store.setStep(step); refresh();
      sections[step]!.querySelector<HTMLElement>('h1')!.focus();
      root.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    function finish() {
      lastMoveAt = performance.now();
      const saved = saveProfile(store.state.profile);
      if (inWelcomeTour && saved) {
        localStorage.setItem(WELCOME_KEY, 'settings');
        store.clear();
        window.location.replace('/');
        return;
      }
      store.clear(); completed = true; refresh();
      // If the device could not store the answers, say so instead of implying they were saved.
      payoff.querySelector<HTMLElement>('[data-save-note]')!.hidden = saved;
      payoff.querySelector<HTMLElement>('h1')!.focus();
      root.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    function advance() {
      if (!settled()) return;
      const nextStep = adjacentStepIndex(availableSteps(), store.state.step, 1);
      if (nextStep === null) finish(); else move(nextStep);
    }
    next.addEventListener('click', () => guard(advance));
    root.querySelector('[data-back]')!.addEventListener('click', () => guard(() => {
      if (!settled()) return;
      const previousStep = adjacentStepIndex(availableSteps(), store.state.step, -1);
      if (previousStep !== null) move(previousStep);
      else leaveOnboarding();
    }));
    skip.addEventListener('click', () => guard(() => {
      if (!settled()) return;
      finish();
    }));
    root.querySelector('[data-edit]')!.addEventListener('click', () => guard(() => { completed = false; move(0); }));
    root.addEventListener('keydown', event => {
      // Native button, input and radio keys remain intact; Alt+arrows navigate steps.
      if (!event.altKey || completed) return;
      if (event.key === 'ArrowLeft') {
        const previousStep = adjacentStepIndex(availableSteps(), store.state.step, -1);
        if (previousStep !== null) { event.preventDefault(); guard(() => { if (settled()) move(previousStep); }); }
      }
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
    if (!completed) root.scrollIntoView({ block: 'start', behavior: 'instant' });
    document.documentElement.setAttribute('data-ui-ready', '');
  } catch { showError(); document.documentElement.setAttribute('data-ui-ready', ''); }
}
