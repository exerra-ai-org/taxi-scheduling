import { Hono } from "hono";
import {
  eq,
  and,
  desc,
  inArray,
  sql,
  getTableColumns,
  avg,
  count,
} from "drizzle-orm";
import type { BookingStatus } from "shared/types";
import {
  createBookingSchema,
  updateBookingSchema,
  updateBookingStatusSchema,
  assignDriversSchema,
  reportIncidentSchema,
  BOOKING_MIN_HOURS_STANDARD,
  BOOKING_MIN_HOURS_LONDON,
  BOOKING_MAX_DAYS,
} from "shared/validation";
import { db } from "../db/index";
import {
  bookings,
  driverAssignments,
  users,
  driverHeartbeats,
  vehicles,
  driverProfiles,
  reviews,
  incidents,
} from "../db/schema";
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
  reserveCouponUsage,
} from "../services/coupon";
import {
  notifyBookingCancelled,
  notifyBookingCreated,
  notifyBookingStatusChanged,
  notifyDriverFallbackActivated,
  notifyDriversAssigned,
  notifyIncident,
} from "../services/notifications";

export const bookingRoutes = new Hono();

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  scheduled: ["assigned", "cancelled"],
  assigned: ["en_route", "cancelled"],
  en_route: ["arrived"],
  arrived: ["in_progress"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
};

class BookingRequestError extends Error {
  status: 400 | 401 | 403 | 404 | 409;

  constructor(message: string, status: 400 | 401 | 403 | 404 | 409 = 400) {
    super(message);
    this.status = status;
  }
}

function parseRouteId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function canTransitionStatus(
  current: BookingStatus,
  next: BookingStatus,
): boolean {
  if (current === next) return true;
  return STATUS_TRANSITIONS[current].includes(next);
}

function runAsyncSideEffect(label: string, promise: Promise<unknown>) {
  void promise.catch((cause) => {
    console.error(`${label} failed:`, cause);
  });
}

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
    flightNumber,
    pickupFlightNumber,
    dropoffFlightNumber,
    vehicleClass,
  } = parsed.data;
  const scheduledDate = new Date(scheduledAt);
  const now = new Date();

  // Get pricing quote — use coordinates when available
  const quote = await getPricingQuote(pickupAddress, dropoffAddress, {
    fromLat: pickupLat,
    fromLon: pickupLon,
    toLat: dropoffLat,
    toLon: dropoffLon,
    vehicleClass,
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

  try {
    const booking = await db.transaction(async (tx) => {
      let discountPence = 0;
      let couponId: number | null = null;
      let finalPrice = quote.pricePence;

      if (couponCode) {
        const couponResult = await validateCoupon(couponCode, tx);
        if (!couponResult.valid || !couponResult.coupon) {
          throw new BookingRequestError(
            couponResult.reason || "Invalid coupon",
          );
        }

        const discount = applyCoupon(couponResult.coupon, quote.pricePence);
        discountPence = discount.discountPence;
        finalPrice = discount.finalPricePence;
        couponId = couponResult.coupon.id;

        const reserved = await reserveCouponUsage(couponId, tx);
        if (!reserved) {
          throw new BookingRequestError(
            "Coupon usage limit reached or coupon expired",
          );
        }
      }

      const [created] = await tx
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
          flightNumber: flightNumber ?? null,
          pickupFlightNumber: pickupFlightNumber ?? null,
          dropoffFlightNumber: dropoffFlightNumber ?? null,
          vehicleClass,
          distanceMiles: quote.distanceMiles ?? null,
          ratePerMilePence: quote.ratePerMilePence ?? null,
          baseFarePence: quote.baseFarePence ?? null,
        })
        .returning();

      return created;
    });

    runAsyncSideEffect(
      "notifyBookingCreated",
      notifyBookingCreated(booking.id),
    );

    return ok(c, { booking }, 201);
  } catch (cause) {
    if (cause instanceof BookingRequestError) {
      return err(c, cause.message, cause.status);
    }
    console.error("Create booking failed:", cause);
    return err(c, "Failed to create booking", 500);
  }
});

// ── List Bookings ──────────────────────────────────────

