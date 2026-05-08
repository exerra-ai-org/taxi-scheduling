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
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { BookingStatus } from "shared/types";
import {
  createBookingSchema,
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
  payments,
  refunds,
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
import { broadcastBookingEvent } from "../services/broadcaster";
import { broadcastBookingChange } from "../services/bookingBroadcast";
import {
  createPaymentIntentForBooking,
  capturePaymentForBooking,
  cancelBookingPayment,
  refundBookingPayment,
  PaymentError,
  type AdminRefundReason,
} from "../services/payments";
import { isStripeEnabled } from "../lib/stripe";
import { config } from "../config";

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

      // Hold the slot while the customer completes payment. With Stripe
      // enabled, this expires after `payments.holdMinutes` and the
      // background job voids the PI + releases the booking. Without
      // Stripe (legacy/dev), bookings start `unpaid` and the existing
      // admin flow handles them.
      const holdExpiresAt = isStripeEnabled()
        ? new Date(Date.now() + config.payments.holdMinutes * 60_000)
        : null;
      const initialPaymentStatus = isStripeEnabled() ? "pending" : "unpaid";

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
          paymentStatus: initialPaymentStatus,
          paymentHoldExpiresAt: holdExpiresAt,
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

    // With Stripe enabled, defer the "booking created" notification + the
    // dispatch broadcast until the webhook flips paymentStatus to
    // `authorized`. We don't want the ops team paged for an unpaid hold.
    if (!isStripeEnabled()) {
      runAsyncSideEffect(
        "notifyBookingCreated",
        notifyBookingCreated(booking.id),
      );
      broadcastBookingEvent([booking.customerId], {
        type: "booking_created",
        bookingId: booking.id,
        customerId: booking.customerId,
      });
      return ok(c, { booking, payment: null }, 201);
    }

    // Stripe enabled: create the PaymentIntent now so the client gets
    // both the booking row and a clientSecret in one roundtrip. If
    // Stripe rejects (network, card validation, etc.) we roll back the
    // booking so the customer doesn't see a phantom row in their
    // history. The hold-expiry job is a backstop for the case where
    // the rollback itself fails.
    try {
      const payment = await createPaymentIntentForBooking(booking.id);
      return ok(c, { booking, payment }, 201);
    } catch (paymentCause) {
      // Best-effort cleanup. Hold-expiry job will catch anything we miss.
      try {
        await db.delete(bookings).where(eq(bookings.id, booking.id));
      } catch (cleanupCause) {
        console.error("Failed to roll back booking after PI failure:", {
          bookingId: booking.id,
          paymentCause,
          cleanupCause,
        });
      }
      if (paymentCause instanceof PaymentError) {
        return err(c, paymentCause.message, paymentCause.status, {
          code: paymentCause.code,
        });
      }
      console.error("Create payment intent failed:", paymentCause);
      return err(c, "Could not initialise payment", 502);
    }
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
    const activePrimary = alias(driverAssignments, "active_primary_da");
    const primaryDriver = alias(users, "active_primary_user");

    results = await db
      .select({
        ...bookingCols,
        hasReview: sql<boolean>`${reviews.id} IS NOT NULL`,
        reviewRating: reviews.rating,
        primaryDriverName: primaryDriver.name,
        primaryDriverPhone: primaryDriver.phone,
      })
      .from(bookings)
      .leftJoin(
        reviews,
        and(
          eq(reviews.bookingId, bookings.id),
          eq(reviews.customerId, payload.sub),
        ),
      )
      .leftJoin(
        activePrimary,
        and(
          eq(activePrimary.bookingId, bookings.id),
          eq(activePrimary.isActive, true),
          eq(activePrimary.role, "primary"),
        ),
      )
      .leftJoin(primaryDriver, eq(primaryDriver.id, activePrimary.driverId))
      .where(eq(bookings.customerId, payload.sub))
      .orderBy(desc(bookings.scheduledAt));
  } else if (payload.role === "admin") {
    const bookingCols = getTableColumns(bookings);
    results = await db
      .select({
        ...bookingCols,
        customerName: users.name,
        customerPhone: users.phone,
      })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.customerId))
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

  // Admin-only: payment + refund audit trail. Hidden from customer/driver
  // responses to keep PCI scope tight and avoid leaking internal Stripe ids
  // back to a customer who already sees their own paymentStatus on the booking row.
  let paymentTrail: {
    payments: Array<typeof payments.$inferSelect>;
    refunds: Array<typeof refunds.$inferSelect>;
  } | null = null;
  if (payload.role === "admin") {
    const [paymentRows, refundRows] = await Promise.all([
      db
        .select()
        .from(payments)
        .where(eq(payments.bookingId, id))
        .orderBy(desc(payments.createdAt)),
      db
        .select()
        .from(refunds)
        .where(eq(refunds.bookingId, id))
        .orderBy(desc(refunds.createdAt)),
    ]);
    paymentTrail = { payments: paymentRows, refunds: refundRows };
  }

  return ok(c, {
    booking: { ...booking, hasReview },
    assignments: enrichedAssignments,
    vehicle: vehicleResult[0] ?? null,
    review: existingReviewData,
    paymentTrail,
  });
});

