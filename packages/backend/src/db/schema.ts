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

// `card`  — Stripe end-to-end (existing flow).
// `cash`  — 25% deposit via Stripe, balance paid in cash to the driver.
//           Required for long-lead bookings beyond the Stripe auth horizon.
export const paymentMethodEnum = pgEnum("booking_payment_method", [
  "card",
  "cash",
]);

// ── Payments ───────────────────────────────────────────
//
// Booking-level rollup of where the money is. Driven entirely by Stripe
// webhooks — never written from a synchronous API response path. See
// services/payments.ts for the state machine.
export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid", // default; no Stripe object yet
  "pending", // PI/SI created, awaiting customer action
  "requires_action", // 3DS or other action required
  "authorized", // funds held, not captured
  "captured", // money has moved
  "partially_refunded",
  "refunded",
  "failed",
  "disputed",
  "uncollectible", // off-session charge failed permanently
]);

export const paymentIntentTypeEnum = pgEnum("payment_intent_type", [
  "payment_intent",
  "setup_intent",
]);

export const refundReasonEnum = pgEnum("refund_reason", [
  "requested_by_customer",
  "duplicate",
  "fraudulent",
  "service_failure",
  "route_change",
  "cancellation_full",
  "cancellation_partial",
  "other",
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
    // Stripe Customer ID for billing. Created eagerly on customer-role
    // signup (and on invitation accept if the new account is a customer).
    // Null for admin/driver accounts — they do not pay.
    stripeCustomerId: text("stripe_customer_id").unique(),
    // Stamped when the user accepts terms during sign-up. Null for legacy
    // accounts created before T&C enforcement.
    termsAcceptedAt: timestamp("terms_accepted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_users_role").on(table.role),
    // Auth-token lookups happen on every magic-link / reset / invite verify.
    index("idx_users_magic_link_token").on(table.magicLinkToken),
    index("idx_users_reset_password_token").on(table.resetPasswordToken),
    index("idx_users_invitation_token").on(table.invitationToken),
    // Email is stored canonically lowercase; the unique btree on email
    // already serves login lookups directly.
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
    // Cached road-snapped polyline for the completed ride. Computed on
    // first /admin/bookings/:id/path GET after status flips to completed
    // and stored as a flat [[lat, lon], ...] array. Avoids re-running
    // OSRM map-matching on every admin view of a finished ride.
    snappedPath: jsonb("snapped_path"),
    // Payment rollup. Authoritative source is the `payments` table; these
    // fields are denormalised projections updated by the webhook handler.
    paymentStatus: paymentStatusEnum("payment_status")
      .notNull()
      .default("unpaid"),
    // Latest active intent. Booking starts with a SetupIntent (long-lead) or
    // PaymentIntent (≤7d). Re-auth flow may replace this with a new PI id.
    activePaymentIntentId: text("active_payment_intent_id"),
    // PaymentMethod attached for off-session re-auth on long-lead bookings.
    paymentMethodId: text("payment_method_id"),
    amountAuthorizedPence: integer("amount_authorized_pence")
      .notNull()
      .default(0),
    amountCapturedPence: integer("amount_captured_pence").notNull().default(0),
    amountRefundedPence: integer("amount_refunded_pence").notNull().default(0),
    cancellationFeePence: integer("cancellation_fee_pence")
      .notNull()
      .default(0),
    // Hold expiry — if the customer never confirms payment, free the slot.
    paymentHoldExpiresAt: timestamp("payment_hold_expires_at"),
    // Card (default, existing behaviour) or cash (25% deposit + balance on
    // pickup). Cash bypasses the Stripe auth-horizon guard, so long-lead
    // bookings are funnelled here.
    paymentMethod: paymentMethodEnum("payment_method")
      .notNull()
      .default("card"),
    // Cash bookings only. 25% of total charged via Stripe up front;
    // balance collected in person and stamped via `cashCollectedAt`.
    depositPence: integer("deposit_pence").notNull().default(0),
    balanceDuePence: integer("balance_due_pence").notNull().default(0),
    cashCollectedAt: timestamp("cash_collected_at"),
    // Driver-side arrival (status -> arrived) timestamp. Starts the
    // 30-min-free waiting clock. Promoted out of the status enum so the
    // fee math has a stable anchor independent of subsequent transitions.
    driverArrivedAt: timestamp("driver_arrived_at"),
    // Customer pressed "I'm here". Caps the waiting timer.
    customerArrivedAt: timestamp("customer_arrived_at"),
    // Computed at ride start (or no-show). 30 min free, then 200p / 5 min.
    waitingFeePence: integer("waiting_fee_pence").notNull().default(0),
    // Stamped when driver/admin marks the customer no-show.
    noShowAt: timestamp("no_show_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_bookings_customer_id").on(table.customerId),
    index("idx_bookings_status").on(table.status),
    index("idx_bookings_scheduled_at").on(table.scheduledAt),
    // Watchdog + reminder background jobs filter by (status, scheduled_at).
    index("idx_bookings_status_sched").on(table.status, table.scheduledAt),
    index("idx_bookings_payment_status").on(table.paymentStatus),
    // Re-auth job scans (paymentStatus, scheduledAt) for long-lead bookings
    // approaching the 7-day reauth horizon.
    index("idx_bookings_pay_status_sched").on(
      table.paymentStatus,
      table.scheduledAt,
    ),
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
    // Geofence dwell tracking. Set when the driver first enters the pickup
    // radius; cleared if they leave it. Auto-arrival fires when the dwell
    // duration exceeds the configured window. Leaving this on the heartbeat
    // row keeps the dwell state colocated with the heartbeat upsert.
    pickupGeofenceSince: timestamp("pickup_geofence_since"),
  },
  (table) => [
    uniqueIndex("driver_heartbeats_booking_driver_unique").on(
      table.bookingId,
      table.driverId,
    ),
    index("idx_hb_last").on(table.lastHeartbeatAt),
  ],
);

