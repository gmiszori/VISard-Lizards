# CampusEats frontend

Astro site for the ETH and UZH mensas. Menus, ratings and crowd predictions come from the CampusEats
backend in `../backend` (Spring Boot); mensa details (photos, addresses, opening windows) come from the
bundled database in `src/data/canteens.ts`.

## Run it with the backend

```sh
cd ../backend && ./mvnw spring-boot:run      # http://localhost:8080
cd ../frontend && pnpm install && pnpm dev   # http://localhost:4321
```

The backend URL is `PUBLIC_API_URL` (copy `.env.example` to `.env`); it defaults to
`http://localhost:8080`. Set it to an empty value to work without a backend.

| What | From | Where |
| --- | --- | --- |
| Today's menus, prices, allergens | `GET /api/meta`, `GET /api/meals?date=` | `src/data/app-data.ts` (page render) |
| Mensa ratings | `GET /api/mensas` | `src/data/app-data.ts` |
| Meal rating (1–5 stars) | `GET /api/meals?date=`, `POST /api/meals/{id}/ratings` | `src/rating/` (browser) |
| Predicted crowd | `GET /api/mensas/{id}/crowd` | `src/pages/canteen/[id].astro` (browser) |

API reference: `../backend/API.md` and the backend's Swagger UI at `/swagger-ui.html`.

**When the backend is not reachable**, pages render the bundled sample menus and show a note on the
home page; the build logs a `[campuseats] Backend ... not reachable` warning. The rating card saves on
the device only if no backend is configured.

**Static builds:** `pnpm dev` renders every request, so menus are always current. `pnpm build`
takes the menus of build time; rebuild to refresh them (the backend imports new menus every 6 hours).

## Commands

| Command | Action |
| :-- | :-- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server at `localhost:4321` |
| `pnpm build` | Static site in `./dist/` |
| `pnpm preview` | Preview the build |
| `pnpm check` | Type check (`astro check`) |
| `pnpm test` | Unit tests (onboarding, rating) |
