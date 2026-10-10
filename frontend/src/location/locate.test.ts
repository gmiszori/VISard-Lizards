import test from 'node:test';
import assert from 'node:assert/strict';
import { MENSAS } from '../data/canteens.ts';
import { distanceM, locateUser, type MensaPlace, type PositionFix } from './locate.ts';
import { getPositionFix, LocationUnavailableError, mensaPlaces } from './geolocation.ts';

// The same coordinates GET /api/mensas returns (both come from mensa-db.json).
const places: MensaPlace[] = MENSAS.flatMap(m => m.coordinates
  ? [{ id: m.id, name: m.name, campus: m.campusId, lat: m.coordinates.lat, lng: m.coordinates.lng }] : []);
const at = (id: string, accuracyM = 20): PositionFix => {
  const place = places.find(p => p.id === id)!;
  return { lat: place.lat, lng: place.lng, accuracyM, at: 0 };
};

test('every mensa has coordinates on its campus', () => {
  assert.equal(places.length, MENSAS.length);
  for (const campus of ['zentrum', 'hoenggerberg', 'irchel']) {
    const own = places.filter(p => p.campus === campus);
    for (const a of own) for (const b of own) assert.ok(distanceM(a, b) < 1000, `${a.id} - ${b.id}`);
  }
});

test('distance: one degree of latitude is about 111.2 km', () => {
  assert.ok(Math.abs(distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111_195) < 10);
  assert.equal(distanceM({ lat: 47.37, lng: 8.54 }, { lat: 47.37, lng: 8.54 }), 0);
});

test('a good fix at Polyterrasse puts the user there, on Zentrum', () => {
  const location = locateUser(at('polyterrasse'), places);
  assert.equal(location.campus, 'zentrum');
  assert.deepEqual(location.atMensaIds, ['polyterrasse']);
  assert.equal(location.nearby[0].id, 'polyterrasse');
  assert.equal(location.nearby.length, places.length);
  assert.ok(location.nearby.every((m, i) => i === 0 || location.nearby[i - 1].distanceM <= m.distanceM));
});

test('mensas in the same building are all candidates', () => {
  assert.deepEqual(locateUser(at('polysnack'), places).atMensaIds.sort(), ['dozentenfoyer', 'polysnack']);
  assert.deepEqual(locateUser(at('uzh-obere-mensa'), places).atMensaIds.sort(), ['uzh-obere-mensa', 'uzh-untere-mensa']);
});

test('Hönggerberg and Irchel', () => {
  const hoengg = locateUser(at('food-market'), places);
  assert.equal(hoengg.campus, 'hoenggerberg');
  assert.equal(hoengg.atMensaIds[0], 'food-market');
  const irchel = locateUser(at('uzh-mensa-irchel'), places);
  assert.equal(irchel.campus, 'irchel');
  assert.deepEqual(irchel.atMensaIds, ['uzh-mensa-irchel', 'uzh-seerose-irchel']);
});

test('off campus: Bellevue is near Zentrum but not on it', () => {
  const location = locateUser({ lat: 47.3667, lng: 8.5450, accuracyM: 15, at: 0 }, places);
  assert.equal(location.campus, null);
  assert.deepEqual(location.atMensaIds, []);
  assert.equal(location.nearby[0].campus, 'zentrum');
});

test('a coarse fix gives the campus but no mensa, a very coarse one neither', () => {
  const coarse = locateUser(at('polyterrasse', 400), places);
  assert.equal(coarse.campus, 'zentrum');
  assert.deepEqual(coarse.atMensaIds, []);
  assert.equal(locateUser(at('polyterrasse', 2000), places).campus, null);
});

test('the at-mensa radius grows with the fix accuracy', () => {
  // Polyterrasse to the ETH main building (Polysnack, Dozentenfoyer) is about 110 m.
  assert.deepEqual(locateUser(at('polyterrasse', 140), places).atMensaIds, ['polyterrasse', 'dozentenfoyer', 'polysnack']);
});

test('no places: nothing nearby', () => {
  const empty = locateUser({ lat: 47.37, lng: 8.54, accuracyM: 10, at: 0 }, []);
  assert.deepEqual([empty.nearby, empty.campus, empty.atMensaIds], [[], null, []]);
});

function fakeGeolocation(result: { coords?: Partial<GeolocationCoordinates>; errorCode?: number }): Geolocation {
  return {
    getCurrentPosition(success: PositionCallback, failure?: PositionErrorCallback | null) {
      if (result.errorCode) {
        failure?.({ code: result.errorCode, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      } else {
        success({ coords: result.coords as GeolocationCoordinates, timestamp: 42 } as GeolocationPosition);
      }
    },
  } as Geolocation;
}

test('getPositionFix maps the Geolocation API', async () => {
  const fix = await getPositionFix(fakeGeolocation({ coords: { latitude: 47.4, longitude: 8.5, accuracy: 12 } }));
  assert.deepEqual(fix, { lat: 47.4, lng: 8.5, accuracyM: 12, at: 42 });
  for (const [code, reason] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout']] as const) {
    await assert.rejects(getPositionFix(fakeGeolocation({ errorCode: code })),
      (e: unknown) => e instanceof LocationUnavailableError && e.reason === reason);
  }
  await assert.rejects(getPositionFix(undefined), (e: unknown) => e instanceof LocationUnavailableError && e.reason === 'unsupported');
});

test('mensaPlaces skips mensas without coordinates', () => {
  assert.deepEqual(mensaPlaces([
    { id: 'a', title: 'A', campus: 'Irchel', coordinates: { lat: 1, lng: 2 }, avgRating: null },
    { id: 'b', title: 'B', campus: 'Irchel', coordinates: null, avgRating: 4 },
  ]), [{ id: 'a', name: 'A', campus: 'Irchel', lat: 1, lng: 2 }]);
});
