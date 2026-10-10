# Backend REST API

Start: `cd backend && ./mvnw spring-boot:run` → `http://localhost:8080`

Interactive docs: [Swagger UI](http://localhost:8080/swagger-ui.html), OpenAPI JSON at `/v3/api-docs`.

> If Food2050 imports log `PKIX path building failed` on Windows, Java does not trust the
> TLS certificate, even if the site opens in a browser. In PowerShell, start the backend with
> `$env:JAVA_TOOL_OPTIONS='-Djavax.net.ssl.trustStoreType=Windows-ROOT'; .\mvnw.cmd spring-boot:run`.
> `JAVA_TOOL_OPTIONS` also reaches the Java process launched by the Spring Boot Maven plugin.

## Data

Everything lives in one database: an H2 file database under `backend/data/` (git-ignored, created
on first start; set `DB_URL` to use another JDBC database).

| Tables | Content | Written by |
| --- | --- | --- |
| `campus`, `mensa`, `mensa_service_hours`, `mensa_closure` | Campuses, mensas, weekly service hours, closures | `MensaSnapshotImporter` |
| `meal`, `meal_component`, `meal_allergen` | Meals per mensa and day (indexed by mensa + date) | `MensaSnapshotImporter`, `LiveMenuImportService` |
| `rating`, `rating_tag`, `crowd_report` | User ratings and crowd reports | the API |

**Mensa data import:** on a start with an empty `mensa` table, `MensaSnapshotImporter` loads the
bundled seed `src/main/resources/seed/mensa-snapshot.json`, a snapshot of `frontend/src/data/canteens.ts`
(22 ETH/UZH mensas, 901 meals, **2026-09-28 to 2026-10-09**). Existing data is never overwritten.
Without live data, dates outside that range return an empty meal plan. To load a new snapshot, regenerate it and start
with an empty database (delete `backend/data/`, which also deletes ratings and crowd reports):

```bash
node backend/scripts/export-mensa-db.mjs
```

**Live ETH menus:** `LiveMenuImportService` loads the current and the next week from ETH Cookpit on
startup and daily at 06:00 Europe/Zurich (`app.live-import.cron`, Zurich time). For each ETH mensa with live meals in a
week, that week's meals are replaced; mensas without live meals keep what they had, and a failed download
keeps the existing meals. `EthMenuMapper` maps Cookpit's classes, allergens and customer groups to the
app's values (diet, canonical allergen ids, student/staff/external prices). English texts are used; where
Cookpit's English translation is missing ("novalue") or a placeholder (one English name for meals with
different German names, e.g. Tannenbar's "Chicken Katsu" in October 2026), the German name and
description are used instead. Turn it off with
`app.live-import.enabled=false`. UZH menus are imported on startup from Food2050's weekly pages
for today and the next Monday; the legacy GraphQL endpoint is attempted first. A TLS error or
unavailable Food2050 page leaves those dates without live UZH meals. Check the startup log for
`Live UZH meal import` and verify `/api/meals?date=YYYY-MM-DD` after starting the backend.
The separate maintained ZFV API needs `MENSA_ZFV_API_KEY` (see [MENSA_API.md](MENSA_API.md)).

Services only see domain models through `MensaRepository` (implemented by `JpaMensaRepository`).

## Overview

| Method | Path | Purpose |
| --- | --- | --- |
| GET | [`/api/mensas`](#get-apimensas) | List all mensas |
| GET | [`/api/campuses`](#get-apicampuses) | List the campuses |
| GET | [`/api/meta`](#get-apimeta) | Which days have data, which day to show |
| GET | [`/api/mensas/{id}`](#get-apimensasid) | One mensa with its meal plan |
| GET | [`/api/mensas/{id}/meal-plan`](#get-apimensasidmeal-plan) | Meal plan of a mensa for a date range |
| POST | [`/api/mensas/{id}/ratings`](#post-apimensasidratings) | Rate a mensa |
| GET | [`/api/mensas/{id}/crowd`](#get-apimensasidcrowd) | How full a mensa is now and usually |
| POST | [`/api/mensas/{id}/crowd-reports`](#post-apimensasidcrowd-reports) | Report how full a mensa is |
| GET | [`/api/meals`](#get-apimeals) | Search meals across all mensas |
| POST | [`/api/search`](#post-apisearch) | Match a search query to displayed canteens with OpenAI |
| GET | [`/api/meals/{id}`](#get-apimealsid) | One meal with its ratings |
| POST | [`/api/meals/{id}/ratings`](#post-apimealsidratings) | Rate a meal |
| DELETE | [`/api/meals/{id}/ratings?userId=`](#delete-apimealsidratings) | Take back a meal rating |
| GET | [`/api/push/public-key`](#push-notifications-for-starred-dishes) | VAPID key for Web Push |
| PUT | [`/api/push/subscription`](#push-notifications-for-starred-dishes) | Subscribe, or update the starred dishes |
| DELETE | [`/api/push/subscription`](#push-notifications-for-starred-dishes) | Unsubscribe |
| POST | [`/api/push/test`](#push-notifications-for-starred-dishes) | Send a test notification |

### Conventions

- Dates: `YYYY-MM-DD`. Times: `HH:mm`.
- **Today** is today in Zurich, independent of the server's time zone.
- **Menu date**: today if there are meals for it, otherwise the next day with meals within a week
  (e.g. Monday on weekends, as the live import loads the next week), otherwise the latest earlier day
  with meals, or the first day with meals. Clients should show the date when it is not today.
- `priceCategory`: `STUDENT` (default), `STAFF`, `EXTERNAL`.
- Mensa ids are the ids from `canteens.ts`, e.g. `polyterrasse`, `archimedes`.
  Meal ids look like `polyterrasse.2026-10-06.lunch.2`.
- Errors are [problem details](https://www.rfc-editor.org/rfc/rfc9457), e.g.
  `{"status": 404, "title": "Not Found", "detail": "Mensa not found: xyz", "instance": "/api/mensas/xyz"}`.
  Unknown ids return 404; invalid parameters or bodies return 400. For an invalid body, `detail` names
  the field, e.g. `"stars: must be less than or equal to 5"`.
- **Spam protection:** a client (IP address) can rate each mensa once per 24 hours and report each
  mensa once per 5 minutes; otherwise `429 Too Many Requests` with a `Retry-After` header (seconds).
  Windows: `app.rate-limit.*` in `application.properties`. Meal ratings are limited per user instead:
  one rating per anonymous user id and meal (`409` otherwise). OpenAI-backed `POST /api/search` is
  limited to one request per IP every 10 seconds.
- **Operational endpoints:** generic data CRUD, cache management, and manual ETH/UZH import endpoints
  are disabled unless `INTERNAL_API_ENABLED=true`. Do not enable them on a public deployment without
  placing them behind authentication or a private network.
- CORS is open for the Astro dev server (`http://localhost:4321`), see `app.cors.allowed-origins`.
- **Frontend:** the Astro app in `frontend/` uses `/api/meta`, `/api/meals`, `/api/mensas`,
  `/api/mensas/{id}/crowd`, `POST /api/search` and `POST /api/meals/{id}/ratings` (see `frontend/README.md`).

### POST /api/search

The frontend sends `{ "query": "vegan curry", "candidates": [{ "id": "polyterrasse", "name": "Polyterrasse", "campus": "Zentrum", "menu": "Vegetable curry", "diets": "vegan" }] }`.
The response is `{ "ids": ["polyterrasse"] }`. Only IDs supplied in `candidates` can be returned.
Queries are limited to 200 characters and candidate lists to 100 items. Configure `OPENAI_API_KEY`
on the backend to enable this endpoint; `OPENAI_MODEL` defaults to `gpt-4.1-mini`. A missing key returns
503, and an upstream failure returns 502. The browser falls back to local text matching on either error.
For Docker Compose, copy the repository-root `.env.example` to `.env`, set `OPENAI_API_KEY`, then run
`docker compose up -d --build backend`. Compose passes the key to the container at runtime; `.env` is
git-ignored and is not copied into the image.

## Mensas

### GET /api/mensas

Returns every mensa as a list, sorted by name. Use it for overview pages: each
entry has the mensa's name, campus, address, average user rating and its opening hours for the
next 7 days starting today. The meal plan is left out (`mealPlan` is `null`) to keep the response
small; load it with [`GET /api/mensas/{id}`](#get-apimensasid) when a mensa is opened.

| Query parameter | Required | Description |
| --- | --- | --- |
| `campus` | no | Only mensas of this campus: `zentrum`, `hoenggerberg` or `irchel` (see [`/api/campuses`](#get-apicampuses)). An unknown campus gives an empty list. |

Response `200`: `MensaDTO[]`

```json
[
  {
    "id": "uzh-seerose-irchel",
    "title": "Cafeteria Seerose",
    "openingHours": {
      "2026-10-12": [{ "from": "11:30", "to": "13:00" }, { "from": "17:00", "to": "19:30" }],
      "...": []
    },
    "campus": "Irchel",
    "location": "Winterthurerstrasse 190, 8057 Zürich",
    "coordinates": { "lat": 47.39704196675, "lng": 8.5482430458069 },
    "avgRating": null,
    "mealPlan": null
  }
]
```

- `openingHours` maps each of the next 7 days to the meal service windows of that day. A closed
  day has an empty list: weekends, company holidays (`closures` in the data) and mensas that are
  temporarily closed.
- `avgRating` is the average of all user ratings, rounded to one decimal, or `null` if nobody has
  rated the mensa yet.
- `coordinates` is the mensa's WGS84 position (degrees), or `null` if unknown. It is accurate to the
  building (about ±50 m): mensas in the same building share a point, e.g. Polysnack and
  Dozentenfoyer (ETH main building) or Obere and Untere Mensa (UZH main building). The frontend uses
  it to find the mensas near the user (`frontend/src/location/`).
- `id` is not on the whiteboard; it was added so the frontend can call `/api/mensas/{id}`.

### GET /api/campuses

Returns the three campuses (Zentrum, Hönggerberg, Irchel) with their display name and city. Use
the `id` as the `campus` filter of [`GET /api/mensas`](#get-apimensas), for example to build a
campus picker.

Response `200`: `[{"id": "zentrum", "name": "Zentrum", "city": "Zürich"}, ...]`

### GET /api/meta

Tells the frontend which days the backend has meals for and which day it should show by default.
This matters because the data is a snapshot: after its last day, "today" has no meals, and the
frontend should show the menu date instead of an empty page.

Response `200`:

```json
{ "today": "2026-10-10", "menuDate": "2026-10-09", "dataFrom": "2026-09-28", "dataTo": "2026-10-09" }
```

`dataFrom`/`dataTo` are the first and last day with meals (`null` if there are none).

### GET /api/mensas/{id}

Returns one mensa with everything [`GET /api/mensas`](#get-apimensas) returns, plus its meal plan.
Without dates, the meal plan covers the menu date, so a mensa page always shows the most recent
menu available. Pass dates to show another day or a whole week.

| Parameter | Required | Description |
| --- | --- | --- |
| `id` (path) | yes | Mensa id |
| `dateStart` | no | First day of the meal plan. Default: the menu date |
| `dateEnd` | no | Last day of the meal plan (inclusive). Default: `dateStart` |
| `priceCategory` | no | Which price to put into each meal. Default: `STUDENT` |

Response `200`: `MensaDTO` with `mealPlan` filled (same format as
[`/meal-plan`](#get-apimensasidmeal-plan)).
Errors: `404` unknown mensa, `400` if `dateEnd` is before `dateStart`.

### GET /api/mensas/{id}/meal-plan

Returns only the meal plan of a mensa between two days, both included. This is the "input:
dateStart/dateEnd → output: date → meals" box from the whiteboard. Each day maps to its meals;
days without any meals (weekends, holidays, days outside the data) are left out of the response.
Within a day, lunch comes before dinner, and each entry says when that meal is served.

| Parameter | Required | Description |
| --- | --- | --- |
| `id` (path) | yes | Mensa id |
| `dateStart` | yes | First day |
| `dateEnd` | yes | Last day (inclusive) |
| `priceCategory` | no | Which price to put into each meal. Default: `STUDENT` |

Response `200`: `MealPlanDTO`. Errors: `404` unknown mensa, `400` missing or invalid date, or
`dateEnd` before `dateStart`.

`GET /api/mensas/polyterrasse/meal-plan?dateStart=2026-10-06&dateEnd=2026-10-06&priceCategory=STAFF`

```json
{
  "2026-10-06": [
    {
      "timeStart": "17:30",
      "timeEnd": "19:30",
      "meal": {
        "id": "polyterrasse.2026-10-06.dinner.1",
        "name": "Panang Tofu Curry",
        "price": { "price": 11.5, "cat": "staff" },
        "description": "Tofu, Panang Curry, Asian Vegetables, Jasmine Rice, Bamboo Shoots",
        "allergens": ["soy", "celery"],
        "classification": ["vegan", "main", "dinner"],
        "envImp": null
      }
    }
  ]
}
```

`timeStart`/`timeEnd` are the lunch or dinner service window of that day, or `null` if the mensa
publishes none.

**`MealDTO` fields:**
- `id`: for [`/api/meals/{id}`](#get-apimealsid). Not on the whiteboard, added so single meals can be addressed.
- `price.price`: the price in CHF for the requested `priceCategory` (`price.cat`), `null` when the source has no price.
- `prices`: all three prices `{student, staff, external}` in CHF (each `null` if unpublished), for clients that
  let the user pick the category themselves.
- `description`: the meal's components joined with commas, `null` if there are none.
- `allergens`: EU allergen ids such as `gluten`, `milk`, `soy`.
- `classification`: `[diet, kind, service]`, where diet is `vegan`/`vegetarian`/`meat`/`fish`, kind is `main`/`buffet`/`dessert`/`drink` and service is `lunch`/`dinner`.
- `envImp`: environmental impact, the ETH eco score (e.g. `C+`) or the UZH climate impact (`LOW`/`MEDIUM`/`HIGH`), `null` if unknown.

### POST /api/mensas/{id}/ratings

Saves a user's star rating of a mensa. Every call adds one rating; there are no user accounts, but
each client (IP address) can rate a mensa only once every 24 hours. The new average shows up as `avgRating` in the mensa
endpoints.

Body: `{"stars": 4}` with `stars` from 1 to 5.

Response `201` without body. Errors: `404` unknown mensa, `400` stars outside 1–5 or invalid body,
`430` already rated by this client in the last 24 hours.

## Crowd

### GET /api/mensas/{id}/crowd

Says how full a mensa is, based on what users reported. `live` holds the reports of the last 30
minutes, newest first: show them as "right now". `histogram` is the "popular times" chart: for
each weekday and 15-minute slot, how full the mensa usually is, from all reports ever made.

Response `200`:

```json
{
  "histogram": {
    "mensaId": "polyterrasse", "sufficient": true, "sampleSize": 42,
    "intervalMinutes": 15, "timeZone": "Europe/Zurich",
    "byWeekday": { "mon": { "11:15": 25, "11:30": null, "11:45": 75, "...": null }, "sat": {} }
  },
  "live": [{ "mensaId": "polyterrasse", "level": 3, "timestamp": "2026-10-09T22:44:23.796Z" }]
}
```

- `byWeekday` has the keys `mon` to `sun`. Each maps slot start times in Zurich time (`"11:00"`,
  `"11:15"`, ...) to the average reported occupancy of that slot, scaled to 0–100 (level 1 = 0,
  level 5 = 100). Slots during the opening hours without any report are `null`, meaning unknown
  (not empty); reports outside the opening hours get their own slot. This is the frontend's
  `CrowdPrediction` shape (`frontend/src/crowd/prediction.ts`).
- With fewer than **10** reports the chart would be meaningless: then `sufficient` is `false` and
  `byWeekday` is left out. `sampleSize` is always the number of reports.

Errors: `404` unknown mensa.

### POST /api/mensas/{id}/crowd-reports

Saves a user's report of how full a mensa is right now. The server sets the time, so clients
cannot backdate reports. Each client (IP address) can report a mensa once every 5 minutes. The report immediately appears in `live` of
[`GET /api/mensas/{id}/crowd`](#get-apimensasidcrowd) and counts towards the histogram.

Body: `{"level": 3}`, where 1 = empty, 2 = quiet, 3 = some queue, 4 = busy, 5 = packed.

Response `201` with the stored report: `{"mensaId": "polyterrasse", "level": 3, "timestamp": "..."}`.
Errors: `404` unknown mensa, `400` level outside 1–5 or invalid body, `430` already reported
by this client in the last 5 minutes.

## Meals

### GET /api/meals

Returns the meals of all mensas on one day, for questions like "which vegan meals without gluten
are there today on Zentrum?". Every filter is optional; without any, all meals of the menu date are
returned. Each result says which mensa serves it and includes its ratings and composite score, in the same format as
[`GET /api/meals/{id}`](#get-apimealsid). Results are ordered by mensa by default, or ranked according to `sortBy`.

| Query parameter | Required | Description |
| --- | --- | --- |
| `date` | no | Day to search. Default: the menu date (see [`/api/meta`](#get-apimeta)) |
| `campus` | no | Only this campus: `zentrum`, `hoenggerberg` or `irchel` |
| `diet` | no | Only this diet: `vegan`, `vegetarian` (includes vegan meals), `meat` or `fish` |
| `excludeAllergens` | no | Comma-separated allergen ids to leave out, e.g. `gluten,milk` |
| `priceCategory` | no | Which price to put into each meal. Default: `STUDENT` |
| `query` | no | Free-text search query matching dish title, components, or lines |
| `sortBy` | no | Ranking/sorting criteria: `mensa` (default), `score` (composite scoring), `rating`, `price_asc`, `price_desc`, `name`, `eco` |

Example: `GET /api/meals?date=2026-10-06&campus=irchel&diet=vegetarian&sortBy=score&query=curry`

Response `200`: list of `{mensaId, date, meal, avgRating, tagCounts, score}` (empty if nothing matches).
Errors: `400` unknown diet, invalid sortBy, or invalid date.

### GET /api/meals/{id}

Returns a single meal with where and when it is served and what users think of it. Use it for a
meal detail page; the id comes from `meal.id` in a meal plan.

| Parameter | Required | Description |
| --- | --- | --- |
| `id` (path) | yes | Meal id, e.g. `polyterrasse.2026-10-06.lunch.2` |
| `priceCategory` | no | Which price to put into the meal. Default: `STUDENT` |

Response `200`:

```json
{
  "mensaId": "polyterrasse",
  "date": "2026-10-06",
  "meal": { "id": "polyterrasse.2026-10-06.lunch.2", "name": "...", "...": "same fields as in the meal plan" },
  "avgRating": 3.5,
  "tagCounts": { "tasty": 3, "worth-it": 1 }
}
```

`avgRating` is `null` until the meal has been rated. `tagCounts` says how many ratings used each
tag; tags nobody used are left out.

Errors: `404` unknown meal.

### POST /api/meals/{id}/ratings

Saves a user's rating of a meal: 1–5 stars plus optional tags that say why. Users are identified by
the anonymous id the frontend keeps per device. Each user can rate each meal once. The result shows up
in [`GET /api/meals/{id}`](#get-apimealsid).

Body: `{"userId": "anon:3f1c2b7e-9a4d-4e8b-8c1f-2d5e6a7b8c9d", "stars": 5, "tags": ["tasty", "worth-it"], "source": "location"}`

- `userId`: `anon:` followed by a UUID (required).
- `stars`: 1 to 5.
- `tags` (optional): any of `tasty`, `big-portion`, `small-portion`, `cold`, `too-salty`,
  `worth-it`. A tag listed twice in one rating counts once.
- `source` (optional): how the app knows the user ate there. `location` (located at the mensa),
  `crowd` (reported its crowd) or `guess` (picked it when asked where they ate). Ratings with `crowd`
  or `guess` count half in `avgRating`; all others count fully.

Response `201` with the saved rating:
`{"mealId": "...", "mensaId": "polyterrasse", "mealDate": "2026-10-06", "userId": "anon:...", "stars": 5, "tags": [], "ratedAt": "...", "source": "location"}`.
Errors: `404` unknown meal, `400` missing or invalid `userId`, stars outside 1–5, unknown tag or
source, or invalid body, `409` this user already rated this meal.

### DELETE /api/meals/{id}/ratings

Takes back a user's rating of a meal ("Undo" in the rating card): `DELETE /api/meals/{id}/ratings?userId=anon:...`.
Afterwards `avgRating` and `tagCounts` no longer count it and the user can rate the meal again.
Response `204`. Errors: `400` missing or invalid `userId`, `404` unknown meal or no rating of this user.

## Push notifications for starred dishes

Web Push (RFC 8030/8291/8292, no third-party library): the browser subscribes with the server's VAPID key
and sends the subscription with its starred dishes. Once a day (`app.push.cron`, default 09:30 Zurich) every
subscription gets **at most one** notification listing the starred dishes that appear on a menu from today on
that it was not told about yet ("Pad Thai is back on the menu", one line per dish and day with the mensas).
A dish that is already on a menu when it is starred does not trigger a notification for those days; only a
later menu does. Dish names match ignoring case and spacing. Subscriptions the push service reports as gone
(404/410) are deleted.

- `GET /api/push/public-key` → `{"publicKey": "BN..."}`: pass it as `applicationServerKey` to
  `PushManager.subscribe()`.
- `PUT /api/push/subscription` with `PushSubscription.toJSON()` plus dishes and language:
  `{"endpoint": "https://fcm.googleapis.com/fcm/send/...", "keys": {"p256dh": "...", "auth": "..."}, "dishes": ["Pad Thai"], "language": "de"}`.
  Creates the subscription or replaces its dishes. `200` with `{endpoint, dishes, language}`; `400` for an
  endpoint outside the browsers' push services (Google, Mozilla, Microsoft, Apple), malformed keys or more
  than 100 dishes.
- `DELETE /api/push/subscription` with `{"endpoint": "..."}` → `204`, also for unknown endpoints.
- `POST /api/push/test` with `{"endpoint": "..."}` sends "Notifications are on" → `200`
  `{"delivered": true, "pushServiceStatus": 201}`; `404` without such a subscription; `429` more than once a
  minute per client.

- `POST /api/push/run?forgetAnnounced=false` (internal, only with `INTERNAL_API_ENABLED=true`) runs the daily
  job now and returns `{"sent": n}`. With `forgetAnnounced=true` every subscription first forgets what it was
  told, so starred dishes on the current menus are announced again (for testing; developer tools, "Push
  notifications").

The notification payload (decrypted by the service worker `frontend/public/sw.js`) is
`{"title", "body", "url", "tag": "starred-dishes"}`.

Configuration: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (base64url), else a key pair is generated once into
`VAPID_KEY_FILE` (default `./data/vapid-keys.properties`; in Docker inside the `backend-data` volume). A new
key pair invalidates every subscription. `PUSH_SUBJECT` (default `mailto:unieats@example.com`) is the contact
the push services see; `PUSH_ENABLED=false` stops the daily job; `PUSH_CRON` changes its time.

## Raw upstream endpoints (optional)

The ETH/UZH API clients (on `main`) add raw inspection endpoints under `/api/upstream`. They are
**off by default** and only exist when the backend runs with `mensa.upstream.enabled=true`. They
pass the original ETH/UZH responses through unchanged, for debugging and for building the live
data mapping; the frontend should use the endpoints above.

| Path | Description |
| --- | --- |
| `GET /api/upstream/eth/weekly-rotas` | Raw ETH menus for the week of `date`, paged with `offset`/`pageSize`, in `language` |
| `GET /api/upstream/uzh/week` | Raw UZH (ZFV) menus of the current week, or the next one with `next=true` |
| `GET /api/upstream/uzh/day` | Raw UZH (ZFV) menus of one `date` |
| `GET /api/upstream/eth/locations` | Bundled catalog of ETH facility ids |
| `GET /api/upstream/uzh/locations` | Bundled catalog of ZFV location ids |

Details, configuration (ZFV API key) and error codes: [MENSA_API.md](MENSA_API.md).

## Scheduled website menus

`GET /api/scraped-menus` returns all 39 cafeterias in the main app catalog from the database's `scraped_menu` table. Each entry includes raw MCP `toolResults`, a model explanation, `updatedAt`, `lastAttempt`, `stale` and a generic error on refresh failure. Root fields expose `enabled`, `configured`, `running`, `lastAttempt` and `lastCompleted`. No credentials are returned. Missing or outdated cache entries trigger a background retrieval when enabled and configured; this endpoint returns the currently saved data without waiting for the batch.

Successful raw tool results and their meal projections commit in one database transaction. The normal `GET /api/meals` and `GET /api/mensas/{id}/meal-plan` APIs read the existing `meal` table first. For a missing cafeteria/day, the backend retrieves through OpenAI and the connector's MCP relay, saves the raw JSON, and re-reads the database. Existing upstream meals take precedence, including when an ETH/UZH import arrives after the fallback. Stable IDs prevent duplicate scraper rows. Empty menus and closures are cached for the Zurich day; failed attempts retry after 15 minutes and retain prior evidence. Concurrent requests for the same venue share a lock within one backend instance. Historical reads do not trigger scraping, and on-demand date ranges are bounded to 31 days. A first cache miss can take as long as the AI/MCP retrieval; subsequent reads use the database.

Set `OPENAI_API_KEY` on the backend. The bundled Kotlin connector/MCP sources are in `meal-scraper/`. Root Docker Compose builds and runs them as a private service and sets `MEAL_CONNECTOR_URL=http://meal-scraper:8091`; configure the required shared `MEAL_CONNECTOR_TOKEN` in `.env`. Only the main website/backend address is public; the connector port is not published. Devices use the existing backend meal routes and do not receive either key. For development outside Compose, run the bundled connector locally and use `MEAL_CONNECTOR_URL=http://127.0.0.1:8091` with the same optional local token. See [../DEPLOY.md](../DEPLOY.md) for Linux deployment and readiness checks.

Missing cache entries refresh after startup, with a full refresh daily at 06:00 Europe/Zurich. Set `MEAL_SCRAPER_ENABLED=true` and configure the backend key to enable retrieval; disabling it still allows reading stored results. Override `MEAL_SCRAPER_CRON` as needed. Each venue is bounded to 6 model turns and 8 tool calls; the batch uses the backend OpenAI account. Missing/invalid sources remain explicit failures; original data survives with `stale=true`. The existing backend database now stores the raw evidence and meals. A legacy `backend/data/scraped-menus.json` file is imported once when the raw database table is empty; `MEAL_SCRAPER_SNAPSHOT` specifies that legacy file only. New results are no longer written to JSON files. Mount the backend database data directory to survive container replacement. Runs are serialized in one backend instance, not across multiple replicas.

The existing frontend can read both the raw results API and the normal meal DTO APIs without changes. Meals with a missing, null or empty date are projected as recurring meals for today and the next 14 days; further requested dates reuse the stored raw result. The raw source date remains unchanged. Published closures suppress the scraper projection for affected dates. Unknown dietary information remains `unknown`; a general CHF price applies to all price categories. Source references and the recurring label are retained in the existing description field, with full original metadata in the raw table.

All 39 main-app cafeterias appear in the snapshot. A cafeteria with only a provider homepage/directory in the seed has `url: null` and `status: source_unavailable` after a refresh; no AI call is spent on a non-specific source. Configure a verified venue URL in `mensa/scraper-locations.json` to enable it. Existing imported menus remain visible in the regular menu cards.
