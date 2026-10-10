export interface Point { lat: number; lng: number }

const EARTH_RADIUS_M = 6_371_000;
/** Typical walking speed 5 km/h, and streets are longer than the straight line between two points. */
const WALK_M_PER_MIN = 83;
const DETOUR_FACTOR = 1.3;
/** Beyond this the walking time is not useful; show the distance only. */
const MAX_WALK_M = 3000;

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const isPoint = (p: unknown): p is Point => !!p && typeof (p as Point).lat === 'number' && typeof (p as Point).lng === 'number'
  && Number.isFinite((p as Point).lat) && Number.isFinite((p as Point).lng) && Math.abs((p as Point).lat) <= 90 && Math.abs((p as Point).lng) <= 180;

/** Straight-line distance in metres (haversine). NaN when a point is not a valid coordinate. */
export function distanceMeters(a: unknown, b: unknown): number {
  if (!isPoint(a) || !isPoint(b)) return NaN;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whole minutes on foot, at least 1; null when it is too far to walk. */
export function walkingMinutes(meters: number): number | null {
  if (!Number.isFinite(meters) || meters > MAX_WALK_M) return null;
  return Math.max(1, Math.round((meters * DETOUR_FACTOR) / WALK_M_PER_MIN));
}

/** "250 m", "1.4 km", "12 km" */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '';
  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  if (rounded < 1000) return `${rounded} m`;
  return meters < 10_000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 1000)} km`;
}

/** Places ordered nearest first. Places without a usable position go last in their original order. */
export function orderByDistance<T extends { position: unknown }>(from: Point, places: T[]): Array<T & { meters: number }> {
  return places
    .map((place, index) => ({ place, index, meters: distanceMeters(from, place.position) }))
    .sort((a, b) => (Number.isNaN(a.meters) ? 1 : 0) - (Number.isNaN(b.meters) ? 1 : 0) || a.meters - b.meters || a.index - b.index)
    .map(({ place, meters }) => ({ ...place, meters }));
}
