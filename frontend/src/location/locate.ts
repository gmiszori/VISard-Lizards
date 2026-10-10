/**
 * Where is the user? Pure functions: a position fix plus the mensa coordinates in, the nearby mensas,
 * the campus and the mensas the user is probably in out. No browser APIs here (see geolocation.ts).
 */

export interface LatLng { lat: number; lng: number }
export interface MensaPlace extends LatLng { id: string; name: string; campus: string }
/** A device position. accuracyM: radius (m) of 68 % confidence, as reported by the Geolocation API. */
export interface PositionFix extends LatLng { accuracyM: number; at: number }
export interface NearbyMensa { id: string; name: string; campus: string; distanceM: number }

export interface UserLocation {
  fix: PositionFix;
  /** Every mensa, nearest first. */
  nearby: NearbyMensa[];
  /** Campus of the nearest mensa when the user is on or right next to a campus, else null. */
  campus: string | null;
  /**
   * Mensas the user is probably in, nearest first. Several when they share a building
   * (Polysnack and Dozentenfoyer, Obere and Untere Mensa) or the fix is coarse. Empty when the fix is
   * too coarse to tell or no mensa is close.
   */
  atMensaIds: string[];
}

/** Max distance (m) to the nearest mensa to count as on campus. Zentrum spans about 800 m. */
export const ON_CAMPUS_M = 500;
/** Distance (m) within which the user is at a mensa: the coordinates are building-level (±50 m). */
export const AT_MENSA_M = 75;
/** Fixes less accurate than this (m) never place the user at a mensa; typical for Wi-Fi/IP positions. */
export const MAX_AT_MENSA_ACCURACY_M = 150;
/** Fixes less accurate than this (m) never place the user on a campus. */
export const MAX_CAMPUS_ACCURACY_M = 1000;

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function locateUser(fix: PositionFix, places: readonly MensaPlace[]): UserLocation {
  const nearby = places
    .map(({ id, name, campus, lat, lng }) => ({ id, name, campus, distanceM: Math.round(distanceM(fix, { lat, lng })) }))
    .sort((a, b) => a.distanceM - b.distanceM);
  const nearest = nearby[0];
  const campus = nearest && fix.accuracyM <= MAX_CAMPUS_ACCURACY_M && nearest.distanceM <= ON_CAMPUS_M ? nearest.campus : null;
  const atRadius = Math.max(AT_MENSA_M, fix.accuracyM);
  const atMensaIds = fix.accuracyM <= MAX_AT_MENSA_ACCURACY_M
    ? nearby.filter(m => m.distanceM <= atRadius).map(m => m.id)
    : [];
  return { fix, nearby, campus, atMensaIds };
}
