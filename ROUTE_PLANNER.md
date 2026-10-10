# Meal route planner branch preview

The route planner uses OpenStreetMap instead of Google. It retains walking, Swiss public transport, the user's OpenAI key, cached cafeteria meals and three separate MCP tools.

## Run

Set `ROUTE_CONNECTOR_TOKEN` (a random secret of at least 16 characters) in ignored root `.env`. Optional settings are in `.env.route-planner.example`. No Google key or OSM login is required.

```powershell
docker compose -p mensa-route-test -f docker-compose.yml -f compose.route-planner.yaml --profile route-planner up --build -d
```

Open http://localhost:8084/route-planner/ and enter an OpenAI API key with access to `ROUTE_PLANNER_MODEL`. This isolated stack has a separate database and leaves the main app on 8083 available. The automatic meal scraper is disabled in this preview.

## Data flow

Browser form and Leaflet map → Java backend → OpenAI tool decisions → private Kotlin MCP bridge → private Node OSM data adapter.

The Kotlin MCP remains Kotlin. The Node adapter is necessary because the requested https://github.com/osmlab/osm-api-js library is JavaScript: it reads canonical restaurant objects after Overpass discovery. It never edits OSM, logs in, opens changesets or sends messages. The library does not provide routing itself.

- `get_route_options`: retrieve actual walking/transit routes and a temporary session.
- `find_meal_stops`: discover and verify up to four meal stops, with two preferred. Use database meals/service windows for cafeterias and OSM opening_hours for restaurants.
- `show_route_on_map`: select only an existing verified option, or -1 for the direct route. No new provider requests.

The authenticated HTTP bridge exposes `/api/tools/routes`, `/api/tools/stops`, `/api/tools/show`, legacy `/api/tools/plan` and `/health`. The internal Node service exposes authenticated `/options`, `/nearby` and `/health` on 8093. Neither MCP nor the data adapter publishes a host port. Only the backend is exposed through the website proxy. Deploy behind HTTPS on Linux; never publish connector tokens or private services publicly.

OpenAI sees the trip and evidence, but cannot replace the submitted trip/session or invent map geometry. The backend makes three tool decisions plus a final explanation, with `store:false`. The entered API key is cleared after submission, sent only to OpenAI, and not stored.

## Providers and limits

- Leaflet 1.9.4 renders OSM tiles: https://operations.osmfoundation.org/policies/tiles/. Browser caching is preserved; no prefetch/offline tile download. Attribution and Fix the map links stay visible.
- FOSSGIS OSRM **foot** instance supplies walking geometry: https://routing.openstreetmap.de/about.html. Never use the driving profile as walking. Requests carry an identifying User-Agent and are serialized at a maximum of one per second.
- https://transport.opendata.ch/docs.html supplies Swiss transit schedules, intermediate stops and address lookup. Street-address inputs use address search rather than station search. Resolved place names are returned as warnings for user verification.
- Overpass discovers nearby restaurants; osm-api-js reads their current tags. opening_hours parses Swiss/Zurich dated, split and overnight schedules. Unknown intervals and unsupported expressions are excluded. Opening hours do not confirm kitchen availability, prices or meals.

Public endpoints suit this small preview; they are shared services without an availability guarantee. For more traffic, configure your own providers using `OSM_FOOT_URL`, `SWISS_TRANSPORT_URL` and `OSM_OVERPASS_URL`; any OSRM replacement must have a foot graph. Public service limits still apply, even without API keys. No Nominatim dependency.

Application-wide external calls are serialized, at least 1.05 seconds apart per host, with 15-second timeouts. A single adapter request runs at a time. Bounded in-memory caches (200 entries) retain transit for 30 seconds, walking geometry/location lookup for 24 hours, nearby places for five minutes and canonical OSM tags for one hour. Restart clears caches. Kotlin trip sessions expire after three minutes and selection removes them.

Solid lines show actual walking paths. Dashed transit lines connect published stops; the timetable API does not supply exact track geometry. Mixed legs retain separate walking/transit segments. Transit distance is unavailable, so `distanceMetres` on transit legs covers walking only and `provider.distanceScope` says `walking_only`. A journey is omitted if its actual foot transfer cannot fit the published schedule. Provider failures fall back to whichever travel mode can be verified and are reported in warnings.

Meal breaks are 45–60 minutes, within published hours, with a five-minute arrival buffer. Results are best among checked stops within 1.5 km of the direct route, not globally optimal. Bistro HPI/Bellavista exclusions remain. Check disruptions and special closures before travelling.

Dependency audit: osm-api 4.0.1 bundles an XMLBuilder advisory (GHSA-gh4j-gqv2-49f6). This adapter uses only read methods, never the affected XML writing functionality. Track the upstream fix before adding any OSM editing features.

## Checks

```powershell
# backend
.\mvnw.cmd '-Dtest=RoutePlannerServiceTests,RoutePlannerMapConfigTests' test
# meal-scraper
.\kotlin.bat test -m route-server -p jvm
# meal-scraper/osm-data
npm test
# frontend
node --experimental-strip-types --test src/route-planner/*.test.ts
pnpm check
```

## Self-hosted walking on Linux

Following https://wiki.openstreetmap.org/wiki/Routing and the official OSRM MLD pipeline, `compose.osrm.yaml` adds a private pedestrian router. It builds the graph with `/opt/foot.lua`, not the car profile. Walking alternatives are returned by OSRM; transfer checks use its fastest foot route. Locations over 100 metres from the pedestrian network are rejected instead of snapping far away.

Download a regional OSM PBF extract, for example from https://download.geofabrik.de/europe/switzerland.html, onto the Linux host as `region.osm.pbf`. This initial download and graph build can be substantial and is not started automatically in the preview.

```sh
docker volume create mensa-route-test_osrm-data
docker run --rm -v "$PWD/region.osm.pbf:/input/region.osm.pbf:ro" -v mensa-route-test_osrm-data:/data alpine:3.22 cp /input/region.osm.pbf /data/region.osm.pbf
docker compose -p mensa-route-test -f docker-compose.yml -f compose.route-planner.yaml -f compose.osrm.yaml --profile route-planner up --build -d
```

The build service runs extract, partition and customize once, and marks successful completion. OSRM starts only after a successful graph build, and publishes no host port. The adapter switches to `http://osrm-foot:5000` automatically. Omit `compose.osrm.yaml` to use the public foot service. For a map-data update, build a fresh volume before switching; the marker prevents repeated builds. Keep sufficient RAM and disk for the extract.

Public transport continues to use Swiss timetables. A full self-hosted transit engine such as OpenTripPlanner (also in the wiki) additionally needs current GTFS data. OSM road data alone does not supply transit schedules.

OpenAI key failures now return 401, model access failures 503 and rate/credit limits 429 with useful messages, instead of generic routing 502s.

Validation: official OSRM v5.27.1 container successfully built and served a synthetic test graph, choosing a pedestrian detour over a forbidden motorway shortcut. The full Switzerland graph has not been downloaded/built on this machine; current preview uses FOSSGIS foot routing.
