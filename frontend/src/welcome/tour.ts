import { detectInstallKind, type InstallKind } from './installGuide';
import { nextWelcomeStep, welcomeStep, WELCOME_KEY, type WelcomeStep } from './state';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Copy = { title: string; description: string; next: string };
const copy: Record<'en' | 'de', Record<WelcomeStep, Copy> & { skip: string; progress: string; help: string; installAction: string }> = {
  en: {
    install: { title: 'Keep UniEats close', description: 'Add UniEats to your home screen for a quick way back to the menus.', next: 'Continue' },
    personalise: { title: 'Make it yours', description: 'Choose your campuses, food preferences and budget. It only takes a moment.', next: 'Personalise' },
    settings: { title: 'You are in control', description: 'Settings are always up there. Change any choice whenever you like.', next: 'Got it' },
    finish: { title: 'Guten Appetit!', description: 'Your next lunch is waiting. Enjoy exploring the menus.', next: 'Explore menus' },
    skip: 'Skip tour', progress: 'Step', help: 'Browser instructions', installAction: 'Install app',
  },
  de: {
    install: { title: 'UniEats immer griffbereit', description: 'Füge UniEats zum Startbildschirm hinzu, um schnell zu den Menüs zurückzukehren.', next: 'Weiter' },
    personalise: { title: 'Mach es zu deinem', description: 'Wähle Standorte, Essenswünsche und Budget. Das dauert nur kurz.', next: 'Personalisieren' },
    settings: { title: 'Du entscheidest', description: 'Hier oben findest du jederzeit die Einstellungen und kannst alles wieder ändern.', next: 'Verstanden' },
    finish: { title: 'Guten Appetit!', description: 'Dein nächstes Mittagessen wartet schon. Viel Spaß beim Entdecken.', next: 'Menüs entdecken' },
    skip: 'Tour überspringen', progress: 'Schritt', help: 'Browser-Anleitung', installAction: 'App installieren',
  },
};

const guide: Record<InstallKind, { en: string; de: string; href?: string; anchor: 'top' | 'bottom' }> = {
  installed: { en: 'Already installed. Open it from your home screen or app launcher.', de: 'Bereits installiert. Öffne die App über den Startbildschirm.', anchor: 'top' },
  'ios-safari': { en: 'Tap the Share button in Safari, then Add to Home Screen.', de: 'Tippe in Safari auf Teilen und dann auf Zum Home-Bildschirm.', href: 'https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph42ab2f3a7/ios', anchor: 'bottom' },
  'ios-other': { en: 'Open this page in Safari, then tap Share and Add to Home Screen.', de: 'Öffne diese Seite in Safari. Tippe auf Teilen und Zum Home-Bildschirm.', href: 'https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph42ab2f3a7/ios', anchor: 'bottom' },
  'ipad-safari': { en: 'Tap Share in Safari, then Add to Home Screen.', de: 'Tippe in Safari auf Teilen und dann auf Zum Home-Bildschirm.', href: 'https://support.apple.com/guide/ipad/turn-a-website-into-an-app-ipad8f1f7a29/ipados', anchor: 'top' },
  'android-chrome': { en: 'Tap the browser menu (⋮) and choose Install app or Add to Home screen.', de: 'Tippe auf das Browsermenü (⋮) und wähle App installieren oder Zum Startbildschirm hinzufügen.', href: 'https://support.google.com/chrome/answer/9658361', anchor: 'top' },
  'android-other': { en: 'Open the browser menu and look for Install app or Add to Home screen.', de: 'Öffne das Browsermenü und suche nach App installieren oder Zum Startbildschirm hinzufügen.', anchor: 'top' },
  'desktop-chrome': { en: 'Click the install icon in the address bar, or open the browser menu and choose Install page as app.', de: 'Klicke auf das Installationssymbol in der Adressleiste oder wähle im Browsermenü Seite als App installieren.', href: 'https://support.google.com/chrome/answer/9658361', anchor: 'top' },
  'desktop-edge': { en: 'Open the browser menu (⋯), then Apps and Install this site as an app.', de: 'Öffne das Browsermenü (⋯), dann Apps und Diese Website als App installieren.', href: 'https://support.microsoft.com/microsoft-edge/install-manage-or-uninstall-apps-in-microsoft-edge', anchor: 'top' },
  'desktop-safari': { en: 'Click Share in Safari, then Add to Dock.', de: 'Klicke in Safari auf Teilen und dann auf Zum Dock hinzufügen.', href: 'https://support.apple.com/guide/safari/turn-a-website-into-an-app-ibrw9e991864/mac', anchor: 'top' },
  other: { en: 'Look for an install option in your browser menu. You can continue without installing.', de: 'Suche im Browsermenü nach einer Installationsoption. Du kannst auch ohne Installation fortfahren.', anchor: 'top' },
};

