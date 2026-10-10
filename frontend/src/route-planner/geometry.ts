export type Point = { lat: number; lng: number };
/** Decode provider polyline geometry; never replace a missing route with a straight line. */
export function decodeRoute(encoded: string | undefined): Point[] {
  if (!encoded || encoded.length > 100_000) return [];
  const points: Point[] = []; let cursor = 0; let lat = 0; let lng = 0;
  function delta(): number {
    let value = 0; let shift = 0; let part: number;
    do {
      if (cursor >= encoded!.length || shift >= 32) throw new Error('Invalid polyline');
      part = encoded!.charCodeAt(cursor++) - 63;
      if (part < 0 || part > 63) throw new Error('Invalid polyline');
      value |= (part & 31) << shift; shift += 5;
    } while (part >= 32);
    return value & 1 ? ~(value >>> 1) : value >>> 1;
  }
  try {
    while (cursor < encoded.length) {
      lat += delta(); lng += delta();
      const point = { lat: lat / 1e5, lng: lng / 1e5 };
      if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return [];
      points.push(point);
    }
  } catch { return []; }
  return points;
}
