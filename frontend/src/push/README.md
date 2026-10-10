# Push notifications for starred dishes

"Tell me when it's back": a notification when a starred dish (`meals/stars.ts`) shows up on a new menu.
Backend side, payload and configuration: `backend/API.md`, section "Push notifications for starred dishes".

- `push.ts`: subscribe (`enablePush`, called from a click), unsubscribe, keep the server's dish list in step
  with the stars and the language (`syncStarredDishes`, skipped when nothing changed), test message.
- `optin.ts`: the one-time question after the **first** star. It says what is sent (the starred dish names
  and the browser's anonymous push address), how often (at most once a day, in the morning) and where to
  turn it off. The browser's permission prompt only comes after "Notify me". Shown once, whatever the answer,
  and only while the browser has not decided yet (`Notification.permission === 'default'`).
- `components/StarredMealsSettings.astro`: the switch in Settings under the starred dishes (which are the
  watched list), with a status line (blocked, unsupported, iPhone hint) and "Send a test notification".
- `public/sw.js`: the service worker. It only shows notifications and opens the canteen on click; no caching.
- `public/manifest.webmanifest`: makes the app installable; on iPhone and iPad push works only from the
  home screen.

Rules the backend enforces: at most one notification per subscription and day (daily job, 09:30 Zurich); a
dish already on a menu when it is starred does not trigger one; only the browsers' push services are accepted
as endpoints; subscriptions the push service reports as gone are deleted.

Local testing: Chrome or Edge on `http://localhost:4321/settings` (localhost counts as secure). The desktop
app's built-in browser blocks notifications. "Send a test notification" checks delivery; the real message
comes from the daily job.
