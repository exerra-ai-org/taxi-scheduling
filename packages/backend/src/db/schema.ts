import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "customer",
  "admin",
  "driver",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "scheduled",
  "assigned",
  "en_route",
  "arrived",
  "completed",
  "cancelled",
]);

export const driverAssignmentRoleEnum = pgEnum("driver_assignment_role", [
  "primary",
  "backup",
]);

export const discountTypeEnum = pgEnum("discount_type", [
  "fixed",
  "percentage",
]);

// ── Users ──────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  role: userRoleEnum("role").notNull().default("customer"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Zones & Pricing ────────────────────────────────────

export const zones = pgTable("zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  // GeoJSON polygon boundary (stored as jsonb, queried via ST_GeomFromGeoJSON)
  boundary: jsonb("boundary"),
  centerLat: doublePrecision("center_lat"),
  centerLon: doublePrecision("center_lon"),
});

export const zonePricing = pgTable(
  "zone_pricing",
  {
    id: serial("id").primaryKey(),
    fromZoneId: integer("from_zone_id")
      .notNull()
      .references(() => zones.id),
    toZoneId: integer("to_zone_id")
      .notNull()
      .references(() => zones.id),
    pricePence: integer("price_pence").notNull(),
    vehicleType: text("vehicle_type").notNull().default("standard"),
  },
  (table) => [
    uniqueIndex("zone_pricing_unique").on(
      table.fromZoneId,
      table.toZoneId,
      table.vehicleType,
    ),
  ],
);

export const fixedRoutes = pgTable("fixed_routes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  fromLabel: text("from_label").notNull(),
  toLabel: text("to_label").notNull(),
  pricePence: integer("price_pence").notNull(),
  vehicleType: text("vehicle_type").notNull().default("standard"),
  isAirport: boolean("is_airport").notNull().default(false),
});

// ── Bookings ───────────────────────────────────────────

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => users.id),
  pickupAddress: text("pickup_address").notNull(),
  dropoffAddress: text("dropoff_address").notNull(),
  pickupLat: doublePrecision("pickup_lat"),
  pickupLon: doublePrecision("pickup_lon"),
  dropoffLat: doublePrecision("dropoff_lat"),
  dropoffLon: doublePrecision("dropoff_lon"),
  pickupZoneId: integer("pickup_zone_id").references(() => zones.id),
  dropoffZoneId: integer("dropoff_zone_id").references(() => zones.id),
  fixedRouteId: integer("fixed_route_id").references(() => fixedRoutes.id),
  scheduledAt: timestamp("scheduled_at").notNull(),
  pricePence: integer("price_pence").notNull(),
  discountPence: integer("discount_pence").notNull().default(0),
  couponId: integer("coupon_id").references(() => coupons.id),
  status: bookingStatusEnum("status").notNull().default("scheduled"),
  isAirport: boolean("is_airport").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Driver Assignments ─────────────────────────────────

export const driverAssignments = pgTable("driver_assignments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id),
  driverId: integer("driver_id")
    .notNull()
    .references(() => users.id),
  role: driverAssignmentRoleEnum("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

// ── Coupons ────────────────────────────────────────────

export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountType: discountTypeEnum("discount_type").notNull(),
  discountValue: integer("discount_value").notNull(),
  expiresAt: timestamp("expires_at"),
  maxUses: integer("max_uses"),
  currentUses: integer("current_uses").notNull().default(0),
});

// ── Reviews ────────────────────────────────────────────

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => users.id),
  driverId: integer("driver_id")
    .notNull()
    .references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
