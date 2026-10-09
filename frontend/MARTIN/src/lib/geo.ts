import { atom } from 'nanostores';
import type { Campus, CampusId, LatLng, Mensa } from './types';

export const CAMPUSES: Campus[] = [
  { id: 'eth-zentrum', name: 'ETH Zentrum', institution: 'ETH', coordinates: { lat: 47.3763, lng: 8.5481 } },
  { id: 'eth-hoenggerberg', name: 'ETH Hönggerberg', institution: 'ETH', coordinates: { lat: 47.4086, lng: 8.5073 } },
  { id: 'uzh-zentrum', name: 'UZH Zentrum', institution: 'UZH', coordinates: { lat: 47.3744, lng: 8.5489 } },
  { id: 'uzh-irchel', name: 'UZH Irchel', institution: 'UZH', coordinates: { lat: 47.3965, lng: 8.5496 } },
  { id: 'uzh-oerlikon', name: 'UZH Oerlikon', institution: 'UZH', coordinates: { lat: 47.4117, lng: 8.5444 } },
];

export const DEFAULT_CAMPUS: CampusId = 'eth-zentrum';

export function campusById(id: CampusId | string | null | undefined): Campus | undefined {
  return CAMPUSES.find((c) => c.id === id);
}

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function nearestCampus(p: LatLng): Campus {
  return CAMPUSES.reduce((best, c) => (haversineM(p, c.coordinates) < haversineM(p, best.coordinates) ? c : best));
}

export function nearestMensa(p: LatLng, mensas: Mensa[]): { mensa: Mensa; distanceM: number } | null {
  let best: { mensa: Mensa; distanceM: number } | null = null;
  for (const m of mensas) {
    const d = haversineM(p, m.coordinates);
    if (!best || d < best.distanceM) best = { mensa: m, distanceM: d };
  }
  return best;
}

// ───────── Live device position (shared across islands) ─────────

export type GeoStatus = 'idle' | 'asking' | 'granted' | 'denied' | 'unavailable';

export const devicePosition = atom<LatLng | null>(null);
export const geoStatus = atom<GeoStatus>('idle');

/** Ask the browser for the position. Must be called from a user gesture. */
export function requestPosition(): Promise<LatLng | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    geoStatus.set('unavailable');
    return Promise.resolve(null);
  }
  geoStatus.set('asking');
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        devicePosition.set(p);
        geoStatus.set('granted');
        resolve(p);
      },
      () => {
        geoStatus.set('denied');
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    );
  });
}

/**
 * Silent start: only reads the position if the user has already granted
 * permission, so opening the app never triggers a surprise permission prompt.
 */
export async function initPositionIfGranted(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions) return;
  if (geoStatus.get() !== 'idle') return;
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status.state === 'granted') await requestPosition();
    else if (status.state === 'denied') geoStatus.set('denied');
  } catch {
    /* Permissions API unsupported; the user can still tap "Use my location". */
  }
}
