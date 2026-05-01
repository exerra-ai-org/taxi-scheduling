import { createTtlCache } from "../lib/cache";
import { config } from "../config";

const OSRM_BASE = `${config.osrm.url}/route/v1/driving`;
const METERS_PER_MILE = 1609.344;

// 4 dp ≈ 11m precision. Far below taxi-routing accuracy. Coords sharing
// a rounded key share an OSRM result — same lookup, same answer.
const COORD_PRECISION = 1e4;

// 1000 entries × ~250B JSON ≈ <1MB. 5-minute TTL covers a typical user
// session of repeated quote tweaks. OSRM data changes much more slowly
// than 5 minutes for any realistic taxi serving area.
const OSRM_CACHE_TTL_MS = 5 * 60 * 1000;
const OSRM_CACHE_MAX = 1000;

export interface OsrmResult {
  distanceMeters: number;
  distanceMiles: number;
  durationSeconds: number;
}

interface OsrmKey {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
}

function roundCoord(c: number): number {
  return Math.round(c * COORD_PRECISION) / COORD_PRECISION;
}

function cacheKey(k: OsrmKey): string {
  return [
    roundCoord(k.fromLat),
    roundCoord(k.fromLon),
    roundCoord(k.toLat),
    roundCoord(k.toLon),
  ].join("|");
}

const cache = createTtlCache<string, OsrmResult>({
  maxSize: OSRM_CACHE_MAX,
  ttlMs: OSRM_CACHE_TTL_MS,
});

async function fetchOsrm(k: OsrmKey): Promise<OsrmResult | null> {
  try {
    const lat1 = roundCoord(k.fromLat);
    const lon1 = roundCoord(k.fromLon);
    const lat2 = roundCoord(k.toLat);
    const lon2 = roundCoord(k.toLon);
    const url = `${OSRM_BASE}/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;

    return {
      distanceMeters: route.distance,
      distanceMiles: Math.round((route.distance / METERS_PER_MILE) * 10) / 10,
      durationSeconds: route.duration,
    };
  } catch {
    return null;
  }
}

const cachedFetch = cache.wrap(async (key: string) => {
  const [a, b, c, d] = key.split("|").map(Number);
  const result = await fetchOsrm({
    fromLat: a,
    fromLon: b,
    toLat: c,
    toLon: d,
  });
  // The cache wrap layer treats null as a value to cache, but we
  // explicitly do NOT want to memoise transport failures — let a later
  // call retry. Throw a sentinel here and convert at the public API.
  if (result === null) throw new OsrmFailure();
  return result;
});

class OsrmFailure extends Error {
  constructor() {
    super("OSRM lookup failed");
    this.name = "OsrmFailure";
  }
}

export async function getOsrmDistance(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): Promise<OsrmResult | null> {
  try {
    return await cachedFetch(cacheKey({ fromLat, fromLon, toLat, toLon }));
  } catch (cause) {
    if (cause instanceof OsrmFailure) return null;
    throw cause;
  }
}

/**
 * Test-only escape hatch — clears the in-process OSRM cache. Production
 * code never calls this.
 */
export function __resetOsrmCacheForTests(): void {
  cache.clear();
}
