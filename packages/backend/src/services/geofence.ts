// Great-circle distance between two WGS84 points in meters.
// Standard haversine; accurate to a few meters at the scales we care about.
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Decide whether the driver should be considered "dwelling" inside the pickup
// geofence. Returns the next dwell-since timestamp (null if outside), and a
// `shouldArrive` flag that is true exactly once — when the dwell window has
// elapsed. Caller is responsible for actually flipping booking status.
export interface GeofenceDwellInput {
  driverLat: number;
  driverLon: number;
  pickupLat: number | null;
  pickupLon: number | null;
  previousSince: Date | null;
  now: Date;
  radiusM: number;
  dwellMs: number;
}
export interface GeofenceDwellResult {
  nextSince: Date | null;
  shouldArrive: boolean;
  distanceM: number | null;
}

export function evaluatePickupDwell(
  input: GeofenceDwellInput,
): GeofenceDwellResult {
  const { driverLat, driverLon, pickupLat, pickupLon } = input;
  if (pickupLat == null || pickupLon == null) {
    return { nextSince: null, shouldArrive: false, distanceM: null };
  }

  const distanceM = haversineMeters(driverLat, driverLon, pickupLat, pickupLon);

  if (distanceM > input.radiusM) {
    return { nextSince: null, shouldArrive: false, distanceM };
  }

  const since = input.previousSince ?? input.now;
  const dwelledMs = input.now.getTime() - since.getTime();
  const shouldArrive = dwelledMs >= input.dwellMs;
  return { nextSince: since, shouldArrive, distanceM };
}