bookingRoutes.get("/", async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;

  let results;

  if (payload.role === "customer") {
    const bookingCols = getTableColumns(bookings);
    results = await db
      .select({
        ...bookingCols,
        hasReview: sql<boolean>`(EXISTS (
          SELECT 1 FROM reviews r
          WHERE r.booking_id = bookings.id
            AND r.customer_id = ${payload.sub}
        ))::boolean`,
        reviewRating: sql<number | null>`(
          SELECT r.rating FROM reviews r
          WHERE r.booking_id = bookings.id
            AND r.customer_id = ${payload.sub}
          LIMIT 1
        )::integer`,
        primaryDriverName: sql<string | null>`(
          SELECT u.name FROM driver_assignments da
          JOIN users u ON u.id = da.driver_id
          WHERE da.booking_id = bookings.id
            AND da.is_active = true AND da.role = 'primary'
          LIMIT 1
        )`,
        primaryDriverPhone: sql<string | null>`(
          SELECT u.phone FROM driver_assignments da
          JOIN users u ON u.id = da.driver_id
          WHERE da.booking_id = bookings.id
            AND da.is_active = true AND da.role = 'primary'
          LIMIT 1
        )`,
      })
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
      .select({
        booking: bookings,
        customerName: users.name,
        customerPhone: users.phone,
      })
      .from(driverAssignments)
      .innerJoin(bookings, eq(driverAssignments.bookingId, bookings.id))
      .innerJoin(users, eq(bookings.customerId, users.id))
      .where(
        and(
          eq(driverAssignments.driverId, payload.sub),
          eq(driverAssignments.isActive, true),
        ),
      )
      .orderBy(desc(bookings.scheduledAt))
      .then((rows) =>
        rows.map((r) => ({
          ...r.booking,
          customerName: r.customerName,
          customerPhone: r.customerPhone,
        })),
      );
  }

  return ok(c, { bookings: results });
});

// ── Get Single Booking ─────────────────────────────────

bookingRoutes.get("/:id", async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const id = parseRouteId(c.req.param("id"));
  if (!id) return err(c, "Invalid booking ID", 400);

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
      driverProfilePicture: users.profilePictureUrl,
    })
    .from(driverAssignments)
    .innerJoin(users, eq(driverAssignments.driverId, users.id))
    .where(eq(driverAssignments.bookingId, id));

  // Enrich assignments with profile + rating
  const driverIds = [...new Set(assignments.map((a) => a.driverId))];
  const profiles = driverIds.length
    ? await db
        .select()
        .from(driverProfiles)
        .where(inArray(driverProfiles.driverId, driverIds))
    : [];
  const ratingsRows = driverIds.length
    ? await db
        .select({
          driverId: reviews.driverId,
          avg: avg(reviews.rating),
          total: count(reviews.id),
        })
        .from(reviews)
        .where(inArray(reviews.driverId, driverIds))
        .groupBy(reviews.driverId)
    : [];

  const profileMap = new Map(profiles.map((p) => [p.driverId, p]));
  const ratingMap = new Map(ratingsRows.map((r) => [r.driverId, r]));

  const enrichedAssignments = assignments.map((a) => {
    const profile = profileMap.get(a.driverId) ?? null;
    const rating = ratingMap.get(a.driverId);
    return {
      ...a,
      driverProfile: profile,
      avgRating: rating?.avg ? Number(Number(rating.avg).toFixed(1)) : null,
      totalReviews: rating?.total ?? 0,
    };
  });

  // Check if customer has reviewed this booking
  let hasReview = false;
  let existingReviewData: {
    rating: number;
    comment: string | null;
    createdAt: Date;
  } | null = null;
  if (payload.role === "customer" && booking.status === "completed") {
    const existingReview = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(
        and(eq(reviews.bookingId, id), eq(reviews.customerId, payload.sub)),
      )
      .limit(1);
    hasReview = existingReview.length > 0;
    existingReviewData = existingReview[0] ?? null;
  }

  // Fetch vehicle info for this booking's class
  const vehicleResult = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.class, booking.vehicleClass))
    .limit(1);

  return ok(c, {
    booking: { ...booking, hasReview },
    assignments: enrichedAssignments,
    vehicle: vehicleResult[0] ?? null,
    review: existingReviewData,
  });
});

// ── Update Booking (edit by customer) ─────────────────

