/**
 * Cancellation policy — pure logic.
 *
 * Decides what happens to the customer's authorisation when a booking
 * is cancelled. Output is consumed by the cancel endpoint to actually
 * execute the void/capture/refund.
 *
 *   > 24h before pickup        → void authorisation (no statement entry)
 *   6–24h before pickup        → capture 50% as cancellation fee
 *   < 6h or after dispatch     → capture full fare (admin can override)
 *
 * All windows are configurable via env (config.payments.*).
 */

import type { BookingStatus } from "shared/types";
import { config } from "../config";

export type CancellationAction = "void" | "partial_capture" | "full_capture";

export interface CancellationDecision {
  action: CancellationAction;
  feePence: number;
  refundablePence: number;
  /** Free-text reason shown to the customer in the confirmation dialog. */
  reason: string;
  /** Human-readable name of the policy window — for receipts/admin notes. */
  window: "outside_full_refund" | "partial_window" | "no_refund_window";
}

interface DecideInput {
  scheduledAt: Date;
  status: BookingStatus;
  /** What's been authorised on the card. We compute fees against this so
   *  we never try to capture more than was held. */
  amountAuthorizedPence: number;
  now?: Date;
}

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Bookings that have moved past `assigned` are considered "in flight"
 * — driver is en route, has arrived, or is mid-ride. These are full-fee
 * regardless of the time window because operational cost has been
 * incurred (driver dispatched, possibly fuel burned).
 */
const IN_FLIGHT_STATUSES = new Set<BookingStatus>([
  "en_route",
  "arrived",
  "in_progress",
]);

export function decideCancellation(input: DecideInput): CancellationDecision {
  const now = input.now ?? new Date();
  const hoursUntilPickup =
    (input.scheduledAt.getTime() - now.getTime()) / MS_PER_HOUR;

  // Driver is already in motion — full fee.
  if (IN_FLIGHT_STATUSES.has(input.status)) {
    return {
      action: "full_capture",
      feePence: input.amountAuthorizedPence,
      refundablePence: 0,
      reason:
        "The driver has already been dispatched. The full fare is charged.",
      window: "no_refund_window",
    };
  }

  // Far enough out — full void, no statement entry on the customer's card.
  if (hoursUntilPickup >= config.payments.fullRefundHours) {
    return {
      action: "void",
      feePence: 0,
      refundablePence: input.amountAuthorizedPence,
      reason: `Cancelled more than ${config.payments.fullRefundHours} hours before pickup. The authorisation is released in full.`,
      window: "outside_full_refund",
    };
  }

  // Inside the partial window — keep configured percentage.
  if (hoursUntilPickup >= config.payments.partialRefundHours) {
    const feePence = Math.round(
      (input.amountAuthorizedPence *
        config.payments.partialCancellationPercent) /
        100,
    );
    return {
      action: "partial_capture",
      feePence,
      refundablePence: input.amountAuthorizedPence - feePence,
      reason: `Cancelled ${Math.floor(hoursUntilPickup)}h before pickup — a ${config.payments.partialCancellationPercent}% cancellation fee applies.`,
      window: "partial_window",
    };
  }

  // Inside the no-refund window.
  return {
    action: "full_capture",
    feePence: input.amountAuthorizedPence,
    refundablePence: 0,
    reason: `Cancelled less than ${config.payments.partialRefundHours} hours before pickup. The full fare is charged.`,
    window: "no_refund_window",
  };
}
