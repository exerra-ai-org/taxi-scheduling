import { Hono } from "hono";
import {
  and,
  eq,
  gt,
  gte,
  inArray,
  sql,
  avg,
  count,
  asc,
  desc,
} from "drizzle-orm";
import {
  inviteUserSchema,
  driverProfileSchema,
  updateUserSchema,
} from "shared/validation";
import type { LiveDriver } from "shared/types";
import { db } from "../db/index";
import {
  users,
  driverProfiles,
  driverPresence,
  driverAssignments,
  driverLocationPoints,
  bookings,
  reviews,
  incidents,
} from "../db/schema";
import { authMiddleware, requireRole } from "../middleware/auth";
import { ok, err } from "../lib/response";
import { generateAuthToken } from "../lib/tokens";
import { sendInvitationEmail } from "../services/email";
import { haversineMeters } from "../services/geofence";
import { snapPathServer } from "../services/snapPath";
import { broadcastBookingEvent } from "../services/broadcaster";

// A driver counts as "live" if presence was pinged within this window.
const LIVE_WINDOW_MS = 2 * 60 * 1000;

export const adminRoutes = new Hono();

adminRoutes.use("*", authMiddleware, requireRole("admin"));

// Invite a new driver or admin
adminRoutes.post("/invite", async (c) => {
  const body = await c.req.json();
  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success)
    return err(c, "Invalid input", 400, parsed.error.flatten());

  const { email, name, role } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0)
    return err(c, "An account with this email already exists", 409);

  const { raw, hash } = generateAuthToken();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  const [user] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      name,
      role,
      invitationToken: hash,
      invitationTokenExpiresAt: expiresAt,
    })
    .returning();

  await sendInvitationEmail(normalizedEmail, raw, name, role);

  return ok(c, {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// Live drivers feed for the admin map. MUST be registered before
// /drivers/:id — otherwise Hono matches "live" as the :id parameter and
// the request falls into the wrong handler (resulting in a 400).
adminRoutes.get("/drivers/live", async (c) => {
  const cutoff = new Date(Date.now() - LIVE_WINDOW_MS);

  const liveRows = await db
    .select({
      driverId: driverPresence.driverId,
      isOnDuty: driverPresence.isOnDuty,
      lastSeenAt: driverPresence.lastSeenAt,
      lat: driverPresence.lastLat,
      lon: driverPresence.lastLon,
      name: users.name,
      phone: users.phone,
    })
    .from(driverPresence)
    .innerJoin(users, eq(driverPresence.driverId, users.id))
    .where(
      and(
        eq(driverPresence.isOnDuty, true),
        gte(driverPresence.lastSeenAt, cutoff),
      ),
    );

  if (liveRows.length === 0) return ok(c, { drivers: [] as LiveDriver[] });

  const driverIds = liveRows.map((r) => r.driverId);

  const profiles = await db
    .select()
    .from(driverProfiles)
    .where(inArray(driverProfiles.driverId, driverIds));
  const profileById = new Map(profiles.map((p) => [p.driverId, p]));

  const ACTIVE_STATUSES = [
    "assigned",
    "en_route",
    "arrived",
    "in_progress",
  ] as const;
  const activeAssignments = await db
    .select({
      driverId: driverAssignments.driverId,
      bookingId: bookings.id,
      status: bookings.status,
      pickupAddress: bookings.pickupAddress,
      dropoffAddress: bookings.dropoffAddress,
      pickupLat: bookings.pickupLat,
      pickupLon: bookings.pickupLon,
      dropoffLat: bookings.dropoffLat,
      dropoffLon: bookings.dropoffLon,
      customerName: users.name,
      scheduledAt: bookings.scheduledAt,
    })
    .from(driverAssignments)
    .innerJoin(bookings, eq(driverAssignments.bookingId, bookings.id))
    .innerJoin(users, eq(bookings.customerId, users.id))
    .where(
      and(
        inArray(driverAssignments.driverId, driverIds),
        eq(driverAssignments.isActive, true),
        inArray(bookings.status, [...ACTIVE_STATUSES]),
      ),
    );

  const STATUS_PRIORITY: Record<string, number> = {
    in_progress: 4,
    arrived: 3,
    en_route: 2,
    assigned: 1,
  };
  const activeByDriver = new Map<number, (typeof activeAssignments)[number]>();
  for (const row of activeAssignments) {
    const existing = activeByDriver.get(row.driverId);
    if (
      !existing ||
      (STATUS_PRIORITY[row.status] ?? 0) >
        (STATUS_PRIORITY[existing.status] ?? 0)
    ) {
      activeByDriver.set(row.driverId, row);
    }
  }

  const drivers: LiveDriver[] = liveRows
    .filter((r) => r.lat != null && r.lon != null && r.lastSeenAt != null)
    .map((r) => {
      const active = activeByDriver.get(r.driverId);
      const profile = profileById.get(r.driverId) ?? null;
      return {
        driverId: r.driverId,
        name: r.name,
        phone: r.phone,
        vehicle: profile,
        lat: r.lat as number,
        lon: r.lon as number,
        lastSeenAt: (r.lastSeenAt as Date).toISOString(),
        isOnDuty: r.isOnDuty,
        activeBooking: active
          ? {
              id: active.bookingId,
              status: active.status,
              pickupAddress: active.pickupAddress,
              dropoffAddress: active.dropoffAddress,
              pickupLat: active.pickupLat,
              pickupLon: active.pickupLon,
              dropoffLat: active.dropoffLat,
              dropoffLon: active.dropoffLon,
              customerName: active.customerName,
              scheduledAt: active.scheduledAt.toISOString(),
            }
          : null,
      };
    });

  return ok(c, { drivers });
});

// Get full driver profile (admin)
adminRoutes.get("/drivers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return err(c, "Invalid ID", 400);

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      profilePictureUrl: users.profilePictureUrl,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id));

  if (!user) return err(c, "Driver not found", 404);

  const [profile] = await db
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.driverId, id));

  const [ratings] = await db
    .select({ avg: avg(reviews.rating), total: count(reviews.id) })
    .from(reviews)
    .where(eq(reviews.driverId, id));

  return ok(c, {
    driver: {
      ...user,
      profile: profile ?? null,
      avgRating: ratings.avg ? Number(Number(ratings.avg).toFixed(1)) : null,
      totalReviews: ratings.total,
    },
  });
});