bookingRoutes.patch("/:id", requireRole("customer"), async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const id = parseRouteId(c.req.param("id"));
  if (!id) return err(c, "Invalid booking ID", 400);

  const body = await c.req.json();
  const parsed = updateBookingSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const result = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);

  if (result.length === 0) return err(c, "Booking not found", 404);

  const booking = result[0];

  if (booking.customerId !== payload.sub) {
    return err(c, "Forbidden", 403);
  }

  const editable: BookingStatus[] = ["scheduled", "assigned"];
  if (!editable.includes(booking.status)) {
    return err(c, "Booking can only be edited when scheduled or assigned", 400);
  }

  // Check minimum time: booking must still be far enough in the future
  const now = new Date();
  const scheduledDate = parsed.data.scheduledAt
    ? new Date(parsed.data.scheduledAt)
    : booking.scheduledAt;

  // Determine min hours based on pickup zone
  const pickupAddress = parsed.data.pickupAddress ?? booking.pickupAddress;
  const pickupLatVal = parsed.data.pickupLat ?? booking.pickupLat;
  const pickupLonVal = parsed.data.pickupLon ?? booking.pickupLon;

  let pickupZone = null;
  if (pickupLatVal != null && pickupLonVal != null) {
    pickupZone = await getZoneByCoordinates(pickupLatVal, pickupLonVal);
  }
  if (!pickupZone) {
    pickupZone = await getZoneByAddress(pickupAddress);
  }
  const minHours =
    pickupZone && isLondonZone(pickupZone.name)
      ? BOOKING_MIN_HOURS_LONDON
      : BOOKING_MIN_HOURS_STANDARD;

  // The current scheduled time must be at least minHours away (can't edit a ride that's too soon)
  const minTimeForEdit = new Date(now.getTime() + minHours * 60 * 60 * 1000);
  if (booking.scheduledAt < minTimeForEdit) {
    return err(
      c,
      `Cannot edit a booking less than ${minHours} hours before its scheduled time`,
      400,
    );
  }

  // If changing scheduledAt, validate the new time
  if (parsed.data.scheduledAt) {
    if (scheduledDate < minTimeForEdit) {
      return err(
        c,
        `New time must be at least ${minHours} hours in advance`,
        400,
      );
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
  }

  // Recalculate price if locations changed
  const dropoffAddress = parsed.data.dropoffAddress ?? booking.dropoffAddress;
  const dropoffLatVal = parsed.data.dropoffLat ?? booking.dropoffLat;
  const dropoffLonVal = parsed.data.dropoffLon ?? booking.dropoffLon;
  const locationsChanged =
    parsed.data.pickupAddress != null ||
    parsed.data.dropoffAddress != null ||
    parsed.data.pickupLat != null ||
    parsed.data.dropoffLat != null;

  let priceUpdate: Record<string, unknown> = {};

  if (locationsChanged) {
    const quote = await getPricingQuote(pickupAddress, dropoffAddress, {
      fromLat: pickupLatVal ?? undefined,
      fromLon: pickupLonVal ?? undefined,
      toLat: dropoffLatVal ?? undefined,
      toLon: dropoffLonVal ?? undefined,
      vehicleClass: booking.vehicleClass,
    });
    if (!quote) {
      return err(c, "No pricing available for the updated route", 400);
    }
    priceUpdate = {
      pricePence: quote.pricePence,
      isAirport: quote.isAirport,
      fixedRouteId: quote.fixedRouteId ?? null,
      pickupZoneId: quote.pickupZoneId ?? null,
      dropoffZoneId: quote.dropoffZoneId ?? null,
      distanceMiles: quote.distanceMiles ?? null,
      ratePerMilePence: quote.ratePerMilePence ?? null,
      baseFarePence: quote.baseFarePence ?? null,
    };
  }

  const updateFields: Record<string, unknown> = {
    ...priceUpdate,
  };

  if (parsed.data.pickupAddress != null)
    updateFields.pickupAddress = parsed.data.pickupAddress;
  if (parsed.data.dropoffAddress != null)
    updateFields.dropoffAddress = parsed.data.dropoffAddress;
  if (parsed.data.scheduledAt != null) updateFields.scheduledAt = scheduledDate;
  if (parsed.data.pickupLat !== undefined)
    updateFields.pickupLat = parsed.data.pickupLat ?? null;
  if (parsed.data.pickupLon !== undefined)
    updateFields.pickupLon = parsed.data.pickupLon ?? null;
  if (parsed.data.dropoffLat !== undefined)
    updateFields.dropoffLat = parsed.data.dropoffLat ?? null;
  if (parsed.data.dropoffLon !== undefined)
    updateFields.dropoffLon = parsed.data.dropoffLon ?? null;
  if (parsed.data.pickupFlightNumber !== undefined)
    updateFields.pickupFlightNumber = parsed.data.pickupFlightNumber;
  if (parsed.data.dropoffFlightNumber !== undefined)
    updateFields.dropoffFlightNumber = parsed.data.dropoffFlightNumber;
  if (parsed.data.flightNumber !== undefined)
    updateFields.flightNumber = parsed.data.flightNumber;

  if (Object.keys(updateFields).length === 0) {
    return ok(c, { booking });
  }

  const [updated] = await db
    .update(bookings)
    .set(updateFields)
    .where(eq(bookings.id, id))
    .returning();

  return ok(c, { booking: updated });
});

