import { db } from "./index";
import { sql } from "drizzle-orm";
import {
  users,
  zones,
  zonePricing,
  fixedRoutes,
  coupons,
  reviews,
  driverAssignments,
  bookings,
} from "./schema";

// Approximate GeoJSON polygon boundaries for London zones
// Coordinates are [longitude, latitude] per GeoJSON spec
const ZONE_GEODATA: Record<
  string,
  {
    label: string;
    centerLat: number;
    centerLon: number;
    boundary: object;
  }
> = {
  central_london: {
    label: "Central London",
    centerLat: 51.5074,
    centerLon: -0.1278,
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [-0.2, 51.47],
          [-0.05, 51.47],
          [-0.05, 51.54],
          [-0.2, 51.54],
          [-0.2, 51.47],
        ],
      ],
    },
  },
  north_london: {
    label: "North London",
    centerLat: 51.58,
    centerLon: -0.11,
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [-0.25, 51.54],
          [-0.0, 51.54],
          [-0.0, 51.65],
          [-0.25, 51.65],
          [-0.25, 51.54],
        ],
      ],
    },
  },
  south_london: {
    label: "South London",
    centerLat: 51.46,
    centerLon: -0.1,
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [-0.2, 51.38],
          [-0.0, 51.38],
          [-0.0, 51.47],
          [-0.2, 51.47],
          [-0.2, 51.38],
        ],
      ],
    },
  },
  east_london: {
    label: "East London",
    centerLat: 51.52,
    centerLon: 0.02,
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [-0.05, 51.47],
          [0.15, 51.47],
          [0.15, 51.58],
          [-0.05, 51.58],
          [-0.05, 51.47],
        ],
      ],
    },
  },
  west_london: {
    label: "West London",
    centerLat: 51.5,
    centerLon: -0.3,
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [-0.45, 51.47],
          [-0.2, 51.47],
          [-0.2, 51.54],
          [-0.45, 51.54],
          [-0.45, 51.47],
        ],
      ],
    },
  },
  heathrow: {
    label: "Heathrow Airport",
    centerLat: 51.47,
    centerLon: -0.4543,
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [-0.5, 51.45],
          [-0.42, 51.45],
          [-0.42, 51.49],
          [-0.5, 51.49],
          [-0.5, 51.45],
        ],
      ],
    },
  },
  gatwick: {
    label: "Gatwick Airport",
    centerLat: 51.1537,
    centerLon: -0.1821,
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [-0.22, 51.13],
          [-0.14, 51.13],
          [-0.14, 51.17],
          [-0.22, 51.17],
          [-0.22, 51.13],
        ],
      ],
    },
  },
  stansted: {
    label: "Stansted Airport",
    centerLat: 51.885,
    centerLon: 0.235,
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [0.19, 51.87],
          [0.28, 51.87],
          [0.28, 51.9],
          [0.19, 51.9],
          [0.19, 51.87],
        ],
      ],
    },
  },
  luton: {
    label: "Luton Airport",
    centerLat: 51.8747,
    centerLon: -0.3683,
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [-0.4, 51.86],
          [-0.34, 51.86],
          [-0.34, 51.89],
          [-0.4, 51.89],
          [-0.4, 51.86],
        ],
      ],
    },
  },
};

