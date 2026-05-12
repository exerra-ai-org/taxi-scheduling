import { Hono } from "hono";
import { eq, sql, and, inArray, gte, avg, count } from "drizzle-orm";
import {
  driverHeartbeatSchema,
  driverPresenceSchema,
  driverProfileSchema,
} from "shared/validation";
import { db } from "../db/index";
import {
  users,
  driverAssignments,
  bookings,
  driverHeartbeats,
  driverLocationPoints,
  driverPresence,
  driverProfiles,
  reviews,
} from "../db/schema";
import { config } from "../config";
import { evaluatePickupDwell } from "../services/geofence";
import { getSettingBool, getSettingInt } from "../services/appSettings";
import { notifyBookingStatusChanged } from "../services/notifications";
import {
  authMiddleware,
  requireRole,
  type JwtPayload,
} from "../middleware/auth";
import { ok, err } from "../lib/response";
import { runDriverWatchdog } from "../services/driverWatchdog";
import { notifyWatchdogResult } from "../services/notifications";
import { broadcastBookingEvent } from "../services/broadcaster";
import { broadcastBookingChange } from "../services/bookingBroadcast";

export const driverRoutes = new Hono();

// Last-broadcast bookkeeping for driver_presence dedup. The heartbeat
// endpoint mirrors driver_presence so the admin map updates without an
// explicit /presence ping; rebroadcasting on every 5s heartbeat is
// wasteful. Skip if we re-broadcast within this window.
const PRESENCE_REBROADCAST_MIN_MS = 25_000;
const lastPresenceBroadcastByDriver = new Map<number, number>();

// Admin list
driverRoutes.get("/", authMiddleware, requireRole("admin"), async (c) => {
  // Drivers + their profile in one query (left join — drivers without a
  // profile still appear).
  const driverList = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      createdAt: users.createdAt,
      profile: driverProfiles,
    })
    .from(users)
    .leftJoin(driverProfiles, eq(driverProfiles.driverId, users.id))
    .where(eq(users.role, "driver"));

  if (driverList.length === 0) {
    return ok(c, { drivers: [] });
  }

  const driverIds = driverList.map((driver) => driver.id);
  const now = new Date();

  // Two aggregate queries run in parallel — we can't fold these into the
  // base query because each is a different GROUP BY shape.
  const [upcoming, ratings] = await Promise.all([
    db
      .select({
        driverId: driverAssignments.driverId,
        upcomingAssignments: sql<number>`COUNT(*)::int`,
      })
      .from(driverAssignments)
      .innerJoin(bookings, eq(driverAssignments.bookingId, bookings.id))
      .where(
        and(
          inArray(driverAssignments.driverId, driverIds),
          eq(driverAssignments.isActive, true),
          inArray(bookings.status, ["scheduled", "assigned", "en_route"]),
          gte(bookings.scheduledAt, now),
        ),
      )
      .groupBy(driverAssignments.driverId),
    db
      .select({
        driverId: reviews.driverId,
        avg: avg(reviews.rating),
        total: count(reviews.id),
      })
      .from(reviews)
      .where(inArray(reviews.driverId, driverIds))
      .groupBy(reviews.driverId),
  ]);

  const upcomingByDriver = new Map(
    upcoming.map((row) => [row.driverId, row.upcomingAssignments]),
  );
  const ratingByDriver = new Map(ratings.map((r) => [r.driverId, r]));

  return ok(c, {
    drivers: driverList.map((driver) => {
      const rating = ratingByDriver.get(driver.id);
      return {
        id: driver.id,
        email: driver.email,
        name: driver.name,
        phone: driver.phone,
        createdAt: driver.createdAt,
        upcomingAssignments: upcomingByDriver.get(driver.id) ?? 0,
        profile: driver.profile,
        avgRating: rating?.avg ? Number(Number(rating.avg).toFixed(1)) : null,
        totalReviews: rating?.total ?? 0,
      };
    }),
  });
});

