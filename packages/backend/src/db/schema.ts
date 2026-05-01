import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  "in_progress",
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

export const vehicleClassEnum = pgEnum("vehicle_class", [
  "regular",
  "comfort",
  "max",
]);

// ── Users ──────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    phone: text("phone"),
    role: userRoleEnum("role").notNull().default("customer"),
    passwordHash: text("password_hash"),
    magicLinkToken: text("magic_link_token"),
    magicLinkExpiresAt: timestamp("magic_link_expires_at"),
    resetPasswordToken: text("reset_password_token"),
    resetPasswordExpiresAt: timestamp("reset_password_expires_at"),
    invitationToken: text("invitation_token"),
    invitationTokenExpiresAt: timestamp("invitation_token_expires_at"),
    profilePictureUrl: text("profile_picture_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_users_role").on(table.role),
    // Auth-token lookups happen on every magic-link / reset / invite verify.
    index("idx_users_magic_link_token").on(table.magicLinkToken),
    index("idx_users_reset_password_token").on(table.resetPasswordToken),
    index("idx_users_invitation_token").on(table.invitationToken),
    // Login does WHERE LOWER(email) = ? — the unique btree on email cannot
    // serve that, so add a functional index.
    index("idx_users_email_lower").on(sql`LOWER(${table.email})`),
  ],
);

// ── Driver Profiles ────────────────────────────────
export const driverProfiles = pgTable("driver_profiles", {
  driverId: integer("driver_id")
    .primaryKey()
    .references(() => users.id),
  vehicleMake: text("vehicle_make"),
  vehicleModel: text("vehicle_model"),
  vehicleYear: integer("vehicle_year"),
  vehicleColor: text("vehicle_color"),
  licensePlate: text("license_plate"),
  vehicleClass: vehicleClassEnum("vehicle_class"),
  bio: text("bio"),
});

// ── Vehicles ──────────────────────────────────────────

export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  class: vehicleClassEnum("class").notNull().unique(),
  name: text("name").notNull(),
  passengerCapacity: integer("passenger_capacity").notNull(),
  baggageCapacity: integer("baggage_capacity").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
});

// ── Mile Rates ────────────────────────────────────────

export const mileRates = pgTable("mile_rates", {
  id: serial("id").primaryKey(),
  vehicleClass: vehicleClassEnum("vehicle_class").notNull().unique(),
  baseFarePence: integer("base_fare_pence").notNull(),
  ratePerMilePence: integer("rate_per_mile_pence").notNull(),
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

export const bookings = pgTable(
  "bookings",
  {
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
    flightNumber: text("flight_number"),
    pickupFlightNumber: text("pickup_flight_number"),
    dropoffFlightNumber: text("dropoff_flight_number"),
    vehicleClass: vehicleClassEnum("vehicle_class")
      .notNull()
      .default("regular"),
    distanceMiles: doublePrecision("distance_miles"),
    ratePerMilePence: integer("rate_per_mile_pence"),
    baseFarePence: integer("base_fare_pence"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_bookings_customer_id").on(table.customerId),
    index("idx_bookings_status").on(table.status),
    index("idx_bookings_scheduled_at").on(table.scheduledAt),
    // Watchdog + reminder background jobs filter by (status, scheduled_at).
    index("idx_bookings_status_sched").on(table.status, table.scheduledAt),
  ],
);

// ── Driver Assignments ─────────────────────────────────

export const driverAssignments = pgTable(
  "driver_assignments",
  {
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
  },
  (table) => [
    index("idx_da_booking").on(table.bookingId),
    index("idx_da_driver_active").on(table.driverId, table.isActive),
    index("idx_da_booking_active").on(table.bookingId, table.isActive),
  ],
);

export const driverHeartbeats = pgTable(
  "driver_heartbeats",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id),
    driverId: integer("driver_id")
      .notNull()
      .references(() => users.id),
    lastHeartbeatAt: timestamp("last_heartbeat_at").notNull().defaultNow(),
    missedWindows: integer("missed_windows").notNull().default(0),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
  },
  (table) => [
    uniqueIndex("driver_heartbeats_booking_driver_unique").on(
      table.bookingId,
      table.driverId,
    ),
    index("idx_hb_last").on(table.lastHeartbeatAt),
  ],
);

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

export const notificationSubscriptions = pgTable(
  "notification_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_notif_subs_user_id").on(table.userId)],
);

export const notificationEvents = pgTable("notification_events", {
  id: serial("id").primaryKey(),
  eventKey: text("event_key").notNull().unique(),
  bookingId: integer("booking_id").references(() => bookings.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Incidents ──────────────────────────────────────────

export const incidents = pgTable(
  "incidents",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id),
    reporterId: integer("reporter_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull().default("contact_admin"),
    message: text("message"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_incidents_booking_id").on(table.bookingId)],
);

// ── Reviews ────────────────────────────────────────────

export const reviews = pgTable(
  "reviews",
  {
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
  },
  (table) => [
    uniqueIndex("reviews_booking_customer_unique").on(
      table.bookingId,
      table.customerId,
    ),
    // Aggregate rating queries (avg, count) filter by driver_id.
    index("idx_reviews_driver_id").on(table.driverId),
  ],
);
