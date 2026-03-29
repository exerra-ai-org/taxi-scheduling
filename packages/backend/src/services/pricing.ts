import { db } from "../db/index";
import { fixedRoutes, zones, zonePricing } from "../db/schema";
import { ilike, eq, and, or, sql } from "drizzle-orm";
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

export function isLondonZone(zoneName: string): boolean {
  return LONDON_ZONE_PATTERN.test(zoneName);
}

export async function getPricingQuote(
  from: string,
  to: string,
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

  // 2. Fall back to zone-based pricing
  const pickupZone = await getZoneByAddress(from);
  const dropoffZone = await getZoneByAddress(to);

  if (!pickupZone || !dropoffZone) {
    return null;
  }

  // Try both directions for zone pricing
  const zonePrice = await db
    .select()
    .from(zonePricing)
    .where(
      or(
        and(
          eq(zonePricing.fromZoneId, pickupZone.id),
          eq(zonePricing.toZoneId, dropoffZone.id),
        ),
        and(
          eq(zonePricing.fromZoneId, dropoffZone.id),
          eq(zonePricing.toZoneId, pickupZone.id),
        ),
      ),
    )
    .limit(1);

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