// Driver heartbeat for active rides
driverRoutes.post(
  "/heartbeat",
  authMiddleware,
  requireRole("driver"),
  async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const body = await c.req.json();
    const parsed = driverHeartbeatSchema.safeParse(body);

    if (!parsed.success) {
      return err(c, "Invalid input", 400, parsed.error.flatten());
    }

    const { bookingId, lat, lon, accuracyM, speedMps } = parsed.data;

    const assignment = await db
      .select({
        bookingId: driverAssignments.bookingId,
        customerId: bookings.customerId,
        status: bookings.status,
        pickupLat: bookings.pickupLat,
        pickupLon: bookings.pickupLon,
      })
      .from(driverAssignments)
      .innerJoin(bookings, eq(driverAssignments.bookingId, bookings.id))
      .where(
        and(
          eq(driverAssignments.bookingId, bookingId),
          eq(driverAssignments.driverId, payload.sub),
          eq(driverAssignments.isActive, true),
          inArray(bookings.status, [
            "assigned",
            "en_route",
            "arrived",
            "in_progress",
          ]),
        ),
      )
      .limit(1);

    if (assignment.length === 0) {
      return err(c, "You are not actively assigned to this ride", 403);
    }
    const ride = assignment[0];

    const now = new Date();

    // Geofence dwell evaluation runs against the previous heartbeat row's
    // pickup_geofence_since. We read it before the upsert so the dwell math
    // sees the prior state, not the row we're about to write.
    const previousHb = await db
      .select({ pickupGeofenceSince: driverHeartbeats.pickupGeofenceSince })
      .from(driverHeartbeats)
      .where(
        and(
          eq(driverHeartbeats.bookingId, bookingId),
          eq(driverHeartbeats.driverId, payload.sub),
        ),
      )
      .limit(1);

    let nextGeofenceSince: Date | null = null;
    let shouldArrive = false;
    if (lat != null && lon != null && ride.status === "en_route") {
      // Admin-tunable: auto-arrive only fires when the toggle is on. Reads
      // are issued in parallel; the DB lookup is sub-millisecond and only
      // happens on heartbeats where the rider is en_route.
      const [autoArrive, radiusM, dwellMs] = await Promise.all([
        getSettingBool("geofenceAutoArrive"),
        getSettingInt("geofencePickupRadiusM"),
        getSettingInt("geofencePickupDwellMs"),
      ]);
      if (autoArrive) {
        const dwell = evaluatePickupDwell({
          driverLat: lat,
          driverLon: lon,
          pickupLat: ride.pickupLat,
          pickupLon: ride.pickupLon,
          previousSince: previousHb[0]?.pickupGeofenceSince ?? null,
          now,
          radiusM,
          dwellMs,
        });
        nextGeofenceSince = dwell.nextSince;
        shouldArrive = dwell.shouldArrive;
      }
    }

    const [heartbeat] = await db
      .insert(driverHeartbeats)
      .values({
        bookingId,
        driverId: payload.sub,
        lastHeartbeatAt: now,
        missedWindows: 0,
        lat: lat ?? null,
        lon: lon ?? null,
        pickupGeofenceSince: nextGeofenceSince,
      })
      .onConflictDoUpdate({
        target: [driverHeartbeats.bookingId, driverHeartbeats.driverId],
        set: {
          lastHeartbeatAt: now,
          missedWindows: 0,
          lat: lat ?? null,
          lon: lon ?? null,
          pickupGeofenceSince: nextGeofenceSince,
        },
      })
      .returning();

    // Append the point to the breadcrumb trail. Skipped when coords are
    // missing (occasional pings without GPS still keep the heartbeat alive
    // for the watchdog but don't add to the path).
    if (lat != null && lon != null) {
      await db.insert(driverLocationPoints).values({
        bookingId,
        driverId: payload.sub,
        lat,
        lon,
        accuracyM: accuracyM ?? null,
        speedMps: speedMps ?? null,
        recordedAt: now,
      });
    }

    if (lat != null && lon != null) {
      broadcastBookingEvent([ride.customerId], {
        type: "driver_location",
        bookingId,
        lat,
        lon,
        updatedAt: now.toISOString(),
      });
    }

    // Auto-arrive transition. Fire-and-forget so the heartbeat itself
    // returns fast even if notification dispatch is slow. Errors are
    // logged but do not fail the request.
    if (shouldArrive) {
      const [updated] = await db
        .update(bookings)
        .set({ status: "arrived" })
        .where(and(eq(bookings.id, bookingId), eq(bookings.status, "en_route")))
        .returning({ id: bookings.id });
      if (updated) {
        void notifyBookingStatusChanged(bookingId, "arrived").catch((cause) =>
          console.error("notifyBookingStatusChanged (geofence) failed:", cause),
        );
        await broadcastBookingChange(bookingId, {
          type: "booking_updated",
          bookingId,
          status: "arrived",
        });
      }
    }

    // Mirror to driver_presence so the admin live map sees on-ride drivers
    // even if they never explicitly toggled "on duty". An active ride is
    // itself proof of being live.
    if (lat != null && lon != null) {
      await db
        .insert(driverPresence)
        .values({
          driverId: payload.sub,
          isOnDuty: true,
          lastSeenAt: now,
          lastLat: lat,
          lastLon: lon,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: driverPresence.driverId,
          set: {
            isOnDuty: true,
            lastSeenAt: now,
            lastLat: lat,
            lastLon: lon,
            updatedAt: now,
          },
        });

      // Skip the SSE rebroadcast if we sent one for this driver recently —
      // the marker only needs ~one update per ~25s for a smooth UX, but
      // heartbeats fire every 5s during en_route.
      const last = lastPresenceBroadcastByDriver.get(payload.sub) ?? 0;
      if (now.getTime() - last >= PRESENCE_REBROADCAST_MIN_MS) {
        lastPresenceBroadcastByDriver.set(payload.sub, now.getTime());
        broadcastBookingEvent([], {
          type: "driver_presence",
          driverId: payload.sub,
          isOnDuty: true,
          lat,
          lon,
          lastSeenAt: now.toISOString(),
        });
      }
    }

    return ok(c, { heartbeat });
  },
);