export function mountWelcomeTour(): void {
  if (window.location.pathname !== '/') return;
  const root = document.querySelector<HTMLElement>('[data-welcome-tour]');
  if (!root) return;
  let saved: string | null = null;
  let hasProfile = false;
  try { saved = localStorage.getItem(WELCOME_KEY); hasProfile = localStorage.getItem('campuseats-profile') !== null; } catch { /* show first-visit tour */ }
  let step = welcomeStep(saved, hasProfile);
  if (!step) return;
  const dialog = root.querySelector<HTMLElement>('[data-welcome-dialog]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-welcome-next]')!;
  const install = root.querySelector<HTMLButtonElement>('[data-welcome-install]')!;
  const help = root.querySelector<HTMLAnchorElement>('[data-welcome-help]')!;
  const guideText = root.querySelector<HTMLElement>('[data-welcome-guide]')!;
  const settingsTarget = document.querySelector<HTMLElement>('[data-tour-settings-target]');
  let installPrompt: InstallPrompt | null = null;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const lang = () => document.documentElement.lang === 'de' ? 'de' : 'en';
  const kind = () => detectInstallKind(navigator.userAgent,
    window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    navigator.maxTouchPoints);
  const persist = (value: string) => { try { localStorage.setItem(WELCOME_KEY, value); } catch { /* storage blocked */ } };

  function close(): void {
    persist('done');
    step = null;
    root!.hidden = true;
    document.body.classList.remove('welcome-open');
    settingsTarget?.classList.remove('tour-settings-highlight');
    previousFocus?.focus();
  }
  function render(): void {
    if (!step) return;
    const language = lang();
    const content = copy[language][step];
    root!.dataset.step = step;
    root!.dataset.anchor = step === 'install' ? guide[kind()].anchor : 'top';
    root!.querySelector<HTMLElement>('[data-welcome-progress]')!.textContent = `${copy[language].progress} ${['install', 'personalise', 'settings', 'finish'].indexOf(step) + 1} / 4`;
    root!.querySelector<HTMLElement>('[data-welcome-skip]')!.textContent = copy[language].skip;
    root!.querySelector<HTMLElement>('[data-welcome-title]')!.textContent = content.title;
    root!.querySelector<HTMLElement>('[data-welcome-description]')!.textContent = content.description;
    next.textContent = content.next;
    const installGuide = guide[kind()];
    guideText.hidden = step !== 'install';
    guideText.textContent = installGuide[language];
    help.hidden = step !== 'install' || !installGuide.href;
    if (installGuide.href) help.href = installGuide.href;
    help.textContent = copy[language].help;
    install.hidden = step !== 'install' || !installPrompt || kind() === 'installed';
    install.textContent = copy[language].installAction;
    root!.querySelector<HTMLElement>('[data-welcome-image]')!.hidden = step !== 'finish';
    settingsTarget?.classList.toggle('tour-settings-highlight', step === 'settings');
    dialog.focus();
  }
  function advance(): void {
    if (!step) return;
    if (step === 'personalise') { persist('personalise'); window.location.assign('/onboarding'); return; }
    const following = nextWelcomeStep(step);
    if (following === 'done') { close(); return; }
    step = following;
    persist(step);
    render();
  }
  root.hidden = false;
  document.body.classList.add('welcome-open');
  root.querySelector('[data-welcome-skip]')!.addEventListener('click', close);
  next.addEventListener('click', advance);
  install.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    await prompt.prompt();
    await prompt.userChoice;
    render();
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    render();
  });
  window.addEventListener('appinstalled', render);
  document.addEventListener('languagechange', render);
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([hidden]),a:not([hidden])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  render();
}
