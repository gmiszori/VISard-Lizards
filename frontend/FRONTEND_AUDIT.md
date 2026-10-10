# CampusEats frontend audit after teammate updates

Audit date: 2026-10-10. Scope: the current Astro frontend, its stored state, and the backend contracts it consumes. This is a prioritised implementation backlog, with a separate comprehensive regression checklist and reusable test prompt. It is not a claim that every listed scenario has passed.

## Pulled and reconciled

- Fetched `origin`; merged `origin/main` at `200539c` and `origin/feature/connect-backend` at `2abbf54` into `feature/meal-rating`.
- `origin/backend` also pointed to `2abbf54`; merging it separately would add nothing.
- Local merge commits: `814e4cf` and `3a72227`. Preserved the ongoing audit changes using a stash checkpoint, then resolved conflicts in the home page, rating buttons and persistence tests.
- Teammate work now supplies backend menu loading, live import/translation repairs, anonymous-user rating uniqueness and 15-minute crowd histograms. Earlier backend notes based on `7ec8898` are historical and must not be treated as the current implementation.

## What was actually verified

| Verification | Result | Limit |
|---|---|---|
| `pnpm check` | 0 errors, 0 warnings, 0 hints | Static types do not validate network JSON |
| `pnpm test` | 53 passed, 0 failed | Node unit tests; API saves use mocked fetch |
| `pnpm build` | Passed; 25 static pages | Backend unavailable; build used sample menus |
| `git diff --check` | Passed | Whitespace/conflict hygiene only |
| Responsive overflow checks | 28 combinations passed | Four routes × seven CSS widths; Chromium emulation |
| Widths | 320, 360, 390, 430, 768, 1024, 1440 | Height 844; mobile emulation; not seven physical devices |
| Routes | `/`, `/settings`, `/onboarding`, `/canteen/uzh-zzm` | Onboarding initial screen, not every step at every width |
| Invalid search | Long HTML-looking text + emoji showed empty results; clearing restored 22 canteens | Does not prove complete XSS coverage |
| First-use rating | Polyterrasse, UZH Untere Mensa, Other mensa, No / skip visible | No personal mensa selections in this test origin |
| Rating walkthrough | Keyboard opened preview → Polyterrasse → Chili sin Carne → German five-star controls → local simulated save confirmation | No live backend POST; save intentionally isolated by `ratingNow` |
| Rating touch target geometry | At 320px, all five buttons ≈46px wide and ≥96px high | Other controls still need complete target audit |
| Lint | No lint script exists | `check` is not a substitute for a configured linter |
| Backend connectivity | `localhost:8080/api/meta` timed out; build fetch failed | No backend build, DB migration or real API end-to-end pass claimed |

Evidence delivered alongside this report: `responsive-evidence.json`, `merged-rating-mobile.png`. Physical iOS/Android, Safari/Firefox, true touch drags, all offline/error branches, load testing and live API correctness remain to be executed. Test checklist boxes deliberately remain unchecked until individually evidenced.

## Fixes already made during this audit

1. Added default rating suggestions for users without valid favourite/profile selections: **Mensa Polyterrasse** and **UZH Untere Mensa**, with Other mensa and prominent No / skip retained.
2. Guarded malformed `mensaRatings`, removed duplicate candidate IDs and refreshed candidates after preference/favourite changes.
3. Extracted preference normalisation; invalid stored objects, wrong boolean types, legacy campus labels and broken JSON now fall back safely. An intentional empty campus selection stays empty.
4. Guarded language/theme storage reads and writes so denied storage cannot abort the shared layout script.
5. Preference changes still apply for the current page if persistence fails, with an honest failure notice. Favourite changes report storage failures instead of pretending to persist.
6. Added cross-tab preference/favourite refresh handling.
7. Fixed meal-name matching to use Unicode word boundaries and escaped regex characters: starring `Ham` no longer matches `Champignon`.
8. Fixed the same substring problem in the no-pork heuristic (`Champignon` and `Hamburger` regression cases).
9. Distinguished missing menu data from menus excluded by food preferences.
10. Translated the meal-rating flow and accessible score labels into German; opening-hours text and search accessible labels follow language changes.
11. Guarded unavailable storage in the rating card; preserved teammate five-star/backend integration during conflict resolution.
12. Added regression tests for preference corruption/storage failures, meal matching, fallback mensas and sparse/invalid crowd values. Removed an unused config import that produced a checker hint.

