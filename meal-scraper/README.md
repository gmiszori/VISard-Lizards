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

## Linux deployment

Run the root `docker compose up --build -d`. Configure `MEAL_CONNECTOR_TOKEN` in root `.env`;
Compose requires a nonempty token and supplies it to both backend and connector. The connector
binds on the private container network, with no published host port. `/health` confirms the MCP
child is connected. Read [../DEPLOY.md](../DEPLOY.md) for device access and backend settings.

Do not expose port 8091 through the public reverse proxy. Devices access the existing `/api/*`
backend routes through the main website's address. The standalone connector test page remains
bundled for local development but is not publicly routed in this deployment.

## Development

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
