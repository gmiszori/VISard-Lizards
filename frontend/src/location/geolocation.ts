/**
 * Browser side of the user location: asks the Geolocation API for a fix and loads the mensa
 * coordinates from GET /api/mensas. The browser shows a permission prompt on the first call, so call
 * locateUserNow() after a user action (e.g. opening the rating card), not on page load.
 */
import { API_URL, apiGet, type BackendMensa } from '../data/api.ts';
import { locateUser, type MensaPlace, type PositionFix, type UserLocation } from './locate.ts';

export type LocationError = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

export class LocationUnavailableError extends Error {
  readonly reason: LocationError;
  constructor(reason: LocationError) {
    super(`User location not available: ${reason}`);
    this.reason = reason;
  }
}

/** A fix of up to 2 minutes ago is reused; indoors a new one can take seconds. */
const DEFAULT_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 120_000 };

export function getPositionFix(
  geolocation: Geolocation | undefined = globalThis.navigator?.geolocation,
  options: PositionOptions = DEFAULT_OPTIONS,
): Promise<PositionFix> {
  return new Promise((resolve, reject) => {
    if (!geolocation) return reject(new LocationUnavailableError('unsupported'));
    geolocation.getCurrentPosition(
      ({ coords, timestamp }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracyM: coords.accuracy, at: timestamp }),
      (error) => reject(new LocationUnavailableError(
        error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'unavailable')),
      options,
    );
  });
}

/** Mensas with known coordinates, from the backend. */
export function mensaPlaces(mensas: readonly BackendMensa[]): MensaPlace[] {
  return mensas.flatMap(({ id, title, campus, coordinates }) =>
    coordinates ? [{ id, name: title, campus, lat: coordinates.lat, lng: coordinates.lng }] : []);
}

export async function loadMensaPlaces(baseUrl = API_URL): Promise<MensaPlace[]> {
  return mensaPlaces(await apiGet<BackendMensa[]>('/api/mensas', baseUrl));
}

/** Where the user is now. Rejects with LocationUnavailableError when there is no fix. */
export async function locateUserNow(places?: readonly MensaPlace[], geolocation?: Geolocation): Promise<UserLocation> {
  const [fix, resolvedPlaces] = await Promise.all([getPositionFix(geolocation), places ?? loadMensaPlaces()]);
  return locateUser(fix, resolvedPlaces);
}
