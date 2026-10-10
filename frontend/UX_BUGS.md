# UniEats / CampusEats — UX bug log

| | |
|---|---|
| **Tested build** | `origin/main` @ `3dce17d` (fetched 2026-10-10). Tested in an isolated git worktree `.claude/worktrees/main-test`, so your branch `feature/safety-offline-backup` and its uncommitted changes were **not touched** |
| **How** | Astro dev server (`:4477`), Claude built-in browser (Chromium): real clicks/typing/keyboard + scripted DOM checks; 1280×720, 768, 320 px; light/dark; EN/DE; corrupted `localStorage`; fresh-visitor flow |
| **Time box** | 14:37 → ~15:05 (30 min) |
| **Backend** | A backend on `:8080` **was** answering through the dev proxy (`/api/meta`, `/api/meals`) but reports `today = 2026-10-07` (data 2026-09-28 → 2026-10-12) and has **no** `/api/scraped-menus`. The machine clock is **Saturday 10 Oct 2026**, so every canteen is "Closed". |

Severity: **S1** blocks a core flow / data loss · **S2** wrong or confusing behaviour · **S3** polish / minor.
All entries were **observed** in the running app unless marked *(code-read)*.

## Result at a glance

**No S1 found. 9 × S2, 17 × S3.** The fix pass (branch `fix/ux-bug-sweep`) fixes 23 of the 26; see the Status column and "Fix pass" at the end. The app is robust against bad input (see "What held up").

| ID | Sev | One-line summary | Status |
|---|---|---|---|
| B01 | S2 | Empty state "Show all canteens" does nothing when *Only show open* is on (and scrolls to top); message blames "search" | Fixed |
| B02 | S2 | Fresh visitors are forced into onboarding from the logo / "← All canteens"; Back on step 1 → Settings → loop | Fixed |
| B03 | S2 | Rapid clicks on **Continue** skip onboarding steps (step 1 → 4) | Fixed |
| B04 | S2 | "Replay onboarding" silently resets price category to Student | Fixed |
| B05 | S2 | Menus labelled "Today" are 3 days old; past days offered in the day picker | Fixed |
| B06 | S2 | Sticky "← All canteens" pill covers headings and the "Today" day pill while scrolling | Fixed |
| B07 | S2 | Rating prompt offered on a closed day, then "No menu available" and the day is used up | Fixed |
| B08 | S2 | "All campuses" hides 9 canteens that show up in their own campus filter | Clarified |
| B09 | S2 | Permanent "Live menus from cafeteria websites … currently unavailable" block + 404 console error on every load | Not fixed (excluded on request) |
| B10 | S3 | "Back to top" button visible at the top of the page, covers "Nowhere today" at 320 px | Fixed |
| B11 | S3 | "1 mensas" plural bug in onboarding | Fixed |
| B12 | S3 | "Staff" (onboarding) vs "Worker" (settings) | Fixed |
| B13 | S3 | Settings headings inconsistent (`<legend>` straddling the card edge vs `<h2>`) | Fixed |
| B14 | S3 | Search placeholder clipped ("…or dishe") at 1280 px | Fixed |
| B15 | S3 | All three food categories can be switched off → "No dishes match" repeated on every card, no reset | Fixed |
| B16 | S3 | "Closed" badge on a *future* day's menu | Fixed |
| B17 | S3 | Weekend / "today" date URLs return 404 | Fixed |
| B18 | S3 | "Today's pick for you" can be a CHF 1.80 soup | Fixed |
| B19 | S3 | German mode: bottom "Live menus" block still English; ss/ß spelling mix | Fixed (except the block of B09) |
| B20 | S3 | List view uses only ~⅓ of desktop width | Fixed |
| B21 | S3 | Suspicious price: Dozentenfoyer "Tandoori Chicken" CHF 3.20 | Not fixable here: backend data |
| B22 | S3 | Crowd chart values only in hover tooltips (no tap/keyboard access) | Fixed |
| B23 | S3 | `Uncaught (in promise) AbortError: Transition was skipped` in console | Not fixed: browser-internal |
| B24 | S3 | Dev-only: out-of-range `?ratingNow=` shows "needs device storage" | Fixed |
| B25 | S3 | Onboarding campus counts don't match home (16 vs 17 for Zentrum) | Fixed |
| B26 | S3 | Onboarding mensa stars: can't clear a single rating; `aria-pressed` on `role=radio` | Fixed |

