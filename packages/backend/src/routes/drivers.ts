import { Hono } from "hono";
import { eq, sql, and, inArray, gte } from "drizzle-orm";
import { driverHeartbeatSchema } from "shared/validation";
import { db } from "../db/index";
import { users, driverAssignments, bookings, driverHeartbeats } from "../db/schema";
import { authMiddleware, requireRole, type JwtPayload } from "../middleware/auth";
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

  return ok(c, {
    drivers: driverList.map((driver) => ({
      ...driver,
      upcomingAssignments: upcomingByDriver.get(driver.id) ?? 0,
    })),
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

    const bookingId = parsed.data.bookingId;

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
          inArray(bookings.status, ["assigned", "en_route"]),
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
      })
      .onConflictDoUpdate({
        target: [driverHeartbeats.bookingId, driverHeartbeats.driverId],
        set: {
          lastHeartbeatAt: new Date(),
          missedWindows: 0,
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
