# Raw meal API clients

Inject `EthMensaClient`, `ZfvMensaClient`, or the legacy `UzhMensaClient` into your
service. They are Spring services and return the response body as a JSON `String`. There are no API or
application DTOs, menu filtering, price formatting, or persistent caches.

```java
String ethJson = ethMensaClient.fetchWeeklyRotas(LocalDate.of(2026, 10, 9), "en");
List<String> allEthPages = ethMensaClient.fetchWeeklyRotaPages(LocalDate.of(2026, 10, 9), "en");
String uzhJson = uzhMensaClient.fetchTodayOffers(locationId);
```

Map these strings to your own DTOs after retrieval. An empty HTTP body can return
`null`. HTTP 4xx/5xx and transport failures throw Spring `RestClientException`
subclasses. Connect timeout is 10 seconds; read timeout is 30 seconds.

## ETH

The GET request uses Cookpit's `weeklyrotas` endpoint with `client-id=ethz-wcms`,
`rs-first=0`, `rs-size=50`, `lang=de|en`, and `valid-after` set to the Monday of
the supplied date's week. The whole response is retained. The original code
notes that extra weeks may be returned, so filter by `valid-from`, `facility-id`,
`day-of-week-code`, and meal time in your mapping layer. This preserves the
original 50-entry request. For complete retrieval, use `fetchWeeklyRotaPages`,
which returns each page unchanged as a `List<String>`. It inspects only the array
length to continue at offsets 0, 50, 100, etc. It rejects missing arrays, empty
responses, repeated pages and more than 100 pages rather than silently losing
data. For manual pagination use `fetchWeeklyRotas(date, language, offset, pageSize)`.
The page size must be between 1 and 50.

Restaurant metadata and facility IDs:
https://github.com/famoser/Mensa/blob/main/app/src/main/assets/eth/locations.json

## UZH: maintained ZFV API

Use `ZfvMensaClient` for the maintained MensaZH app's request. Set your own key in
the environment before starting Spring Boot:

```powershell
$env:MENSA_ZFV_API_KEY = 'your-api-key'
```

Alternatively configure `mensa.zfv.api-key` through external Spring configuration.
Do not commit keys to the repository. The application can start without a key;
calling the ZFV client without one fails immediately with an explanatory error.

```java
String thisWeekJson = zfvMensaClient.fetchThisWeek();
String nextWeekJson = zfvMensaClient.fetchNextWeek();
String dayJson = zfvMensaClient.fetchDay(LocalDate.of(2026, 10, 12));
```

These POST to `https://api.zfv.ch/graphql` with the `api-key` header and query the
UZH organisation's outlets. Raw results include kitchen/outlet slugs, daily menu
items, translated dish names, price amounts, nutrition, allergens, images and
vegetarian/vegan flags. Map the response's `data.organisation.outlets` to your own
DTOs. Inspect `errors` first: GraphQL failures can use HTTP 200. The request retains
the source's `outlets(take: 100)` limit.

Current outlet slug/category metadata:
https://github.com/fflopsi/mensa-zh/blob/main/app/src/main/assets/uzh/locations_zfv.json

## UZH: original FOOD2050 translation (legacy)

The POST request uses FOOD2050's GraphQL endpoint and the original `ExampleQuery`
with a safely serialized `locationId` variable. It retrieves `todayOffer` for
all kitchens at the location; there is no historical/date parameter. The response
includes translated titles, price categories, and allergens. Filter by kitchen
`slug` and optional recipe selector in your mapping layer. GraphQL can return
HTTP 200 with an `errors` array; inspect it before mapping `data`.

Use the FOOD2050 `locationId` from:
https://github.com/famoser/Mensa/blob/main/app/src/main/assets/uzh/locations_food2025.json

The original ETH/FOOD2050 requests send no API key. Upstream availability and
schema can change independently of this backend.

### Live verification on 2026-10-10

- ETH: HTTP 200; first page had 50 entries and the second 8. `valid-after` did not
  restrict results to the requested week. Use pagination and filter dates yourself.
- FOOD2050: the original URL returned HTTP 404. Retained for source compatibility;
  use the maintained ZFV client for new integration.
- ZFV: GraphQL endpoint reachable; unauthenticated menu queries returned
  authorization errors. Authorized meal retrieval needs your own working key.
  Day and week requests are covered by mock tests; meal data with a valid key
  has not been verified in this workspace.

## Source

The request logic is adapted from these MIT-licensed Kotlin providers:

- https://github.com/famoser/Mensa/blob/main/app/src/main/java/ch/famoser/mensa/services/providers/ETHMensaProvider2.kt
- https://github.com/famoser/Mensa/blob/main/app/src/main/java/ch/famoser/mensa/services/providers/UZHMensaProvider2.kt

The original repository is archived. See `third-party/Mensa-LICENSE.txt` for
the upstream copyright and license notice.

The ZFV request is adapted from the maintained MensaZH provider:
https://github.com/fflopsi/mensa-zh/blob/main/app/src/main/java/ch/florianfrauenfelder/mensazh/data/providers/UZHMensaProvider.kt
Its MIT notice is retained in `third-party/MensaZH-LICENSE.md`.

## Verification

### Optional raw HTTP endpoints

Raw endpoints are disabled by default. For local inspection, enable them when
starting the backend:

```powershell
cd backend
.\mvnw.cmd spring-boot:run '-Dspring-boot.run.arguments=--mensa.upstream.enabled=true'
```

- `GET /api/upstream/eth/weekly-rotas?date=2026-10-09&language=en&offset=0&pageSize=50`
- `GET /api/upstream/uzh/week` (current week)
- `GET /api/upstream/uzh/week?next=true`
- `GET /api/upstream/uzh/day?date=2026-10-12`

Responses have `application/json` content type and preserve the upstream body
without quoting it as a JSON string. These endpoints do not overlap the app's
`/api/mensas` DTO endpoints. ZFV keys remain on the server. HTTP/transport errors
become 502; missing ZFV configuration becomes 503; invalid parameters become 400.
GraphQL `errors` inside a successful HTTP response remain in the raw body, so
consumers must inspect them. No FOOD2050 HTTP endpoint is exposed because the
legacy source URL returned 404 during verification.

### Automated checks

Normal `mvnw test` runs mock HTTP contract tests and the application context test.
Live checks are disabled by default, so upstream outages cannot break an ordinary
build. To verify the real Java client from PowerShell:

```powershell
cd backend
$env:MENSA_LIVE_TESTS = 'true'
.\mvnw.cmd -B -ntp '-Dtest=MensaLiveApiTests' test
Remove-Item Env:MENSA_LIVE_TESTS
```

The ETH test fetches all pages. The ZFV test additionally requires
`MENSA_ZFV_API_KEY`; without a key it is skipped. It checks that GraphQL returned
authorized outlet data rather than silently accepting HTTP 200 authorization
errors. Keys are not printed by these tests.
