import { ApiError, apiPost } from '../data/api.ts';
import { readStarredMeals } from '../meals/stars.ts';
import { PUSH_EVENT, pushState, sendTestPush } from '../push/push.ts';

/**
 * Developer tools section "Push notifications": this browser's push state and the starred dishes the server
 * watches, a test message, and the daily starred-dish job on demand (needs the backend's internal API).
 */
export function mountPushPanel(): void {
  const root = document.querySelector<HTMLElement>('[data-dev-push]');
  if (!root) return;
  const status = root.querySelector<HTMLElement>('[data-dev-push-status]')!;

  async function run(forgetAnnounced: boolean) {
    status.textContent = 'Running the daily check…';
    try {
      const { sent } = await apiPost<{ sent: number }>(`/api/push/run?forgetAnnounced=${forgetAnnounced}`, {});
      status.textContent = sent === 0
        ? 'Done: no notification sent (no new starred dish on a menu, or no subscription).'
        : `Done: ${sent} notification${sent === 1 ? '' : 's'} sent. Check the backend log for the push service's answer.`;
    } catch (error) {
      status.textContent = error instanceof ApiError && error.status === 404
        ? 'Not available: start the backend with INTERNAL_API_ENABLED=true (app.internal-api.enabled).'
        : `Failed: ${(error as Error).message}`;
    }
  }

  root.querySelector('[data-dev-push-test]')!.addEventListener('click', async () => {
    status.textContent = 'Sending…';
    try { status.textContent = (await sendTestPush()) ? 'Test sent; the push service accepted it.' : 'Not sent: no subscription here, or the push service refused it.'; }
    catch (error) { status.textContent = `Failed: ${(error as Error).message}`; }
  });
  root.querySelector('[data-dev-push-run]')!.addEventListener('click', () => void run(false));
  root.querySelector('[data-dev-push-run-again]')!.addEventListener('click', () => void run(true));
  document.addEventListener(PUSH_EVENT, () => void renderPushPanel());
  void renderPushPanel();
}

export async function renderPushPanel(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-dev-push]');
  if (!root) return;
  const state = await pushState();
  const permission = typeof Notification === 'undefined' ? 'n/a' : Notification.permission;
  const worker = 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistration('/'))?.active?.state ?? 'none' : 'n/a';
  const dishes = readStarredMeals();
  root.querySelector<HTMLElement>('[data-dev-push-state]')!.textContent =
    `State: ${state} · permission: ${permission} · service worker: ${worker} · starred dishes: ${dishes.length ? dishes.join(', ') : 'none'}`;
}
