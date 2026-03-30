import { db } from "../db/index";
import { fixedRoutes, zones, zonePricing } from "../db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import type { PricingQuote } from "shared/types";
import { LONDON_ZONE_PATTERN } from "../lib/constants";

export async function getZoneByAddress(address: string) {
  // Check if the address contains a zone label (e.g. "123 High St, North London" contains "North London")
  const results = await db
    .select()
    .from(zones)
    .where(sql`${address} ILIKE '%' || ${zones.label} || '%'`);
  return results[0] ?? null;
}

/**
 * Coordinate-based zone lookup using PostGIS ST_Contains with GeoJSON boundaries.
 * Falls back gracefully if no boundary data is stored.
 */
export async function getZoneByCoordinates(lat: number, lon: number) {
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
  return results[0] ?? null;
}

export function isLondonZone(zoneName: string): boolean {
  return LONDON_ZONE_PATTERN.test(zoneName);
}

async function getZonePriceForZones(fromZoneId: number, toZoneId: number) {
  return db
    .select()
    .from(zonePricing)
    .where(
      or(
        and(
          eq(zonePricing.fromZoneId, fromZoneId),
          eq(zonePricing.toZoneId, toZoneId),
        ),
        and(
          eq(zonePricing.fromZoneId, toZoneId),
          eq(zonePricing.toZoneId, fromZoneId),
        ),
      ),
    )
    .limit(1);
}

export async function getPricingQuote(
  from: string,
  to: string,
  opts?: {
    fromLat?: number;
    fromLon?: number;
    toLat?: number;
    toLon?: number;
  },
): Promise<
  | (PricingQuote & {
      fixedRouteId?: number;
      pickupZoneId?: number;
      dropoffZoneId?: number;
    })
  | null
> {
  // 1. Check fixed routes first (highest priority)
  const fixedMatch = await db
    .select()
    .from(fixedRoutes)
    .where(
      and(
        sql`${from} ILIKE '%' || ${fixedRoutes.fromLabel} || '%'`,
        sql`${to} ILIKE '%' || ${fixedRoutes.toLabel} || '%'`,
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

  // 2. Zone-based pricing — prefer coordinate lookup, fall back to text
  let pickupZone = null;
  let dropoffZone = null;

  if (
    opts?.fromLat != null &&
    opts?.fromLon != null &&
    opts?.toLat != null &&
    opts?.toLon != null
  ) {
    [pickupZone, dropoffZone] = await Promise.all([
      getZoneByCoordinates(opts.fromLat, opts.fromLon),
      getZoneByCoordinates(opts.toLat, opts.toLon),
    ]);
  }

  // Text fallback for either or both zones
  if (!pickupZone) pickupZone = await getZoneByAddress(from);
  if (!dropoffZone) dropoffZone = await getZoneByAddress(to);

  if (!pickupZone || !dropoffZone) {
    return null;
  }

  const zonePrice = await getZonePriceForZones(pickupZone.id, dropoffZone.id);

  if (zonePrice.length > 0) {
    return {
      pricePence: zonePrice[0].pricePence,
      routeType: "zone",
      routeName: null,
      isAirport: false,
      pickupZoneId: pickupZone.id,
      dropoffZoneId: dropoffZone.id,
    };
  }

  return null;
}
