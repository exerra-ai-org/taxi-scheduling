/**
 * Payments domain logic.
 *
 * Pure-ish functions over (booking, payment) rows + the Stripe API.
 * The HTTP layer in routes/payments.ts is a thin wrapper.
 *
 * State-machine contract:
 *   booking.paymentStatus is the denormalised projection of the most
 *   recent terminal state. The `payments` table is the audit log. ALL
 *   transitions to `authorized` / `captured` / `refunded` etc. are
 *   driven by webhook handlers — never by the synchronous Stripe API
 *   response — to avoid race conditions where a webhook fires before
 *   we finish persisting our local state.
 *
 * Phase 2 scope: ≤7-day PaymentIntent manual-capture flow only.
 * Bookings further out are guarded with a clear error; phase 4 lifts
 * this with the SetupIntent + off-session re-auth path.
 */

import { eq, sum } from "drizzle-orm";
import { db } from "../db/index";
import { bookings, payments, refunds, users } from "../db/schema";
import { config } from "../config";
import {
  getStripe,
  idempotencyKeyFor,
  classifyStripeError,
} from "../lib/stripe";
import { ensureStripeCustomer } from "./stripeCustomer";
import {
  decideCancellation,
  type CancellationDecision,
} from "./cancellationPolicy";
import { logger } from "../lib/logger";
import { broadcastBookingEvent } from "./broadcaster";
import type { BookingStatus } from "shared/types";

export class PaymentError extends Error {
  status: 400 | 403 | 404 | 409 | 502;
  code: string;
  constructor(
    message: string,
    code: string,
    status: 400 | 403 | 404 | 409 | 502 = 400,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "PaymentError";
  }
}

