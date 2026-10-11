# Meal route planner branch preview

The route planner uses OpenStreetMap for routing and restaurant data, with Google Maps JavaScript for display only. It retains walking, Swiss public transport, the user's OpenAI key, cached cafeteria meals and three separate MCP tools.

## Run

Set `ROUTE_CONNECTOR_TOKEN` (a random secret of at least 16 characters) in ignored root `.env`. Optional settings are in `.env.route-planner.example`. For the map display, set `GOOGLE_MAPS_BROWSER_KEY` to a browser key restricted to Maps JavaScript API and your website referrers. No Google routing key or OSM login is required.

```powershell
docker compose -p mensa-route-test -f docker-compose.yml -f compose.route-planner.yaml --profile route-planner up --build -d
```

Open http://localhost:8084/route-planner/. A working OpenAI key enables AI route selection and explanation; unavailable/invalid keys fall back to verified backend-ranked results. The API also accepts requests without an OpenAI key. This isolated stack has a separate database and leaves the main app on 8083 available. The scheduled all-venue meal refresh is disabled in this preview; the private scraper MCP is enabled for on-demand route-stop menus.

The first startup automatically downloads the Swiss OSM extract and builds a private pedestrian OSRM graph. Allow several minutes and enough disk/RAM for preprocessing. The graph and restaurant catalog use named Docker volumes; ordinary rebuilds reuse them. No routing-provider API key is required.

## Data flow

Browser form and Google Maps JavaScript display → Java backend → private Kotlin MCP tools → private Node data adapter → private OSRM / Swiss timetable API. After verification, OpenAI may select and explain an existing option.

The Kotlin MCP remains Kotlin. The Node adapter is necessary because the requested https://github.com/osmlab/osm-api-js library is JavaScript: it reads canonical restaurant objects after Overpass discovery. It never edits OSM, logs in, opens changesets or sends messages. The library does not provide routing itself.

- `get_route_options`: retrieve actual walking/transit routes and a temporary session.
- `find_meal_stops`: use a daily regional restaurant catalog and one batched walking-time matrix to rank up to 64 candidates before verifying up to four meal stops. Use database meals/service windows for cafeterias and OSM opening_hours for restaurants. Matrix costs rank candidates without excluding feasible transit journeys.
- `show_route_on_map`: select only an existing verified option, or -1 for the direct route. No new provider requests.

The authenticated HTTP bridge exposes `/api/tools/routes`, `/api/tools/stops`, `/api/tools/show`, legacy `/api/tools/plan` and `/health`. The internal Node service exposes authenticated `/options`, `/nearby`, `/matrix` and `/health` on 8093. MCP, the data adapter and OSRM publish no host ports. Only the backend is exposed through the website proxy. Deploy behind HTTPS on Linux; never publish connector tokens or private services publicly.

The backend invokes route discovery and meal checks before any AI request. OpenAI sees the trip and verified evidence, but cannot replace the submitted session or invent map geometry. It can request `show_route_on_map` for an existing option, followed by an explanation: at most two AI requests, with `store:false`. On quota, authentication, model or output failures, the backend selects the earliest verified meal arrival (or the direct route when none fits), executes the same map tool and returns HTTP 200 with a visible warning and `aiAvailable:false`. The entered OpenAI key stays in the form until cleared or the page reloads; it is sent through the backend only to OpenAI, never to MCP or map providers, and never persisted. Tool records include `initiatedBy` to distinguish backend and AI dispatch.

AI requests time out after 45 seconds each. If the subsequent MCP selection fails or the session expires, the backend can still display the previously verified geometry with an explicit warning. Unknown and ambiguous location matches are rejected instead of taking the first unrelated result. `ETH Zentrum` resolves to Rämistrasse 101, Zürich.

## Providers and limits

- Google Maps JavaScript draws supplied route geometry and clickable numbered stops. It does not call Google Directions, Routes, Places or geocoding. Transit stop sequences remain dashed. Only the public browser key is exposed by `/api/route-planner/map-config`.
- Private OSRM with an extracted **foot** graph supplies walking geometry and batched travel-time matrices. Never use the driving profile as walking. `OSM_FOOT_URL` can override the private endpoint; public alternatives retain provider throttling.
- https://transport.opendata.ch/docs.html supplies Swiss transit schedules, intermediate stops and address lookup. Street-address inputs use address search rather than station search. Resolved place names are returned as warnings for user verification.
- One regional Overpass snapshot covers Zurich (47.1–47.7 latitude, 8.2–8.9 longitude), stored in `/data/restaurants.json`. Startup and a 30-minute check refresh it only when at least 24 hours old. Failed refreshes keep the file but do not treat expired hours as current; cafeterias and direct routes can still work. Nearby searches use this local catalog. osm-api-js refreshes canonical tags in batches, caches by object for 24 hours and falls back to the dated snapshot if unavailable. opening_hours parses Swiss/Zurich dated, split and overnight schedules. Unknown intervals and unsupported expressions are excluded. Opening hours do not confirm kitchen availability, prices or meals.

