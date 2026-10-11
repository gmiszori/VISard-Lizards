import { translate, t } from '../onboarding/i18n';
import { mountBudgetSlider } from '../onboarding/budgetSlider';
import { readProfileSettings, writeProfileSettings, type EditableProfileSettings } from '../onboarding/profileSettings';
import { readPreferences, isPriceTier } from '../preferences/state';

/** Called by components/ProfileMealSettings.astro on the Settings page. */
export function mountProfileMealSettings() {
  const formElement = document.querySelector<HTMLFormElement>('#preferences-form');
  const budgetElement = formElement?.querySelector<HTMLInputElement>('[data-profile-budget]');
  const priceTier = formElement?.querySelector<HTMLSelectElement>('[data-price-tier]');
  if (!formElement || !budgetElement) return;
  // Non-null aliases: the helper functions below are hoisted, so TypeScript would not keep the narrowing above.
  const form = formElement;
  const budget = budgetElement;
  let settings = readProfileSettings();
  let tier = readPreferences().priceTier;
  if (priceTier) priceTier.value = tier;

  const rangeFor = (selectedTier: typeof tier) => ({
    min: Number(budget.dataset[`range${selectedTier[0]!.toUpperCase()}${selectedTier.slice(1)}Min`]),
    max: Number(budget.dataset[`range${selectedTier[0]!.toUpperCase()}${selectedTier.slice(1)}Max`]),
  });
  if (settings.priceTier && settings.priceTier !== tier) {
    const nextRange = rangeFor(tier);
    const maxPrice = settings.maxPrice === null || settings.maxPrice === undefined ? null
      : Math.min(nextRange.max - 0.5, Math.max(nextRange.min, settings.maxPrice));
    settings = { ...settings, priceTier: tier, maxPrice };
    try { writeProfileSettings({ priceTier: tier, maxPrice }); } catch { /* Continue with the saved preference tier in this view. */ }
  }
  const savedMessage = () => form.querySelector<HTMLElement>('#settings-saved');
  function announce(success: boolean) {
    const status = savedMessage();
    if (!status) return;
    const de = document.documentElement.lang === 'de';
    status.hidden = false;
    status.textContent = success ? (de ? 'Gespeichert' : 'Saved')
      : (de ? 'Diese Einstellungen konnten auf diesem Gerät nicht gespeichert werden.' : 'These settings could not be saved on this device.');
    if (success) status.dataset.i18n = 'settingsSaved'; else delete status.dataset.i18n;
  }
  function save(patch: EditableProfileSettings) {
    settings = { ...settings, ...patch };
    try { writeProfileSettings(patch); announce(true); }
    catch { announce(false); }
  }
  function renderBudget() {
    const range = rangeFor(tier);
    budget.min = String(range.min);
    budget.max = String(range.max);
    const rawValue = settings.maxPrice;
    const value = rawValue === null || rawValue === undefined ? range.max : Math.min(range.max - 0.5, Math.max(range.min, rawValue));
    budget.value = String(value);
    budget.style.setProperty('--budget-fill', `${(value - range.min) / Math.max(0.5, range.max - range.min) * 100}%`);
    const output = form.querySelector<HTMLOutputElement>('[data-profile-budget-value]');
    if (output) output.textContent = rawValue === null || rawValue === undefined
      ? t('noLimit') : `CHF ${value.toFixed(2)}`;
    const minimum = form.querySelector<HTMLElement>('[data-profile-budget-min]');
    if (minimum) minimum.textContent = `CHF ${range.min.toFixed(2)}`;
    budget.setAttribute('aria-valuetext', rawValue === null || rawValue === undefined
      ? t('noLimit') : `CHF ${value.toFixed(2)}`);
  }
  const render = () => {
    const selectedHard = new Set(settings.hard ?? []);
    form.querySelectorAll<HTMLInputElement>('[data-profile-hard]').forEach(input => { input.checked = selectedHard.has(input.value as NonNullable<EditableProfileSettings['hard']>[number]); });
    form.querySelectorAll<HTMLInputElement>('input[name="profile-price-mode"]').forEach(input => { input.checked = input.value === (settings.priceMode ?? 'soft'); });
    renderBudget();
    translate(form);
  };
  render();
  mountBudgetSlider(budget, value => {
    const range = rangeFor(tier);
    const maxPrice = value >= range.max ? null : value;
    save({ maxPrice });
    renderBudget();
  });

  form.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.matches('[data-profile-hard]')) {
      const hard = [...form.querySelectorAll<HTMLInputElement>('[data-profile-hard]:checked')]
        .map(input => input.value).filter((value): value is NonNullable<EditableProfileSettings['hard']>[number] =>
          ['no_pork', 'lactose_free', 'gluten_free', 'nut_free'].includes(value));
      save({ hard });
    } else if (target.name === 'profile-price-mode' && (target.value === 'soft' || target.value === 'hard')) {
      save({ priceMode: target.value });
    } else if (target === priceTier && isPriceTier(target.value)) {
      const previousRange = rangeFor(tier);
      const previous = settings.maxPrice;
      tier = target.value;
      const nextRange = rangeFor(tier);
      const maxPrice = previous === null || previous === undefined ? null
        : Math.min(nextRange.max - 0.5, Math.max(nextRange.min, previousRange.max === previous ? nextRange.max - 0.5 : previous));
      save({ priceTier: tier, maxPrice });
      renderBudget();
    }
  });
  document.addEventListener('languagechange', render);
  window.addEventListener('storage', event => {
    if (event.key === 'campuseats-profile' || event.key === 'campuseats-profile-overrides' || event.key === null) {
      settings = readProfileSettings();
      render();
    }
  });
}