import { Hono } from "hono";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  createBookingSchema,
  updateBookingStatusSchema,
  assignDriversSchema,
  BOOKING_MIN_HOURS_STANDARD,
  BOOKING_MIN_HOURS_LONDON,
  BOOKING_MAX_DAYS,
} from "shared/validation";
import { db } from "../db/index";
import { bookings, driverAssignments, users } from "../db/schema";
import { authMiddleware, type JwtPayload } from "../middleware/auth";
import { requireRole } from "../middleware/auth";
import { ok, err } from "../lib/response";
import {
  getPricingQuote,
  getZoneByAddress,
  getZoneByCoordinates,
  isLondonZone,
} from "../services/pricing";
import {
  validateCoupon,
  applyCoupon,
  incrementCouponUsage,
} from "../services/coupon";

export const bookingRoutes = new Hono();

// All booking routes require auth
bookingRoutes.use("*", authMiddleware);

// ── Create Booking ─────────────────────────────────────

bookingRoutes.post("/", requireRole("customer"), async (c) => {
  const body = await c.req.json();
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const payload = c.get("jwtPayload") as JwtPayload;
  const {
    pickupAddress,
    dropoffAddress,
    scheduledAt,
    couponCode,
    pickupLat,
    pickupLon,
    dropoffLat,
    dropoffLon,
  } = parsed.data;
  const scheduledDate = new Date(scheduledAt);
  const now = new Date();

  // Get pricing quote — use coordinates when available
  const quote = await getPricingQuote(pickupAddress, dropoffAddress, {
    fromLat: pickupLat,
    fromLon: pickupLon,
    toLat: dropoffLat,
    toLon: dropoffLon,
  });
  if (!quote) {
    return err(c, "No pricing available for this route", 400);
  }

  // Determine minimum booking hours based on pickup zone
  let pickupZone = null;
  if (pickupLat != null && pickupLon != null) {
    pickupZone = await getZoneByCoordinates(pickupLat, pickupLon);
  }
  if (!pickupZone) {
    pickupZone = await getZoneByAddress(pickupAddress);
  }
  const minHours =
    pickupZone && isLondonZone(pickupZone.name)
      ? BOOKING_MIN_HOURS_LONDON
      : BOOKING_MIN_HOURS_STANDARD;

  // Validate time constraints
  const minTime = new Date(now.getTime() + minHours * 60 * 60 * 1000);
  if (scheduledDate < minTime) {
    return err(c, `Booking must be at least ${minHours} hours in advance`, 400);
  }

  const maxTime = new Date(
    now.getTime() + BOOKING_MAX_DAYS * 24 * 60 * 60 * 1000,
  );
  if (scheduledDate > maxTime) {
    return err(
      c,
      `Booking cannot be more than ${BOOKING_MAX_DAYS} days in advance`,
      400,
    );
  }

  // Handle coupon
  let discountPence = 0;
  let couponId: number | null = null;
  let finalPrice = quote.pricePence;

  if (couponCode) {
    const couponResult = await validateCoupon(couponCode);
    if (!couponResult.valid || !couponResult.coupon) {
      return err(c, couponResult.reason || "Invalid coupon", 400);
    }
    const discount = applyCoupon(couponResult.coupon, quote.pricePence);
    discountPence = discount.discountPence;
    finalPrice = discount.finalPricePence;
    couponId = couponResult.coupon.id;
  }

  // Insert booking
  const [booking] = await db
    .insert(bookings)
    .values({
      customerId: payload.sub,
      pickupAddress,
      dropoffAddress,
      pickupLat: pickupLat ?? null,
      pickupLon: pickupLon ?? null,
      dropoffLat: dropoffLat ?? null,
      dropoffLon: dropoffLon ?? null,
      pickupZoneId: quote.pickupZoneId ?? null,
      dropoffZoneId: quote.dropoffZoneId ?? null,
      fixedRouteId: quote.fixedRouteId ?? null,
      scheduledAt: scheduledDate,
      pricePence: finalPrice,
      discountPence,
      couponId,
      isAirport: quote.isAirport,
    })
    .returning();

  // Increment coupon usage
  if (couponId) {
    await incrementCouponUsage(couponId);
  }

  return ok(c, { booking }, 201);
});

