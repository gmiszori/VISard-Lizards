# User location

Finds where the user is, for the meal rating ("Did you eat at one of these?") and for ranking mensas.

**Sort by distance** (`NearMe.astro`, `near-me.ts`, on the home page): a button that locates the user,
sorts the canteen cards nearest first (canteens without meals stay last, like `scripts/meal-stars.ts`)
and shows the distance on each card. The first click offers an optional `distanceDefault` setting
in `campuseats-preferences`; the same setting is available under Canteen filters. Only that explicit
opt-in sorts on future visits and may request browser location permission on page load. A one-off
sort does not change the default. After each fix it dispatches `campuseats:user-located` with the
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
import { MENSAS } from '../data/canteens.ts';

const places = MENSAS.flatMap(m => m.coordinates
  ? [{ id: m.id, name: m.name, campus: m.campusId, lat: m.coordinates.lat, lng: m.coordinates.lng }]
  : []);

try {
  const { campus, atMensaIds, nearby } = await locateUserNow(places);
  // campus: 'Zentrum' | 'Hönggerberg' | 'Irchel' | null
  // atMensaIds: mensas the user is probably in, nearest first ([] if unsure)
  // nearby: every mensa with distanceM, nearest first
} catch (e) {
  if (e instanceof LocationUnavailableError) { /* e.reason: unsupported | denied | unavailable | timeout */ }
}
```

- `locateUserNow(places)` uses the browser's Geolocation API and the cafeteria coordinates bundled
  into the page. It does not send the device fix to the backend or request a server-side nearest result.
  A first-use permission prompt requires a user action; passive checks run only after permission is granted.
- `locateUser(fix, places)` in `locate.ts` is the pure part, tested in `locate.test.ts`.

The device fix, calculated distances and location-based rating source stay on the device. A submitted
rating still identifies its meal (and thus its cafeteria) to the backend, and normal HTTP requests
expose an IP address; this is not a claim of complete anonymity.

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
