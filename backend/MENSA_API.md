# Raw meal API clients

Inject `EthMensaClient` or `UzhMensaClient` into your service. Both are Spring
services and return the response body as a JSON `String`. There are no API or
application DTOs, menu filtering, price formatting, or persistent caches.

```java
String ethJson = ethMensaClient.fetchWeeklyRotas(LocalDate.of(2026, 10, 9), "en");
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
original 50-entry request; it does not implement automatic pagination.

Restaurant metadata and facility IDs:
https://github.com/famoser/Mensa/blob/main/app/src/main/assets/eth/locations.json

## UZH

The POST request uses FOOD2050's GraphQL endpoint and the original `ExampleQuery`
with a safely serialized `locationId` variable. It retrieves `todayOffer` for
all kitchens at the location; there is no historical/date parameter. The response
includes translated titles, price categories, and allergens. Filter by kitchen
`slug` and optional recipe selector in your mapping layer. GraphQL can return
HTTP 200 with an `errors` array; inspect it before mapping `data`.

Use the FOOD2050 `locationId` from:
https://github.com/famoser/Mensa/blob/main/app/src/main/assets/uzh/locations_food2025.json

Neither translated request sends an API key. Upstream availability and schema
can change independently of this backend.

## Source

The request logic is adapted from these MIT-licensed Kotlin providers:

- https://github.com/famoser/Mensa/blob/main/app/src/main/java/ch/famoser/mensa/services/providers/ETHMensaProvider2.kt
- https://github.com/famoser/Mensa/blob/main/app/src/main/java/ch/famoser/mensa/services/providers/UZHMensaProvider2.kt

The original repository is archived. See `third-party/Mensa-LICENSE.txt` for
the upstream copyright and license notice.
