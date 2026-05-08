/**
 * Stripe webhook event dispatch.
 *
 * Webhooks are the authoritative source of truth for payment state.
 * The synchronous Stripe API responses we get during PI creation are
 * for client-secret handoff only — we never persist `authorized` /
 * `captured` from a return value. That avoids the classic race where
 * the webhook fires before our DB write completes, leaving the booking
 * in a stale state.
 *
 * Why dispatch lives in services/: the route is purely HTTP-shape
 * (raw body, signature header). Domain decisions belong in services so
 * they can be unit-tested without spinning up Hono.
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { bookings, payments, refunds } from "../db/schema";
import type { Logger } from "../lib/logger";
import { broadcastBookingEvent } from "./broadcaster";
import { notifyBookingCreated } from "./notifications";

export type WebhookHandler = (
  event: Stripe.Event,
  log: Logger,
) => Promise<void>;

/**
 * Event types we explicitly care about. Anything outside this set is
 * recorded in webhook_events but ignored — Stripe sends a lot of events
 * we never enabled in the dashboard.
 */
const HANDLERS: Record<string, WebhookHandler> = {
  // ── Payment Intents (≤7d direct flow) ──
  "payment_intent.created": logOnly("payment_intent.created"),
  "payment_intent.requires_action": handleRequiresAction,
  "payment_intent.processing": logOnly("payment_intent.processing"),
  // Manual-capture flow: this fires when funds have been authorised but
  // not yet captured. This is our "authorized" milestone.
  "payment_intent.amount_capturable_updated": handleAuthorized,
  // For automatic-capture flows this fires post-capture; for manual
  // capture it fires when we explicitly capture in phase 3.
  "payment_intent.succeeded": handleCaptured,
  "payment_intent.payment_failed": handlePaymentFailed,
  "payment_intent.canceled": handleCanceled,

  // ── Setup Intents (long-lead bookings, phase 4) ──
  "setup_intent.created": logOnly("setup_intent.created"),
  "setup_intent.requires_action": logOnly("setup_intent.requires_action"),
  "setup_intent.succeeded": logOnly("setup_intent.succeeded"),
  "setup_intent.setup_failed": logOnly("setup_intent.setup_failed"),

  // ── Charges & Refunds ──
  "charge.succeeded": logOnly("charge.succeeded"),
  "charge.refunded": handleChargeRefunded,
  "charge.refund.updated": handleRefundUpdated,

  // ── Disputes (phase 6) ──
  "charge.dispute.created": logOnly("charge.dispute.created"),
  "charge.dispute.updated": logOnly("charge.dispute.updated"),
  "charge.dispute.closed": logOnly("charge.dispute.closed"),
  "charge.dispute.funds_withdrawn": logOnly("charge.dispute.funds_withdrawn"),
  "charge.dispute.funds_reinstated": logOnly("charge.dispute.funds_reinstated"),

  // ── Payment Methods (phase 8) ──
  "payment_method.attached": logOnly("payment_method.attached"),
  "payment_method.detached": logOnly("payment_method.detached"),
};

function logOnly(label: string): WebhookHandler {
  return async (event, log) => {
    log.info("stripe.webhook.handled", {
      type: label,
      eventId: event.id,
      objectId: (event.data?.object as { id?: string } | undefined)?.id ?? null,
      stub: true,
    });
  };
}

interface BookingRefs {
  bookingId: number;
  customerId: number;
}

/**
 * Pull the booking + customer ids out of a PI's metadata. We always set
 * these at PI creation time, so a missing value means the PI was created
 * outside our flow (e.g., Dashboard test) — log and skip gracefully.
 */
function readBookingMeta(
  intent: Stripe.PaymentIntent | Stripe.SetupIntent,
  log: Logger,
): BookingRefs | null {
  const meta = intent.metadata ?? {};
  const bookingId = Number(meta.bookingId);
  const customerId = Number(meta.customerId);
  if (!Number.isInteger(bookingId) || !Number.isInteger(customerId)) {
    log.warn("stripe.webhook.no_booking_meta", { intentId: intent.id });
    return null;
  }
  return { bookingId, customerId };
}

