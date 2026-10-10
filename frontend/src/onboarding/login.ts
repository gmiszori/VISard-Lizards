// A UI-only demo session. Never use this flag to authorize API or account access.
const DEMO_SESSION_KEY = 'campuseats-demo-session';
const copy = {
  en: {
    navigation: 'Account', settings: 'Settings', login: 'Login',
    close: 'Close login', welcome: 'Welcome back.', intro: 'Find a lunch that fits your day.',
    email: 'Email address', password: 'Password', show: 'Show', hide: 'Hide',
    quickAccess: 'Just trying it out?', helperHint: 'Enter a demo session. No details needed.',
    previewNote: 'Login preview · Account connection coming soon.',
    unavailable: 'Account login is coming soon. Nothing was sent or saved. Use pass to try the demo.',
    demoAccount: 'Demo account', demoBadge: 'Demo session active', demoTitle: 'You’re in.',
    demoIntro: 'A little shortcut to your next lunch.',
    sessionHint: 'Make yourself at home. Your preferences stay on this device.',
    signout: 'Leave demo session',
    entered: 'You’re in — demo session active.', left: 'You’ve left the demo session.',
  },
  de: {
    navigation: 'Konto', settings: 'Einstellungen', login: 'Login',
    close: 'Login schließen', welcome: 'Willkommen zurück.', intro: 'Finde ein Mittagessen, das zu deinem Tag passt.',
    email: 'E-Mail-Adresse', password: 'Passwort', show: 'Zeigen', hide: 'Verbergen',
    quickAccess: 'Einfach ausprobieren?', helperHint: 'Starte eine Demo-Sitzung. Ganz ohne Angaben.',
    previewNote: 'Login-Vorschau · Kontoanbindung folgt bald.',
    unavailable: 'Der Konto-Login folgt bald. Nichts wurde gesendet oder gespeichert. Mit pass kannst du die Demo ausprobieren.',
    demoAccount: 'Demo-Konto', demoBadge: 'Demo-Sitzung aktiv', demoTitle: 'Du bist drin.',
    demoIntro: 'Eine kleine Abkürzung zu deinem nächsten Mittagessen.',
    sessionHint: 'Mach es dir gemütlich. Deine Einstellungen bleiben auf diesem Gerät.',
    signout: 'Demo-Sitzung verlassen',
    entered: 'Du bist drin — Demo-Sitzung aktiv.', left: 'Du hast die Demo-Sitzung verlassen.',
  },
};
type Key = keyof typeof copy.en;
const text = (key: Key) => copy[document.documentElement.lang === 'de' ? 'de' : 'en'][key];

const dialog = document.querySelector<HTMLDialogElement>('#login-dialog');
if (dialog) mountLogin(dialog);

function mountLogin(dialog: HTMLDialogElement) {
  const trigger = document.querySelector<HTMLButtonElement>('[data-login-open]')!;
  const form = dialog.querySelector<HTMLFormElement>('[data-login-form]')!;
  const password = dialog.querySelector<HTMLInputElement>('#login-password')!;
  const reveal = dialog.querySelector<HTMLButtonElement>('[data-login-reveal]')!;
  const feedback = dialog.querySelector<HTMLElement>('[data-login-feedback]')!;
  const toast = document.querySelector<HTMLElement>('[data-login-toast]')!;
  let demo = false;
  let notice: 'entered' | 'left' | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  try { demo = sessionStorage.getItem(DEMO_SESSION_KEY) === 'true'; } catch { /* In-memory demo still works. */ }

  function render() {
    document.querySelectorAll<HTMLElement>('[data-account-text]').forEach(el => {
      el.textContent = text(el.dataset.accountText as Key);
    });
    document.querySelectorAll<HTMLElement>('[data-account-aria]').forEach(el => {
      el.setAttribute('aria-label', text(el.dataset.accountAria as Key));
    });
    trigger.textContent = text(demo ? 'demoAccount' : 'login');
    dialog.querySelector('#login-title')!.textContent = text(demo ? 'demoTitle' : 'welcome');
    dialog.querySelector('#login-description')!.textContent = text(demo ? 'demoIntro' : 'intro');
    dialog.querySelector<HTMLElement>('[data-login-guest]')!.hidden = demo;
    dialog.querySelector<HTMLElement>('[data-login-session]')!.hidden = !demo;
    reveal.textContent = text(password.type === 'password' ? 'show' : 'hide');
    if (!feedback.hidden) feedback.textContent = text('unavailable');
    if (notice) toast.textContent = text(notice);
  }

  function announce(key: 'entered' | 'left') {
    notice = key;
    toast.textContent = text(key);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; notice = undefined; }, 4500);
  }

  function setDemo(active: boolean) {
    demo = active;
    try {
      if (active) sessionStorage.setItem(DEMO_SESSION_KEY, 'true');
      else sessionStorage.removeItem(DEMO_SESSION_KEY);
    } catch { /* No credentials or identity data are stored. */ }
    render();
    dialog.close();
    announce(active ? 'entered' : 'left');
  }

  trigger.addEventListener('click', () => {
    toast.hidden = true;
    dialog.showModal();
    document.documentElement.classList.add('login-is-open');
  });
  dialog.querySelector('[data-login-close]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('login-is-open');
    form.reset();
    password.type = 'password';
    reveal.setAttribute('aria-pressed', 'false');
    feedback.hidden = true;
    render();
    trigger.focus();
  });
  reveal.addEventListener('click', () => {
    password.type = password.type === 'password' ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(password.type === 'text'));
    reveal.textContent = text(password.type === 'password' ? 'show' : 'hide');
  });
  // Prevent every submit, even if native field validation fails. No credential request is made.
  form.addEventListener('submit', event => {
    event.preventDefault();
    password.value = '';
    feedback.hidden = false;
    feedback.textContent = text('unavailable');
  });
  dialog.querySelector('[data-login-pass]')!.addEventListener('click', () => setDemo(true));
  dialog.querySelector('[data-login-signout]')!.addEventListener('click', () => setDemo(false));
  document.addEventListener('languagechange', render);
  render();
}