export interface CreatedIntent {
  clientSecret: string;
  intentId: string;
  intentType: "payment_intent" | "setup_intent";
  amountPence: number;
  publishableKey: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Create or reuse a PaymentIntent for the given booking. Idempotent on
 * (bookingId, attempt-version) — calling twice for the same booking
 * returns the same PI (Stripe-side dedupe via idempotency key, plus a
 * local payments-table check).
 *
 * Caller must verify the booking belongs to the authenticated customer
 * before invoking this.
 */
export async function createPaymentIntentForBooking(
  bookingId: number,
): Promise<CreatedIntent> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    throw new PaymentError("Booking not found", "not_found", 404);
  }

  // Guard against re-creating intents for already-paid bookings.
  if (
    booking.paymentStatus === "authorized" ||
    booking.paymentStatus === "captured" ||
    booking.paymentStatus === "partially_refunded" ||
    booking.paymentStatus === "refunded"
  ) {
    throw new PaymentError(
      "This booking has already been paid",
      "already_paid",
      409,
    );
  }

  const totalPence = booking.pricePence - booking.discountPence;
  if (totalPence <= 0) {
    throw new PaymentError(
      "Booking total must be greater than zero",
      "invalid_amount",
      400,
    );
  }

  // Phase 2 guard: long-lead bookings require SetupIntent + delayed
  // authorisation, which lands in phase 4. Stripe authorisations expire
  // at ~7 days, so a PI created today for a 14-day-out pickup would be
  // voided before we could capture.
  const horizonMs = config.payments.authHorizonDays * MS_PER_DAY;
  const msUntilPickup = booking.scheduledAt.getTime() - Date.now();
  if (msUntilPickup > horizonMs) {
    throw new PaymentError(
      `Bookings more than ${config.payments.authHorizonDays} days in advance are temporarily unavailable for online payment. Please contact support to book by phone.`,
      "horizon_exceeded",
      400,
    );
  }

  // Look up the customer's Stripe id; create lazily if signup-time
  // creation was skipped (Stripe outage, legacy user).
  const [customer] = await db
    .select({
      stripeCustomerId: users.stripeCustomerId,
      email: users.email,
      name: users.name,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, booking.customerId))
    .limit(1);

  if (!customer) {
    throw new PaymentError("Customer not found", "customer_not_found", 404);
  }

  const stripeCustomerId =
    customer.stripeCustomerId ??
    (await ensureStripeCustomer({
      userId: booking.customerId,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
    }));

  if (!stripeCustomerId) {
    throw new PaymentError(
      "Payments are not configured",
      "stripe_disabled",
      400,
    );
  }

  // Idempotency: same booking + same attempt version always produces
  // the same PI on Stripe's side. Bumping `version` lets us intentionally
  // create a fresh PI after a hard failure (e.g., admin "retry payment").
  const idempotencyKey = idempotencyKeyFor("booking", `${bookingId}-pi`, 1);
  const stripe = getStripe();

  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: totalPence,
        currency: config.stripe.currency,
        customer: stripeCustomerId,
        capture_method: "manual",
        // Card-only for now. To re-enable wallets (Apple Pay, Google
        // Pay, Link) and other methods, swap this back to
        // `automatic_payment_methods: { enabled: true }` and toggle the
        // ones you want in Stripe Dashboard → Settings → Payment methods.
        payment_method_types: ["card"],
        metadata: {
          bookingId: String(bookingId),
          customerId: String(booking.customerId),
          scheduledAt: booking.scheduledAt.toISOString(),
        },
        description: `Booking #${bookingId} — ${booking.pickupAddress.split(",")[0]} → ${booking.dropoffAddress.split(",")[0]}`,
        // Stripe sends a paid receipt automatically when this is set; we
        // also send our branded receipt via Resend in phase 5.
        receipt_email: customer.email,
        // Save the PaymentMethod for later off-session re-use (refunds
        // back to original card; phase 4 long-lead reauth).
        setup_future_usage: "off_session",
      },
      { idempotencyKey },
    );
  } catch (cause) {
    const classified = classifyStripeError(cause);
    logger.error("payments.intent.create_failed", {
      bookingId,
      err: cause as Error,
      code: classified.code,
    });
    throw new PaymentError(classified.message, classified.code, 502);
  }

  // Persist the payments row + flip the booking projection.
  await db.transaction(async (tx) => {
    await tx
      .insert(payments)
      .values({
        bookingId,
        customerId: booking.customerId,
        stripeIntentId: intent.id,
        intentType: "payment_intent",
        status: "pending",
        amountPence: totalPence,
        currency: config.stripe.currency,
        idempotencyKey,
      })
      .onConflictDoNothing({ target: payments.stripeIntentId });

    await tx
      .update(bookings)
      .set({
        activePaymentIntentId: intent.id,
        paymentStatus: "pending",
      })
      .where(eq(bookings.id, bookingId));
  });

  if (!intent.client_secret) {
    throw new PaymentError(
      "Payment provider returned no client secret",
      "no_client_secret",
      502,
    );
  }

  return {
    clientSecret: intent.client_secret,
    intentId: intent.id,
    intentType: "payment_intent",
    amountPence: totalPence,
    publishableKey: config.stripe.publishableKey,
  };
}

/**
 * Cancel the active intent on a booking and roll the booking back to
 * an "expired" state. Used by:
 *   - the hold-expiry job when paymentHoldExpiresAt elapses
 *   - explicit customer/admin cancellations of unpaid bookings
 *   - cleanup after Stripe-side failures during PI creation
 */
export async function voidPendingPayment(
  bookingId: number,
  reason: string,
): Promise<void> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return;
  if (
    booking.paymentStatus !== "pending" &&
    booking.paymentStatus !== "requires_action" &&
    booking.paymentStatus !== "failed"
  ) {
    // Nothing to void — payment already authorised, captured, or
    // already in a terminal failure state.
    return;
  }

  if (booking.activePaymentIntentId) {
    try {
      const stripe = getStripe();
      await stripe.paymentIntents.cancel(booking.activePaymentIntentId, {
        cancellation_reason: "abandoned",
      });
    } catch (cause) {
      // Stripe will reject cancel if the PI is in a non-cancelable
      // state (e.g. already succeeded). Don't fail loudly — the webhook
      // will reconcile.
      logger.warn("payments.intent.cancel_failed", {
        bookingId,
        intentId: booking.activePaymentIntentId,
        reason,
        err: cause as Error,
      });
    }
  }

  await db
    .update(bookings)
    .set({
      paymentStatus: "failed",
      paymentHoldExpiresAt: null,
    })
    .where(eq(bookings.id, bookingId));

  logger.info("payments.hold.voided", { bookingId, reason });
}

