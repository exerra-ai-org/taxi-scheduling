import { db } from "./index";
import { sql } from "drizzle-orm";
import {
  users,
  zones,
  zonePricing,
  fixedRoutes,
  coupons,
  reviews,
  driverHeartbeats,
  driverAssignments,
  bookings,
  notificationSubscriptions,
  notificationEvents,
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
  await db.delete(driverHeartbeats);
  await db.delete(notificationEvents);
  await db.delete(notificationSubscriptions);
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
  await db.execute(sql`ALTER SEQUENCE bookings_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE driver_assignments_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE driver_heartbeats_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE reviews_id_seq RESTART WITH 1`);
  await db.execute(
    sql`ALTER SEQUENCE notification_subscriptions_id_seq RESTART WITH 1`,
  );
  await db.execute(sql`ALTER SEQUENCE notification_events_id_seq RESTART WITH 1`);

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

  // Additional test customers
  await db.insert(users).values([
    {
      email: "sarah@example.com",
      name: "Sarah Johnson",
      phone: "07712345678",
      role: "customer",
    },
    {
      email: "james@example.com",
      name: "James Wilson",
      phone: "07798765432",
      role: "customer",
    },
    {
      email: "emma@example.com",
      name: "Emma Davis",
      phone: "07755544433",
      role: "customer",
    },
  ]);

  console.log(
    "  Users created:",
    admin.id,
    driver1.id,
    driver2.id,
    customer.id,
    "+ 3 more customers",
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

  // ── Zone Pricing — full tiered matrix (pence) ─────
  // Same zone: £20 (2000p)
  // Adjacent (1 hop from Central): £35 (3500p)
  // Cross-city (2 hops, opposite): £50 (5000p)
  // Diagonal (2 hops, not opposite): £45 (4500p)
  // Airport ↔ Central: handled by fixed routes
  // Airport ↔ non-Central London zone: £75-85

  const C = zoneMap.central_london;
  const N = zoneMap.north_london;
  const S = zoneMap.south_london;
  const E = zoneMap.east_london;
  const W = zoneMap.west_london;
  const HEA = zoneMap.heathrow;
  const GAT = zoneMap.gatwick;
  const STA = zoneMap.stansted;
  const LUT = zoneMap.luton;

  const zonePricingData = [
    // Adjacent to Central (1 hop) — £35
    { fromZoneId: C, toZoneId: N, pricePence: 3500 },
    { fromZoneId: C, toZoneId: S, pricePence: 3500 },
    { fromZoneId: C, toZoneId: E, pricePence: 3500 },
    { fromZoneId: C, toZoneId: W, pricePence: 3500 },

    // Cross-city opposite (2 hops) — £50
    { fromZoneId: N, toZoneId: S, pricePence: 5000 },
    { fromZoneId: E, toZoneId: W, pricePence: 5000 },

    // Diagonal (2 hops, not opposite) — £45
    { fromZoneId: N, toZoneId: E, pricePence: 4500 },
    { fromZoneId: N, toZoneId: W, pricePence: 4500 },
    { fromZoneId: S, toZoneId: E, pricePence: 4500 },
    { fromZoneId: S, toZoneId: W, pricePence: 4500 },

    // Airport ↔ Central London (zone fallback for when fixed route text doesn't match)
    { fromZoneId: HEA, toZoneId: C, pricePence: 6500 },
    { fromZoneId: GAT, toZoneId: C, pricePence: 8500 },
    { fromZoneId: STA, toZoneId: C, pricePence: 9500 },
    { fromZoneId: LUT, toZoneId: C, pricePence: 8000 },

    // Airport ↔ non-Central London zones — £75-85
    { fromZoneId: HEA, toZoneId: N, pricePence: 7500 },
    { fromZoneId: HEA, toZoneId: S, pricePence: 7500 },
    { fromZoneId: HEA, toZoneId: E, pricePence: 8500 },
    { fromZoneId: HEA, toZoneId: W, pricePence: 5500 },
    { fromZoneId: GAT, toZoneId: N, pricePence: 8500 },
    { fromZoneId: GAT, toZoneId: S, pricePence: 6500 },
    { fromZoneId: GAT, toZoneId: E, pricePence: 8000 },
    { fromZoneId: GAT, toZoneId: W, pricePence: 8500 },
    { fromZoneId: STA, toZoneId: N, pricePence: 7500 },
    { fromZoneId: STA, toZoneId: S, pricePence: 9500 },
    { fromZoneId: STA, toZoneId: E, pricePence: 7000 },
    { fromZoneId: STA, toZoneId: W, pricePence: 9500 },
    { fromZoneId: LUT, toZoneId: N, pricePence: 7000 },
    { fromZoneId: LUT, toZoneId: S, pricePence: 9000 },
    { fromZoneId: LUT, toZoneId: E, pricePence: 8500 },
    { fromZoneId: LUT, toZoneId: W, pricePence: 8000 },
  ];

  await db.insert(zonePricing).values(zonePricingData);
  console.log("  Zone pricing entries created:", zonePricingData.length);

  // ── Fixed Routes ───────────────────────────────────

  const fixedRouteData = [
    // Airport routes
    {
      name: "Heathrow → Central London",
      fromLabel: "Heathrow",
      toLabel: "Central London",
      pricePence: 6500,
      isAirport: true,
    },
    {
      name: "Central London → Heathrow",
      fromLabel: "Central London",
      toLabel: "Heathrow",
      pricePence: 6500,
      isAirport: true,
    },
    {
      name: "Gatwick → Central London",
      fromLabel: "Gatwick",
      toLabel: "Central London",
      pricePence: 8500,
      isAirport: true,
    },
    {
      name: "Central London → Gatwick",
      fromLabel: "Central London",
      toLabel: "Gatwick",
      pricePence: 8500,
      isAirport: true,
    },
    {
      name: "Heathrow ↔ Gatwick",
      fromLabel: "Heathrow",
      toLabel: "Gatwick",
      pricePence: 12000,
      isAirport: true,
    },
    {
      name: "Stansted → Central London",
      fromLabel: "Stansted",
      toLabel: "Central London",
      pricePence: 9500,
      isAirport: true,
    },
    {
      name: "Luton → Central London",
      fromLabel: "Luton",
      toLabel: "Central London",
      pricePence: 8000,
      isAirport: true,
    },

    // Common London routes (non-airport)
    {
      name: "Westminster → Canary Wharf",
      fromLabel: "Westminster",
      toLabel: "Canary Wharf",
      pricePence: 3000,
      isAirport: false,
    },
    {
      name: "Canary Wharf → Westminster",
      fromLabel: "Canary Wharf",
      toLabel: "Westminster",
      pricePence: 3000,
      isAirport: false,
    },
    {
      name: "King's Cross → Greenwich",
      fromLabel: "King's Cross",
      toLabel: "Greenwich",
      pricePence: 3500,
      isAirport: false,
    },
    {
      name: "Greenwich → King's Cross",
      fromLabel: "Greenwich",
      toLabel: "King's Cross",
      pricePence: 3500,
      isAirport: false,
    },
    {
      name: "Paddington → Liverpool Street",
      fromLabel: "Paddington",
      toLabel: "Liverpool Street",
      pricePence: 2800,
      isAirport: false,
    },
    {
      name: "Liverpool Street → Paddington",
      fromLabel: "Liverpool Street",
      toLabel: "Paddington",
      pricePence: 2800,
      isAirport: false,
    },
    {
      name: "Camden → London Bridge",
      fromLabel: "Camden",
      toLabel: "London Bridge",
      pricePence: 2500,
      isAirport: false,
    },
    {
      name: "London Bridge → Camden",
      fromLabel: "London Bridge",
      toLabel: "Camden",
      pricePence: 2500,
      isAirport: false,
    },
    {
      name: "Victoria → Stratford",
      fromLabel: "Victoria",
      toLabel: "Stratford",
      pricePence: 3500,
      isAirport: false,
    },
    {
      name: "Stratford → Victoria",
      fromLabel: "Stratford",
      toLabel: "Victoria",
      pricePence: 3500,
      isAirport: false,
    },
    {
      name: "Wimbledon → Central London",
      fromLabel: "Wimbledon",
      toLabel: "Central London",
      pricePence: 4000,
      isAirport: false,
    },
    {
      name: "Central London → Wimbledon",
      fromLabel: "Central London",
      toLabel: "Wimbledon",
      pricePence: 4000,
      isAirport: false,
    },
    {
      name: "Richmond → City of London",
      fromLabel: "Richmond",
      toLabel: "City of London",
      pricePence: 3800,
      isAirport: false,
    },
    {
      name: "City of London → Richmond",
      fromLabel: "City of London",
      toLabel: "Richmond",
      pricePence: 3800,
      isAirport: false,
    },
    {
      name: "Croydon → Central London",
      fromLabel: "Croydon",
      toLabel: "Central London",
      pricePence: 4500,
      isAirport: false,
    },
    {
      name: "Central London → Croydon",
      fromLabel: "Central London",
      toLabel: "Croydon",
      pricePence: 4500,
      isAirport: false,
    },
    {
      name: "Shoreditch → Westminster",
      fromLabel: "Shoreditch",
      toLabel: "Westminster",
      pricePence: 3000,
      isAirport: false,
    },
    {
      name: "Westminster → Shoreditch",
      fromLabel: "Westminster",
      toLabel: "Shoreditch",
      pricePence: 3000,
      isAirport: false,
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
