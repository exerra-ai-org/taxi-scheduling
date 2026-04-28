import { Hono } from "hono";
import { eq, sql, and, inArray, gte, avg, count } from "drizzle-orm";
import { driverHeartbeatSchema, driverProfileSchema } from "shared/validation";
import { db } from "../db/index";
import {
  users,
  driverAssignments,
  bookings,
  driverHeartbeats,
  driverProfiles,
  reviews,
} from "../db/schema";
import {
  authMiddleware,
  requireRole,
  type JwtPayload,
} from "../middleware/auth";
import { ok, err } from "../lib/response";
import { runDriverWatchdog } from "../services/driverWatchdog";
import { notifyWatchdogResult } from "../services/notifications";

export const driverRoutes = new Hono();

// Admin list
driverRoutes.get("/", authMiddleware, requireRole("admin"), async (c) => {
  const driverList = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.role, "driver"));

  if (driverList.length === 0) {
    return ok(c, { drivers: [] });
  }

  const driverIds = driverList.map((driver) => driver.id);
  const now = new Date();

  const upcoming = await db
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
    .groupBy(driverAssignments.driverId);

  const upcomingByDriver = new Map(
    upcoming.map((row) => [row.driverId, row.upcomingAssignments]),
  );

  const profiles = await db
    .select()
    .from(driverProfiles)
    .where(inArray(driverProfiles.driverId, driverIds));

  const profileByDriver = new Map(profiles.map((p) => [p.driverId, p]));

  const ratings = await db
    .select({
      driverId: reviews.driverId,
      avg: avg(reviews.rating),
      total: count(reviews.id),
    })
    .from(reviews)
    .where(inArray(reviews.driverId, driverIds))
    .groupBy(reviews.driverId);

  const ratingByDriver = new Map(ratings.map((r) => [r.driverId, r]));

  return ok(c, {
    drivers: driverList.map((driver) => {
      const profile = profileByDriver.get(driver.id) ?? null;
      const rating = ratingByDriver.get(driver.id);
      return {
        ...driver,
        upcomingAssignments: upcomingByDriver.get(driver.id) ?? 0,
        profile,
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

    const { bookingId, lat, lon } = parsed.data;

    const assignment = await db
      .select({
        bookingId: driverAssignments.bookingId,
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

    const [heartbeat] = await db
      .insert(driverHeartbeats)
      .values({
        bookingId,
        driverId: payload.sub,
        lastHeartbeatAt: new Date(),
        missedWindows: 0,
        lat: lat ?? null,
        lon: lon ?? null,
      })
      .onConflictDoUpdate({
        target: [driverHeartbeats.bookingId, driverHeartbeats.driverId],
        set: {
          lastHeartbeatAt: new Date(),
          missedWindows: 0,
          lat: lat ?? null,
          lon: lon ?? null,
        },
      })
      .returning();

    return ok(c, { heartbeat });
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

    return ok(c, {
      profile,
      profilePictureUrl: user?.profilePictureUrl ?? null,
    });
  },
);