// Update any user's name/phone (admin)
adminRoutes.patch("/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return err(c, "Invalid ID", 400);

  const body = await c.req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success)
    return err(c, "Invalid input", 400, parsed.error.flatten());

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.phone !== undefined)
    updates.phone = parsed.data.phone?.trim() || null;

  if (Object.keys(updates).length === 0)
    return err(c, "Nothing to update", 400);

  const [user] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning();
  if (!user) return err(c, "User not found", 404);

  // Notify dependents — admin tabs viewing this user, the user's own tabs,
  // and any tab displaying their name (driver tab showing customer name,
  // customer tab showing driver name, etc.).
  broadcastBookingEvent([user.id], { type: "user_updated", userId: user.id });

  return ok(c, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
    },
  });
});

// Update driver vehicle/profile (admin)
adminRoutes.put("/drivers/:id/profile", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return err(c, "Invalid ID", 400);

  const body = await c.req.json();
  const parsed = driverProfileSchema.safeParse(body);
  if (!parsed.success)
    return err(c, "Invalid input", 400, parsed.error.flatten());

  const { profilePictureUrl, ...profileFields } = parsed.data;

  if (profilePictureUrl !== undefined) {
    await db.update(users).set({ profilePictureUrl }).where(eq(users.id, id));
  }

  await db
    .insert(driverProfiles)
    .values({ driverId: id, ...profileFields })
    .onConflictDoUpdate({
      target: driverProfiles.driverId,
      set: profileFields,
    });

  const [profile] = await db
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.driverId, id));

  // Notify the driver themselves and any tab displaying their vehicle info
  // (admin lists, customer ride detail, live map side panel).
  broadcastBookingEvent([id], {
    type: "driver_profile_updated",
    driverId: id,
  });

  return ok(c, { profile });
});

// Breadcrumb path for a booking. Returns every recorded GPS point for the
// ride in chronological order. Used by the admin live map to draw the
// actual route a driver took, separate from the planned OSRM polyline.
//
// Two filters are applied to clean up the path:
//   1. Drop low-accuracy fixes (browser Wi-Fi / IP geolocation can be off
//      by kilometers — those would draw absurd straight lines on the map).
//   2. Drop impossible-speed jumps between consecutive kept points — a
//      remaining safety net for the rare bad fix that slips through.
const PATH_MAX_ACCURACY_M = 100; // typical Wi-Fi fixes report 50-2000m; GPS <30m
const PATH_MAX_SPEED_MPS = 55; // ~200 km/h, anything beyond that is GPS error

