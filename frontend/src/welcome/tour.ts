import { detectInstallKind, type InstallKind } from './installGuide';
import { nextWelcomeStep, welcomeStep, WELCOME_KEY, type WelcomeStep } from './state';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Copy = { title: string; description: string; next: string };
const copy: Record<'en' | 'de', Record<WelcomeStep, Copy> & { skip: string; close: string; progress: string; help: string; installAction: string }> = {
  en: {
    install: { title: 'Keep UniEats close', description: 'Add UniEats to your home screen for a quick way back to the menus.', next: 'Continue' },
    personalise: { title: 'Make it yours', description: 'Choose your campuses, food preferences and budget. It only takes a moment.', next: 'Personalise' },
    settings: { title: 'You are in control', description: 'Settings are always up there. Change any choice whenever you like.', next: 'Got it' },
    finish: { title: 'En Guete!', description: 'Your next lunch is waiting. Enjoy exploring the menus.', next: 'Explore menus' },
    skip: 'Skip tour', close: 'Close', progress: 'Welcome to UniEats', help: 'Browser instructions', installAction: 'Install app',
  },
  de: {
    install: { title: 'UniEats immer griffbereit', description: 'Füge UniEats zum Startbildschirm hinzu, um schnell zu den Menüs zurückzukehren.', next: 'Weiter' },
    personalise: { title: 'Mach es zu deinem', description: 'Wähle Standorte, Essenswünsche und Budget. Das dauert nur kurz.', next: 'Personalisieren' },
    settings: { title: 'Du entscheidest', description: 'Hier oben findest du jederzeit die Einstellungen und kannst alles wieder ändern.', next: 'Verstanden' },
    finish: { title: 'En Guete!', description: 'Dein nächstes Mittagessen wartet schon. Viel Spaß beim Entdecken.', next: 'Menüs entdecken' },
    skip: 'Tour überspringen', close: 'Schließen', progress: 'Willkommen bei UniEats', help: 'Browser-Anleitung', installAction: 'App installieren',
  },
};

export const guide: Record<InstallKind, { en: string; de: string; href?: string; hrefDe?: string; anchor: 'top' | 'bottom' }> = {
  installed: { en: 'Already installed. Open it from your home screen or app launcher.', de: 'Bereits installiert. Öffne die App über den Startbildschirm.', anchor: 'top' },
  'ios-safari': { en: 'Tap the Share button in Safari, then Add to Home Screen.', de: 'Tippe in Safari auf Teilen und dann auf Zum Home-Bildschirm.', href: 'https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph42ab2f3a7/ios', anchor: 'bottom' },
  'ios-other': { en: 'Open this page in Safari, then tap Share and Add to Home Screen.', de: 'Öffne diese Seite in Safari. Tippe auf Teilen und Zum Home-Bildschirm.', href: 'https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph42ab2f3a7/ios', anchor: 'bottom' },
  'ipad-safari': { en: 'Tap Share in Safari, then Add to Home Screen.', de: 'Tippe in Safari auf Teilen und dann auf Zum Home-Bildschirm.', href: 'https://support.apple.com/guide/ipad/turn-a-website-into-an-app-ipad8f1f7a29/ipados', anchor: 'top' },
  'android-chrome': { en: 'Tap the browser menu (⋮) and choose Install app or Add to Home screen.', de: 'Tippe auf das Browsermenü (⋮) und wähle App installieren oder Zum Startbildschirm hinzufügen.', href: 'https://support.google.com/chrome/answer/9658361', anchor: 'top' },
  'android-other': { en: 'Open the browser menu and look for Install app or Add to Home screen.', de: 'Öffne das Browsermenü und suche nach App installieren oder Zum Startbildschirm hinzufügen.', anchor: 'top' },
  'desktop-chrome': { en: 'Click the install icon in the address bar, or open the browser menu and choose Install page as app.', de: 'Klicke auf das Installationssymbol in der Adressleiste oder wähle im Browsermenü Seite als App installieren.', href: 'https://support.google.com/chrome/answer/9658361', anchor: 'top' },
  'desktop-edge': { en: 'Open the browser menu (⋯), then More tools, Apps and Install this site as an app.', de: 'Öffne das Browsermenü (⋯), dann Weitere Tools, Apps und Diese Website als App installieren.', href: 'https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge', hrefDe: 'https://support.microsoft.com/de-de/edge/install-manage-or-uninstall-apps-in-microsoft-edge', anchor: 'top' },
  'desktop-safari': { en: 'Click Share in Safari, then Add to Dock.', de: 'Klicke in Safari auf Teilen und dann auf Zum Dock hinzufügen.', href: 'https://support.apple.com/guide/safari/turn-a-website-into-an-app-ibrw9e991864/mac', anchor: 'top' },
  other: { en: 'Look for an install option in your browser menu. You can continue without installing.', de: 'Suche im Browsermenü nach einer Installationsoption. Du kannst auch ohne Installation fortfahren.', anchor: 'top' },
};