Primary changed areas: `src/preferences/`, `src/rating/`, `src/meals/`, `src/onboarding/constraints*`, `src/scripts/preferences.ts`, `src/scripts/live-status.ts`, `src/pages/index.astro`, `src/layouts/BaseLayout.astro`, card/search components and test script. No dependency added.

## Remaining fixes and improvements

Status: **C** = confirmed by code inspection or observed UI; **R** = risk requiring a targeted reproduction/integration test; **I** = improvement, not a demonstrated defect; **D** = requirements decision. P1 blocks reliable real-data use; P2 is ordinary correctness/UX work; P3 is polish/tooling. These are separate from the fixed items above.

### Data, deployment and API

| ID | Priority/status | Issue and concrete next action | Evidence |
|---|---|---|---|
| F01 | P1 C | The default browser API URL is `http://localhost:8080`. On a phone it points at the phone; an HTTPS tunnel also cannot reliably consume that HTTP API. Provide a reachable HTTPS API or same-origin proxy and configure the actual deployment. | `src/data/api.ts` DEFAULT_API_URL |
| F02 | P1 C | Backend CORS defaults only allow localhost/127.0.0.1:4321. Configure the exact preview/production origins, or proxy requests through the frontend origin. | `backend/src/main/resources/application.properties` |
| F03 | P1 C | Production output is static. Menu and average-rating data are frozen at build time despite six-hour backend imports. Choose scheduled rebuilds with a freshness SLA, SSR, or client refresh. | `astro.config.mjs`, `src/data/app-data.ts` |
| F04 | P1 C | `menuDate` can be an earlier fallback day, but detail still says “Today’s menu” and empty states say “today”. Pass and display the actual date on every menu surface. | `src/data/app-data.ts`, `src/pages/canteen/[id].astro` |
| F05 | P1 C | A successful rating POST can be followed by a localStorage parse/write failure, causing a false “could not save” message. Treat server acceptance separately from a best-effort local cache; test retry/409 reconciliation. | `src/rating/saveMealRating.ts`, `RatingCard.ts` |
| F06 | P1 R | Target-day API failure falls back to bundled meal IDs while rating submission still uses the live API URL. Avoid mixing sources: disable submission with retry, or use explicit local-preview mode. A coincidentally matching stale ID may describe a different imported dish. | `RatingCard.ts` mealsOn + saveMealRating call |
| F07 | P1 R | Imported meal IDs include `{mensa}.{date}.{service}.{index}`. Reordering an import can attach saved feedback to a different meal unless import identity is stable. Coordinate a backend identity contract; starring must continue to store dish strings. | `backend/.../EthMenuMapper.java`, `saveMealRating.ts` |
| F08 | P2 C | API data is trusted through TypeScript casts. Validate required fields, types, finite prices/averages, valid classifications/dates and array limits at the boundary. Reject invalid payloads with a clear data error. | `src/data/api.ts`, `app-data.ts` |
| F09 | P2 C | All request/conversion failures are reported as “backend not reachable”, including malformed JSON or schema mismatch. Distinguish unavailable service from invalid data. | `app-data.ts` catch |
| F10 | P2 C | The rendered mensa catalogue is always the bundled list. Newly added backend mensas are ignored; removed ones remain. Define catalogue ownership and merge server IDs/metadata deliberately. | `app-data.ts` CANTEENS.map |
| F11 | P2 C | Onboarding recommendations/budget calculations use bundled data while home menus can use backend data. Feed both from the same dated source, including language variants. | `src/pages/onboarding.astro`, `steps.ts`, `main.ts` |
| F12 | P2 I | Introduce loading, retry and last-successful-update states for live menus/ratings. Avoid showing an indefinite sample snapshot as recovery. | `app-data.ts`, home/detail |
| F13 | P2 R | Backend rate limiting may block legitimate successive mensa/meal actions. Exercise 429, Retry-After and shared-IP behaviour with the real API; keep the selection available for retry. | `api.ts`, backend rate-limit configuration |
| F14 | P2 I | Reconcile menus/averages between home, detail, rating picker and another open tab after a successful save. A reload of static HTML currently cannot refresh backend averages. | static pages + RatingCard |
| F15 | P3 I | Add a deployment configuration check that rejects a localhost API URL in a public build and documents public API/CORS setup. | `.env.example`, build pipeline |
| F16 | P3 R | Test endpoint responses with empty bodies; the common request function always parses successful responses as JSON. Current documented saves return JSON, so this is a compatibility case, not a current 201 failure. | `api.ts` request |

