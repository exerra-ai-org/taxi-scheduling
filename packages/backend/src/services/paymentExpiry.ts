/**
 * Hold-expiry sweep.
 *
 * Bookings created with Stripe enabled enter `paymentStatus = "pending"`
 * with a `paymentHoldExpiresAt` timestamp ~15 minutes out. If the
 * customer abandons the Payment Element, the slot is locked
 * indefinitely and the PaymentIntent stays in `requires_payment_method`
 * until Stripe garbage-collects it ~24h later. This job releases the
 * slot inside our own SLA so re-bookings work.
 *
 * Idempotent. Runs inside the existing background tick under the same
 * advisory lock — we do NOT spin up a second cron loop.
 */

import { and, eq, lt, isNotNull } from "drizzle-orm";
import { db } from "../db/index";
import { bookings } from "../db/schema";
import { voidPendingPayment } from "./payments";
import { isStripeEnabled } from "../lib/stripe";
import { logger } from "../lib/logger";

export async function expirePendingPayments(now: Date): Promise<number> {
  if (!isStripeEnabled()) return 0;

  const expired = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.paymentStatus, "pending"),
        isNotNull(bookings.paymentHoldExpiresAt),
        lt(bookings.paymentHoldExpiresAt, now),
      ),
    );

  if (expired.length === 0) return 0;

  let released = 0;
  for (const row of expired) {
    try {
      await voidPendingPayment(row.id, "hold_expired");
      released += 1;
    } catch (cause) {
      // Log and move on — a single misbehaving booking shouldn't block
      // the rest. The next tick will retry.
      logger.error("payments.expiry.failed", {
        bookingId: row.id,
        err: cause as Error,
      });
    }
  }

  if (released > 0) {
    logger.info("payments.expiry.released", {
      total: expired.length,
      released,
    });
  }
  return released;
}
