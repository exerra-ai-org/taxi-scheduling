import type { LatLngExpression } from "leaflet";
import type { BookingPathPoint } from "../api/drivers";
import { config } from "../config";

// OSRM public demo allows up to 100 coordinates per match request.
// We thin to a hard ceiling slightly under that to leave room for the
// occasional duplicate the thinning step doesn't catch.
const OSRM_MAX_POINTS = 90;

// Skip raw points within this distance of the last kept point. The
// breadcrumb often has dozens of fixes within a few meters when the car
// is stopped at a light — those add no information and just eat budget.
const THIN_MIN_M = 25;

// Search radius hint passed to OSRM per point. Wider radius = more
// tolerant of GPS error, but also more chance of snapping to the wrong
// road. 30m is a good middle ground for urban driving.
const SNAP_RADIUS_M = 30;

function haversineMeters(
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

// Drop adjacent points that are very close together. Preserves the first
// and last points unconditionally so we don't trim ride endpoints.
function thin(points: BookingPathPoint[]): BookingPathPoint[] {
  if (points.length <= 2) return points;
  const out: BookingPathPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    const p = points[i];
    if (haversineMeters(last.lat, last.lon, p.lat, p.lon) >= THIN_MIN_M) {
      out.push(p);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// Drop down to OSRM_MAX_POINTS by uniform sampling, keeping endpoints.
function downsample(points: BookingPathPoint[]): BookingPathPoint[] {
  if (points.length <= OSRM_MAX_POINTS) return points;
  const out: BookingPathPoint[] = [points[0]];
  const step = (points.length - 2) / (OSRM_MAX_POINTS - 2);
  for (let i = 1; i < OSRM_MAX_POINTS - 1; i++) {
    out.push(points[Math.round(i * step)]);
  }
  out.push(points[points.length - 1]);
  return out;
}

interface OsrmMatchResponse {
  code: string;
  matchings?: Array<{
    geometry: { coordinates: [number, number][] };
  }>;
}

// Call OSRM match-service. Returns null on any failure; caller decides
// the fallback (we just draw the raw thinned line in that case).
async function callOsrmMatch(
  points: BookingPathPoint[],
  signal?: AbortSignal,
): Promise<LatLngExpression[] | null> {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(";");
  const timestamps = points
    .map((p) => Math.floor(new Date(p.recordedAt).getTime() / 1000))
    .join(";");
  const radiuses = points.map(() => SNAP_RADIUS_M).join(";");

  const url = `${config.osrmUrl}/match/v1/driving/${coords}?overview=full&geometries=geojson&timestamps=${timestamps}&radiuses=${radiuses}`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as OsrmMatchResponse;
    if (data.code !== "Ok" || !data.matchings || data.matchings.length === 0) {
      return null;
    }
    // OSRM may split the trace into multiple matchings (e.g., when the
    // driver was off-road for a stretch). Concatenate them in order.
    const out: LatLngExpression[] = [];
    for (const m of data.matchings) {
      for (const c of m.geometry.coordinates) {
        out.push([c[1], c[0]] as LatLngExpression);
      }
    }
    return out;
  } catch {
    return null;
  }
}

// Snap a raw breadcrumb to the road network. Returns the snapped polyline
// on success, or the thinned raw points on failure (so something still
// renders even if OSRM is down).
export async function snapBreadcrumb(
  points: BookingPathPoint[],
  signal?: AbortSignal,
): Promise<LatLngExpression[]> {
  if (points.length < 2) {
    return points.map((p) => [p.lat, p.lon] as LatLngExpression);
  }
  const reduced = downsample(thin(points));
  const snapped = await callOsrmMatch(reduced, signal);
  if (snapped) return snapped;
  return reduced.map((p) => [p.lat, p.lon] as LatLngExpression);
}