### Meal-rating prompt

| ID | Priority/status | Issue and concrete next action | Evidence |
|---|---|---|---|
| F17 | P1 D | Original request specified 1/2/3 thumbs; teammate integration and README now specify 1–5 stars. Keep the pulled implementation intact pending team confirmation; align copy, analytics, tests and migrations with the chosen scale. | `RatingButtons.astro`, `saveMealRating.ts`, `src/rating/README.md` |
| F18 | P2 C | Profile has preference scores, not visit history or “most-rated” counts. The current ranking is favourites then highest preference score. Document that meaning or add actual frequency data before calling it most-rated. | `src/onboarding/profile.ts`, `mensaCandidates` |
| F19 | P2 R | Dismiss/skip/back while a menu fetch is in flight can leave stale step content or focus changes after hiding. Cancel obsolete requests or use a generation token plus hidden/resolved checks. | `RatingCard.ts` chooseMensa |
| F20 | P2 R | Two tabs can independently read/write `promptedDays` and resolution arrays. Add atomic merge/locking or server enforcement for the one-prompt-per-day rule, not just duplicate meal ratings. | `useRatingPrompt.ts` shown/resolve |
| F21 | P2 C | Simulator writes are isolated, but it can still fetch live menu data. Make simulation fully fixture-driven or visibly identify the source; preserve the “no production writes” guarantee. | `RatingCard.ts` simulated + mealsOn |
| F22 | P2 C | A stored non-empty anonymous ID is trusted without format checking, while the backend expects `anon:` + UUID. Validate/migrate invalid IDs and explain that this is device identity, not an account. | `saveMealRating.ts` anonymousUserId |
| F23 | P2 R | Date validation accepts syntactically valid but impossible dates such as 2026-02-31. Validate calendar dates where persisted state/payloads are consumed. | useRatingPrompt dates; saveMealRating validation |
| F24 | P2 I | No-menu auto-resolution is intentional in the current code. Decide whether an outage, late import or empty meal list should resolve the whole date; distinguish “no menu” from “failed to load”. | RatingCard mealsOn/chooseMensa |
| F25 | P2 I | Preserve a recoverable rating after a transient failure; show a clear Retry action, source-aware error and useful handling of 404/409/429/500/timeout. | RatingCard save error branch |
| F26 | P2 R | Card auto-hides after 2.2 seconds. Verify screen-reader announcement/focus restoration and reduced-motion behaviour; allow enough time for feedback to be perceived. | RatingCard feedback/hide |
| F27 | P3 I | Storage-unavailable early-return UI is not subscribed to later language changes. Translate that state too. | RatingCard storage guard |
| F28 | P3 I | Resolution/day maps grow without bound. If pruning is introduced, preserve the once-per-target-date guarantee and migration semantics. | useRatingPrompt persisted state |

### Preferences, onboarding and starred meals

