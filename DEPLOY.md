# Test deployment

## Docker demo on a server

The hackathon managed address forwards plain HTTP to port 8080 on the VM. Copy `.env.example` to
`.env`, set `MEAL_CONNECTOR_TOKEN` to a generated secret (`openssl rand -hex 32`), set
`OPENAI_API_KEY` and `MEAL_SCRAPER_ENABLED=true` to enable AI menu retrieval, and run from the repository root:

```sh
docker compose --profile scraper up --build -d
```

Caddy serves the frontend over plain HTTP on `0.0.0.0:8080`; the backend is reachable only by Caddy
over the private Compose network. The hackathon managed address handles access control and TLS, so
no VM firewall rule or TLS configuration is needed. The `backend-data` volume persists the H2
database. Back up this volume before replacing the server or removing volumes. Do not commit `.env`.

The Caddy proxy trusts client-IP forwarding headers from private proxy ranges by default. If the
hackathon ingress uses public source addresses, set `CADDY_TRUSTED_PROXY_RANGES` in `.env` to the
documented ingress CIDR(s), separated by spaces. Trust only proxy address ranges; do not use `0.0.0.0/0`.
Rate limits rely on these forwarded client addresses.

Caddy limits request bodies to 2 MB and adds `nosniff`, frame-denial, referrer, and permissions
headers to responses.

Generic data CRUD, cache-management, and manual menu-sync endpoints are disabled by default. Do not
set `INTERNAL_API_ENABLED=true` on a publicly reachable deployment unless those routes are protected
by authentication or restricted to a private network.

The frontend image contains bundled static pages in Caddy's `/srv`. On startup it waits for the
backend and rebuilds the pages with current API data. If readiness or building fails, the bundled
pages remain available. Recreate/restart the frontend to refresh the initial menu snapshot;
browser API features use the live backend through Caddy and still require backend readiness.
Caddy permits same-origin microphone access for voice search; HTTPS (or localhost) and explicit
browser permission are required. The Kotlin scraper and its HTTP connector are built from `meal-scraper/` and deployed
as the private `meal-scraper` service. No separate repository checkout, Windows process, or
`host.docker.internal` connection is needed on Linux.

## Meal scraping from other devices

```text
Phone / laptop -> https://your-server/api/* -> Java backend
                                             -> http://meal-scraper:8091 (shared token)
                                             -> Kotlin MCP server (stdio child)
                                             -> public meal websites / PDFs
```

Use the same deployed website address on every device. Existing backend routes
`/api/meals`, `/api/mensas/{id}/meal-plan`, and `/api/scraped-menus` expose database-backed meal
results. Missing current/future data invokes the connector when scraping is enabled and the
backend key is configured. Refresh also runs daily at 06:00 Europe/Zurich. Devices do not need
an OpenAI key or connector token. The backend is the only OpenAI client in this path.

Compose sets `MEAL_CONNECTOR_URL=http://meal-scraper:8091` and passes the same
`MEAL_CONNECTOR_TOKEN` to both services. The optional MCP service requires the `scraper` profile;
alternatively set `COMPOSE_PROFILES=scraper` in `.env` to include it with plain `docker compose up`.
Check connector readiness before triggering a manual refresh. Port 8091 is not published and is not proxied by Caddy. Keep `.env` on the server; never
put these keys in browser settings or frontend build variables. The existing `backend-data`
volume holds both raw MCP evidence and projected meal rows.

For a general Linux VM, install Docker Engine with Compose v2, clone this repo, configure `.env`,
and run the same Compose command. Point your HTTPS ingress/domain to the server's port 8080.
On a private LAN, the website is reachable at `http://<server-LAN-IP>:8080` when that port is
allowed by the host firewall. `localhost` on a phone refers to the phone, so use the server address.

If a local Eclipse backend already occupies port 8080, set `WEB_PORT=8083` in `.env` or start with:

```sh
WEB_PORT=8083 docker compose --profile scraper up --build -d
```

Then use `http://localhost:8083`. The backend remains private on container port 8080, and the
manual refresh command is unchanged. Keep `WEB_PORT=8080` on the managed VM for its ingress.

Verify deployment:

```sh
docker compose ps
docker compose exec meal-scraper sh -c 'curl -fsS -H "Authorization: Bearer $MEAL_CONNECTOR_TOKEN" http://127.0.0.1:8091/health'
docker compose exec meal-scraper sh -c 'curl -fsS -H "Authorization: Bearer $MEAL_CONNECTOR_TOKEN" http://127.0.0.1:8091/api/ai/tools'
curl -fsS https://your-server/api/health
curl -fsS https://your-server/api/scraped-menus
docker compose logs --tail=100 backend meal-scraper
```

To force a fresh AI/MCP batch before 06:00, run this from the repository directory on the server:

