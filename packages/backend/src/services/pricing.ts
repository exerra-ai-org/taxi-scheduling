import { db } from "../db/index";
import { fixedRoutes, zones, mileRates } from "../db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import type {
  PricingQuote,
  PricingQuoteMulti,
  VehicleClass,
} from "shared/types";
import { LONDON_ZONE_PATTERN } from "../lib/constants";
import { getOsrmDistance } from "./osrm";
import { createTtlCache } from "../lib/cache";

const VEHICLE_CLASSES: VehicleClass[] = ["regular", "comfort", "max"];

// mile_rates is a tiny tariff table that changes only when an admin
// edits it. 60s TTL is a fine compromise between query latency and
// pricing freshness — a tariff update is reflected after one minute.
type MileRateRow = typeof mileRates.$inferSelect;
const MILE_RATES_CACHE_KEY = "all";
const mileRatesCache = createTtlCache<string, MileRateRow[]>({
  maxSize: 1,
  ttlMs: 60_000,
});

const getMileRatesCached = mileRatesCache.wrap(async () => {
  return await db.select().from(mileRates);
});

/** Test-only escape hatch — invalidates the cache so admin tariff
 *  changes take effect immediately during integration tests. */
export function __resetMileRatesCacheForTests(): void {
  mileRatesCache.clear();
}

// Multipliers used when a fixed route exists for some classes but not
// others. We extrapolate from a known price rather than fall through to
// mile-based pricing — keeps the customer-facing price stable across
// classes when the dispatch team only configured one tier.
const CLASS_MULTIPLIER: Record<VehicleClass, number> = {
  regular: 1,
  comfort: 1.3,
  max: 1.7,
};

function isAirportAddress(address: string): boolean {
  return address.toLowerCase().includes("airport");
}

export async function getZoneByAddress(address: string) {
  const results = await db
    .select()
    .from(zones)
    .where(sql`${address} ILIKE '%' || ${zones.label} || '%'`);
  return results[0] ?? null;
}

/**
 * Simple bounding-box check for rectangular zone polygons.
 */