| ID | Priority/status | Issue and concrete next action | Evidence |
|---|---|---|---|
| F29 | P2 C | Profile completion writes profile, preferences and language in separate operations. Quota failure can leave partial state. Use a single versioned snapshot or transactional recovery. | `src/onboarding/api.ts` saveProfile |
| F30 | P2 C | Onboarding relies on localStorage; denied access produces a save error and blocks the flow. Decide on an in-memory guest mode and keep navigation usable if storage is unavailable. | onboardingStore/main |
| F31 | P2 R | Draft restoration can mutate internal state before a failed persist. Verify step/diet/priority changes and retry consistency after quota errors. | onboardingStore update/setStep |
| F32 | P2 C | Full profile persistence remains a local mock. Real login will not sync preferences, stars or history across devices. Keep local-only wording until authenticated profile endpoints exist. | onboarding/api TODO(backend), login.ts |
| F33 | P2 C | Home food categories do not enforce all hard constraints applied by onboarding payoff. Define whether no-pork/gluten/nut constraints must filter every surface and share the same evaluator. | onboarding/constraints vs scripts/preferences |
| F34 | P2 I | Allergen and halal/kosher data can be unknown. Show unknown provenance explicitly; absence of an allergen field must not imply certified suitability. | constraints + imported menu metadata |
| F35 | P2 R | Two tabs can overwrite the same profile when updating stars and onboarding preferences. Add merge/version semantics and a cross-tab lost-update test. | meals/stars writeProfile + saveProfile |
| F36 | P2 I | Dish strings intentionally replace IDs for stars. Splitting on “with/mit/avec/con” and case/spacing normalisation still cannot equate translations or every dish variant. Add aliases/user editing; avoid silently broad matching. | src/meals/stars.ts |
| F37 | P2 R | Unavailable dishes sort last based on rendered rows/filter results. Confirm behaviour for missing selected-tier price, sold-out meals, closed mensas and no menus; these are different states. | scripts/meal-stars.ts rank/render |
| F38 | P2 I | Empty filter selections need explicit explanatory copy and a reset action. Keep “no matching canteens”, “no menus” and “excluded by preferences” distinct. | preferences + home empty states |
| F39 | P2 R | Re-run onboarding should preserve stars and intentional settings while resetting the draft exactly once. Verify reload/back/finish and legacy profile migrations. | settings restart link + main.ts |
| F40 | P3 I | Add a versioned schema and unit coverage for draft/profile migration, including null entries in mensaRatings and unsupported schema versions. Current tests focus mainly on selection algorithms. | onboardingStore + tests |
| F41 | P3 C | saveProfile logs the whole profile to the console. Remove or development-gate this before account data is added. | onboarding/api.ts console.info |
| F42 | P3 I | Profile has removed soft/dislike/lunch-time fields for compatibility. Keep migrations explicit; do not accidentally reintroduce the deferred “Make it yours” screens. | profile.ts/onboardingStore |

### Crowd, availability and menu presentation

| ID | Priority/status | Issue and concrete next action | Evidence |
|---|---|---|---|
| F43 | P1 C | “Current crowd” still comes from bundled LIVE_DATA, not backend current observations. Wire the current-crowd contract and mark stale/missing data. Opening status is also based on bundled windows. | scripts/live-status.ts; detail LIVE_DATA |
| F44 | P2 C | Insufficient/failed backend prediction leaves the illustrative preview histogram. Keep a clear preview label or replace it with insufficient-data UI in real mode; do not make sample data look measured. | detail crowd fetch catch/sufficient check |
| F45 | P2 C | Detail hardcodes 15 minutes/Europe/Zurich when dispatching backend data, ignoring returned metadata. Validate and use the response contract; reject incompatible intervals/timezones. | detail crowd script |
| F46 | P2 I | Show prediction sample size, observation freshness, source and uncertainty. Current browser DTO has sampleSize but the chart receives none. | api.ts BackendCrowd + detail script |
| F47 | P2 R | Verify true zero vs missing/null bins, DST, future/closed hours, all-empty weekdays, sparse 96-bin data and live replacement while a user has selected a bin/day. | crowd/chart.ts + prediction.ts |
| F48 | P2 C | Lunch and dinner meals are displayed together without an obvious service separator on the home card. The sample Alumni menu visibly repeats dish names. Group/label service and avoid visually indistinguishable duplicates. | app-data.ts + CanteenCard; observed home |
| F49 | P2 R | Sorting uses two stable sorts: kind becomes the primary key, ahead of lunch/dinner. Verify intended “lunch before dinner, mains first” order and replace with one explicit comparator if service should be primary. | app-data.ts toMenu |
| F50 | P2 I | Unknown selected-tier prices display a dash. Add clear unavailable-price semantics and ensure unknown prices never count as free/under budget or trigger another tier’s price. | MealPrice + priceRange |
| F51 | P2 I | Synthetic fallback mensa ratings should be labelled sample values, including detail pages where the home sample-data banner is absent. | bundled CANTEENS ratings + detail |
| F52 | P3 I | Keep the smaller hero/photo balance and name/open status readable over every photo; add image failure fallback and stable dimensions to prevent layout shifts. | CanteenCard/detail CSS |
| F53 | P3 I | Move backend ownership of addresses/opening calendars/temporary closures into a shared source, then validate every Google Maps destination. | LocationLink uses bundled MENSAS |