Swiss timetables, OSM objects and catalog refresh still use shared external services. Configure alternatives using `OSM_FOOT_URL`, `SWISS_TRANSPORT_URL` and `OSM_OVERPASS_URL`; any OSRM replacement must have a foot graph. Public service limits still apply, even without API keys. No Nominatim dependency.

Application-wide provider calls are serialized, with 15-second timeouts. Public hosts are paced at least 1.05 seconds apart; the private `osrm-foot` host is not artificially delayed. HTTP 429 activates a provider cooldown using Retry-After (30 seconds if missing). Identical in-flight cached lookups share a promise. A single adapter request runs at a time. Bounded in-memory caches retain transit for 30 seconds, walking/matrices/location lookup for 24 hours, and canonical tags for 24 hours (2,000 objects). The fixed regional restaurant snapshot persists; API keys and user journeys do not. Kotlin trip sessions expire after three minutes and selection removes them. Backend submissions have a ten-second cooldown; failed requests release their reservation.

Solid lines show actual walking paths. Dashed transit lines connect published stops; the timetable API does not supply exact track geometry. Mixed legs retain separate walking/transit segments. Transit distance is unavailable, so `distanceMetres` on transit legs covers walking only and `provider.distanceScope` says `walking_only`. A journey is omitted if its actual foot transfer cannot fit the published schedule. Provider failures fall back to whichever travel mode can be verified and are reported in warnings.

Meal breaks are 45–60 minutes, within published hours, with a five-minute arrival buffer. Results are best among checked stops within 1.5 km of the direct route, not globally optimal. Bistro HPI/Bellavista exclusions remain. Check disruptions and special closures before travelling.

Dependency audit: osm-api 4.0.1 bundles an XMLBuilder advisory (GHSA-gh4j-gqv2-49f6). This adapter uses only read methods, never the affected XML writing functionality. Track the upstream fix before adding any OSM editing features.

## Checks

```powershell
# backend
.\mvnw.cmd '-Dtest=RoutePlannerServiceTests,RoutePlannerMapConfigTests,RouteRateLimitTests,RateLimitTests' test
# meal-scraper
.\kotlin.bat test -m route-server -p jvm
# meal-scraper/osm-data
npm test
# frontend
node --experimental-strip-types --test src/route-planner/*.test.ts
pnpm check
```

## Self-hosted walking on Linux

The route-planner Compose stack now includes private pedestrian routing by default, following https://wiki.openstreetmap.org/wiki/Routing and the official OSRM MLD pipeline. `compose.osrm.yaml` remains a compatible override for existing installations. The graph uses `/opt/foot.lua`, not the car profile. Walking alternatives are returned by OSRM; transfer checks use its fastest foot route. Locations over 100 metres from the pedestrian network are rejected instead of snapping far away.

The download service obtains https://download.geofabrik.de/europe/switzerland-latest.osm.pbf once. To use a separately downloaded extract instead, preload `region.osm.pbf` into the volume before starting the stack:

```sh
docker volume create mensa-route-test_osrm-data
docker run --rm -v "$PWD/region.osm.pbf:/input/region.osm.pbf:ro" -v mensa-route-test_osrm-data:/data alpine:3.22 cp /input/region.osm.pbf /data/region.osm.pbf
docker compose -p mensa-route-test -f docker-compose.yml -f compose.route-planner.yaml -f compose.osrm.yaml --profile route-planner up --build -d
```

The build service runs extract, partition and customize once, and marks successful completion. OSRM starts only after a successful graph build, and publishes no host port. The adapter defaults to `http://osrm-foot:5000`. For a map-data update, build a fresh volume before switching; the marker prevents repeated builds. Keep sufficient RAM and disk for the extract.

Public transport continues to use Swiss timetables. A full self-hosted transit engine such as OpenTripPlanner (also in the wiki) additionally needs current GTFS data. OSM road data alone does not supply transit schedules.

OpenAI key, model and rate/credit failures now return verified routes with specific AI warnings. A routing-provider failure remains an actual error when no route can be verified.

Validation: official OSRM v5.27.1 container built and served both a synthetic pedestrian detour test and the full Switzerland graph. The preview now uses private OSRM; a direct Zurich request returned two walking alternatives.

## Place suggestions

