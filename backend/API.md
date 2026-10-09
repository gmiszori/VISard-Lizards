# Backend REST API

Start: `cd backend && ./mvnw spring-boot:run` → `http://localhost:8080`

Interactive docs: [Swagger UI](http://localhost:8080/swagger-ui.html), OpenAPI JSON at `/v3/api-docs`.

> If Maven fails with `PKIX path building failed`, Java does not trust your network's TLS certificate.
> Run with the Windows certificate store: `MAVEN_OPTS="-Djavax.net.ssl.trustStoreType=Windows-ROOT" ./mvnw spring-boot:run`

## Data

Mensas and meals come from `src/main/resources/data/mensa-db.json`, a snapshot of
`frontend/src/data/canteens.ts` (22 ETH/UZH mensas, 901 meals, **2026-09-28 to 2026-10-09**).
Dates outside that range return an empty meal plan. Regenerate after the frontend data changes:

```bash
node backend/scripts/export-mensa-db.mjs
```

`MensaRepository` is an interface: a live implementation using the ETH/UZH clients can replace
`JsonMensaRepository` without changes to services or controllers.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/mensas?campus=` | `MensaDTO[]` without meal plan. `campus`: `zentrum`, `hoenggerberg`, `irchel` (optional) |
| GET | `/api/campuses` | `[{id, name, city}]`, ids for the `campus` filter |
| GET | `/api/meta` | `{today, menuDate, dataFrom, dataTo}`: which days have meals and which day to show by default |
| GET | `/api/mensas/{id}?dateStart=&dateEnd=&priceCategory=` | `MensaDTO` with meal plan. Dates default to the menu date (see below) |
| GET | `/api/mensas/{id}/meal-plan?dateStart=&dateEnd=&priceCategory=` | `MealPlanDTO`. Both dates required, inclusive |
| POST | `/api/mensas/{id}/ratings` | `201`. Body `{"stars": 1-5}` |
| GET | `/api/mensas/{id}/crowd` | `{histogram: {mensaId, sufficient, sampleSize, byWeekday?}, live: CrowdReport[]}` |
| POST | `/api/mensas/{id}/crowd-reports` | `201` + `CrowdReport`. Body `{"level": 1-5}`, the server stamps the time |
| GET | `/api/meals/{id}?priceCategory=` | `{mensaId, date, meal: MealDTO, avgRating, tagCounts}` |
| POST | `/api/meals/{id}/ratings` | `201`. Body `{"stars": 1-5, "tags": ["tasty", ...]}`, tags optional |

- Dates: `YYYY-MM-DD`. Times: `HH:mm`.
- "Today" is today in Zurich. The **menu date** is today if there are meals for it, otherwise the latest
  earlier day with meals (e.g. Friday on weekends), the same rule as `MENU_DATE` in `canteens.ts`.
- `priceCategory`: `STUDENT` (default), `STAFF`, `EXTERNAL`.
- Mensa ids are the ids from `canteens.ts`, e.g. `polyterrasse`, `archimedes`.
- Meal rating tags: `tasty`, `big-portion`, `small-portion`, `cold`, `too-salty`, `worth-it`.
- Ratings and crowd reports are stored in an H2 file database under `backend/data/` (git-ignored, created on
  first start; set `DB_URL` to use another JDBC database). `avgRating` is `null` until a mensa has been rated.
- Crowd: `live` holds the reports of the last 30 minutes, newest first. `histogram.byWeekday`
  (`mon`..`sun`, 24 hourly values 0–100, Zurich time) is only present when `sufficient` is true
  (at least 20 reports).
- Errors are [problem details](https://www.rfc-editor.org/rfc/rfc9457):
  `{"status": 404, "title": "Not Found", "detail": "Mensa not found: xyz", ...}`.
- CORS is open for the Astro dev server (`http://localhost:4321`), see `app.cors.allowed-origins`.

## Examples

`GET /api/mensas?campus=irchel`

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

`openingHours` covers the next 7 days starting today; closed days have an empty list.

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

Entries of a day are ordered lunch before dinner. `timeStart`/`timeEnd` are `null` when the mensa
publishes no service window for that day.

`MensaDTO.id` (e.g. `polyterrasse`) is not on the whiteboard either; it is needed to call `/api/mensas/{id}`.

**`MealDTO` fields:**
- `id`: e.g. `polyterrasse.2026-10-06.lunch.2`, for `/api/meals/{id}`. Not on the whiteboard, added so single meals can be addressed.
- `description`: the meal's components joined with commas.
- `classification`: `[diet, kind, service]`, where diet is `vegan`/`vegetarian`/`meat`/`fish`, kind is `main`/`buffet`/`dessert`/`drink` and service is `lunch`/`dinner`.
- `envImp`: the ETH eco score (e.g. `C+`) or the UZH climate impact (`LOW`/`MEDIUM`/`HIGH`).
- `price.price`: `null` when the source has no price.
