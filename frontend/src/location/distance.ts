/** "40 m", "350 m", "1.2 km", "12 km": rounded to what GPS and building-level coordinates can tell. */
export function formatDistance(distanceM: number, lang = 'en'): string {
  if (distanceM < 1000) return `${Math.max(10, Math.round(distanceM / 10) * 10)} m`;
  const km = distanceM < 10_000 ? (Math.round(distanceM / 100) / 10).toFixed(1) : String(Math.round(distanceM / 1000));
  return `${lang === 'de' ? km.replace('.', ',') : km} km`;
}