Starting point and destination offer Swiss transport location matches after three characters and a 500 ms typing pause. Select with a click or Arrow Up/Down and Enter; Escape closes the list. Selected names remain visible, while routing submits the exact coordinates. Editing the name clears that selection. Suggestions require no OpenAI or Google Places key. `/api/route-planner/locations?query=...` relays through the authenticated Kotlin connector and private Node adapter; provider queries reuse the bounded 24-hour cache and pacing. Refine-only, duplicate and invalid-coordinate matches are omitted, with at most eight suggestions. If unavailable, full addresses or coordinates still work.

## Origin and transit display fixes

Editing/selecting a manual origin clears the prior device marker and invalidates pending GPS lookups. Submitting also invalidates pending GPS responses. The map shows only the selected route and its meal marker; All options deliberately overlays alternatives, while Direct route shows start-to-destination only. Direct walking/transit alternatives have separate controls.

Transit geometry now matches numbered services against OSM route relations in the Zurich region (relations may extend beyond it, including Basel). Consecutive way geometry is oriented and stitched without bridging gaps, projected to the boarding/alighting stops and checked against the intervening stops. Out-of-section passList stops are excluded. Matched service paths are solid; unmatched paths retain a dashed, explicit fallback. Timetables, travel times and journey choices stay with the Swiss transport service. Service-reference lookups are bounded/cached for 24 hours, use shared Overpass pacing, eight-second fetch timeouts, and a five-minute cooldown per failed lookup (successful cached shapes and other services remain available). No Google routing or user-device waypoint is added.

Train trip numbers (for example EC 000151) cannot reliably identify an OSM line. For those, station bounding boxes select rail relations passing both published endpoints; the matcher checks the boarded stops and favors the shortest matching corridor. This is labelled inferred rail geometry, not a confirmed train track. Walking transfers use the entire wait before the next boarding, so a four-minute timetable walk with a 4.5-minute OSM path and five minutes of waiting is accepted. Missed departures are rejected; a longer final walk extends the returned arrival time.

## Timetable view

Meal options show two visible journey timelines with stop names, Zurich departure/arrival times, mode/line badges, published platforms, walking distances and waits between vehicles. A meal-break panel joins the outbound and onward journeys. Structured `provider.itinerary` data comes from verified timetable sections and actual walking times; the AI does not invent steps or platforms. Walking-only legs use a compact start/end timeline, with street instructions expandable. Menus and service notes are expandable below the journey. All public transport segments on the map are dashed (including matched OSM paths); walking remains solid. The journey notes still identify approximate/unmatched transit geometry.

## Transit path alignment and simplified cards

