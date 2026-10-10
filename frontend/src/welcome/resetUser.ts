import { disablePush } from '../push/push';
import { clearAppCaches, clearAppStorage } from './state';

export async function resetAsNewUser(): Promise<void> {
  try {
    await disablePush();
  } catch {
    // Still remove the device subscription when the backend cannot be reached.
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
    } catch { /* browser push is unavailable */ }
  }
  clearAppStorage(window.localStorage);
  clearAppStorage(window.sessionStorage);
  if ('caches' in window) await clearAppCaches(window.caches);
  window.location.replace('/');
}