async function seed() {
  console.log("Seeding database...");

  // Clear existing data (order matters for FK constraints)
  console.log("  Clearing existing data...");
  await db.delete(reviews);
  await db.delete(driverAssignments);
  await db.delete(bookings);
  await db.delete(zonePricing);
  await db.delete(fixedRoutes);
  await db.delete(coupons);
  await db.delete(zones);
  await db.delete(users);
  // Reset sequences
  await db.execute(sql`ALTER SEQUENCE users_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE zones_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE zone_pricing_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE fixed_routes_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE coupons_id_seq RESTART WITH 1`);

  // ── Users ──────────────────────────────────────────
  const [admin] = await db
    .insert(users)
    .values({
      email: "admin@taxi.local",
      name: "Admin User",
      phone: "07700000001",
      role: "admin",
      passwordHash: await Bun.password.hash("admin123"),
    })
    .returning();

  const [driver1] = await db
    .insert(users)
    .values({
      email: "driver1@taxi.local",
      name: "John Driver",
      phone: "07700000002",
      role: "driver",
      passwordHash: await Bun.password.hash("driver123"),
    })
    .returning();

  const [driver2] = await db
    .insert(users)
    .values({
      email: "driver2@taxi.local",
      name: "Jane Driver",
      phone: "07700000003",
      role: "driver",
      passwordHash: await Bun.password.hash("driver123"),
    })
    .returning();

  const [customer] = await db
    .insert(users)
    .values({
      email: "customer@example.com",
      name: "Test Customer",
      phone: "07700000004",
      role: "customer",
    })
    .returning();

  console.log(
    "  Users created:",
    admin.id,
    driver1.id,
    driver2.id,
    customer.id,
  );

  // ── Zones with GeoJSON boundaries ─────────────────
  const zoneEntries = Object.entries(ZONE_GEODATA).map(([name, geo]) => ({
    name,
    label: geo.label,
    centerLat: geo.centerLat,
    centerLon: geo.centerLon,
    boundary: geo.boundary,
  }));

  const insertedZones = await db.insert(zones).values(zoneEntries).returning();
  const zoneMap = Object.fromEntries(insertedZones.map((z) => [z.name, z.id]));
  console.log("  Zones created:", insertedZones.length);

  // ── Zone Pricing (sample pairs, pence) ─────────────
  const zonePricingData = [
    {
      fromZoneId: zoneMap.central_london,
      toZoneId: zoneMap.north_london,
      pricePence: 3500,
    },
    {
      fromZoneId: zoneMap.central_london,
      toZoneId: zoneMap.south_london,
      pricePence: 3500,
    },
    {
      fromZoneId: zoneMap.central_london,
      toZoneId: zoneMap.east_london,
      pricePence: 3500,
    },
    {
      fromZoneId: zoneMap.central_london,
      toZoneId: zoneMap.west_london,
      pricePence: 3500,
    },
    {
      fromZoneId: zoneMap.north_london,
      toZoneId: zoneMap.south_london,
      pricePence: 5000,
    },
    {
      fromZoneId: zoneMap.east_london,
      toZoneId: zoneMap.west_london,
      pricePence: 5000,
    },
  ];

  await db.insert(zonePricing).values(zonePricingData);
  console.log("  Zone pricing entries created:", zonePricingData.length);

  // ── Fixed Routes ───────────────────────────────────
  const fixedRouteData = [
    {
      name: "Heathrow → Central London",
      fromLabel: "Heathrow Airport",
      toLabel: "Central London",
      pricePence: 6500,
      isAirport: true,
    },
    {
      name: "Central London → Heathrow",
      fromLabel: "Central London",
      toLabel: "Heathrow Airport",
      pricePence: 6500,
      isAirport: true,
    },
    {
      name: "Gatwick → Central London",
      fromLabel: "Gatwick Airport",
      toLabel: "Central London",
      pricePence: 8500,
      isAirport: true,
    },
    {
      name: "Central London → Gatwick",
      fromLabel: "Central London",
      toLabel: "Gatwick Airport",
      pricePence: 8500,
      isAirport: true,
    },
    {
      name: "Heathrow → Gatwick",
      fromLabel: "Heathrow Airport",
      toLabel: "Gatwick Airport",
      pricePence: 12000,
      isAirport: true,
    },
    {
      name: "Stansted → Central London",
      fromLabel: "Stansted Airport",
      toLabel: "Central London",
      pricePence: 9500,
      isAirport: true,
    },
    {
      name: "Luton → Central London",
      fromLabel: "Luton Airport",
      toLabel: "Central London",
      pricePence: 8000,
      isAirport: true,
    },
  ];

  await db.insert(fixedRoutes).values(fixedRouteData);
  console.log("  Fixed routes created:", fixedRouteData.length);

  // ── Coupons ────────────────────────────────────────
  await db.insert(coupons).values([
    {
      code: "WELCOME10",
      discountType: "percentage",
      discountValue: 10,
      maxUses: 100,
    },
    { code: "FLAT5", discountType: "fixed", discountValue: 500, maxUses: 50 },
  ]);
  console.log("  Coupons created: 2");

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