## Automated baseline

| Command | Result |
|---|---|
| `pnpm test` | 189 passed / 0 failed |
| `pnpm check` | 0 errors / 0 warnings / 0 hints (122 files) |
| `pnpm build` | passes — 203 pages built |

Not a bug: Astro's dev toolbar (dark pill, bottom-centre) overlaps the primary button at 1280×720 in dev only; I hid it for testing.

---

## S2 — confusing or wrong behaviour

### B01 · Empty state is a dead end: "Show all canteens" does not show any canteen
- **Steps (re-verified with only this one change):** Settings → turn on *Only show open canteens* (leave Zentrum selected) → Home on a day when everything is closed (e.g. a weekend) → "0 canteens" → click **Show all canteens**.
- **Expected:** all canteens appear, or the filter that hides them is cleared / named.
- **Actual:** campus select flips to "All campuses", the page **scrolls away from the button** and focuses the search box (`#search-input`), but the list is still `0 canteens` — *Only show open* (`openOnly:true`) is never cleared, so the button can be pressed forever. The message says "No canteens match your **search**" although there is no search text; the real cause is never named. (Without *Only show open*, e.g. zero campuses selected, the same button works.)
- **Where:** empty-state handler in `src/pages/index.astro` / `src/scripts/preferences.ts`.

### B02 · A fresh visitor cannot leave onboarding / reach the overview
- `BaseLayout.astro:21` redirects `/` → `/onboarding` whenever `campuseats-profile` is missing. **Observed:** on `/onboarding` clicking the **UniEats logo** goes `/` → straight back to onboarding. Deep links (`/canteen/…`) are *not* redirected (observed), so by *(code-read)* a visitor who lands on a shared canteen link and presses "← All canteens" hits the same redirect.
- Only way out: skip through all 6 steps to the payoff and press "Explore all menus".
- **Loop** *(code-read, Back→Settings observed)*: onboarding step 1 **Back** → `/settings` (`src/onboarding/main.ts:86`, a screen the user never visited) → "← All canteens" → `/` → onboarding again.
- **Expected:** a "Skip for now"/close that remembers the choice (or Back hidden on step 1), and home reachable without a profile.

### B03 · Rapid clicks on "Continue" skip onboarding steps
- `/onboarding?restart=1`, three quick clicks on **Continue** moved **Step 1 → Step 4**, skipping *Where do you eat?* and *What's on your plate?* (campus, diet, "Never show me": pork / nuts …). `advance()` has no debounce / in-transition guard. Double-click/double-tap is common on phones; skipped steps store defaults the user never saw.
- *Caveat:* reproduced with synthetic click events; the Browser pane was hidden for the real-mouse retry. Reproduction is deterministic.

### B04 · "Replay onboarding" silently resets the price category
- Settings price = **External** → *Replay onboarding* → leave step 5 untouched → **Finish**: `campuseats-preferences.priceTier` goes `external` → `student`. Onboarding starts from defaults instead of current settings. (View mode, open-only and starred meals *were* preserved.)
- Root cause: two stores (`campuseats-profile`, `campuseats-preferences`) each hold `priceTier`, campus/`locations`, diet/`vegan|vegetarian|meat`, and can disagree (profile said `student` while preferences said `external`).

### B05 · Menus labelled "Today" are not today's
- Backend `menuDate = 2026-10-07`, device date Sat 10 Oct. Home "Today" pill, detail "**Today's menu**", onboarding "**Today's pick for you**", and the starred-meals block all show **Wednesday's** menu as today. The rating card on the same page says "Saturday, 10 October 2026". The day picker offers **Thu 8 / Fri 9** (past days) and **Mon 12**, never Sat/Sun. Nothing tells the user the data is 3 days old (known audit item F04).