// ── List Bookings ──────────────────────────────────────

bookingRoutes.get("/", async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;

  let results;

  if (payload.role === "customer") {
    results = await db
      .select()
      .from(bookings)
      .where(eq(bookings.customerId, payload.sub))
      .orderBy(desc(bookings.scheduledAt));
  } else if (payload.role === "admin") {
    results = await db
      .select()
      .from(bookings)
      .orderBy(desc(bookings.scheduledAt));
  } else {
    // Driver: get bookings where driver has active assignment
    results = await db
      .select({ booking: bookings })
      .from(driverAssignments)
      .innerJoin(bookings, eq(driverAssignments.bookingId, bookings.id))
      .where(
        and(
          eq(driverAssignments.driverId, payload.sub),
          eq(driverAssignments.isActive, true),
        ),
      )
      .orderBy(desc(bookings.scheduledAt))
      .then((rows) => rows.map((r) => r.booking));
  }

  return ok(c, { bookings: results });
});

// ── Get Single Booking ─────────────────────────────────

bookingRoutes.get("/:id", async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const id = parseInt(c.req.param("id"));

  const result = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);

  if (result.length === 0) {
    return err(c, "Booking not found", 404);
  }

  const booking = result[0];

  // Access control
  if (payload.role === "customer" && booking.customerId !== payload.sub) {
    return err(c, "Forbidden", 403);
  }

  if (payload.role === "driver") {
    const assignment = await db
      .select()
      .from(driverAssignments)
      .where(
        and(
          eq(driverAssignments.bookingId, id),
          eq(driverAssignments.driverId, payload.sub),
          eq(driverAssignments.isActive, true),
        ),
      )
      .limit(1);
    if (assignment.length === 0) {
      return err(c, "Forbidden", 403);
    }
  }

  // Fetch driver assignments with driver info
  const assignments = await db
    .select({
      id: driverAssignments.id,
      driverId: driverAssignments.driverId,
      role: driverAssignments.role,
      isActive: driverAssignments.isActive,
      assignedAt: driverAssignments.assignedAt,
      driverName: users.name,
      driverPhone: users.phone,
    })
    .from(driverAssignments)
    .innerJoin(users, eq(driverAssignments.driverId, users.id))
    .where(eq(driverAssignments.bookingId, id));

  return ok(c, { booking, assignments });
});

// ── Update Status ──────────────────────────────────────

bookingRoutes.patch(
  "/:id/status",
  requireRole("driver", "admin"),
  async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const id = parseInt(c.req.param("id"));

    const body = await c.req.json();
    const parsed = updateBookingStatusSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, "Invalid status", 400, parsed.error.flatten());
    }

    const result = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id))
      .limit(1);

    if (result.length === 0) {
      return err(c, "Booking not found", 404);
    }

    // Driver can only set en_route, arrived, completed and must be active primary
    if (payload.role === "driver") {
      const allowed = ["en_route", "arrived", "completed"];
      if (!allowed.includes(parsed.data.status)) {
        return err(
          c,
          "Drivers can only set: en_route, arrived, completed",
          403,
        );
      }

      const assignment = await db
        .select()
        .from(driverAssignments)
        .where(
          and(
            eq(driverAssignments.bookingId, id),
            eq(driverAssignments.driverId, payload.sub),
            eq(driverAssignments.isActive, true),
          ),
        )
        .limit(1);

      if (assignment.length === 0) {
        return err(c, "You are not assigned to this booking", 403);
      }
    }

    const [updated] = await db
      .update(bookings)
      .set({ status: parsed.data.status })
      .where(eq(bookings.id, id))
      .returning();

    return ok(c, { booking: updated });
  },
);

// ── Cancel Booking ─────────────────────────────────────