// Driver presence ping. Called by the driver app every ~30s while the
// driver has flipped the on-duty toggle. Used by the admin live map.
driverRoutes.post(
  "/presence",
  authMiddleware,
  requireRole("driver"),
  async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const body = await c.req.json();
    const parsed = driverPresenceSchema.safeParse(body);
    if (!parsed.success) {
      return err(c, "Invalid input", 400, parsed.error.flatten());
    }

    const { isOnDuty, lat, lon } = parsed.data;
    const now = new Date();

    await db
      .insert(driverPresence)
      .values({
        driverId: payload.sub,
        isOnDuty,
        lastSeenAt: isOnDuty ? now : null,
        lastLat: lat ?? null,
        lastLon: lon ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: driverPresence.driverId,
        set: {
          isOnDuty,
          lastSeenAt: isOnDuty ? now : null,
          lastLat: lat ?? null,
          lastLon: lon ?? null,
          updatedAt: now,
        },
      });

    broadcastBookingEvent([], {
      type: "driver_presence",
      driverId: payload.sub,
      isOnDuty,
      lat: lat ?? null,
      lon: lon ?? null,
      lastSeenAt: now.toISOString(),
    });

    return ok(c, { isOnDuty });
  },
);

// Admin watchdog: can be run manually from dashboard
// Auto-run is also enabled by background jobs.
driverRoutes.post(
  "/watchdog",
  authMiddleware,
  requireRole("admin"),
  async (c) => {
    const result = await runDriverWatchdog();

    try {
      await notifyWatchdogResult(result);
    } catch (cause) {
      console.error("notifyWatchdogResult failed:", cause);
    }

    return ok(c, {
      checked: result.checked,
      warnings: result.warnings.map((w) => w.bookingId),
      fallbacks: result.fallbacks.map((f) => f.bookingId),
      config: result.config,
    });
  },
);

// ── Driver self-service profile ───────────────────────

driverRoutes.get(
  "/me/profile",
  authMiddleware,
  requireRole("driver"),
  async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        profilePictureUrl: users.profilePictureUrl,
      })
      .from(users)
      .where(eq(users.id, payload.sub));

    if (!user) return err(c, "User not found", 404);

    const [profile] = await db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.driverId, payload.sub));

    const [ratingRow] = await db
      .select({ avg: avg(reviews.rating), total: count(reviews.id) })
      .from(reviews)
      .where(eq(reviews.driverId, payload.sub));

    return ok(c, {
      driver: {
        ...user,
        profile: profile ?? null,
        avgRating: ratingRow?.avg
          ? Number(Number(ratingRow.avg).toFixed(1))
          : null,
        totalReviews: ratingRow?.total ?? 0,
      },
    });
  },
);

driverRoutes.put(
  "/me/profile",
  authMiddleware,
  requireRole("driver"),
  async (c) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    const body = await c.req.json();
    const parsed = driverProfileSchema.safeParse(body);
    if (!parsed.success)
      return err(c, "Invalid input", 400, parsed.error.flatten());

    const { profilePictureUrl, ...profileFields } = parsed.data;

    if (profilePictureUrl !== undefined) {
      await db
        .update(users)
        .set({ profilePictureUrl })
        .where(eq(users.id, payload.sub));
    }

    await db
      .insert(driverProfiles)
      .values({ driverId: payload.sub, ...profileFields })
      .onConflictDoUpdate({
        target: driverProfiles.driverId,
        set: profileFields,
      });

    const [profile] = await db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.driverId, payload.sub));
    const [user] = await db
      .select({ profilePictureUrl: users.profilePictureUrl })
      .from(users)
      .where(eq(users.id, payload.sub));

    broadcastBookingEvent([payload.sub], {
      type: "driver_profile_updated",
      driverId: payload.sub,
    });

    return ok(c, {
      profile,
      profilePictureUrl: user?.profilePictureUrl ?? null,
    });
  },
);
