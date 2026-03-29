import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index";
import { users, driverAssignments, bookings } from "../db/schema";
import { authMiddleware, requireRole } from "../middleware/auth";
import { ok } from "../lib/response";

export const driverRoutes = new Hono();

driverRoutes.use("*", authMiddleware, requireRole("admin"));

driverRoutes.get("/", async (c) => {
  const results = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      createdAt: users.createdAt,
      upcomingAssignments: sql<number>`(
        SELECT COUNT(*)::int FROM driver_assignments da
        JOIN bookings b ON da.booking_id = b.id
        WHERE da.driver_id = ${users.id}
          AND da.is_active = true
          AND b.status IN ('scheduled', 'assigned', 'en_route')
          AND b.scheduled_at >= NOW()
      )`,
    })
    .from(users)
    .where(eq(users.role, "driver"));

  return ok(c, { drivers: results });
});