function pointInBoundary(
  lat: number,
  lon: number,
  boundary: { coordinates?: number[][][] },
): boolean {
  const ring = boundary?.coordinates?.[0];
  if (!ring || ring.length < 4) return false;
  const lons = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

/**
 * Coordinate-based zone lookup. Tries PostGIS first, falls back to JS bounding-box check.
 */
export async function getZoneByCoordinates(lat: number, lon: number) {
  try {
    const results = await db
      .select()
      .from(zones)
      .where(
        sql`${zones.boundary} IS NOT NULL AND ST_Contains(
          ST_GeomFromGeoJSON(${zones.boundary}::text),
          ST_Point(${lon}, ${lat})
        )`,
      )
      .limit(1);
    if (results.length > 0) return results[0];
  } catch {
    // PostGIS not available — fall through to JS check
  }

  const allZones = await db.select().from(zones);
  return (
    allZones.find(
      (z) =>
        z.boundary &&
        pointInBoundary(lat, lon, z.boundary as { coordinates?: number[][][] }),
    ) ?? null
  );
}

export function isLondonZone(zoneName: string): boolean {
  return LONDON_ZONE_PATTERN.test(zoneName);
}

/**
 * Get pricing quote for a single vehicle class.
 * Priority: 1) Fixed route match  2) Mile-based pricing
 */
export async function getPricingQuote(
  from: string,
  to: string,
  opts?: {
    fromLat?: number;
    fromLon?: number;
    toLat?: number;
    toLon?: number;
    vehicleClass?: VehicleClass;
  },
): Promise<
  | (PricingQuote & {
      fixedRouteId?: number;
      pickupZoneId?: number;
      dropoffZoneId?: number;
    })
  | null
> {
  const vehicleClass = opts?.vehicleClass ?? "regular";

  try {
    // 1. Check fixed routes first (highest priority)
    const fixedMatch = await db
      .select()
      .from(fixedRoutes)
      .where(
        and(
          sql`${from} ILIKE '%' || ${fixedRoutes.fromLabel} || '%'`,
          sql`${to} ILIKE '%' || ${fixedRoutes.toLabel} || '%'`,
          eq(fixedRoutes.vehicleType, vehicleClass),
        ),
      )
      .limit(1);

    if (fixedMatch.length > 0) {
      const route = fixedMatch[0];
      return {
        pricePence: route.pricePence,
        routeType: "fixed",
        routeName: route.name,
        isAirport: route.isAirport,
        fixedRouteId: route.id,
      };
    }

    // Also try without vehicle class filter for backward compat with old fixed routes
    const fixedMatchAny = await db
      .select()
      .from(fixedRoutes)
      .where(
        and(
          sql`${from} ILIKE '%' || ${fixedRoutes.fromLabel} || '%'`,
          sql`${to} ILIKE '%' || ${fixedRoutes.toLabel} || '%'`,
        ),
      )
      .limit(1);

    if (fixedMatchAny.length > 0) {
      const route = fixedMatchAny[0];
      return {
        pricePence: route.pricePence,
        routeType: "fixed",
        routeName: route.name,
        isAirport: route.isAirport,
        fixedRouteId: route.id,
      };
    }

    // 2. Mile-based pricing — requires coordinates
    if (
      opts?.fromLat == null ||
      opts?.fromLon == null ||
      opts?.toLat == null ||
      opts?.toLon == null
    ) {
      return null;
    }

    const osrm = await getOsrmDistance(
      opts.fromLat,
      opts.fromLon,
      opts.toLat,
      opts.toLon,
    );
    if (!osrm) return null;

    const allRates = await getMileRatesCached(MILE_RATES_CACHE_KEY);
    const rate = allRates.find((r) => r.vehicleClass === vehicleClass);
    if (!rate) return null;
    const pricePence =
      rate.baseFarePence +
      Math.round(osrm.distanceMiles * rate.ratePerMilePence);

    const airport = isAirportAddress(from) || isAirportAddress(to);

    return {
      pricePence,
      routeType: "mile",
      routeName: null,
      isAirport: airport,
      distanceMiles: osrm.distanceMiles,
      baseFarePence: rate.baseFarePence,
      ratePerMilePence: rate.ratePerMilePence,
    };
  } catch (error) {
    console.error("Pricing query failed:", error);
    return null;
  }
}

/**
 * Get pricing quotes for ALL vehicle classes in a single call.
 */
export async function getPricingQuoteAllClasses(
  from: string,
  to: string,
  opts?: {
    fromLat?: number;
    fromLon?: number;
    toLat?: number;
    toLon?: number;
  },
): Promise<PricingQuoteMulti | null> {
  try {
    // 1. Single batched query for fixed routes across all vehicle classes.
    //    Replaces the previous N=3 sequential SELECTs (one per class).
    const allFixedMatches = await db
      .select()
      .from(fixedRoutes)
      .where(
        and(
          sql`${from} ILIKE '%' || ${fixedRoutes.fromLabel} || '%'`,
          sql`${to} ILIKE '%' || ${fixedRoutes.toLabel} || '%'`,
          inArray(fixedRoutes.vehicleType, VEHICLE_CLASSES),
        ),
      );

    const fixedByClass = new Map<VehicleClass, (typeof allFixedMatches)[number]>();
    for (const row of allFixedMatches) {
      const vc = row.vehicleType as VehicleClass;
      if (!fixedByClass.has(vc)) fixedByClass.set(vc, row);
    }

    const fixedQuotes: PricingQuoteMulti["quotes"] = [];
    let routeType: "fixed" | "mile" = "mile";
    let routeName: string | null = null;
    let isAirport = false;
    let isPickupAirport = false;
    let isDropoffAirport = false;
    let distanceMiles: number | undefined;

    for (const vc of VEHICLE_CLASSES) {
      const match = fixedByClass.get(vc);
      if (match) {
        fixedQuotes.push({ vehicleClass: vc, pricePence: match.pricePence });
        routeType = "fixed";
        routeName = match.name;
        isAirport = match.isAirport;
      }
    }

    // All three classes have explicit fixed routes — return as-is.
    if (fixedQuotes.length === VEHICLE_CLASSES.length) {
      isPickupAirport = isAirportAddress(from);
      isDropoffAirport = isAirportAddress(to);
      return {
        quotes: fixedQuotes,
        routeType,
        routeName,
        isAirport,
        isPickupAirport,
        isDropoffAirport,
      };
    }

    // Some but not all classes matched — extrapolate the rest from the
    // first known price using the class multiplier.
    if (fixedQuotes.length > 0) {
      const basePrice = fixedQuotes[0].pricePence;
      for (const vc of VEHICLE_CLASSES) {
        if (!fixedQuotes.find((q) => q.vehicleClass === vc)) {
          fixedQuotes.push({
            vehicleClass: vc,
            pricePence: Math.round(basePrice * CLASS_MULTIPLIER[vc]),
          });
        }
      }
      isPickupAirport = isAirportAddress(from);
      isDropoffAirport = isAirportAddress(to);
      return {
        quotes: fixedQuotes,
        routeType,
        routeName,
        isAirport,
        isPickupAirport,
        isDropoffAirport,
      };
    }

    // 2. Mile-based pricing — requires coordinates
    if (
      opts?.fromLat == null ||
      opts?.fromLon == null ||
      opts?.toLat == null ||
      opts?.toLon == null
    ) {
      return null;
    }

    const osrm = await getOsrmDistance(
      opts.fromLat,
      opts.fromLon,
      opts.toLat,
      opts.toLon,
    );
    if (!osrm) return null;

    distanceMiles = osrm.distanceMiles;
    isPickupAirport = isAirportAddress(from);
    isDropoffAirport = isAirportAddress(to);
    isAirport = isPickupAirport || isDropoffAirport;

    const allRates = await getMileRatesCached(MILE_RATES_CACHE_KEY);
    if (allRates.length === 0) return null;

    const mileQuotes: PricingQuoteMulti["quotes"] = [];
    for (const vc of VEHICLE_CLASSES) {
      const rate = allRates.find((r) => r.vehicleClass === vc);
      if (!rate) continue;
      mileQuotes.push({
        vehicleClass: vc,
        pricePence:
          rate.baseFarePence +
          Math.round(osrm.distanceMiles * rate.ratePerMilePence),
        baseFarePence: rate.baseFarePence,
        ratePerMilePence: rate.ratePerMilePence,
      });
    }

    if (mileQuotes.length === 0) return null;

    return {
      quotes: mileQuotes,
      routeType: "mile",
      routeName: null,
      isAirport,
      isPickupAirport,
      isDropoffAirport,
      distanceMiles,
    };
  } catch (error) {
    console.error("Pricing quote-all failed:", error);
    return null;
  }
}