// ── Update Status ──────────────────────────────────────

bookingRoutes.patch(
  "/:id/status",
  requireRole("driver", "admin"),
  async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const id = parseRouteId(c.req.param("id"));
    if (!id) return err(c, "Invalid booking ID", 400);

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

    const booking = result[0];
    const nextStatus = parsed.data.status;

    if (!canTransitionStatus(booking.status, nextStatus)) {
      return err(
        c,
        `Invalid transition from ${booking.status} to ${nextStatus}`,
        400,
      );
    }

    // Driver can only set en_route, arrived, in_progress, completed and must be active primary.
    if (payload.role === "driver") {
      const allowedByDriver: BookingStatus[] = [
        "en_route",
        "arrived",
        "in_progress",
        "completed",
      ];
      if (!allowedByDriver.includes(nextStatus)) {
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
            eq(driverAssignments.role, "primary"),
          ),
        )
        .limit(1);

      if (assignment.length === 0) {
        return err(c, "Only the active primary driver can update status", 403);
      }
    }

    if (booking.status === nextStatus) {
      return ok(c, { booking });
    }

    const [updated] = await db
      .update(bookings)
      .set({ status: nextStatus })
      .where(eq(bookings.id, id))
      .returning();

    runAsyncSideEffect(
      "notifyBookingStatusChanged",
      notifyBookingStatusChanged(id, nextStatus),
    );

    return ok(c, { booking: updated });
  },
);

// ── Cancel Booking ─────────────────────────────────────

bookingRoutes.patch(
  "/:id/cancel",
  requireRole("customer", "admin"),
  async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const id = parseRouteId(c.req.param("id"));
    if (!id) return err(c, "Invalid booking ID", 400);

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

    const cancellable: BookingStatus[] = ["scheduled", "assigned"];
    if (!cancellable.includes(booking.status)) {
      return err(c, "Booking cannot be cancelled in its current status", 400);
    }

    const [updated] = await db
      .update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, id))
      .returning();

    runAsyncSideEffect("notifyBookingCancelled", notifyBookingCancelled(id));

    return ok(c, { booking: updated });
  },
);

// ── Assign Drivers ─────────────────────────────────────

bookingRoutes.post("/:id/assign", requireRole("admin"), async (c) => {
  const id = parseRouteId(c.req.param("id"));
  if (!id) return err(c, "Invalid booking ID", 400);

  const body = await c.req.json();
  const parsed = assignDriversSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const { primaryDriverId, backupDriverId } = parsed.data;

  if (primaryDriverId === backupDriverId) {
    return err(c, "Primary and backup driver must be different", 400);
  }

  // Verify booking exists and is assignable
  const bookingResult = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);

  if (bookingResult.length === 0) {
    return err(c, "Booking not found", 404);
  }

  const booking = bookingResult[0];
  if (!["scheduled", "assigned"].includes(booking.status)) {
    return err(
      c,
      "Can only assign drivers to scheduled or assigned rides",
      400,
    );
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

  runAsyncSideEffect(
    "notifyDriversAssigned",
    notifyDriversAssigned(id, primaryDriverId, backupDriverId),
  );

  return ok(c, { booking: updatedBooking, assignments });
});

// ── Trigger Fallback ───────────────────────────────────