### B06 · Sticky "← All canteens" pill floats over content
- On `/settings` and `/canteen/:id` the back pill stays on screen and **covers** headings and controls: "Food preferences" reads "…rences"; on a canteen page it hides "Today's menu" and the left-most **Today** day pill. Expected: reserve space / don't stick / shrink.

### B07 · Rating prompt asks about a day with no menu, then uses the day up
- Saturday: "How was lunch? – Where did you eat today?" is shown (and re-shown on every `/day/*` page) while every canteen is closed. Choosing **Mensa Polyterrasse** turns the card into "**No menu available for this date.**" and `campuseats-meal-rating-state.resolvedDates` already contains `2026-10-10`, so the prompt never returns that day. (Auto-resolve is "intentional" per audit F24, but the user is invited to rate and then dead-ended without explanation; don't offer the prompt when no menu exists.)

### B08 · "All campuses" hides canteens that appear in their own campus filter
- *All campuses* → `20 canteens` + "Show 19 without menus". Per-campus counts: Zentrum 12, Hönggerberg 5, Irchel 3, Oerlikon 4, Basel 1, Toni-Areal 2, Europaallee 2 = **29**. Missing from *All*: Restaurant Octavo, Mensa Oerlikon, BIM11, Cityport Mensa, Science Lounge, Mensa Molki, Bistro Tonino, Mensa PHZH, ZHAW Cafeteria Lagerstrasse & Sihlhof.
- Cause: these campuses have *no* menus at all, so the single-campus view falls back to showing every card ("No menu available for this date."), while the combined view hides them behind "Show N without menus". Same data, different rule, different counts.

### B09 · Permanent error block "Live menus from cafeteria websites"
- Bottom of `/` always renders the heading, "Refreshed daily at 06:00 Zurich time." and then **"Live website menus are currently unavailable."** when `/api/scraped-menus` fails/404s, plus a `404 /api/scraped-menus` console error on **every** home load (the only failing request on the page). A failed optional section should hide itself or offer retry. (`src/components/ScrapedMenus.astro`; environment caveat: this backend has no such route — verify against the real deployment.)

---

## S3 — polish / minor

### B10 · "Back to top" is always visible
- Shown at scroll position 0 on `/` (`.back-to-top` is `position:fixed` with no scroll condition, `src/pages/index.astro:104`). At 320 px it sits on top of the **"Nowhere today"** rating option.

### B11 · "1 mensas"
- Onboarding step 2 shows **"1 mensas"** for Basel (home correctly says "1 canteen").

### B12 · "Staff" vs "Worker"
- Onboarding step 5: **Student / Staff / External**. Settings → *Your price*: **Student / Worker / External** (`value="worker"`). German says "Mitarbeitende" in both.

### B13 · Settings headings inconsistent
- *Appearance, Price category, Food preferences, Canteen filters, Overview layout, Dev mode* are `<legend>`s that sit on the card's top edge/indented ("Appearance" straddles the border); *Starred meals* and *Your meal ratings* are normal `<h2>` inside the card.

### B14 · Search placeholder clipped
- At 1280 px: **"Search canteens or dishe"**. Input is 240 px with 42/16 px padding and `text-overflow: clip`.

### B15 · All three food categories can be switched off → wall of "No dishes match"
- Settings → Food preferences: Vegan, Vegetarian and Meat can all be turned off (stored `false/false/false`, no guard, no warning). Home then shows "**12 canteens**" and the sentence "No dishes match your food preferences." **repeated on every one of the 12 cards**, with no overall message and no "reset filters" action.
- *Correction note:* an earlier draft of this entry claimed the last category "can't be switched off". That was a mistake in my test selector (`includes('Meat')` also matched the Vegetarian label, whose subtitle is "Meat-free"); re-tested by input name — toggles behave correctly.

### B16 · "Closed" badge on a future day's menu
- `/day/2026-10-12` (Monday) lists every card with a red **● Closed** badge because *now* is closed — misleading for another day.

### B17 · Weekend / "today" date URLs 404
- `/day/2026-10-10`, `/day/2026-10-11`, `/day/2026-10-13`, `/canteen/uzh-zzm/2026-10-10` → **404 "This page does not exist"**. A bookmarked/shared link to a weekend date dead-ends instead of redirecting to the nearest menu day.

### B18 · "Today's pick" can be a CHF 1.80 soup
- Vegan / Irchel onboarding → **Mensa Irchel – Pastinakensuppe CHF 1.80** (a starter) as "today's pick"; no main-course filter. The omnivore/Zentrum run gave *Chässpätzli* CHF 6.10.

### B19 · German mode gaps
- The whole bottom block "**Live menus from cafeteria websites / Meals, catering offers and published closures… / Live website menus are currently unavailable.**" stays English (dish names too, probably data).
- aria-labels mix spellings: "Essensbewertung **schliessen**" vs "Login **schließen**".

### B20 · List view wastes desktop width
- Overview layout = **List** at 1280×720: a single ~330 px column hugging the left; large empty area to the right; canteen name in a small white label box.

### B21 · Suspicious price
- `/day/2026-10-12` Dozentenfoyer "Tandoori Chicken" **CHF 3.20** beside "Kalbsfleisch Roulade" CHF 20.50 — likely a side/unit price parsed as a main price. Similar: "Hot & Cold Buffet CHF 2.20", "Dessert of the day CHF 2.40" shown as plain prices.

### B22 · Crowd chart values are hover-only
- The *Predicted crowd* bars are non-focusable SVG `<rect>`s whose values live only in `<title>` tooltips (the whole chart has one long `aria-label`). On touch there is no way to read a single bar. (A "Now" marker exists, but only when the selected weekday is today — it was not visible in my run because Monday was selected on a Saturday.)

### B23 · Console: `Uncaught (in promise) AbortError: Transition was skipped`
- Logged 3× when navigating while a view transition is running (rapid link clicks / programmatic navigation).

### B24 · (Dev-only) misleading message for out-of-range `?ratingNow=`
- `?ratingNow=9999-12-31T23:59:59Z` shows "**Meal feedback needs device storage. Please enable it or dismiss this card.**" although storage works. `ratingNow` is correctly gated by `import.meta.env.DEV`.

### B25 · Campus counts differ between onboarding and home
- Onboarding: "Zentrum **16** mensas"; home: Zentrum 12 with menus + 5 without = **17**. Onboarding sum = 37, home catalogue total = 39.

### B26 · Onboarding mensa stars: can't clear one rating; invalid ARIA combo
- Step 6: clicking an already-selected star again keeps the rating (3★ stays 3★); the only way to clear is "I haven't been to any of these", which clears **all** mensas.
- The stars are `<button role="radio" aria-checked aria-pressed>` — `aria-pressed` is not valid on `role=radio` (screen readers may announce both states). Roving `tabindex` and the radiogroup itself are fine.

---

## What held up (tested, no defect found)

- **Hostile search input:** HTML (`<img onerror>`), emoji, 300 chars, `"`, `\`, `%`, `(?:`, `[`, `.*`, leading/trailing spaces, case, `ü/ö` — no errors, no layout shift, clear results.
- **Corrupted storage:** broken JSON, `null`, wrong types, `lang=xx`, `theme=purple`, `step:99` → app falls back to defaults on all pages, no crash.
- **Responsive:** no horizontal overflow on `/` (320 / 768 / 1280 px), `/canteen/polyterrasse` (320 px) and `/settings` (320 px, the pane's minimum); no sub-32 px interactive elements on `/` and the canteen page at 320 px; standard / compact / list views render. Onboarding was only checked at 1280 px.
- **Theme & language:** dark mode and German checked on Home and Settings (apart from B19); language change mid-onboarding keeps position.
- **Keyboard:** skip link, logical tab order, visible focus rings on the 14 tab stops walked on `/`; every control on onboarding step 5 has an accessible name; light-mode text contrast on `/` is fine (only decorative glyphs flagged).
- **Stars:** star → persists → appears in Settings and at top of home/detail.
- **Rating flow (simulation):** mensa → dish → 5★ → "saved on this device" + Undo.
- **Geolocation denied:** clear inline message, button stays usable.
- **Filters:** Lunch / Dinner / day pills / campus select / "Show N without menus" toggle behave consistently; 404 pages for bad canteen IDs and routes.
- `pnpm test`, `pnpm check`, `pnpm build` all green.

## Not covered (be honest)

- Real-device touch, Safari/Firefox, true offline/service-worker behaviour, push notifications (browser permission was "denied" in this pane), the Login dialog (hidden unless dev mode), crowd survey, location-based "near me" with real coordinates, 200 % zoom / screen reader.
- The Browser pane became hidden mid-run, so late checks were DOM-based rather than visual.
- Backend contract/validation behaviour was only seen against the one dev backend on `:8080`.

---

## Fix pass (branch `fix/ux-bug-sweep`, based on `origin/main`)

Besides the items above, **halal and kosher were removed from onboarding** (step "What's on your plate?", the footnotes and the data types): the menu data cannot tell, so the filter promised something the app could not do. A halal/kosher answer left in an old saved profile is ignored instead of excluding dishes.

| Bug | What changed |
|---|---|
| B01 | "Show all canteens" now also looks past *Only show open canteens* for the visit (Settings unchanged), keeps the scroll position and moves focus to the result count. The empty message names the cause (search / nothing open / no campus selected). |
| B02 | Leaving onboarding is remembered for the browser session, so the logo / "← All canteens" reach the overview. Back on step 1 returns to the page the visitor came from, else the overview — never Settings. |
| B03 | A 400 ms step cool-down on Continue / Skip / Back / Alt+arrows: a double-click advances one step. |
| B04 | New `onboarding/seed.ts`: replaying starts from the saved answers; price category and campuses come from the current Settings. Unit-tested. |
| B05 / B16 | "Today" labels (day pill, "Today's menu") are compared with the real Zurich date in the browser; a menu from another day says "Menu(s) for Wednesday 7 October". On a day picked in the day picker that is not today, "Closed/Open now", current crowd and today's hours are hidden. |
| B06 | The "← All canteens" pill is no longer sticky. |
| B07 | The "Where did you eat today?" question is not asked when the day has no menu at all (weekends), and the day is not used up. Choosing a mensa without a menu keeps the card open: "Choose another one". |
| B08 | Behaviour kept (a campus with no menus still lists its canteens rather than an empty page); the count now says "· no menus for this day". |
| B10 | Back-to-top appears only after scrolling 400 px. |
| B11 / B25 | Singular "1 mensa"; campus counts use the same menu data as the overview. |
| B12 | "Staff" everywhere (value stays `worker`). |
| B13 | Settings headings sit inside their cards. |
| B14 | Wider search field; text ellipsis. |
| B15 | Turning off the last food category is refused with a note; an old saved "all off" reads as "all on". |
| B17 | The 404 page sends `/day/<date>` and `/canteen/<id>/<date>` for a day without a page to the next menu day (`nearestMenuDay`, unit-tested). |
| B18 | Today's pick skips dishes below CHF 4 and names with soup / Suppe / dessert, unless nothing else fits. |
| B19 | "schliessen" everywhere (Swiss spelling), "Mässig besucht". The English block of B09 is untouched. |
| B20 | List view uses several ~480 px columns on wide screens; the canteen star no longer overlaps the first dish. |
| B22 | Tap/click or ← → / Home / End on the crowd chart reads the time slot and value. |
| B24 | Dev-only: simulated timestamps outside 2000–2100 are rejected with a clear message. |
| B26 | Tapping the chosen star again clears the rating; `aria-pressed` removed from `role="radio"` chips (CSS now keys on `aria-checked`). |

Not changed: **B09** (excluded on request); **B21** — the backend itself returns `3.2` for all three price categories of Dozentenfoyer "Tandoori Chicken" (check the scraper/price mapping); **B23** — logged by the browser's own view-transition handling, no app code involved and not reproducible by a user action.

Verification: `pnpm test` 198 passed (was 189; +9 new), `pnpm check` 0 errors, `pnpm build` 203 pages; every fix re-checked in the running app (the Browser pane was hidden for part of the run, so a few checks were DOM-based).