### Accessibility, language, login and resilience

| ID | Priority/status | Issue and concrete next action | Evidence |
|---|---|---|---|
| F54 | P2 C | Login remains an email/password UI preview; pass starts a demo session only. There is no authenticated account flow. Retain that explicit distinction and never use demo state to authorize API operations. | onboarding/login.ts |
| F55 | P2 R | Test modal focus trapping/restoration, Escape, backdrop, password reveal and mobile software-keyboard scrolling in actual browsers. Native dialog helps but is not a complete cross-browser pass. | HeaderAccount/login.ts |
| F56 | P2 C | Location link/ARIA, image alt text and some “No ratings yet” tooltips remain English after German selection. Add shared translation keys; menu content language needs its own source/translation policy. | LocationLink, CanteenCard/detail |
| F57 | P2 R | Audit every visible target at 320px, including header controls, reorder arrows, ratings, chart controls and stars. Five rating buttons passed measured ≥44px; do not infer the rest. | responsive evidence + component CSS |
| F58 | P2 R | Run keyboard-only and screen-reader journeys, 200%/400% zoom, dark-theme contrast, focus visibility, forced colours and reduced motion. No complete WCAG pass has been performed. | cross-feature validation gap |
| F59 | P2 R | Exercise denied/cleared/quota-full storage, corrupted data and BFCache restoration across all features, not only the newly guarded modules. | regression checklist |
| F60 | P2 I | Add a recoverable stale-data/offline state and a clear path back from invalid mensa URLs; decide how useful the app should remain without JS. | global runtime/deployment |
| F61 | P3 I | Add focused linting and browser regression automation using existing dependencies where possible. Current repo has check/test/build but no lint or browser test script. | package.json |
| F62 | P3 I | Measure page payload, image loading, layout shift, long menus, repeated listeners/timers and filter/star performance before setting budgets. Add bounded stress fixtures, not unbounded production traffic. | test tooling/performance gap |
| F63 | P3 I | Add CI for check/test/build plus contract fixtures and a small browser smoke suite; archive screenshots and failing seeds. | repository workflow follow-up |
| F64 | P3 I | Document reset/export/delete behaviour for local profile/ratings and how anonymous feedback changes when real accounts arrive. | localStorage model + future account integration |

## Suggested implementation order

1. Agree on the rating scale (F17) and deploy a reachable API/CORS configuration (F01–F02).
2. Fix data freshness/date/source correctness (F03–F07, F11, F43–F45).
3. Harden API validation and save/retry/concurrency paths (F08–F09, F19–F25, F29–F35).
4. Complete actual-device, accessibility, translation and menu-presentation checks (F47–F60).
5. Add repeatable CI, performance budgets and migration/privacy documentation (F61–F64).

## Contract notes and mocks

- Meal stars continue to store plain dish strings, separate from rating records, which need backend meal IDs.
- Profile mensaRatings are 1–5 preference scores. They do not expose visit counts.
- Rating request is `{userId, stars}`; backend derives mensaId/mealDate and stamps ratedAt. The local record still includes all fields from the requested model. A real anonymous save was not verified in this audit.
- The pulled backend now enforces unique user+meal ratings and returns 409; this replaces earlier notes that duplicate enforcement was absent.
- Current 15-minute histogram contract includes `intervalMinutes`, `timeZone`, `sampleSize`, `sufficient`, and weekday maps with null gaps. Backend current-crowd display is not yet connected.
- Demo login, profile persistence, simulated ratings, bundled menus and illustrative crowd data remain local/mock paths. The normal meal-rating API call itself is implemented, not a TODO mock.
- Unknown numeric prices are represented as null by the backend and shown as unavailable by the frontend. No confirmed top-level `prices: null` mismatch was found in the current mapper.

Companion files: `FRONTEND_CHECKLIST.md` (full regression inventory) and `FRONTEND_TEST_PROMPT.md` (ready-to-use execution prompt).
