# Meal scraping MCP service

Kotlin source imported from [hackathon-mensamcp](https://github.com/NikitaSosnovski/hackathon-mensamcp)
at commit `c33f626bc96d3aabd4165beb6a68b2e5de06f637`. This repository now owns its deployment;
no sibling checkout or prebuilt JAR is required. The checked-in Kotlin wrappers are pinned and
checksum-verified. Shared extraction code is in `src`, the stdio MCP server in `server`,
and its dedicated HTTP connector in `connector`.

The main backend sends AI function requests to the connector, which calls `discover_menu_sources`,
`scrape_meals`, and `read_menu_source` on its MCP child process. It returns raw JSON. The main
backend owns the OpenAI key and persists results in the application's database. The connector
does not need an OpenAI key.

The backend scraper defaults to `MEAL_SCRAPER_MODEL=gpt-6-astra`, using the Responses API
with low reasoning effort and an 8000-token output budget. Override the model in the root
`.env` if needed. This model costs more per request than the previous GPT-5 Mini default.

`src/mensa/MensaSources.kt` lists 22 known locations and supplies their official sources in
the MCP tool descriptions. Combined locations include supplementary links for UniTurm,
Brunnenhof and ZHAW Lagerstrasse. The backend's `mensa/scraper-locations.json` uses the primary
menu page for each combined location (Rämi 74, The YARD and Sihlhof respectively).
Science Lounge is at the ETH campus in Basel. ZHAW Lagerstrasse currently lists vending
machines rather than a staffed cafeteria. Bistro HPI and Bellavista are excluded from the source catalog
and automatic scraping at the user's request. Source registration does not guarantee that
a venue publishes a dated menu.

`scrape_meals` collects the current/requested FOOD2050 week plus the following two weeks,
then filters past meals and deduplicates the combined result. Missing future weeks are
reported as warnings without discarding existing meals. The shared detail enrichment limit
applies across the combined menu. FOOD2050 PDFs use their matching digital weekly pages.
Bellavista weekly PDFs support German main dishes and the separately priced dessert,
with one entry per date in each printed range. English copies and overlapping PDF weeks
are deduplicated. Dates require a printed year or the year in the PDF's upload path;
serving times and customer-group prices remain unknown when absent from the source.

## Linux deployment

Run the root `docker compose up --build -d`. Configure `MEAL_CONNECTOR_TOKEN` in root `.env`;
Compose requires a nonempty token and supplies it to both backend and connector. The connector
binds on the private container network, with no published host port. `/health` confirms the MCP
child is connected. Read [../DEPLOY.md](../DEPLOY.md) for device access and backend settings.

Do not expose port 8091 through the public reverse proxy. Devices access the existing `/api/*`
backend routes through the main website's address. The standalone connector test page remains
bundled for local development but is not publicly routed in this deployment.

## Development

All MCP tools and corresponding connector POST routes accept `date` in `YYYY-MM-DD` format:
`{"url":"https://www.zfv.ch/de/essen-gehen/mensa-paedagogische-hochschule-zuerich","date":"2026-10-19"}`.
`scrape_meals` excludes earlier dishes and begins weekly lookahead from this date. Omitted/null
dates use today in Europe/Zurich, and past cutoffs are clamped to today. Undated meals retain
`date: null`. `read_menu_source` applies the cutoff when supplied; without it, exact historical
inspection remains available. The backend supplies and enforces Zurich today's date for each
automatic refresh, including AI tool calls. OpenAI strict tool definitions expose nullable `date`.

Use Java 25. From this directory:

```sh
sh ./kotlin test -p jvm
sh ./kotlin package -m server -m connector -p jvm -f executable-jar
java -jar build/tasks/_connector_executableJarJvm/connector-jvm-executable.jar
```

On Windows use `.\kotlin.bat` instead of `sh ./kotlin`. Local defaults bind to `127.0.0.1:8091`.
`python scripts/smoke.py` verifies real MCP stdio and connector round trips after packaging;
add `--live` to scrape BQM. The scraper validates public URLs, checks robots rules, and bounds
responses and tool execution. If the MCP child fails, health returns 503; restart this service.
