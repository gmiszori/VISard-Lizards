# Meal route planner — branch preview

The `/route-planner/` page plans transit/walking journeys with a 45–60 minute meal break. The browser gets the starting position only after the user clicks **Use my location**; an address can also be entered. Departure and arrival inputs use the device timezone; returned itineraries use Europe/Zurich.

## Run separately from the current app

Copy the variables in `.env.route-planner.example` into the ignored root `.env`. The Google key must have **Routes API** and **Places API (New)** enabled, with billing. Restrict it to those APIs (and the Linux server's outbound IP for deployment). `ROUTE_CONNECTOR_TOKEN` is a separate random secret of at least 16 characters shared only by the backend and the private route connector. Do not put either secret in frontend configuration.

```powershell
docker compose -p mensa-route-test -f docker-compose.yml -f compose.route-planner.yaml --profile route-planner up --build -d
```

Open `http://localhost:8084/route-planner/`. Enter your OpenAI key in the form; it must have access to the model in `ROUTE_PLANNER_MODEL`. The key is cleared from the field after submission, forwarded only to OpenAI by the backend, and never written to storage. Planning uses Google API calls billed to the server project's account and two OpenAI requests billed to the entered key.

For the embedded map, enable **Maps JavaScript API** and create a separate browser key. Restrict it to that API and website referrers `http://localhost:8084/*` and `http://127.0.0.1:8084/*` (use your actual HTTPS domain in production). Save it as `GOOGLE_MAPS_BROWSER_KEY` in root `.env`, then recreate the backend. This key is intentionally public; never reuse the private routing key. `GOOGLE_MAPS_MAP_ID` defaults to Google's development `DEMO_MAP_ID`; set your own map ID for deployment. Missing map configuration does not block planning or external Google Maps links.

The map shows the direct route, numbered meal stops and all returned alternatives. Select a route line, stop, option chip or result card button to highlight travel to the meal in blue and onward travel in green. “All options” fits the complete set on screen. Geometry comes from the MCP result; displaying the map makes no extra routing requests.

The separate Compose project has its own database volume. It starts with the app's seed/upstream menus and disables automatic AI scraper refreshes to avoid duplicate background spending. It does not copy the running app's scraper cache. Existing cafeterias without cached meals and published service hours for the chosen date are omitted; other restaurants can still be suggested. The current application on port 8083 remains separate.

```powershell
docker compose -p mensa-route-test -f docker-compose.yml -f compose.route-planner.yaml --profile route-planner logs -f route-planner backend
docker compose -p mensa-route-test -f docker-compose.yml -f compose.route-planner.yaml --profile route-planner down
```

For a Linux deployment, use the same Compose files and environment with a chosen `ROUTE_WEB_PORT`, behind the existing HTTPS reverse proxy. The MCP connector port is private to the Docker network. Browser location requires HTTPS, except on localhost. This preview is not automatically merged into the main deployment.

## Data flow

```text
Webpage → POST /api/route-planner/plan → OpenAI function call
        → private HTTP connector → Kotlin MCP plan_meal_route
        → Google Routes + Places, combined with database cafeteria menus
        → raw verified options + OpenAI explanation → webpage
```

`GET /api/route-planner/status` checks the MCP process. `GET /api/route-planner/map-config` returns only the public browser key and map ID. `POST /api/route-planner/plan` accepts `{origin,destination,departureTime,arrivalTime,mealMinutes}` and the request header `X-OpenAI-Key`. Timestamps are RFC3339 instants. These endpoints send `Cache-Control: no-store`. Only one plan can run at once, and the existing IP rate limiter allows one submission per minute.

The Kotlin application has a native stdio MCP mode and a private HTTP bridge mode. The server JAR is packaged with `meal-scraper/kotlin.bat package -m route-server -p jvm -f executable-jar`. For a native MCP client, launch `java -jar <route-server-jvm-executable.jar>` with `GOOGLE_MAPS_API_KEY` in its environment. The tool schema documents its full trip and cafeteria inputs; the app's AI adapter exposes the same tool without arguments and injects trusted request/database inputs so the model cannot change the deadline or evidence.

## Search and limits

- Supports journeys on one date in the next seven days, up to 18 hours, with a five-minute arrival buffer.
- Computes both transit and walking routes and uses scheduled transit stop times, including waiting and final walking.
- Google Places routing does not support transit. Restaurant discovery therefore uses three nearby searches at points on the direct route, then checks both journey legs with Routes.
- Checks at most eight route-near stops, balancing cafeterias and restaurants, within 1.5 km of the direct route. Options are ordered by earliest verified arrival; the result is the best among those checked, not a globally optimal search of every restaurant.
- A cafeteria needs a cached menu and matching meal-service window. The complete break must fit inside that window, and only the matching service's dishes are shown.
- Restaurant opening hours do not confirm kitchen service, specific dishes or prices. Suggestions explicitly label these unknowns and link to the restaurant's website. Google restaurant data is returned per request and is not saved in the app database.
- Estimated routes do not guarantee arrival during disruptions. Google attribution and any returned third-party attributions are displayed. Each journey leg also opens in Google Maps.
- Bistro HPI and Bellavista remain excluded.

## Validation

```powershell
cd backend
.\mvnw.cmd -Dtest=RoutePlannerServiceTests test
cd ../meal-scraper
.\kotlin.bat test -m route-server -p jvm
cd ../frontend
pnpm check
pnpm build
```
