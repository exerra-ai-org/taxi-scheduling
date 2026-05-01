import { and, eq } from "drizzle-orm";
import { db } from "../db/index";
import { bookings, driverAssignments } from "../db/schema";
import { broadcastBookingEvent, type BroadcastEvent } from "./broadcaster";

// Broadcast an event to every participant of a booking — the customer who
// owns it and every driver currently actively assigned (primary + backup).
// Admins always receive every broadcast regardless of recipients, so we
// don't include them explicitly.
//
// Use this whenever a booking-affecting event happens that any of the
// participants would want to react to (status changes, cancellations,
// reassignments). Falling back to broadcastBookingEvent with just the
// customer id silently drops events for the driver tabs, which is the
// most common cause of "the page didn't update, I had to refresh".
export async function broadcastBookingChange(
  bookingId: number,
  event: BroadcastEvent,
): Promise<void> {
  const rows = await db
    .select({
      customerId: bookings.customerId,
      driverId: driverAssignments.driverId,
    })
    .from(bookings)
    .leftJoin(
      driverAssignments,
      and(
        eq(driverAssignments.bookingId, bookings.id),
        eq(driverAssignments.isActive, true),
      ),
    )
    .where(eq(bookings.id, bookingId));

  const userIds = new Set<number>();
  for (const row of rows) {
    if (row.customerId != null) userIds.add(row.customerId);
    if (row.driverId != null) userIds.add(row.driverId);
  }

  broadcastBookingEvent(Array.from(userIds), event);
}