After installing this update, rebuild once with `docker compose --profile scraper up --build -d`.
Set `MEAL_SCRAPER_ENABLED=true`, `OPENAI_API_KEY`, and a random `MEAL_CONNECTOR_TOKEN` of at
least 32 characters in `.env`. The short default development token cannot authorize manual refreshes.
For the GPT-5 scraper, set `MEAL_SCRAPER_MODEL=gpt-5-mini`; remove an old model override or replace
it explicitly. Updated code defaults do not override existing `.env` settings.

```sh
docker compose exec -T meal-scraper sh -c 'curl -fsS -X POST -H "Authorization: Bearer $MEAL_CONNECTOR_TOKEN" http://backend:8080/api/scraped-menus/refresh'
```

The command uses the container's configured token; no key needs to be pasted into your shell.
You can also attach to the backend terminal (PowerShell or Bash):

For **r directly at the IntelliJ PowerShell terminal prompt**, load the helper once per
terminal session from the repository root:

```powershell
. .\scraper-console.ps1 -Install
r
```

`r` now starts or joins the refresh and prints the start time, per-cafeteria saved/failed
results, running elapsed time, and final completion time and duration. `s` shows status.
These aliases apply only to this terminal session. Ctrl+C stops watching; the backend
continues refreshing. The single-command equivalent with progress is
`powershell -ExecutionPolicy Bypass -File .\scraper-console.ps1 -Refresh -Wait`.

On Windows, the simplest terminal console is `powershell -ExecutionPolicy Bypass -File .\scraper-console.ps1`
from the repository root. Type **r + Enter** in that console; it forwards the authenticated
refresh request to the running backend even when Docker is detached. Type **s** for progress,
or **q** to exit. For a single refresh use `powershell -ExecutionPolicy Bypass -File .\scraper-console.ps1 -Refresh`.
The helper reads only the connector token and web port from the root `.env` and never prints
credentials. It also accepts `-BackendUrl https://your-server`.

Typing `r` at a normal PowerShell prompt, in `docker compose logs`, or after `up -d` does
not reach Java's standard input. Use the helper above or attach below. The website polls
saved results every minute; `lastCompleted` changes only after the entire batch finishes.

```sh
docker attach --sig-proxy=false $(docker compose ps -q backend)
```

Type `r` and press Enter to start the same full refresh. Press **Ctrl+P, then Ctrl+Q** to detach
while leaving the backend running. Compose keeps backend stdin open and enables a terminal for
this command; recreate the backend once after installing this change. When running Java directly
in a terminal or IDE Run console, just type `r` and Enter there. The listener is a daemon and
exits at EOF; set `MEAL_SCRAPER_CONSOLE_ENABLED=false` for noninteractive Java deployments.

`{"status":"started"}` (HTTP 202) means the background batch was accepted. It refreshes all
configured cafeterias even if today's cache is fresh, calls OpenAI using the backend key, and
saves raw results and meal rows to the database. The 06:00 schedule stays unchanged. HTTP 409
means a batch is already running; HTTP 503 means scraping is disabled or the backend key is missing.
HTTP 401 means the shared token is missing or mismatched. Check progress with
`curl -fsS https://your-server/api/scraped-menus` (`running`, `lastCompleted`, and each cafeteria's
`stale`/`error` fields); acceptance does not guarantee every venue succeeds. Prior data survives failures.

After updating source, run `docker compose --profile scraper up --build -d` again. If connector health reports
MCP unavailable, inspect logs and run `docker compose restart meal-scraper`. Do not use
`docker compose down -v` during an update: it removes the database volume. Linux CI builds
the bundled MCP image and checks MCP readiness and backend connectivity without OpenAI calls.

Open the managed address provided by the hackathon to access the demo.

The GitHub Actions workflow in `.github/workflows/ci.yml` checks the Java backend and the Astro
frontend on pushes to `main` and on pull requests. The optional `render.yaml` Blueprint defines a
Spring Boot API and a static Astro site on Render. Adding the Blueprint file does not create the
services; a Render account owner must apply it once.

## Set up the Blueprint

1. In Render, choose **New > Blueprint** and select `gmiszori/VISard-Lizards` on `main`.
2. Apply `render.yaml`. The default service names target `visard-lizards-api.onrender.com` and
   `visard-lizards.onrender.com`; Render may give either service a suffix if a name is taken.
3. If the API host differs, update the static site's `PUBLIC_API_URL` to its actual HTTPS URL and
   redeploy the site. Confirm that `APP_CORS_ALLOWED_ORIGINS` on the API includes the site's origin.
4. Check `/api/meta`, `/`, `/settings`, and a `/canteen/{id}` page on the deployed hosts.

The static build waits for the API before generating pages. If it cannot be reached within five
minutes, the build fails so an older working deployment stays in place instead of silently
publishing bundled sample menus.

## Free-plan limits

The backend may sleep when idle. Its H2 database has no persistent disk on the free plan, so
ratings and crowd reports are lost after a restart or redeploy. Menus in the static HTML are
snapshots from the last successful frontend build; the backend can refresh its own data more often.
