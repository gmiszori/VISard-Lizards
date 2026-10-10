# Meal feedback

Astro components and a vanilla TypeScript controller follow the app's existing
framework. No React runtime, TSX renderer, or production dependency was added.

`getRatingPrompt(now, candidates, state)` is pure. All clock decisions use Europe/Zurich, even on
devices in another timezone. When the question comes (decided 2026-10-10):

- **Visits** (`location/visits.ts`): being located at a mensa during a service, or reporting its crowd
  ("How busy is it right now?"), records the arrival and the expected queue wait (crowd indicator or the
  reported level). The question about today comes once the meal is probably eaten:
  arrival + queue wait + 20 minutes (`readyAt`), on the next page load or 30-second check, until 23:00
  (lunch and dinner). Before 11:00 it asks about yesterday's visits.
- With **one** visited mensa the card opens straight on its meals, with a flat "I ate somewhere else" link.
- **Without location** (no near-me preference and no location visit stored): from 14:00, once a day,
  "Where did you eat today?" with up to three suggestions (favourites, profile ratings, else defaults) and
  "Nowhere today", which also pauses this question for three more days (`quietUntil`). No guess while a
  visit of today is still waiting for its `readyAt`.

`useRatingPrompt()` owns localStorage state at `campuseats-meal-rating-state`:
`resolvedDates`, `dismissedDates`, `promptedDays` (Zurich day -> target date) and `quietUntil`.
The extra day map prevents a yesterday prompt in the morning followed by another
prompt that afternoon. An unresolved target can resume after a reload. All
terminal choices are retained, not pruned. Missing menus resolve the target too.
Storage failures leave the choice unresolved and show retry feedback.

The visit question offers up to four mensas visited on the target date. Saved favourites and profile
`mensaRatings` are only suggestions for the guess question (and the development simulator); they are
not evidence of a visit.

## Persistence and backend

`saveMealRating()` is the only rating save boundary. With a backend (`PUBLIC_API_URL`, see
`src/data/api.ts`) it sends rating data to `POST /api/meals/{id}/ratings`. `X-User-Id` from the trusted reverse
proxy identifies the user when present; the request userId is only a local-development fallback. `source` is `location`
(located there), `crowd` (reported its crowd) or `guess` (picked from suggestions or "Other mensa");
the backend counts `crowd` and `guess` ratings half in the average. The backend stores
1–5 stars, enforces one rating per `(userId, mealId)` with a unique constraint (`409` →
`DuplicateMealRatingError`) and returns the meal's mensa and date plus the server's `ratedAt`.
Every saved rating is also kept in `campuseats-meal-ratings` on the device. The persistent anonymous
userId is a UUID with an `anon:` prefix and is used only when the trusted proxy identity is unavailable.

Ratings use 1–5 stars (decided 2026-10-10, replacing the earlier 1–3 scale), the same scale as the
mensa ratings. In the development simulator (`?ratingNow=`), ratings stay on the device only.

The picker loads the target day's meals from `GET /api/meals?date=`, so meal ids match the backend.
Without a backend it falls back to the bundled DB (`Meal.id`, `Meal.date`). It filters by the exact
mensa and target date and never substitutes the home screen's fallback menu date.

Without a backend, the device copy rejects duplicate `(userId, mealId)` pairs. Web Locks serialize writes
across browser tabs where supported. Across devices, uniqueness holds only per anonymous id: the
backend validates the meal and derives mensa and date from it, but it cannot tell that two anonymous
ids belong to the same person.

## Development simulator

The developer tools (Dev mode) have a **Meal-rating prompt** section. "Open rating prompt" opens a
fresh, isolated development prompt immediately. It uses the latest date with fixture menus and an afternoon
Zurich time. Only simulated prompt state is reset; simulated saved ratings remain,
so duplicate rejection can also be tried. The button is absent from production.

Run the existing `pnpm dev` script (background server: `pnpm exec astro dev --background`).
Open `http://localhost:4321/?ratingNow=2026-10-09T14%3A00%3A00%2B02%3A00`, or apply an ISO timestamp
with an explicit offset or Z in that section. The section's simulated time is separate from the developer
tools' "Simulated time", which drives the normal (non-isolated) prompt. Invalid input shows a validation message.

When an override is active, prompt state and ratings use separate `:dev` storage
keys. "Reset simulated ratings" clears only those two simulation keys. Normal
ratings, profile, favourites, and anonymous identity are preserved. The panel
and override are compiled out of production; query parameters cannot override
the production clock.

Useful cases (sample menus cover 2026-09-28 through 2026-10-09):

- `2026-10-09T13:59:00+02:00`: no prompt (suggestions only, before 14:00).
- `2026-10-09T14:00:00+02:00`: "Where did you eat today?", menus available.
- `2026-10-09T22:59:00+02:00`: today's prompt.
- `2026-10-09T23:00:00+02:00`: no prompt.
- `2026-10-10T10:59:00+02:00`: yesterday, unless resolved/dismissed already.
- `2026-10-10T11:00:00+02:00`: no prompt.
- Select Other mensa -> food&lab: no menu feedback, then closes.
- Answer or dismiss, reload, then advance the clock: resolved targets stay hidden.
- Morning prompt followed by the same day's afternoon: no second target.

`pnpm test` includes the pure eligibility and persistence tests as well as the
existing onboarding suite. `pnpm check` runs the repository's Astro/TypeScript
diagnostics; `pnpm build` creates the production preview. There is no lint script.
Node type definitions are a dev-only dependency for typechecking the existing
and new Node test files. The lockfile now also includes the previously missing
onboarding checker/TypeScript development dependencies.
