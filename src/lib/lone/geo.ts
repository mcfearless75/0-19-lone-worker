/** Straight-line distance between two points in metres (haversine). */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Within this many metres of the job's pin counts as having arrived. */
export const ARRIVE_RADIUS_M = 100;
/** A GPS fix looser than this is not trusted for arrival. */
export const ARRIVE_MAX_ACCURACY_M = 100;

export function hasArrived(
  fix: { lat: number; lng: number; accuracy: number | null },
  pin: { lat: number; lng: number },
): boolean {
  if (fix.accuracy != null && fix.accuracy > ARRIVE_MAX_ACCURACY_M) return false;
  return distanceM(fix.lat, fix.lng, pin.lat, pin.lng) <= ARRIVE_RADIUS_M;
}
