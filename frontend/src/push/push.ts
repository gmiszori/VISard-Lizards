/**
 * Push notifications when a starred dish is back on a menu (backend: /api/push, see backend/API.md).
 * The service worker public/sw.js shows them. Nothing is subscribed without the user's explicit yes
 * (the opt-in in optin.ts or the switch in Settings); the browser's own permission prompt comes after that.
 */
import { API_URL, apiDelete, apiGet, apiPost, apiPut } from '../data/api.ts';
import { readStarredMeals } from '../meals/stars.ts';

/** { asked: true } once the opt-in was shown, so it is never shown again. */
export const PUSH_KEY = 'campuseats-push';
/** What was last sent to the backend, to skip identical updates. */
const SYNCED_KEY = 'campuseats-push-synced';
/** Dispatched on document after push was switched on or off. */
export const PUSH_EVENT = 'campuseats:push-changed';

/** unsupported: browser cannot; no-backend: no API; denied: blocked in the browser; off; on. */
export type PushState = 'unsupported' | 'no-backend' | 'denied' | 'off' | 'on';

export class PushWorkerUnavailableError extends Error {
  constructor() { super('The notification service worker did not become active.'); }
}

export class PushSubscriptionUnavailableError extends Error {
  constructor() { super('The browser push service did not respond.'); }
}

export class PushPermissionUnavailableError extends Error {
  constructor() { super('The browser did not finish the notification permission request.'); }
}

async function withTimeout<T>(operation: Promise<T>, error: Error, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(error), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

export const waitForWorkerReady = <T>(operation: Promise<T>, timeoutMs = 15000): Promise<T> =>
  withTimeout(operation, new PushWorkerUnavailableError(), timeoutMs);
export const waitForSubscriptionReady = <T>(operation: Promise<T>, timeoutMs = 15000): Promise<T> =>
  withTimeout(operation, new PushSubscriptionUnavailableError(), timeoutMs);
export const waitForPermission = <T>(operation: Promise<T>, timeoutMs = 30000): Promise<T> =>
  withTimeout(operation, new PushPermissionUnavailableError(), timeoutMs);

/** base64url (as the backend sends the VAPID key) to bytes for applicationServerKey. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameBytes(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const view = new Uint8Array(a);
  return view.every((byte, i) => byte === b[i]);
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window;
}

function storage(): Storage | null {
  try { return localStorage; } catch { return null; }
}

export function wasAsked(): boolean {
  try { return JSON.parse(storage()?.getItem(PUSH_KEY) ?? '{}')?.asked === true; } catch { return false; }
}

export function markAsked(): void {
  try { storage()?.setItem(PUSH_KEY, JSON.stringify({ asked: true })); } catch { /* not stored: may ask again */ }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await waitForWorkerReady(navigator.serviceWorker.getRegistration('/'));
  return registration ? await waitForSubscriptionReady(registration.pushManager.getSubscription()) : null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!API_URL) return 'no-backend';
  if (Notification.permission === 'denied') return 'denied';
  try { return (await currentSubscription()) && Notification.permission === 'granted' ? 'on' : 'off'; }
  catch { return 'off'; }
}

const language = () => (document.documentElement.lang === 'de' ? 'de' : 'en');

async function send(subscription: PushSubscription): Promise<void> {
  const body = { ...subscription.toJSON(), dishes: readStarredMeals().slice(0, 100), language: language() };
  const signature = JSON.stringify(body);
  await apiPut('/api/push/subscription', body);
  try { storage()?.setItem(SYNCED_KEY, signature); } catch { /* sent again next time */ }
}

/**
 * Asks the browser for permission (call from a click), subscribes with the backend's key and sends the
 * starred dishes. Returns the resulting state.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!API_URL) return 'no-backend';
  const permission = await waitForPermission(Notification.requestPermission());
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const registration = await waitForWorkerReady(navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  await waitForWorkerReady(navigator.serviceWorker.ready);
  const { publicKey } = await apiGet<{ publicKey: string }>('/api/push/public-key');
  const key = base64UrlToBytes(publicKey);
  let subscription = await waitForSubscriptionReady(registration.pushManager.getSubscription());
  // A subscription made with another server key (e.g. a reset backend) cannot receive our messages.
  if (subscription && !sameBytes(subscription.options.applicationServerKey, key)) {
    await waitForSubscriptionReady(subscription.unsubscribe());
    subscription = null;
  }
  subscription ??= await waitForSubscriptionReady(registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  await send(subscription);
  document.dispatchEvent(new Event(PUSH_EVENT));
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const subscription = pushSupported() ? await currentSubscription() : null;
  if (subscription) {
    // Delete on the server first: if that fails the user can try again, nothing is left behind.
    if (API_URL) await apiDelete('/api/push/subscription', { endpoint: subscription.endpoint });
    await waitForSubscriptionReady(subscription.unsubscribe());
  }
  try { storage()?.removeItem(SYNCED_KEY); } catch { /* ignore */ }
  document.dispatchEvent(new Event(PUSH_EVENT));
  return pushState();
}

/** Sends the current starred dishes and language when push is on and they changed. */
export async function syncStarredDishes(): Promise<void> {
  if (!pushSupported() || !API_URL || Notification.permission !== 'granted') return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  const body = { ...subscription.toJSON(), dishes: readStarredMeals().slice(0, 100), language: language() };
  if (storage()?.getItem(SYNCED_KEY) === JSON.stringify(body)) return;
  await send(subscription);
}

/** "Notifications are on" to this browser. */
export async function sendTestPush(): Promise<boolean> {
  const subscription = await currentSubscription();
  if (!subscription) return false;
  const result = await apiPost<{ delivered: boolean }>('/api/push/test', { endpoint: subscription.endpoint });
  return result.delivered;
}
