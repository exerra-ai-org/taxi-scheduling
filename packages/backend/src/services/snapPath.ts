import { haversineMeters } from "./geofence";
import { config } from "../config";

// Server-side mirror of frontend snapBreadcrumb. Used by the admin path
// endpoint to compute and cache the road-snapped polyline once a ride
// completes, so subsequent views read from the cache.

const OSRM_MAX_POINTS = 90;
const THIN_MIN_M = 25;
const SNAP_RADIUS_M = 30;

export interface RawPathPoint {
  lat: number;
  lon: number;
  recordedAt: Date;
}

export type SnappedPolyline = [number, number][]; // [[lat, lon], ...]

function thin(points: RawPathPoint[]): RawPathPoint[] {
  if (points.length <= 2) return points;
  const out: RawPathPoint[] = [points[0]];
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

function downsample(points: RawPathPoint[]): RawPathPoint[] {
  if (points.length <= OSRM_MAX_POINTS) return points;
  const out: RawPathPoint[] = [points[0]];
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

// Returns the snapped polyline on success, or null on any failure (rate
// limit, OSRM down, no matchable geometry). Caller decides whether to
// retry later or fall back to raw points.
export async function snapPathServer(
  points: RawPathPoint[],
): Promise<SnappedPolyline | null> {
  if (points.length < 2) return null;

  const reduced = downsample(thin(points));
  const coords = reduced.map((p) => `${p.lon},${p.lat}`).join(";");
  const timestamps = reduced
    .map((p) => Math.floor(p.recordedAt.getTime() / 1000))
    .join(";");
  const radiuses = reduced.map(() => SNAP_RADIUS_M).join(";");

  const url = `${config.osrm.url}/match/v1/driving/${coords}?overview=full&geometries=geojson&timestamps=${timestamps}&radiuses=${radiuses}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as OsrmMatchResponse;
    if (data.code !== "Ok" || !data.matchings || data.matchings.length === 0) {
      return null;
    }
    const out: SnappedPolyline = [];
    for (const m of data.matchings) {
      for (const c of m.geometry.coordinates) {
        out.push([c[1], c[0]]);
      }
    }
    return out;
  } catch {
    return null;
  }
}