// ── Driver Location Breadcrumb ─────────────────────────
//
// Append-only trail of every GPS fix during a ride. driver_heartbeats only
// stores the latest position (for watchdog liveness); this table preserves
// history so we can replay a trip, compute actual distance, or settle
// disputes about the route taken. One row per heartbeat that carries coords.

export const driverLocationPoints = pgTable(
  "driver_location_points",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id),
    driverId: integer("driver_id")
      .notNull()
      .references(() => users.id),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    accuracyM: doublePrecision("accuracy_m"),
    speedMps: doublePrecision("speed_mps"),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_dlp_booking_recorded").on(table.bookingId, table.recordedAt),
  ],
);

// ── Driver Presence ────────────────────────────────────
//
// One row per driver. Updated by the driver app while on duty (every 30s)
// and by the heartbeat endpoint while a ride is active. The admin live map
// reads this for "where is everyone right now" — a driver counts as live
// when isOnDuty=true and lastSeenAt is recent.

export const driverPresence = pgTable(
  "driver_presence",
  {
    driverId: integer("driver_id")
      .primaryKey()
      .references(() => users.id),
    isOnDuty: boolean("is_on_duty").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at"),
    lastLat: doublePrecision("last_lat"),
    lastLon: doublePrecision("last_lon"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_driver_presence_live").on(table.isOnDuty, table.lastSeenAt),
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

// ── Payments ──────────────────────────────────────────
//
// One row per Stripe PaymentIntent or SetupIntent. A booking can have many
// payment rows over its lifetime (e.g. SetupIntent at booking time, then a
// PaymentIntent created at T-6d for long-lead reauth). The most recent
// authorised/captured row reflects the live charge — the booking's
// `activePaymentIntentId` points to it for fast lookup.
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => users.id),
    stripeIntentId: text("stripe_intent_id").notNull().unique(),
    intentType: paymentIntentTypeEnum("intent_type").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amountPence: integer("amount_pence").notNull().default(0),
    currency: text("currency").notNull().default("gbp"),
    paymentMethodId: text("payment_method_id"),
    // Stripe charge id — populated after a successful PI is captured.
    stripeChargeId: text("stripe_charge_id"),
    // Last failure reason from Stripe for debugging / customer support.
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    // Idempotency key used when the intent was created. Stored so we can
    // safely retry a stuck create.
    idempotencyKey: text("idempotency_key"),
    capturedAt: timestamp("captured_at"),
    voidedAt: timestamp("voided_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_payments_booking").on(table.bookingId),
    index("idx_payments_customer").on(table.customerId),
    index("idx_payments_status").on(table.status),
    index("idx_payments_charge").on(table.stripeChargeId),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id),
    paymentId: integer("payment_id")
      .notNull()
      .references(() => payments.id),
    stripeRefundId: text("stripe_refund_id").notNull().unique(),
    amountPence: integer("amount_pence").notNull(),
    reason: refundReasonEnum("reason").notNull(),
    adminNote: text("admin_note"),
    // Null when refund originates from a webhook (e.g. dispute auto-refund).
    initiatedByUserId: integer("initiated_by_user_id").references(
      () => users.id,
    ),
    // Stripe lifecycle: pending → succeeded | failed | canceled
    status: text("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_refunds_booking").on(table.bookingId),
    index("idx_refunds_status").on(table.status),
  ],
);

export const disputes = pgTable(
  "disputes",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id),
    paymentId: integer("payment_id")
      .notNull()
      .references(() => payments.id),
    stripeDisputeId: text("stripe_dispute_id").notNull().unique(),
    amountPence: integer("amount_pence").notNull(),
    reason: text("reason").notNull(),
    // Stripe statuses: warning_needs_response, needs_response, under_review,
    // charge_refunded, won, lost.
    status: text("status").notNull(),
    evidenceDueBy: timestamp("evidence_due_by"),
    evidenceSubmittedAt: timestamp("evidence_submitted_at"),
    outcome: text("outcome"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_disputes_booking").on(table.bookingId),
    index("idx_disputes_status").on(table.status),
  ],
);

// ── App Settings ───────────────────────────────────────
//
// Single-row-per-key kv store for runtime-tunable values that the admin
// panel exposes (contact phone, emergency number, waiting-fee dials, etc.).
// Strings only — coerce on read. Keep the surface tiny on purpose; bigger
// config goes in code/env, not here.
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Webhook Events ─────────────────────────────────────
//
// Idempotency log. Stripe's at-least-once delivery means the same event id
// can hit the endpoint multiple times; INSERT-then-process gives us a
// single-source-of-truth on whether work has already been done.
export const webhookEvents = pgTable(
  "webhook_events",
  {
    stripeEventId: text("stripe_event_id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
    processingError: text("processing_error"),
  },
  (table) => [index("idx_webhook_events_type").on(table.type)],
);
