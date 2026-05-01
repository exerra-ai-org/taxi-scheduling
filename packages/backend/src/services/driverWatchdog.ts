import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/index";
import { bookings, driverAssignments, driverHeartbeats } from "../db/schema";
import { config } from "../config";
import { classifyHeartbeat } from "./watchdogClassify";

const HEARTBEAT_STALE_MINUTES = config.drivers.heartbeatStaleMinutes;
const HEARTBEAT_FALLBACK_WINDOWS = config.drivers.heartbeatFallbackWindows;

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

const ACTIVE_STATUSES = [
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
] as const;

export async function runDriverWatchdog(
  now = new Date(),
): Promise<DriverWatchdogResult> {
  const primary = alias(driverAssignments, "primary_da");
  const backup = alias(driverAssignments, "backup_da");

  // Single query: fetch every active booking that has BOTH an active
  // primary and an active backup, plus the primary's latest heartbeat
  // (LEFT JOIN — a never-beat driver is still considered).
  const candidates = await db
    .select({
      bookingId: bookings.id,
      primaryAssignmentId: primary.id,
      primaryDriverId: primary.driverId,
      backupAssignmentId: backup.id,
      backupDriverId: backup.driverId,
      heartbeatId: driverHeartbeats.id,
      lastHeartbeatAt: driverHeartbeats.lastHeartbeatAt,
      missedWindows: driverHeartbeats.missedWindows,
    })
    .from(bookings)
    .innerJoin(
      primary,
      and(
        eq(primary.bookingId, bookings.id),
        eq(primary.role, "primary"),
        eq(primary.isActive, true),
      ),
    )
    .innerJoin(
      backup,
      and(
        eq(backup.bookingId, bookings.id),
        eq(backup.role, "backup"),
        eq(backup.isActive, true),
      ),
    )
    .leftJoin(
      driverHeartbeats,
      and(
        eq(driverHeartbeats.bookingId, bookings.id),
        eq(driverHeartbeats.driverId, primary.driverId),
      ),
    )
    .where(inArray(bookings.status, ACTIVE_STATUSES));

  const warnings: DriverWatchdogWarning[] = [];
  const fallbacks: DriverWatchdogFallback[] = [];

  for (const row of candidates) {
    const decision = classifyHeartbeat({
      now,
      staleMinutes: HEARTBEAT_STALE_MINUTES,
      fallbackWindows: HEARTBEAT_FALLBACK_WINDOWS,
      lastHeartbeatAt: row.lastHeartbeatAt ?? null,
      missedWindows: row.missedWindows ?? 0,
    });

    if (decision.kind === "ok") {
      if (decision.shouldResetMissedWindows && row.heartbeatId !== null) {
        await db
          .update(driverHeartbeats)
          .set({ missedWindows: 0 })
          .where(eq(driverHeartbeats.id, row.heartbeatId));
      }
      continue;
    }

    // For warn / fallback we need a heartbeat row — upsert it now.
    const [updatedHeartbeat] = await db
      .insert(driverHeartbeats)
      .values({
        bookingId: row.bookingId,
        driverId: row.primaryDriverId,
        lastHeartbeatAt: row.lastHeartbeatAt ?? now,
        missedWindows: decision.newMissedWindows,
      })
      .onConflictDoUpdate({
        target: [driverHeartbeats.bookingId, driverHeartbeats.driverId],
        set: { missedWindows: decision.newMissedWindows },
      })
      .returning();

    if (decision.kind === "warn") {
      warnings.push({
        bookingId: row.bookingId,
        primaryDriverId: row.primaryDriverId,
        missedWindows: decision.newMissedWindows,
      });
      continue;
    }

    // Fallback: deactivate primary, promote backup, reset counters.
    await db.transaction(async (tx) => {
      await tx
        .update(driverAssignments)
        .set({ isActive: false })
        .where(eq(driverAssignments.id, row.primaryAssignmentId));

      await tx
        .update(driverAssignments)
        .set({ role: "primary" })
        .where(eq(driverAssignments.id, row.backupAssignmentId));

      await tx
        .update(driverHeartbeats)
        .set({ missedWindows: 0 })
        .where(eq(driverHeartbeats.id, updatedHeartbeat.id));
    });

    fallbacks.push({
      bookingId: row.bookingId,
      oldPrimaryDriverId: row.primaryDriverId,
      newPrimaryDriverId: row.backupDriverId,
    });
  }

  return {
    checked: candidates.length,
    warnings,
    fallbacks,
    config: {
      staleMinutes: HEARTBEAT_STALE_MINUTES,
      fallbackWindows: HEARTBEAT_FALLBACK_WINDOWS,
    },
  };
}
