/**
 * Browser side of the user location. Cafeteria coordinates must be supplied by the page;
 * the device fix and nearest calculation never make a backend request.
 */
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

/** Where the user is now. Rejects with LocationUnavailableError when there is no fix. */
export async function locateUserNow(places: readonly MensaPlace[], geolocation?: Geolocation): Promise<UserLocation> {
  return locateUser(await getPositionFix(geolocation), places);
}
