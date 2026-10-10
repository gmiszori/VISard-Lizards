# CampusEats frontend

Astro site for the ETH and UZH mensas. Menus, ratings and crowd predictions come from the CampusEats
backend in `../backend` (Spring Boot); mensa details (photos, addresses, opening windows) come from the
bundled database in `src/data/canteens.ts`.

## Run it with the backend

```sh
cd ../backend && ./mvnw spring-boot:run      # http://localhost:8080
cd ../frontend && pnpm install && pnpm dev   # http://localhost:4321
```

Install dependencies on the same operating system that will run the frontend. Do not reuse
`node_modules` between Windows and WSL/Linux; pnpm creates platform-specific package links.
If the checkout has been moved between those environments, delete `frontend/node_modules` and
run `pnpm install` again from the target environment.

The backend URL is `PUBLIC_API_URL` (copy `.env.example` to `.env`); it defaults to
`http://localhost:8080`. Set it to an empty value to work without a backend.

| What | From | Where |
| --- | --- | --- |
| Today's menus, prices, allergens | `GET /api/meta`, `GET /api/meals?date=` | `src/data/app-data.ts` (page render) |
| Mensa ratings | `GET /api/mensas` | `src/data/app-data.ts` |
| Meal rating (1–5 stars) | `GET /api/meals?date=`, `POST /api/meals/{id}/ratings` | `src/rating/` (browser) |
| Predicted crowd | `GET /api/mensas/{id}/crowd` | `src/pages/canteen/[id].astro` (browser) |
| AI search | `POST /api/search` | Search bar on the home page (browser) |

Set `OPENAI_API_KEY` in the **backend** environment to enable AI search. `OPENAI_MODEL` defaults to
`gpt-4.1-mini`. The key is never sent to the browser. Search requests are debounced and include the
currently displayed canteen names, campuses, dishes and diet labels; the model returns matching canteen
IDs. If the key or backend is unavailable, the search bar still filters by text locally.

API reference: `../backend/API.md` and the backend's Swagger UI at `/swagger-ui.html`.

**When the backend is not reachable**, pages render the bundled sample menus and show a note on the
home page; the build logs a `[campuseats] Backend ... not reachable` warning. The rating card saves on
the device only if no backend is configured.

**Static builds:** `pnpm dev` renders every request, so menus are always current. `pnpm build`
takes the menus of build time; rebuild to refresh them (the backend imports new menus every 6 hours).

## Docker demo deployment

From the repository root, configure any secrets in `.env` and start both services:

```sh
docker compose up --build -d
```

The frontend is served by Caddy and proxies `/api` to the backend, which remains private on the
Compose network. For a public server, point a DNS A/AAAA record at the server and set `DOMAIN` to
that hostname in `.env`; Caddy will obtain and renew HTTPS certificates automatically. Ports 80 and
443 (TCP and UDP) must be reachable. For a local HTTP demo, leave `DOMAIN` unset. Change `HTTP_PORT`
or `HTTPS_PORT` if the host ports are already in use. The `backend-data` volume persists the H2
database, and Caddy's data/config volumes persist certificate state. Set `CORS_ALLOWED_ORIGINS` to
specific origins only if you need cross-origin API access; same-origin requests through Caddy do not
need a broad CORS rule.

The Astro site is statically generated in the image, so its initial menu snapshot is taken during
the image build. Browser API calls use the frontend origin and reach the live backend through Caddy.
The separate menu scraper is off by default because it requires a separately deployed connector;
enable it with `MEAL_SCRAPER_ENABLED=true` after setting its connector URL and token.

## Commands

| Command | Action |
| :-- | :-- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server at `localhost:4321` |
| `pnpm build` | Static site in `./dist/` |
| `pnpm preview` | Preview the build |
| `pnpm check` | Type check (`astro check`) |
| `pnpm test` | Unit tests (onboarding, rating) |