async function handleRequiresAction(event: Stripe.Event, log: Logger) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const refs = readBookingMeta(intent, log);
  if (!refs) return;

  await db
    .update(payments)
    .set({ status: "requires_action", updatedAt: new Date() })
    .where(eq(payments.stripeIntentId, intent.id));
  await db
    .update(bookings)
    .set({ paymentStatus: "requires_action" })
    .where(eq(bookings.id, refs.bookingId));

  broadcastBookingEvent([refs.customerId], {
    type: "payment_status_changed",
    bookingId: refs.bookingId,
    paymentStatus: "requires_action",
  });
  log.info("stripe.webhook.pi.requires_action", {
    bookingId: refs.bookingId,
    intentId: intent.id,
  });
}

/**
 * Funds authorised. With manual capture, this is the milestone that
 * makes the booking real — the slot is locked, we can dispatch a
 * driver, and the customer's statement shows a pending hold.
 */
async function handleAuthorized(event: Stripe.Event, log: Logger) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const refs = readBookingMeta(intent, log);
  if (!refs) return;

  // amount_capturable is the actual hold amount (Stripe lets you over-
  // or under-capture; we always set capture_method=manual + full amount).
  const authorisedPence = intent.amount_capturable ?? intent.amount;
  // Persist the PaymentMethod so phase 3 can capture off-session and
  // refunds always go back to the original card.
  const paymentMethodId =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : (intent.payment_method?.id ?? null);

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "authorized",
        paymentMethodId,
        updatedAt: new Date(),
      })
      .where(eq(payments.stripeIntentId, intent.id));
    await tx
      .update(bookings)
      .set({
        paymentStatus: "authorized",
        amountAuthorizedPence: authorisedPence,
        paymentMethodId,
        // Slot is locked — clear the hold expiry.
        paymentHoldExpiresAt: null,
      })
      .where(eq(bookings.id, refs.bookingId));
  });

  // Now that payment is real, fire the booking-created notifications
  // we deferred at booking time.
  notifyBookingCreated(refs.bookingId).catch((cause) => {
    log.error("stripe.webhook.notify_booking_created_failed", {
      bookingId: refs.bookingId,
      err: cause as Error,
    });
  });
  broadcastBookingEvent([refs.customerId], {
    type: "booking_created",
    bookingId: refs.bookingId,
    customerId: refs.customerId,
  });
  broadcastBookingEvent([refs.customerId], {
    type: "payment_status_changed",
    bookingId: refs.bookingId,
    paymentStatus: "authorized",
  });
  log.info("stripe.webhook.pi.authorized", {
    bookingId: refs.bookingId,
    intentId: intent.id,
    authorisedPence,
  });
}

/**
 * Captured. For manual-capture flow this fires AFTER our backend
 * explicitly calls capture (phase 3). For other flows it can fire
 * straight after authorisation — we handle both by being idempotent.
 */
async function handleCaptured(event: Stripe.Event, log: Logger) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const refs = readBookingMeta(intent, log);
  if (!refs) return;

  const charge = (
    intent as Stripe.PaymentIntent & {
      latest_charge?: string | Stripe.Charge | null;
    }
  ).latest_charge;
  const chargeId = typeof charge === "string" ? charge : (charge?.id ?? null);
  const capturedPence = intent.amount_received ?? intent.amount;

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "captured",
        stripeChargeId: chargeId,
        capturedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payments.stripeIntentId, intent.id));
    await tx
      .update(bookings)
      .set({
        paymentStatus: "captured",
        amountCapturedPence: capturedPence,
      })
      .where(eq(bookings.id, refs.bookingId));
  });

  broadcastBookingEvent([refs.customerId], {
    type: "payment_status_changed",
    bookingId: refs.bookingId,
    paymentStatus: "captured",
  });
  log.info("stripe.webhook.pi.captured", {
    bookingId: refs.bookingId,
    intentId: intent.id,
    capturedPence,
  });
}

async function handlePaymentFailed(event: Stripe.Event, log: Logger) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const refs = readBookingMeta(intent, log);
  if (!refs) return;

  const lastError = intent.last_payment_error;
  await db
    .update(payments)
    .set({
      status: "failed",
      lastErrorCode: lastError?.code ?? null,
      lastErrorMessage: lastError?.message ?? null,
      updatedAt: new Date(),
    })
    .where(eq(payments.stripeIntentId, intent.id));
  await db
    .update(bookings)
    .set({ paymentStatus: "failed" })
    .where(eq(bookings.id, refs.bookingId));

  broadcastBookingEvent([refs.customerId], {
    type: "payment_status_changed",
    bookingId: refs.bookingId,
    paymentStatus: "failed",
    lastErrorMessage: lastError?.message ?? null,
  });
  log.warn("stripe.webhook.pi.failed", {
    bookingId: refs.bookingId,
    intentId: intent.id,
    code: lastError?.code,
  });
}