export function mountWelcomeTour(): void {
  const standaloneInstall = window.location.pathname.replace(/\/+$/, '') === '/settings';
  if (!standaloneInstall && window.location.pathname !== '/') return;
  const root = document.querySelector<HTMLElement>('[data-welcome-tour]');
  if (!root) return;
  let saved: string | null = null;
  let hasProfile = false;
  try { saved = localStorage.getItem(WELCOME_KEY); hasProfile = localStorage.getItem('campuseats-profile') !== null; } catch { /* keep the menus accessible when storage is blocked */ }
  let step: WelcomeStep | null = standaloneInstall
    ? (new URLSearchParams(window.location.search).get('install') === '1' ? 'install' : null)
    : welcomeStep(saved, hasProfile);
  const dialog = root.querySelector<HTMLElement>('[data-welcome-dialog]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-welcome-next]')!;
  const install = root.querySelector<HTMLButtonElement>('[data-welcome-install]')!;
  const help = root.querySelector<HTMLAnchorElement>('[data-welcome-help]')!;
  const guideText = root.querySelector<HTMLElement>('[data-welcome-guide]')!;
  const settingsTarget = document.querySelector<HTMLElement>('[data-tour-settings-target]');
  const settingsSpotlight = root.querySelector<HTMLElement>('[data-welcome-settings-spotlight]')!;
  const pointer = root.querySelector<HTMLElement>('.welcome-pointer')!;
  const appWindow = window as Window & { unieatsInstallPrompt?: InstallPrompt | null };
  let installPrompt: InstallPrompt | null = appWindow.unieatsInstallPrompt ?? null;
  let previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const lang = () => document.documentElement.lang === 'de' ? 'de' : 'en';
  const kind = () => detectInstallKind(navigator.userAgent,
    window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    navigator.maxTouchPoints);
  const persist = (value: string) => { try { localStorage.setItem(WELCOME_KEY, value); } catch { /* storage blocked */ } };

  function close(): void {
    if (!standaloneInstall) persist('done');
    step = null;
    root!.hidden = true;
    document.body.classList.remove('welcome-open');
    if (standaloneInstall) {
      const url = new URL(window.location.href);
      url.searchParams.delete('install');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      document.querySelector<HTMLElement>('.install-entry')?.focus();
    } else previousFocus?.focus();
  }
  function positionSettingsSpotlight(): void {
    if (step !== 'settings' || !settingsTarget) { settingsSpotlight.hidden = true; return; }
    const bounds = settingsTarget.getBoundingClientRect();
    settingsSpotlight.hidden = false;
    settingsSpotlight.textContent = settingsTarget.textContent;
    settingsSpotlight.style.left = `${bounds.left}px`;
    settingsSpotlight.style.top = `${bounds.top}px`;
    settingsSpotlight.style.width = `${bounds.width}px`;
    settingsSpotlight.style.height = `${bounds.height}px`;
    pointer.style.left = `${bounds.left + bounds.width / 2 - 11}px`;
    pointer.style.top = `${bounds.bottom + 9}px`;
  }
  function render(): void {
    if (!step) return;
    const language = lang();
    const content = copy[language][step];
    root!.dataset.step = step;
    root!.dataset.standalone = String(standaloneInstall);
    root!.dataset.anchor = step === 'install' ? guide[kind()].anchor : 'top';
    const progress = root!.querySelector<HTMLElement>('[data-welcome-progress]')!;
    progress.hidden = standaloneInstall;
    progress.textContent = copy[language].progress;
    const skip = root!.querySelector<HTMLElement>('[data-welcome-skip]')!;
    skip.hidden = standaloneInstall;
    skip.textContent = copy[language].skip;
    root!.querySelector<HTMLElement>('[data-welcome-title]')!.textContent = content.title;
    root!.querySelector<HTMLElement>('[data-welcome-description]')!.textContent = content.description;
    next.textContent = standaloneInstall ? copy[language].close : content.next;
    const installGuide = guide[kind()];
    guideText.hidden = step !== 'install';
    guideText.textContent = installGuide[language];
    const helpUrl = language === 'de' ? installGuide.hrefDe ?? installGuide.href : installGuide.href;
    help.hidden = step !== 'install' || !helpUrl;
    if (helpUrl) help.href = helpUrl;
    help.textContent = copy[language].help;
    install.hidden = step !== 'install' || !installPrompt || kind() === 'installed';
    install.textContent = copy[language].installAction;
    root!.querySelector<HTMLElement>('[data-welcome-image]')!.hidden = step !== 'finish';
    positionSettingsSpotlight();
    dialog.focus();
  }
  function advance(): void {
    if (!step) return;
    if (standaloneInstall) { close(); return; }
    if (step === 'personalise') { persist('personalise'); window.location.assign('/onboarding'); return; }
    const following = nextWelcomeStep(step);
    if (following === 'done') { close(); return; }
    step = following;
    persist(step);
    render();
  }
  function open(): void {
    root!.hidden = false;
    document.body.classList.add('welcome-open');
    render();
  }
  document.querySelector('[data-install-open]')?.addEventListener('click', () => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    step = 'install';
    open();
  });
  root.querySelector('[data-welcome-skip]')!.addEventListener('click', close);
  next.addEventListener('click', advance);
  install.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    appWindow.unieatsInstallPrompt = null;
    await prompt.prompt();
    await prompt.userChoice;
    render();
  });
  window.addEventListener('unieats:install-ready', () => {
    installPrompt = appWindow.unieatsInstallPrompt ?? null;
    render();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; render(); });
  document.addEventListener('languagechange', render);
  window.addEventListener('resize', positionSettingsSpotlight);
  window.addEventListener('scroll', positionSettingsSpotlight, { passive: true });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([hidden]),a:not([hidden])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  if (step) open();
}