The two extra sections (directions/service notes and meals/venue information) are removed from meal cards. Timelines and platform labels remain. Transit geometry now uses `OSM_TRANSIT_GEOMETRY_URL` (default Swiss OSM Overpass at https://overpass.osm.ch/api/interpreter), independently of restaurant Overpass queries. Service lookups use a bounding box around published stops. Matching rejects larger station/path gaps (150m rail, 45m tram, 65m bus). The map no longer renders stop-to-stop straight chords when matching fails; timetables still include those connections and the map explains omitted geometry. Train corridors remain explicitly approximate without a service-specific journey-shape source. Walking geometry and timing are unchanged.
## OJP train journey shapes

Set `OJP_API_KEY` in the ignored root `.env` to enable Swiss OJP 2.0 train shapes, then rebuild/recreate the `osm-data` service. Compose forwards the key only to the private adapter, never the browser or AI. `OJP_API_URL` defaults to `https://api.opentransportdata.swiss/ojp20`.

The adapter requests track sections and leg projections for each boarded train section, using its station references and scheduled departure. It accepts a shape only when the published service/train identity, both station names, and scheduled departure/arrival match the existing timetable section. Geometry cannot change the route or timetable. Responses are bounded to 4 MB and 8 seconds; XML entities and disconnected/invalid projections are rejected. Successful shapes are cached for 24 hours by service, stations and times; failed lookups cool down for five minutes.

Matched OJP shapes use `ojp_transit_path` and remain dashed on the Google display map. Bus/tram geometry continues using Swiss OSM service ways. If OJP is unavailable or cannot match the journey, the labelled approximate OSM rail fallback remains; unavailable stop-to-stop geometry is omitted from the map. A journey projection describes the published service path, not a guarantee of a specific platform track or live diversion. Official interface: https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/.

## Travel mode and display selection

The route form has independent Walk and Public transport buttons. Public transport is selected initially; activate both to compare both sets of route alternatives. The API accepts `modes: ["WALK"]`, `["TRANSIT"]`, or both. Empty/unsupported selections are rejected before provider calls; omitted modes preserve the legacy both-mode behavior. The selected modes stay authoritative through the Java trip context, Kotlin session and every meal leg. Public transport still needs pedestrian access/transfer paths and the candidate walking matrix, but does not request complete walking-only alternatives when Walk is off.

Map controls, meal markers and route clicks select the matching details below. Only All options displays every meal/direct journey. Approaches to meal stops stay blue; onward and direct alternatives use distinct greens. Starting point/destination use large circular dots instead of letter pins.


## Meal menus and journey times

The route profile also starts the existing `meal-scraper` HTTP connector and its dedicated Kotlin MCP server. Selecting a meal option calls same-origin `GET /api/route-planner/menu?planId=...&optionIndex=...`; `planId` is returned by `/plan` and expires after 30 minutes. Only server-held verified options can choose the venue URL and Zurich meal date. The browser cannot submit a scrape URL. Database dishes appear immediately; website dishes, prices, allergens and source links replace them when available. Other restaurants use their OSM website URL. Stops without a published website/menu show an explicit missing-data message.

The backend invokes `scrape_meals` through the authenticated private connector. That tool discovers and reads linked HTML/PDF menus itself. No additional OpenAI call or OpenAI key is needed for extraction. Full raw MCP evidence is cached in the existing scraped-menu database table under a separate `route-menu.` namespace: six hours for completed lookups, fifteen minutes for failures. Canonical cafeteria menu rows are not overwritten by these date-specific requests. Responses filter to the selected date/time, keep undated recurring dishes, exclude duplicates and suppress meals during source-backed closures. Repeated selections and replanning reuse persisted evidence.

Each route now includes timing in seconds: total elapsed time from the requested departure, travel (walking and vehicle movement), meal, waiting (including initial/transfer/onward waits), and slack before the deadline. The displayed rounded components sum to the total. Menu requests are serialized and do not delay the route result. The form's dual slider specifies a 5–120 minute meal range; the planner verifies the minimum and seeks a longer feasible break within opening hours and the arrival buffer.

ETH English API entries whose dish name is `novalue` are resolved against the corresponding German menu, preserving the date, section, serving times, prices and source evidence. Unresolved placeholders remain excluded from route menu cards.

Other restaurant cards use their published website and linked menus even when dishes have no serving schedule. Their menu response removes dish dates and serving times, applies no meal-time/day restriction, and deduplicates dishes; the card shows a general website menu. Cafeteria cards continue filtering to the planned meal date/time. Closure notices still apply to the journey date.

Restaurant menu discovery follows a linked HTML menu page to its PDFs, bounded to six fetched menu sources. French carte links are included, beverage/wine links are excluded, and priced text PDFs with food sections are supported beyond the original Food/Snacks layout. Published price variants remain separate; currency is retained only where stated.

Meal-stop priority balances food suitability with detours: a kilometre adds 350 ranking points, published dishes or OSM cuisine subtract 500 points (a bounded 100-point bonus for menu evidence), and restaurant/fast-food/bakery/deli categories subtract 250 points. Thus a modest detour can be worthwhile for better food evidence. This is a bounded heuristic, not a global optimum. Exact walking distances and labelled transit access-distance estimates remain visible. Discovery samples nine areas on the direct route and checks further candidates when the first ones fail, up to 24 candidates and five returned options. All routes still require published opening hours, the requested meal minimum and the arrival deadline; impossible trips honestly return no verified meal option.

## Food-type research (current route cards)

Route cards now use `search_meal_place_food` on the routing MCP server instead of on-demand `scrape_meals`. Selecting a stop calls `POST /api/route-planner/food?planId=...&optionIndex=...` with the user-entered `X-OpenAI-Key`. The backend retrieves the registered, verified place; the browser cannot inject a URL or place. The private authenticated connector passes the credential separately from the public tool schema, injecting `_credential` into the MCP invocation. It is never included in route-selection prompts or stored. The tool calls the official OpenAI Responses API with `web_search`, store=false, at most two tool calls, and a 75-second timeout. `FOOD_SEARCH_MODEL` defaults to `gpt-5-mini` in the routing service; this does not change the route-selection model.

The result contains `status`, a short `description` of food/cuisine, and `sources` with title/URL. No dishes, prices, serving days or times are requested. Only a completed answer with citations is treated as researched; unsupported claims and search/auth/quota failures fall back to explicitly labelled OSM cuisine/venue tags. Selecting another option researches that option; reselecting an already loaded card makes no new call. Retry allows another lookup. Canonical cafeteria scraping and legacy `/menu` remain available elsewhere; route cards no longer trigger menu scraping. Cafeterias with known opening hours can be considered even when dated database dishes are missing.

When mealMaxMinutes is 15 or less (including 5–15 minutes), discovery switches to quick-meal candidates: fast_food/kebab/takeaway, cafes, kiosk, supermarket (including Coop), convenience, bakery and deli tags. Sit-down restaurants without takeaway are excluded from the OSM quick search. Shops are not added to longer meal searches. Published opening hours and the existing full-break/deadline checks still apply. The expanded regional OSM catalog uses a versioned file so old restaurant-only snapshots cannot hide the new shop categories.