// ── Cancellation preview ───────────────────────────────
//
// Returns the policy decision *without* mutating any state. Used by the
// customer cancel dialog to show the fee/refund amount before they
// confirm. Idempotent and safe to poll.
bookingRoutes.get(
  "/:id/cancel-preview",
  requireRole("customer", "admin"),
  async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const id = parseRouteId(c.req.param("id"));
    if (!id) return err(c, "Invalid booking ID", 400);

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id))
      .limit(1);
    if (!booking) return err(c, "Booking not found", 404);
    if (payload.role === "customer" && booking.customerId !== payload.sub) {
      return err(c, "Forbidden", 403);
    }

    const { decideCancellation } =
      await import("../services/cancellationPolicy");
    const decision = decideCancellation({
      scheduledAt: booking.scheduledAt,
      status: booking.status,
      amountAuthorizedPence: booking.amountAuthorizedPence,
    });
    return ok(c, { decision });
  },
);

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

    // Auto-capture when the ride completes. Webhook flips paymentStatus
    // to `captured`; we just need to ask Stripe to move the funds. If
    // capture fails (Stripe outage, expired auth) we don't roll back the
    // status flip — admin can retry via /admin/bookings/:id/capture.
    if (
      nextStatus === "completed" &&
      isStripeEnabled() &&
      updated.paymentStatus === "authorized"
    ) {
      runAsyncSideEffect(
        "capturePaymentForBooking",
        capturePaymentForBooking(id),
      );
    }

    runAsyncSideEffect(
      "notifyBookingStatusChanged",
      notifyBookingStatusChanged(id, nextStatus),
    );

    await broadcastBookingChange(id, {
      type: "booking_updated",
      bookingId: id,
      status: nextStatus,
    });

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

    // Customers can cancel up to (and including) en_route. Admin can
    // cancel any non-terminal status. Drivers go through fallback flow
    // and should not hit this endpoint.
    const customerCancellable: BookingStatus[] = ["scheduled", "assigned"];
    const adminCancellable: BookingStatus[] = [
      "scheduled",
      "assigned",
      "en_route",
      "arrived",
    ];
    const allowed =
      payload.role === "admin" ? adminCancellable : customerCancellable;
    if (!allowed.includes(booking.status)) {
      return err(c, "Booking cannot be cancelled in its current status", 400);
    }

    // Apply the cancellation policy first (void / partial / full capture)
    // BEFORE flipping the booking status, so a Stripe failure leaves the
    // booking in its original state and the customer can retry. Skip
    // when Stripe is disabled or there's no payment to act on.
    let cancellationDecision = null;
    if (isStripeEnabled()) {
      try {
        cancellationDecision = await cancelBookingPayment({
          bookingId: id,
          scheduledAt: booking.scheduledAt,
          status: booking.status,
        });
      } catch (cause) {
        if (cause instanceof PaymentError) {
          return err(c, cause.message, cause.status, { code: cause.code });
        }
        c.get("logger")?.error("cancel.payment_failed", {
          bookingId: id,
          err: cause as Error,
        });
        return err(c, "Could not process cancellation payment", 502);
      }
    }

    const [updated] = await db
      .update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, id))
      .returning();

    runAsyncSideEffect("notifyBookingCancelled", notifyBookingCancelled(id));

    await broadcastBookingChange(id, {
      type: "booking_cancelled",
      bookingId: id,
    });

    return ok(c, {
      booking: updated,
      cancellation: cancellationDecision,
    });
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

  broadcastBookingEvent([booking.customerId, primaryDriverId, backupDriverId], {
    type: "drivers_assigned",
    bookingId: id,
  });

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

  // Old primary must be in the recipient list — they were just dropped from
  // the ride and their MyRides view needs to refetch and remove the row.
  // broadcastBookingChange resolves participants from currently-active
  // assignments, which by this point excludes the old primary, so we use
  // the explicit list here.
  broadcastBookingEvent(
    [booking.customerId, primary.driverId, backup.driverId],
    {
      type: "drivers_assigned",
      bookingId: id,
    },
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

// ── Admin Refund ───────────────────────────────────────

const refundReasonValues = [
  "requested_by_customer",
  "duplicate",
  "fraudulent",
  "service_failure",
  "route_change",
  "other",
] as const;

const refundSchema = z.object({
  // Omit / null → full remaining refund. We coerce 0 to null so the
  // service treats "click refund without typing an amount" as full.
  amountPence: z.number().int().positive().optional().nullable(),
  reason: z.enum(refundReasonValues),
  adminNote: z.string().max(500).optional().nullable(),
});

bookingRoutes.post("/:id/refund", requireRole("admin"), async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const id = parseRouteId(c.req.param("id"));
  if (!id) return err(c, "Invalid booking ID", 400);

  if (!isStripeEnabled()) {
    return err(c, "Payments not configured", 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  try {
    const result = await refundBookingPayment({
      bookingId: id,
      amountPence: parsed.data.amountPence ?? undefined,
      reason: parsed.data.reason as AdminRefundReason,
      adminNote: parsed.data.adminNote ?? undefined,
      initiatedByUserId: payload.sub,
    });

    // The webhook (charge.refunded) is the canonical writer for the
    // booking's amountRefundedPence + paymentStatus. Don't mutate booking
    // state here — let the webhook reconcile to avoid double-writes.
    return ok(c, { refund: result });
  } catch (cause) {
    if (cause instanceof PaymentError) {
      return err(c, cause.message, cause.status, { code: cause.code });
    }
    c.get("logger")?.error("admin.refund.unhandled", {
      bookingId: id,
      err: cause as Error,
    });
    return err(c, "Refund failed", 500);
  }
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

  // SSE so admins watching the dispatch board see SOS land immediately,
  // independent of push notifications (which can be missed on devices
  // with notifications disabled or backgrounded).
  broadcastBookingEvent([], {
    type: "incident_reported",
    bookingId: id,
    incidentType: parsed.data.type,
  });

  return ok(c, { incident }, 201);
});