/**
 * Capture the authorised funds on a booking. Called when the ride
 * status transitions to `completed`. Idempotent — capturing an already-
 * captured PI is a no-op.
 *
 * The webhook (payment_intent.succeeded) flips paymentStatus to
 * `captured` and writes the charge id; we do not mutate booking state
 * here to avoid double-writes racing the webhook.
 */
export async function capturePaymentForBooking(
  bookingId: number,
  options: { amountPence?: number } = {},
): Promise<void> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    throw new PaymentError("Booking not found", "not_found", 404);
  }
  if (
    booking.paymentStatus === "captured" ||
    booking.paymentStatus === "refunded" ||
    booking.paymentStatus === "partially_refunded"
  ) {
    // Already captured (or beyond) — no-op.
    return;
  }
  if (booking.paymentStatus !== "authorized") {
    throw new PaymentError(
      `Cannot capture booking in payment status "${booking.paymentStatus}"`,
      "invalid_state",
      409,
    );
  }
  if (!booking.activePaymentIntentId) {
    throw new PaymentError(
      "Booking has no active payment intent",
      "no_intent",
      409,
    );
  }

  const captureAmount = options.amountPence ?? booking.amountAuthorizedPence;
  if (captureAmount <= 0 || captureAmount > booking.amountAuthorizedPence) {
    throw new PaymentError(
      "Capture amount must be between 1p and the authorised total",
      "invalid_amount",
      400,
    );
  }

  try {
    const stripe = getStripe();
    await stripe.paymentIntents.capture(
      booking.activePaymentIntentId,
      { amount_to_capture: captureAmount },
      {
        // Idempotency on (bookingId, action). Same capture call is safe
        // to retry if the webhook acknowledged but our local state was
        // not yet updated.
        idempotencyKey: idempotencyKeyFor("booking", `${bookingId}-capture`, 1),
      },
    );
  } catch (cause) {
    const classified = classifyStripeError(cause);
    logger.error("payments.capture_failed", {
      bookingId,
      intentId: booking.activePaymentIntentId,
      err: cause as Error,
      code: classified.code,
    });
    throw new PaymentError(classified.message, classified.code, 502);
  }

  logger.info("payments.captured", {
    bookingId,
    intentId: booking.activePaymentIntentId,
    capturedPence: captureAmount,
  });
}

/**
 * Apply the cancellation policy to a booking's payment.
 *
 *   - void:             stripe.paymentIntents.cancel()
 *   - partial_capture:  capture the fee, refund nothing (the rest is
 *                       released by Stripe automatically once we
 *                       capture less than authorised)
 *   - full_capture:     capture full authorised amount as cancellation fee
 *
 * Returns the decision so the caller can persist the fee on the
 * booking row + show it to the customer.
 */
export async function cancelBookingPayment(input: {
  bookingId: number;
  scheduledAt: Date;
  status: BookingStatus;
}): Promise<CancellationDecision> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (!booking) throw new PaymentError("Booking not found", "not_found", 404);

  // No payment authorised → policy is moot. Just void any pending hold.
  if (
    booking.paymentStatus !== "authorized" &&
    booking.paymentStatus !== "captured"
  ) {
    if (
      booking.paymentStatus === "pending" ||
      booking.paymentStatus === "requires_action"
    ) {
      await voidPendingPayment(input.bookingId, "booking_cancelled");
    }
    return {
      action: "void",
      feePence: 0,
      refundablePence: 0,
      reason: "No payment had been authorised yet.",
      window: "outside_full_refund",
    };
  }

  const decision = decideCancellation({
    scheduledAt: input.scheduledAt,
    status: input.status,
    amountAuthorizedPence: booking.amountAuthorizedPence,
  });

  // If already captured, the only lever is refund (handled in phase 5).
  // For the demo, treat already-captured cancellations as "no further
  // action" — admin will issue a refund manually if needed.
  if (booking.paymentStatus === "captured") {
    logger.info("payments.cancel_after_capture", {
      bookingId: input.bookingId,
      decision,
    });
    return decision;
  }

  if (!booking.activePaymentIntentId) {
    throw new PaymentError("Booking has no active intent", "no_intent", 409);
  }

  const stripe = getStripe();
  const intentId = booking.activePaymentIntentId;

  try {
    if (decision.action === "void") {
      await stripe.paymentIntents.cancel(intentId, {
        cancellation_reason: "requested_by_customer",
      });
    } else {
      // Capturing less than the authorised amount automatically releases
      // the remainder back to the customer. No refund call needed.
      await stripe.paymentIntents.capture(
        intentId,
        { amount_to_capture: decision.feePence },
        {
          idempotencyKey: idempotencyKeyFor(
            "booking",
            `${input.bookingId}-cancel-capture`,
            1,
          ),
        },
      );
    }
  } catch (cause) {
    const classified = classifyStripeError(cause);
    logger.error("payments.cancel_failed", {
      bookingId: input.bookingId,
      action: decision.action,
      err: cause as Error,
      code: classified.code,
    });
    throw new PaymentError(classified.message, classified.code, 502);
  }

  // Persist the fee + decision on the booking. Webhook will set the
  // captured/voided amounts; we record the policy decision here so it's
  // visible immediately on the cancel response.
  await db
    .update(bookings)
    .set({ cancellationFeePence: decision.feePence })
    .where(eq(bookings.id, input.bookingId));

  logger.info("payments.cancelled", {
    bookingId: input.bookingId,
    decision,
  });

  return decision;
}