adminRoutes.get("/bookings/:id/path", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return err(c, "Invalid ID", 400);

  // Optional `since` ISO timestamp — when provided, return only points
  // recorded strictly after it. Lets the client re-poll cheaply for active
  // rides instead of refetching the whole trail.
  const sinceRaw = c.req.query("since");
  let since: Date | null = null;
  if (sinceRaw) {
    const parsed = new Date(sinceRaw);
    if (!Number.isNaN(parsed.getTime())) since = parsed;
  }

  // Read the booking shell first so we can decide whether to use the
  // cache. Once a ride is completed the path is immutable, so a cached
  // snap is always correct.
  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      snappedPath: bookings.snappedPath,
    })
    .from(bookings)
    .where(eq(bookings.id, id))
    .limit(1);
  if (!booking) return err(c, "Booking not found", 404);

  // Cache hit: completed ride with a previously-snapped path. The snap is
  // the whole ride; ignore `since` because the client should replace the
  // trail wholesale anyway.
  if (booking.status === "completed" && booking.snappedPath) {
    return ok(c, {
      points: [],
      snappedPath: booking.snappedPath as [number, number][],
    });
  }

  const whereClauses = since
    ? and(
        eq(driverLocationPoints.bookingId, id),
        gt(driverLocationPoints.recordedAt, since),
      )
    : eq(driverLocationPoints.bookingId, id);

  const rows = await db
    .select({
      lat: driverLocationPoints.lat,
      lon: driverLocationPoints.lon,
      accuracyM: driverLocationPoints.accuracyM,
      speedMps: driverLocationPoints.speedMps,
      recordedAt: driverLocationPoints.recordedAt,
    })
    .from(driverLocationPoints)
    .where(whereClauses)
    .orderBy(asc(driverLocationPoints.recordedAt));

  const accurate = rows.filter(
    (p) => p.accuracyM == null || p.accuracyM <= PATH_MAX_ACCURACY_M,
  );

  const cleaned: typeof accurate = [];
  for (const p of accurate) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev) {
      cleaned.push(p);
      continue;
    }
    const dtSec = (p.recordedAt.getTime() - prev.recordedAt.getTime()) / 1000;
    if (dtSec <= 0) continue;
    const dM = haversineMeters(prev.lat, prev.lon, p.lat, p.lon);
    if (dM / dtSec > PATH_MAX_SPEED_MPS) continue;
    cleaned.push(p);
  }

  const points = cleaned.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    accuracyM: p.accuracyM,
    speedMps: p.speedMps,
    recordedAt: p.recordedAt.toISOString(),
  }));

  // Cache miss: completed ride with no snap yet. Compute now, persist,
  // and serve the snapped path. If the OSRM call fails we fall through
  // to returning raw points; the next request will retry the snap.
  // Skip when this is an incremental fetch — the snapped path is built
  // from the *whole* trail, not a tail.
  if (booking.status === "completed" && cleaned.length >= 2 && !since) {
    const snapped = await snapPathServer(
      cleaned.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        recordedAt: p.recordedAt,
      })),
    );
    if (snapped) {
      await db
        .update(bookings)
        .set({ snappedPath: snapped })
        .where(eq(bookings.id, id));
      return ok(c, { points: [], snappedPath: snapped });
    }
  }

  return ok(c, { points });
});

// ── Incident inbox ──────────────────────────────────────
// Admin sees every incident customers raised, newest first. Used by the
// dispatch board to triage SOS / contact-admin events that came in via
// SSE (incident_reported) or were missed because the operator was on
// another tab.
adminRoutes.get("/incidents", async (c) => {
  const rows = await db
    .select({
      id: incidents.id,
      bookingId: incidents.bookingId,
      reporterId: incidents.reporterId,
      type: incidents.type,
      message: incidents.message,
      resolved: incidents.resolved,
      createdAt: incidents.createdAt,
      reporterName: users.name,
      reporterPhone: users.phone,
    })
    .from(incidents)
    .innerJoin(users, eq(users.id, incidents.reporterId))
    .orderBy(desc(incidents.createdAt))
    .limit(200);

  return ok(c, { incidents: rows });
});

adminRoutes.patch("/incidents/:id/resolve", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return err(c, "Invalid ID", 400);

  const [row] = await db
    .update(incidents)
    .set({ resolved: true })
    .where(eq(incidents.id, id))
    .returning();
  if (!row) return err(c, "Incident not found", 404);

  return ok(c, { incident: row });
});
