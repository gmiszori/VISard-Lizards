# Meal feedback

Astro components and a vanilla TypeScript controller follow the app's existing
framework. No React runtime, TSX renderer, or production dependency was added.

`getRatingPrompt(now, lastEatenCandidates, state)` is pure. All clock decisions use
Europe/Zurich, even on devices in another timezone. Its today window is
[13:30, 21:00); before 11:00 it targets yesterday. Candidate dates are optional:
profile recommendations are undated; dated visit candidates must match the target.
An empty recommendation list still offers Other mensa and No / skip.

`useRatingPrompt()` owns localStorage state at `campuseats-meal-rating-state`:
`resolvedDates`, `dismissedDates`, and `promptedDays` (Zurich day -> target date).
The extra day map prevents a yesterday prompt in the morning followed by another
prompt that afternoon. An unresolved target can resume after a reload. All
terminal choices are retained, not pruned. Missing menus resolve the target too.
Storage failures leave the choice unresolved and show retry feedback.

The four recommendations prefer saved favourites, then descending profile
`mensaRatings`. There is no visit history or rating frequency in Profile; its
ratings are preference scores, not counts.

## Persistence and DB alignment

`saveMealRating()` is the only rating save boundary, currently a local mock with
`TODO(backend)`. It writes `{userId, mealId, mensaId, rating, ratedAt, mealDate}`
to `campuseats-meal-ratings`. The persistent anonymous userId is a UUID with an
`anon:` prefix. The demo login is not authentication. A real account integration
must provide its trusted identity at this boundary.

Meal IDs come directly from DB `Meal.id`, and `mealDate` from `Meal.date`. The
picker filters by the exact mensa and target date; it never substitutes the
home screen's fallback menu date. Saved meal stars continue using names.
The frontend's bundled DB has no meal-rating table or authenticated user ID.
The separately developed backend branch now has `POST /api/meals/{id}/ratings`,
but accepts 1–5 `stars` and optional tags, with IP-based 24-hour throttling.
Its rating entity has no user identity or unique user/meal constraint, so it does
not yet implement this prompt's payload or duplicate rule. The mock remains
behind `saveMealRating()` until that contract is aligned; no scale conversion is
silently applied. Backend source reviewed: commit `7ec8898` on 2026-10-10.
Mensa aggregate ratings in the bundled frontend data are explicitly synthetic and use a separate 1–5 scale.
This feature uses the requested 1–3 scale without changing those aggregates.

The mock rejects duplicate `(userId, mealId)` pairs. Web Locks serialize writes
across browser tabs where supported. There is no cross-device/server uniqueness
until the backend supplies a UNIQUE(userId, mealId) constraint and validates the
meal, mensa, date, and trusted identity. No backend route was invented.

## Development simulator

The small **rate** button above the card opens a fresh, isolated development
prompt immediately. It uses the latest date with fixture menus and an afternoon
Zurich time. Only simulated prompt state is reset; simulated saved ratings remain,
so duplicate rejection can also be tried. The button is absent from production.

Run the existing `pnpm dev` script (background server: `pnpm exec astro dev --background`).
Open `http://localhost:4321/?ratingNow=2026-10-09T13%3A30%3A00%2B02%3A00`, or expand
"Meal-rating simulator · development only" and apply an ISO timestamp with an
explicit offset or Z. Invalid input shows a validation message.

When an override is active, prompt state and ratings use separate `:dev` storage
keys. "Reset simulated ratings" clears only those two simulation keys. Normal
ratings, profile, favourites, and anonymous identity are preserved. The panel
and override are compiled out of production; query parameters cannot override
the production clock.

Useful cases (sample menus cover 2026-09-28 through 2026-10-09):

- `2026-10-09T12:00:00+02:00`: no prompt.
- `2026-10-09T13:30:00+02:00`: today's prompt, menus available.
- `2026-10-09T20:59:00+02:00`: today's prompt.
- `2026-10-09T21:00:00+02:00`: no prompt.
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
