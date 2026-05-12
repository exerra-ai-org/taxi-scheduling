// Glue between booking events and PDF + email dispatch. Best-effort:
// any failure is logged and swallowed so the calling flow (status flip,
// webhook) never reverses on email trouble.

import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { bookings, users } from "../db/schema";
import { logger } from "../lib/logger";
import { renderReceiptPdf } from "./pdfReceipt";
import { sendReceiptEmail } from "./email";

async function loadAdminEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.role, "admin"));
  return rows.map((r) => r.email);
}

export async function dispatchReceipt(
  bookingId: number,
  kind: "confirmation" | "final",
): Promise<void> {
  try {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!booking) return;

    const [customer] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, booking.customerId))
      .limit(1);
    if (!customer) return;

    const pdf = await renderReceiptPdf({
      kind,
      booking: {
        id: booking.id,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        scheduledAt: booking.scheduledAt,
        pricePence: booking.pricePence,
        discountPence: booking.discountPence,
        waitingFeePence: booking.waitingFeePence,
        cancellationFeePence: booking.cancellationFeePence,
        paymentMethod: booking.paymentMethod,
        depositPence: booking.depositPence,
        balanceDuePence: booking.balanceDuePence,
        cashCollectedAt: booking.cashCollectedAt,
        vehicleClass: booking.vehicleClass,
      },
      customer,
    });

    const adminEmails = await loadAdminEmails();
    const recipients = Array.from(new Set([customer.email, ...adminEmails]));
    await sendReceiptEmail({
      to: recipients,
      bookingId: booking.id,
      kind,
      pdf,
    });
  } catch (cause) {
    logger.warn("receipt.dispatch_failed", {
      bookingId,
      kind,
      err: cause as Error,
    });
  }
}