async function handleCanceled(event: Stripe.Event, log: Logger) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const refs = readBookingMeta(intent, log);
  if (!refs) return;

  await db
    .update(payments)
    .set({ status: "failed", voidedAt: new Date(), updatedAt: new Date() })
    .where(eq(payments.stripeIntentId, intent.id));
  // Don't blanket-overwrite — if the booking was already authorized then
  // refunded, the canceled event for some other intent shouldn't undo
  // that. Only flip status when our active intent is the one canceled.
  await db
    .update(bookings)
    .set({ paymentStatus: "failed", paymentHoldExpiresAt: null })
    .where(eq(bookings.activePaymentIntentId, intent.id));

  broadcastBookingEvent([refs.customerId], {
    type: "payment_status_changed",
    bookingId: refs.bookingId,
    paymentStatus: "failed",
  });
  log.info("stripe.webhook.pi.canceled", {
    bookingId: refs.bookingId,
    intentId: intent.id,
  });
}

/**
 * Refund issued (or auto-issued by a partial-capture). Stripe sends one
 * event per refund — we project the total onto the booking row and log
 * the individual refund for the audit trail.
 *
 * The cancellation policy uses partial-capture (not refund) so this
 * handler primarily fires for admin-issued refunds in phase 5+. We
 * wire it now so refund state is correct from day one.
 */
async function handleChargeRefunded(event: Stripe.Event, log: Logger) {
  const charge = event.data.object as Stripe.Charge;
  const intentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!intentId) {
    log.warn("stripe.webhook.refund.no_intent", { chargeId: charge.id });
    return;
  }

  const [paymentRow] = await db
    .select({
      id: payments.id,
      bookingId: payments.bookingId,
      customerId: payments.customerId,
    })
    .from(payments)
    .where(eq(payments.stripeIntentId, intentId))
    .limit(1);
  if (!paymentRow) {
    log.warn("stripe.webhook.refund.unknown_payment", { intentId });
    return;
  }

  // Stripe attaches the latest refund as `charge.refunds.data[0]` AND
  // emits one event per refund — pick the most recent and upsert.
  const latest = charge.refunds?.data?.[0];
  const totalRefunded = charge.amount_refunded;
  const newPaymentStatus =
    totalRefunded >= charge.amount ? "refunded" : "partially_refunded";

  await db.transaction(async (tx) => {
    if (latest) {
      await tx
        .insert(refunds)
        .values({
          bookingId: paymentRow.bookingId,
          paymentId: paymentRow.id,
          stripeRefundId: latest.id,
          amountPence: latest.amount,
          reason: "requested_by_customer",
          status: latest.status ?? "succeeded",
          failureReason: latest.failure_reason ?? null,
        })
        .onConflictDoNothing({ target: refunds.stripeRefundId });
    }

    await tx
      .update(payments)
      .set({ status: newPaymentStatus, updatedAt: new Date() })
      .where(eq(payments.id, paymentRow.id));

    await tx
      .update(bookings)
      .set({
        paymentStatus: newPaymentStatus,
        amountRefundedPence: totalRefunded,
      })
      .where(eq(bookings.id, paymentRow.bookingId));
  });

  broadcastBookingEvent([paymentRow.customerId], {
    type: "payment_status_changed",
    bookingId: paymentRow.bookingId,
    paymentStatus: newPaymentStatus,
  });
  log.info("stripe.webhook.refund.applied", {
    bookingId: paymentRow.bookingId,
    chargeId: charge.id,
    totalRefunded,
    paymentStatus: newPaymentStatus,
  });
}

async function handleRefundUpdated(event: Stripe.Event, log: Logger) {
  const refund = event.data.object as Stripe.Refund;
  await db
    .update(refunds)
    .set({
      status: refund.status ?? "succeeded",
      failureReason: refund.failure_reason ?? null,
    })
    .where(eq(refunds.stripeRefundId, refund.id));
  log.info("stripe.webhook.refund.updated", {
    refundId: refund.id,
    status: refund.status,
  });
}

/**
 * Dispatch a verified Stripe event to its handler. Throws on handler
 * failure so the route can mark the webhook_events row as errored;
 * Stripe will retry with exponential backoff.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  log: Logger,
): Promise<void> {
  const handler = HANDLERS[event.type];
  if (!handler) {
    log.debug("stripe.webhook.ignored", {
      type: event.type,
      eventId: event.id,
    });
    return;
  }
  await handler(event, log);
}