bookingRoutes.patch(
  "/:id/cancel",
  requireRole("customer", "admin"),
  async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const id = parseInt(c.req.param("id"));

    const result = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id))
      .limit(1);

    if (result.length === 0) {
      return err(c, "Booking not found", 404);
    }

    const booking = result[0];

    if (payload.role === "customer" && booking.customerId !== payload.sub) {
      return err(c, "Forbidden", 403);
    }

    const cancellable = ["scheduled", "assigned"];
    if (!cancellable.includes(booking.status)) {
      return err(c, "Booking cannot be cancelled in its current status", 400);
    }

    const [updated] = await db
      .update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, id))
      .returning();

    return ok(c, { booking: updated });
  },
);

// ── Assign Drivers ─────────────────────────────────────

bookingRoutes.post("/:id/assign", requireRole("admin"), async (c) => {
  const id = parseInt(c.req.param("id"));

  const body = await c.req.json();
  const parsed = assignDriversSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const { primaryDriverId, backupDriverId } = parsed.data;

  if (primaryDriverId === backupDriverId) {
    return err(c, "Primary and backup driver must be different", 400);
  }

  // Verify booking exists
  const bookingResult = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);

  if (bookingResult.length === 0) {
    return err(c, "Booking not found", 404);
  }

  // Verify both drivers exist and are drivers
  const drivers = await db
    .select()
    .from(users)
    .where(
      and(
        inArray(users.id, [primaryDriverId, backupDriverId]),
        eq(users.role, "driver"),
      ),
    );

  if (drivers.length !== 2) {
    return err(c, "One or both driver IDs are invalid", 400);
  }

  // Transaction: deactivate old, insert new, update status
  await db.transaction(async (tx) => {
    // Deactivate existing assignments
    await tx
      .update(driverAssignments)
      .set({ isActive: false })
      .where(eq(driverAssignments.bookingId, id));

    // Insert new assignments
    await tx.insert(driverAssignments).values([
      {
        bookingId: id,
        driverId: primaryDriverId,
        role: "primary",
        isActive: true,
      },
      {
        bookingId: id,
        driverId: backupDriverId,
        role: "backup",
        isActive: true,
      },
    ]);

    // Update booking status to assigned
    await tx
      .update(bookings)
      .set({ status: "assigned" })
      .where(eq(bookings.id, id));
  });

  // Fetch updated state
  const [updatedBooking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id));

  const assignments = await db
    .select()
    .from(driverAssignments)
    .where(
      and(
        eq(driverAssignments.bookingId, id),
        eq(driverAssignments.isActive, true),
      ),
    );

  return ok(c, { booking: updatedBooking, assignments });
});

// ── Trigger Fallback ───────────────────────────────────

bookingRoutes.post("/:id/fallback", requireRole("admin"), async (c) => {
  const id = parseInt(c.req.param("id"));

  const bookingResult = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);

  if (bookingResult.length === 0) {
    return err(c, "Booking not found", 404);
  }

  const booking = bookingResult[0];
  const allowedStatuses = ["assigned", "en_route"];
  if (!allowedStatuses.includes(booking.status)) {
    return err(
      c,
      "Fallback only available for assigned or en_route bookings",
      400,
    );
  }

  // Find active primary and backup
  const activeAssignments = await db
    .select()
    .from(driverAssignments)
    .where(
      and(
        eq(driverAssignments.bookingId, id),
        eq(driverAssignments.isActive, true),
      ),
    );

  const primary = activeAssignments.find((a) => a.role === "primary");
  const backup = activeAssignments.find((a) => a.role === "backup");

  if (!primary) {
    return err(c, "No active primary driver to replace", 400);
  }
  if (!backup) {
    return err(c, "No backup driver available for fallback", 400);
  }

  // Deactivate primary, backup becomes the executing driver
  await db
    .update(driverAssignments)
    .set({ isActive: false })
    .where(eq(driverAssignments.id, primary.id));

  const updatedAssignments = await db
    .select({
      id: driverAssignments.id,
      driverId: driverAssignments.driverId,
      role: driverAssignments.role,
      isActive: driverAssignments.isActive,
      driverName: users.name,
    })
    .from(driverAssignments)
    .innerJoin(users, eq(driverAssignments.driverId, users.id))
    .where(eq(driverAssignments.bookingId, id));

  return ok(c, {
    message: "Fallback triggered",
    assignments: updatedAssignments,
  });
});
