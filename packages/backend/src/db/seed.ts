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
      // password: "admin123" — hashed with Bun.password in Phase 1b
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

  // ── Zones ──────────────────────────────────────────
  const zoneData = [
    { name: "central_london", label: "Central London" },
    { name: "north_london", label: "North London" },
    { name: "south_london", label: "South London" },
    { name: "east_london", label: "East London" },
    { name: "west_london", label: "West London" },
    { name: "heathrow", label: "Heathrow Airport" },
    { name: "gatwick", label: "Gatwick Airport" },
    { name: "stansted", label: "Stansted Airport" },
    { name: "luton", label: "Luton Airport" },
  ];

  const insertedZones = await db.insert(zones).values(zoneData).returning();
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
