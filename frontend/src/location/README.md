# User location

Finds where the user is, for the meal rating ("Did you eat at one of these?") and for ranking mensas.

**Sort by distance** (`NearMe.astro`, `near-me.ts`, on the home page): a button that locates the user,
sorts the canteen cards nearest first (canteens without meals stay last, like `scripts/meal-stars.ts`)
and shows the distance on each card. The choice is kept in `campuseats-near-me`; when the browser has
already granted location access, the next visit sorts again without a click. It never opens the
permission prompt by itself. After each fix it dispatches `campuseats:user-located` with the
`UserLocation` as `detail`.

**Visits** (`visits.ts`): a fix at a mensa during one of its meal services (15 min grace) is saved in
`campuseats-visits` as `{mensaId, date, service, at, waitMin, source}`, newest first, for 30 days. `at` is
the arrival, `waitMin` the queue wait expected from the crowd indicator; a crowd report (canteen page) adds
a visit with `source: 'crowd'` and the wait for the reported level. One visit per mensa, day and service
keeps the first arrival. When location permission
is already granted, the home page records a visit without turning on distance sorting. The rating
card asks about a visit once its meal is probably eaten (arrival + wait + 20 min, see `rating/README.md`).

```ts
import { locateUserNow, LocationUnavailableError } from '../location/geolocation.ts';

try {
  const { campus, atMensaIds, nearby } = await locateUserNow();
  // campus: 'Zentrum' | 'Hönggerberg' | 'Irchel' | null
  // atMensaIds: mensas the user is probably in, nearest first ([] if unsure)
  // nearby: every mensa with distanceM, nearest first
} catch (e) {
  if (e instanceof LocationUnavailableError) { /* e.reason: unsupported | denied | unavailable | timeout */ }
}
```

- `locateUserNow()` asks the browser's Geolocation API (a permission prompt on first use, so call it
  after a user action, not on page load; it needs HTTPS or localhost) and loads the mensa
  coordinates from `GET /api/mensas`. Pass the places yourself to skip that request.
- `locateUser(fix, places)` in `locate.ts` is the pure part, tested in `locate.test.ts`.

## Rules

| Result | When |
| --- | --- |
| `campus` | nearest mensa within 500 m and fix accuracy ≤ 1000 m |
| `atMensaIds` | mensas within max(75 m, accuracy) and fix accuracy ≤ 150 m |

## Coordinates

They come from `mensa-db.json` (backend `seed/mensa-snapshot.json`, frontend `canteens.ts`): UZH
from the zfv.ch map pins, ETH geocoded from the street address with OpenStreetMap Nominatim. They are
accurate to the building, about ±50 m. Mensas in one building share a point (Polysnack and
Dozentenfoyer in HG, Obere and Untere Mensa in the UZH main building), so both are returned in
`atMensaIds`; GPS cannot tell floors apart anyway.