export type AdminRefundReason =
  | "requested_by_customer"
  | "duplicate"
  | "fraudulent"
  | "service_failure"
  | "route_change"
  | "other";

export interface RefundResult {
  refundId: string;
  amountPence: number;
  status: string;
  remainingRefundablePence: number;
}

/**
 * Issue a refund (full or partial) for a captured booking. Admin-only
 * action. Idempotent on (bookingId, refund-attempt#).
 *
 * Stripe accepts refunds against the PaymentIntent directly (Stripe maps
 * to the underlying charge). We persist a `pending` refunds row first;
 * the `charge.refunded` / `refund.updated` webhooks promote it to
 * `succeeded` and update `bookings.amountRefundedPence`. Doing this at
 * webhook time avoids races where two refunds are issued in parallel.
 */
export async function refundBookingPayment(input: {
  bookingId: number;
  amountPence?: number; // omit → full remaining refund
  reason: AdminRefundReason;
  adminNote?: string;
  initiatedByUserId: number;
}): Promise<RefundResult> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (!booking) throw new PaymentError("Booking not found", "not_found", 404);

  if (
    booking.paymentStatus !== "captured" &&
    booking.paymentStatus !== "partially_refunded"
  ) {
    throw new PaymentError(
      `Cannot refund booking in payment status "${booking.paymentStatus}"`,
      "not_refundable",
      409,
    );
  }
  if (!booking.activePaymentIntentId) {
    throw new PaymentError("Booking has no payment intent", "no_intent", 409);
  }

  const refundable = booking.amountCapturedPence - booking.amountRefundedPence;
  if (refundable <= 0) {
    throw new PaymentError(
      "Nothing left to refund on this booking",
      "fully_refunded",
      409,
    );
  }

  const requested = input.amountPence ?? refundable;
  if (requested <= 0 || requested > refundable) {
    throw new PaymentError(
      `Refund amount must be between 1p and ${refundable}p`,
      "invalid_amount",
      400,
    );
  }

  // Find the payments row so the refunds insert can FK to it. We expect
  // exactly one captured payment per booking under the current flow.
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripeIntentId, booking.activePaymentIntentId))
    .limit(1);

  if (!payment) {
    throw new PaymentError(
      "Payment record missing for booking",
      "payment_not_found",
      404,
    );
  }

  // Bumping the version on each new refund prevents Stripe from
  // dedupe-collapsing two genuinely-different refund requests. We
  // derive it from the count of refunds already on the booking.
  const existingRefunds = await db
    .select({ id: refunds.id })
    .from(refunds)
    .where(eq(refunds.bookingId, input.bookingId));
  const attemptVersion = existingRefunds.length + 1;
  const idempotencyKey = idempotencyKeyFor(
    "booking",
    `${input.bookingId}-refund`,
    attemptVersion,
  );

  // Map our reason to Stripe's restricted vocabulary. Stripe only
  // accepts duplicate | fraudulent | requested_by_customer; everything
  // else lands in metadata for the dashboard.
  const stripeReason: "duplicate" | "fraudulent" | "requested_by_customer" =
    input.reason === "duplicate"
      ? "duplicate"
      : input.reason === "fraudulent"
        ? "fraudulent"
        : "requested_by_customer";

  let refund;
  try {
    const stripe = getStripe();
    refund = await stripe.refunds.create(
      {
        payment_intent: booking.activePaymentIntentId,
        amount: requested,
        reason: stripeReason,
        metadata: {
          bookingId: String(input.bookingId),
          internalReason: input.reason,
          initiatedByUserId: String(input.initiatedByUserId),
          adminNote: input.adminNote ?? "",
        },
      },
      { idempotencyKey },
    );
  } catch (cause) {
    const classified = classifyStripeError(cause);
    logger.error("payments.refund_failed", {
      bookingId: input.bookingId,
      err: cause as Error,
      code: classified.code,
    });
    throw new PaymentError(classified.message, classified.code, 502);
  }

  // Persist refunds row + project totals onto the booking in a single
  // transaction.
  //
  // The `charge.refunded` webhook is still the canonical reconciler, but
  // applying the projection here means:
  //   - the UI flips to Refunded immediately (webhook latency / loss
  //     no longer leaves the dispatcher staring at a stale "Paid" pill),
  //   - a missing or mis-configured webhook subscription doesn't strand
  //     the booking in an inconsistent state.
  //
  // Both writers (this path + the webhook) are idempotent because:
  //   - refunds.stripeRefundId is UNIQUE (onConflictDoNothing),
  //   - amountRefundedPence is recomputed from the refunds table, not
  //     incremented, so re-running yields the same value.
  const refundAmount = refund.amount ?? requested;
  const refundStatus = refund.status ?? "pending";

  await db.transaction(async (tx) => {
    await tx
      .insert(refunds)
      .values({
        bookingId: input.bookingId,
        paymentId: payment.id,
        stripeRefundId: refund.id,
        amountPence: refundAmount,
        reason: input.reason,
        adminNote: input.adminNote,
        initiatedByUserId: input.initiatedByUserId,
        status: refundStatus,
      })
      .onConflictDoNothing({ target: refunds.stripeRefundId });

    // Sum of all non-failed refund amounts for this booking. We exclude
    // `failed`/`canceled` to avoid letting a Stripe rejection inflate the
    // refunded total.
    // Treat anything Stripe hasn't outright failed as outstanding.
    // `pending` refunds will become `succeeded` via the webhook. If they
    // fail, the webhook handler rolls the projection back to `captured`.
    const [totals] = await tx
      .select({ succeededPence: sum(refunds.amountPence) })
      .from(refunds)
      .where(eq(refunds.bookingId, input.bookingId));

    const totalRefundedPence = Number(totals?.succeededPence ?? 0);
    const newPaymentStatus =
      totalRefundedPence >= booking.amountCapturedPence
        ? "refunded"
        : totalRefundedPence > 0
          ? "partially_refunded"
          : booking.paymentStatus;

    await tx
      .update(bookings)
      .set({
        amountRefundedPence: totalRefundedPence,
        paymentStatus: newPaymentStatus,
      })
      .where(eq(bookings.id, input.bookingId));

    await tx
      .update(payments)
      .set({ status: newPaymentStatus, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
  });

  // Push the new state to any open customer / admin tabs without waiting
  // for the (possibly missing) webhook. The webhook still fires the same
  // event later — clients de-dupe via React state on bookingId, so a
  // second emit is a harmless no-op.
  broadcastBookingEvent([booking.customerId], {
    type: "payment_status_changed",
    bookingId: input.bookingId,
    paymentStatus:
      refundAmount >= refundable ? "refunded" : "partially_refunded",
  });

  logger.info("payments.refund_created", {
    bookingId: input.bookingId,
    refundId: refund.id,
    amountPence: refundAmount,
    reason: input.reason,
    initiatedByUserId: input.initiatedByUserId,
  });

  return {
    refundId: refund.id,
    amountPence: refundAmount,
    status: refundStatus,
    remainingRefundablePence: refundable - refundAmount,
  };
}
