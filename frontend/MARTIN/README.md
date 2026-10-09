# Tablett – ETH & UZH mensa app (frontend)

Mobile-first web app for the ETH Zurich and UZH mensas: today's menus, live crowd levels, ratings and favourites.
Frontend only. All data comes from a mock layer that is a drop-in replacement for a future REST API.

**Stack:** Astro 7 + React islands (`client:load`), TypeScript strict, nanostores (+ persistent, localStorage), plain CSS tokens,
fonts installed locally via `@fontsource` (Bricolage Grotesque, Instrument Sans, IBM Plex Mono). No CDN, no analytics, no hotlinked assets.

## Working app

There is no hosted deployment yet. The working app is the local dev server:

**http://localhost:4321/** after running the commands below. Open it in a phone-sized window (or DevTools device mode) for the intended layout.

## How to run (PowerShell)

```powershell
cd C:\Hackathon\mensa-astro
npm install
npm run dev        # http://localhost:4321  (binds to localhost only)
npm run build      # astro check (TypeScript) + production build into dist/
npm run preview    # serve the production build
```

Node 22.12+ is required by Astro 7 (developed on Node 24).
Copy `.env.example` to `.env` and set `PUBLIC_API_URL` to switch from mock data to a real backend.

## Features

- **Today** `/` – date, campus (detected or picked), Lunch/Dinner switch (defaults by time), "Recommended for you" top 3, sticky filter bar
  (diet, protein minimum slider, kcal maximum slider, price category, sort), feed grouped by mensa (favourites first, hidden never shown)
  with distance, open/closed and live crowd pill. Tray-ticket meal cards with "I'm eating this".
- **Mensas** `/mensas` – grouped by campus, star (favourite) and eye (hide) toggles, collapsed "Hidden (n)" section to restore, rating, distance, crowd now.
- **Mensa detail** `/mensa/[id]` – address, hours, favourite/hide, "Popular times" chart (weekday selector, hours 07–21, current hour in the accent colour,
  Live marker from reports, "Usually a little busy at this time", empty state when there are too few reports), Lunch/Dinner tabs, rating summary and "Rate this mensa" (stars + food/queue/seating/value).
- **Meal detail** `/meal/[id]` – large image, description, all three prices, nutrition, allergens, origin, rating distribution, reviews, "Rate this meal" (stars + quick tags).
- **Profile** `/profile` – default campus, price category, nutrition targets, hidden mensas, ratings history, reset all local data, developer panel.
- **Check-in popup** – bottom sheet when you are near an open mensa: how full is it (5 bars), then how was your last meal. Both steps skippable,
  focus trap, Esc closes, 45 minute cooldown, not shown on every navigation. Results update the UI immediately.
- **Generated plates** – no external images. `<MealImage>` draws a top-down plate from the meal's ingredients and diet tag, and shows `imageUrl` when a backend provides one.
- Installable: web app manifest, theme-color (light and dark), icons, safe-area insets. Dark theme follows `prefers-color-scheme`. Reduced motion respected.

## Testing every feature on a laptop

Open **Profile → Developer panel** (bottom of the page).

| Feature | How to test |
| --- | --- |
| Check-in popup, both steps | Press **Simulate check-in popup**. Pick a mensa in the select first. Step 2 appears only if `lastEaten` exists and is unrated: press **Set lastEaten to a sample dish** first. |
| Automatic popup near a mensa | Press **Set time to 12:15**, then **Pretend I'm at …**, then open Today or any page. (On a weekend, the clock jumps to Monday.) Press **Clear 45 min cooldown** to see it again. |
| Live crowd marker and counts | Submit a crowd report in the popup, then open the mensa page: the LIVE marker and "n reports in the last 30 min" update. Ratings counts update the same way. |
| "Not enough reports yet" | Open `/mensa/dozentenfoyer` or `/mensa/raemi-59`. |
| Lunch/dinner, open/closed states | Set the clock to 12:15, then reload; the real time (e.g. evening) shows closed mensas. |
| Meals with no nutrition data | Move the protein slider above 0 on Today: "n hidden – no nutrition data" appears. |
| Empty states | Reset filters empty state: protein ≥ 60 g. All hidden: hide every mensa on `/mensas`. Mensa closed: switch to Dinner (several mensas have none). |
| Error state | Press **Simulate API errors**, go to Today, press **Try again** after turning it off. |
| Clear lastEaten | **Clear lastEaten**. |
| Back to normal | **Back to real time and place**, or **Reset all local data** in the Your data section. |

## API contract summary

Source of truth: [`src/lib/types.ts`](src/lib/types.ts). Fields the scraper may not provide are optional: `Meal.nutrition` (`proteinG`, `kcal`, `carbsG`, `fatG`),
`Meal.imageUrl`, `Meal.origin`, `Meal.description`. The UI handles their absence.