bookingRoutes.post("/:id/fallback", requireRole("admin"), async (c) => {
  const id = parseRouteId(c.req.param("id"));
  if (!id) return err(c, "Invalid booking ID", 400);

  const bookingResult = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);

  if (bookingResult.length === 0) {
    return err(c, "Booking not found", 404);
  }

  const booking = bookingResult[0];
  const allowedStatuses: BookingStatus[] = [
    "assigned",
    "en_route",
    "arrived",
    "in_progress",
  ];
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

  // Deactivate primary and promote backup to primary.
  await db.transaction(async (tx) => {
    await tx
      .update(driverAssignments)
      .set({ isActive: false })
      .where(eq(driverAssignments.id, primary.id));

    await tx
      .update(driverAssignments)
      .set({ role: "primary" })
      .where(eq(driverAssignments.id, backup.id));
  });

  runAsyncSideEffect(
    "notifyDriverFallbackActivated",
    notifyDriverFallbackActivated(id, primary.driverId, backup.driverId),
  );

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

// ── Driver Location (for customer tracking) ───────

bookingRoutes.get(
  "/:id/driver-location",
  requireRole("customer", "admin"),
  async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const id = parseRouteId(c.req.param("id"));
    if (!id) return err(c, "Invalid booking ID", 400);

    const result = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id))
      .limit(1);

    if (result.length === 0) return err(c, "Booking not found", 404);

    const booking = result[0];
    if (payload.role === "customer" && booking.customerId !== payload.sub)
      return err(c, "Forbidden", 403);

    const trackable: BookingStatus[] = [
      "assigned",
      "en_route",
      "arrived",
      "in_progress",
    ];
    if (!trackable.includes(booking.status)) {
      return ok(c, {
        lat: null,
        lon: null,
        lastUpdatedAt: null,
        distanceMiles: null,
      });
    }

    // Find active primary driver
    const primary = await db
      .select()
      .from(driverAssignments)
      .where(
        and(
          eq(driverAssignments.bookingId, id),
          eq(driverAssignments.isActive, true),
          eq(driverAssignments.role, "primary"),
        ),
      )
      .limit(1);

    if (primary.length === 0) {
      return ok(c, {
        lat: null,
        lon: null,
        lastUpdatedAt: null,
        distanceMiles: null,
      });
    }

    const heartbeat = await db
      .select()
      .from(driverHeartbeats)
      .where(
        and(
          eq(driverHeartbeats.bookingId, id),
          eq(driverHeartbeats.driverId, primary[0].driverId),
        ),
      )
      .limit(1);

    if (heartbeat.length === 0 || heartbeat[0].lat == null) {
      return ok(c, {
        lat: null,
        lon: null,
        lastUpdatedAt: null,
        distanceMiles: null,
      });
    }

    let distanceMiles: number | null = null;
    if (booking.pickupLat != null && booking.pickupLon != null) {
      distanceMiles = haversineMiles(
        heartbeat[0].lat!,
        heartbeat[0].lon!,
        booking.pickupLat,
        booking.pickupLon,
      );
    }

    return ok(c, {
      lat: heartbeat[0].lat,
      lon: heartbeat[0].lon,
      lastUpdatedAt: heartbeat[0].lastHeartbeatAt.toISOString(),
      distanceMiles,
    });
  },
);

// ── Report Incident / Contact Admin ───────────────────

bookingRoutes.post("/:id/incident", requireRole("customer"), async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const id = parseRouteId(c.req.param("id"));
  if (!id) return err(c, "Invalid booking ID", 400);

  const body = await c.req.json();
  const parsed = reportIncidentSchema.safeParse(body);
  if (!parsed.success)
    return err(c, "Invalid input", 400, parsed.error.flatten());

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);
  if (!booking) return err(c, "Booking not found", 404);
  if (booking.customerId !== payload.sub) return err(c, "Forbidden", 403);

  const activeStatuses: BookingStatus[] = [
    "assigned",
    "en_route",
    "arrived",
    "in_progress",
  ];
  if (!activeStatuses.includes(booking.status)) {
    return err(c, "Incidents can only be reported on active bookings", 400);
  }

  const [incident] = await db
    .insert(incidents)
    .values({
      bookingId: id,
      reporterId: payload.sub,
      type: parsed.data.type,
      message: parsed.data.message ?? null,
    })
    .returning();

  runAsyncSideEffect(
    "notifyIncident",
    notifyIncident(id, parsed.data.type, parsed.data.message),
  );

  return ok(c, { incident }, 201);
});
