# Backend REST API

Start: `cd backend && ./mvnw spring-boot:run` → `http://localhost:8080`

Interactive docs: [Swagger UI](http://localhost:8080/swagger-ui.html), OpenAPI JSON at `/v3/api-docs`.

> If Maven fails with `PKIX path building failed`, Java does not trust your network's TLS certificate.
> Run with the Windows certificate store: `MAVEN_OPTS="-Djavax.net.ssl.trustStoreType=Windows-ROOT" ./mvnw spring-boot:run`

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
startup and every 6 hours (`app.live-import.cron`, Zurich time). For each ETH mensa with live meals in a
week, that week's meals are replaced; mensas without live meals keep what they had, and a failed download
keeps the existing meals. `EthMenuMapper` maps Cookpit's classes, allergens and customer groups to the
app's values (diet, canonical allergen ids, student/staff/external prices). English texts are used; where
Cookpit's English translation is missing ("novalue") or a placeholder (one English name for meals with
different German names, e.g. Tannenbar's "Chicken Katsu" in October 2026), the German name and
description are used instead. Turn it off with
`app.live-import.enabled=false`. UZH menus are not imported yet: the maintained ZFV API needs
`MENSA_ZFV_API_KEY` (see [MENSA_API.md](MENSA_API.md)), so UZH mensas only have the snapshot.

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
| GET | [`/api/meals/{id}`](#get-apimealsid) | One meal with its ratings |
| POST | [`/api/meals/{id}/ratings`](#post-apimealsidratings) | Rate a meal |

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
  one rating per anonymous user id and meal (`409` otherwise).
- CORS is open for the Astro dev server (`http://localhost:4321`), see `app.cors.allowed-origins`.
- **Frontend:** the Astro app in `frontend/` uses `/api/meta`, `/api/meals`, `/api/mensas`,
  `/api/mensas/{id}/crowd` and `POST /api/meals/{id}/ratings` (see `frontend/README.md`).

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
`429` already rated by this client in the last 24 hours.

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
Errors: `404` unknown mensa, `400` level outside 1–5 or invalid body, `429` already reported
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

Body: `{"userId": "anon:3f1c2b7e-9a4d-4e8b-8c1f-2d5e6a7b8c9d", "stars": 5, "tags": ["tasty", "worth-it"]}`

- `userId`: `anon:` followed by a UUID (required).
- `stars`: 1 to 5.
- `tags` (optional): any of `tasty`, `big-portion`, `small-portion`, `cold`, `too-salty`,
  `worth-it`. A tag listed twice in one rating counts once.

Response `201` with the saved rating:
`{"mealId": "...", "mensaId": "polyterrasse", "mealDate": "2026-10-06", "userId": "anon:...", "stars": 5, "tags": [], "ratedAt": "..."}`.
Errors: `404` unknown meal, `400` missing or invalid `userId`, stars outside 1–5, unknown tag or
invalid body, `409` this user already rated this meal.

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