| Function (`src/lib/api.ts`) | HTTP | Returns |
| --- | --- | --- |
| `getMensas()` | `GET /mensas` | `Mensa[]` (with `RatingSummary`, `OpeningHours`) |
| `getMenu(mensaId, date)` | `GET /mensas/:id/menu?date=YYYY-MM-DD` | `Meal[]` for lunch and dinner |
| `getMeal(id)` | `GET /meals/:id` | `MealDetail` (`Meal` + `reviews: MealReview[]`) |
| `getCrowd(mensaId)` | `GET /mensas/:id/crowd` | `CrowdInfo { histogram: CrowdHistogram, live: CrowdReport[] }` |
| `submitCrowdReport(mensaId, level)` | `POST /mensas/:id/crowd-reports` `{ level: 1-5 }` | `CrowdReport` |
| `submitMealRating(...)` | `POST /meals/:id/ratings` `{ stars, tags }` | `MealRating` |
| `submitMensaRating(...)` | `POST /mensas/:id/ratings` `{ stars, aspects }` | `MensaRating` |

Key shapes: `Meal { id, mensaId, date, service, line, title, sides[], dietTag: 'vegan'|'vegetarian'|'meat'|'fish', ingredients[], price: {student, staff, external}, allergens[], origin?, nutrition?, imageUrl?, rating }`;
`CrowdHistogram { mensaId, sufficient, sampleSize, byWeekday?: Record<Weekday, number[24]> }` (0–100 per hour; omitted when `sufficient` is false);
`CrowdReport { mensaId, level: 1-5, timestamp }`; `RatingSummary { average, count, distribution: [1★..5★], aspects? }`.
Dates are `YYYY-MM-DD`, times `HH:MM`, timestamps ISO-8601, prices in CHF.

## Decisions

- **Name:** "Tablett" (German for tray), matching the tray-ticket design.
- **Meal ids** are `mensa.weekday.service.slot` (e.g. `polyterrasse.fri.lunch.0`), so every detail page can be pre-rendered and links never break;
  dishes themselves change every week (seeded by date). With a real backend, generate `getStaticPaths` from the API or switch Astro to server output.
- **Mock database:** submissions (crowd reports, ratings) are stored in localStorage under `tablett:mockdb`, which is what a server would do across page loads. "Reset all local data" clears it.
- **Hydration:** persisted state lives in localStorage, so each page island renders a layout-matched skeleton on the server and the real UI after mount (`Gate`).
- **Time and location are injectable:** `getNow()` and `usePosition()` honour the developer panel, so the app never reads `new Date()` for business logic.
- **Geolocation** is never requested on page load. It is read silently only if the browser already granted it; otherwise the campus sheet and Profile have an explicit "Use my location" button.
- **Distances** are measured from the picked campus; with campus "detect automatically" they use your position, and ETH Zentrum as the last resort.
- **"Meat" filter** includes fish. **"Vegetarian"** includes vegan.
- **Nutrition filters** exclude meals with missing data (never counted as a pass) and say how many were hidden.
- **Accent contrast:** tomato `#E5441D` is used for fills and large marks (current hour, tab indicator). Small text and button backgrounds use a slightly deeper tomato (`#C23311` / `#C73513`) so white text passes WCAG AA. Dark theme uses brighter equivalents.
- **Ranking weights** are in `src/lib/rank.ts` (`scoreMeal`), commented and easy to tune.
- **Mensa data** (addresses, coordinates, opening hours) are best-effort mock values and must be checked against the official ETH and UZH sources. UZH Oerlikon exists as a campus but has no mensa in the mock.
- **Crowd levels:** histogram 0–100 maps to Empty (<20), Quiet (<40), Some queue (<60), Busy (<80), Packed. Live reports from the last 30 minutes win over the typical pattern.
- **Check-in cooldown** uses the real clock (45 min), never the simulated one.
- Icons for the home screen are generated by `scripts/make-icons.mjs` (no image dependency).

## vs famoser/Mensa

I read the [famoser/Mensa](https://github.com/famoser/Mensa) README and repo layout. It is a native Android app (Kotlin) that shows ETH and UZH menus, with the whole-week view and vegetarian/vegan highlighting listed as planned. The repository is archived.
This app matches its core (daily menus for ETH and UZH mensas, favourites) and goes further:

| | famoser/Mensa | Tablett |
| --- | --- | --- |
| Platform | Android only | Any phone or laptop browser, installable |
| Menus + favourites | yes | yes, plus hiding mensas and grouping by campus |
| Diet | highlighting planned | filter (vegan / vegetarian / meat) and diet markers |
| Nutrition | no | protein and kcal sliders, honest "no data" handling |
| Crowd levels | no | typical pattern chart per weekday + live reports |
| Ratings | no | meals and mensas, distribution, tags, reviews |
| Personalisation | no | "Recommended for you" scoring from favourites, distance, crowd, rating, filters |
| Prices | one | student, staff and external tiers |
| Check-in | no | popup when you stand near an open mensa |
| Images | no | generated plates when there is no photo |
