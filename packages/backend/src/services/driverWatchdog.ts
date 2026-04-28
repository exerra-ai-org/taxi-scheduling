import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index";
import { bookings, driverAssignments, driverHeartbeats } from "../db/schema";

const HEARTBEAT_STALE_MINUTES = Math.max(
  1,
  Number(process.env.DRIVER_HEARTBEAT_STALE_MINUTES || "5"),
);
const HEARTBEAT_FALLBACK_WINDOWS = Math.max(
  1,
  Number(process.env.DRIVER_HEARTBEAT_FALLBACK_WINDOWS || "2"),
);

export interface DriverWatchdogWarning {
  bookingId: number;
  primaryDriverId: number;
  missedWindows: number;
}

export interface DriverWatchdogFallback {
  bookingId: number;
  oldPrimaryDriverId: number;
  newPrimaryDriverId: number;
}

export interface DriverWatchdogResult {
  checked: number;
  warnings: DriverWatchdogWarning[];
  fallbacks: DriverWatchdogFallback[];
  config: {
    staleMinutes: number;
    fallbackWindows: number;
  };
}

export async function runDriverWatchdog(
  now = new Date(),
): Promise<DriverWatchdogResult> {
  const staleThreshold = new Date(
    now.getTime() - HEARTBEAT_STALE_MINUTES * 60 * 1000,
  );

  const activeBookings = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      inArray(bookings.status, [
        "assigned",
        "en_route",
        "arrived",
        "in_progress",
      ]),
    );

  const warnings: DriverWatchdogWarning[] = [];
  const fallbacks: DriverWatchdogFallback[] = [];

  for (const booking of activeBookings) {
    const assignments = await db
      .select({
        id: driverAssignments.id,
        driverId: driverAssignments.driverId,
        role: driverAssignments.role,
      })
      .from(driverAssignments)
      .where(
        and(
          eq(driverAssignments.bookingId, booking.id),
          eq(driverAssignments.isActive, true),
        ),
      );

    const primary = assignments.find((a) => a.role === "primary");
    const backup = assignments.find((a) => a.role === "backup");
    if (!primary || !backup) {
      continue;
    }

    const heartbeatRow = await db
      .select()
      .from(driverHeartbeats)
      .where(
        and(
          eq(driverHeartbeats.bookingId, booking.id),
          eq(driverHeartbeats.driverId, primary.driverId),
        ),
      )
      .limit(1);

    const heartbeat = heartbeatRow[0];
    const isStale = !heartbeat || heartbeat.lastHeartbeatAt < staleThreshold;

    if (!isStale) {
      if (heartbeat && heartbeat.missedWindows !== 0) {
        await db
          .update(driverHeartbeats)
          .set({ missedWindows: 0 })
          .where(eq(driverHeartbeats.id, heartbeat.id));
      }
      continue;
    }

    const newMissedWindows = (heartbeat?.missedWindows || 0) + 1;

    const [updatedHeartbeat] = await db
      .insert(driverHeartbeats)
      .values({
        bookingId: booking.id,
        driverId: primary.driverId,
        lastHeartbeatAt: heartbeat?.lastHeartbeatAt || now,
        missedWindows: newMissedWindows,
      })
      .onConflictDoUpdate({
        target: [driverHeartbeats.bookingId, driverHeartbeats.driverId],
        set: {
          missedWindows: newMissedWindows,
        },
      })
      .returning();

    if (newMissedWindows < HEARTBEAT_FALLBACK_WINDOWS) {
      warnings.push({
        bookingId: booking.id,
        primaryDriverId: primary.driverId,
        missedWindows: newMissedWindows,
      });
      continue;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(driverAssignments)
        .set({ isActive: false })
        .where(eq(driverAssignments.id, primary.id));

      await tx
        .update(driverAssignments)
        .set({ role: "primary" })
        .where(eq(driverAssignments.id, backup.id));

      await tx
        .update(driverHeartbeats)
        .set({ missedWindows: 0 })
        .where(eq(driverHeartbeats.id, updatedHeartbeat.id));
    });

    fallbacks.push({
      bookingId: booking.id,
      oldPrimaryDriverId: primary.driverId,
      newPrimaryDriverId: backup.driverId,
    });
  }

  return {
    checked: activeBookings.length,
    warnings,
    fallbacks,
    config: {
      staleMinutes: HEARTBEAT_STALE_MINUTES,
      fallbackWindows: HEARTBEAT_FALLBACK_WINDOWS,
    },
  };
}
