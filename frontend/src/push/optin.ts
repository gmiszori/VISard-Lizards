/**
 * Asked once, on the first starred dish: "Tell you when it's back?". Says what is sent, how often and
 * where to turn it off, before the browser's own permission prompt. Never shown again, whatever the answer.
 */
import { API_URL } from '../data/api.ts';
import { enablePush, markAsked, pushSupported, syncStarredDishes, wasAsked } from './push.ts';
import './push.css';

export const pushCopy = {
  en: {
    title: 'Tell you when it’s back?',
    body: 'We can notify you when a starred dish shows up on a new menu: at most one notification a day, in the morning. For this, your starred dishes are stored on the UniEats server with an anonymous browser address, nothing else.',
    where: 'You can turn it off any time in Settings.',
    yes: 'Notify me', no: 'Not now',
    on: 'Notifications are on.', denied: 'Notifications are blocked in your browser settings.', failed: 'Could not turn on notifications. Try again in Settings.',
  },
  de: {
    title: 'Bescheid geben, wenn es wieder da ist?',
    body: 'Wir können dich benachrichtigen, wenn ein markiertes Gericht auf einem neuen Menü steht: höchstens eine Nachricht pro Tag, am Morgen. Dafür speichern wir deine markierten Gerichte mit einer anonymen Browser-Adresse auf dem UniEats-Server, sonst nichts.',
    where: 'Du kannst es jederzeit in den Einstellungen ausschalten.',
    yes: 'Benachrichtige mich', no: 'Jetzt nicht',
    on: 'Benachrichtigungen sind an.', denied: 'Benachrichtigungen sind in deinen Browser-Einstellungen blockiert.', failed: 'Benachrichtigungen konnten nicht eingeschaltet werden. Versuche es in den Einstellungen erneut.',
  },
};
export const pushText = () => pushCopy[document.documentElement.lang === 'de' ? 'de' : 'en'];

/** Shows the opt-in if it was never shown and push can work here; resolves when it is closed. */
export async function askForPushOnce(announce: (message: string) => void): Promise<void> {
  if (wasAsked() || !pushSupported() || !API_URL || Notification.permission !== 'default') return;
  markAsked();
  const t = pushText();
  const dialog = document.createElement('dialog');
  dialog.className = 'push-optin';
  dialog.setAttribute('aria-labelledby', 'push-optin-title');
  const title = Object.assign(document.createElement('h2'), { id: 'push-optin-title', textContent: t.title });
  const body = Object.assign(document.createElement('p'), { textContent: t.body });
  const where = Object.assign(document.createElement('p'), { className: 'push-optin-where', textContent: t.where });
  const actions = Object.assign(document.createElement('div'), { className: 'push-optin-actions' });
  const no = Object.assign(document.createElement('button'), { type: 'button', className: 'push-optin-no', textContent: t.no });
  const yes = Object.assign(document.createElement('button'), { type: 'button', className: 'push-optin-yes', textContent: t.yes });
  actions.append(no, yes);
  dialog.append(title, body, where, actions);
  document.body.append(dialog);

  const opener = document.activeElement as HTMLElement | null;
  const close = () => { dialog.close(); dialog.remove(); opener?.focus({ preventScroll: true }); };
  no.addEventListener('click', close);
  dialog.addEventListener('cancel', () => dialog.remove());
  yes.addEventListener('click', async () => {
    yes.disabled = true; no.disabled = true;
    let message = t.failed;
    try {
      const state = await enablePush();
      message = state === 'on' ? t.on : state === 'denied' ? t.denied : t.failed;
    } catch { /* message stays "failed" */ }
    close();
    announce(message);
  });
  dialog.showModal();
  yes.focus();
}

/** Keeps the server's dish list in step with the stars; errors are retried on the next change. */
export function syncLater(): void {
  void syncStarredDishes().catch(() => { /* offline: next star change or page load sends it */ });
}
