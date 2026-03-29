import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createReviewSchema } from "shared/validation";
import { db } from "../db/index";
import { reviews, bookings, driverAssignments } from "../db/schema";
import {
  authMiddleware,
  requireRole,
  type JwtPayload,
} from "../middleware/auth";
import { ok, err } from "../lib/response";

export const reviewRoutes = new Hono();

reviewRoutes.use("*", authMiddleware, requireRole("customer"));

reviewRoutes.post("/", async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;

  const body = await c.req.json();
  const parsed = createReviewSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const { bookingId, driverId, rating, comment } = parsed.data;

  // Verify booking exists, is completed, and belongs to customer
  const bookingResult = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (bookingResult.length === 0) {
    return err(c, "Booking not found", 404);
  }

  const booking = bookingResult[0];

  if (booking.customerId !== payload.sub) {
    return err(c, "Forbidden", 403);
  }

  if (booking.status !== "completed") {
    return err(c, "Can only review completed bookings", 400);
  }

  // Verify driver was assigned to this booking
  const assignment = await db
    .select()
    .from(driverAssignments)
    .where(
      and(
        eq(driverAssignments.bookingId, bookingId),
        eq(driverAssignments.driverId, driverId),
      ),
    )
    .limit(1);

  if (assignment.length === 0) {
    return err(c, "Driver was not assigned to this booking", 400);
  }

  // Check for duplicate review
  const existing = await db
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.bookingId, bookingId),
        eq(reviews.customerId, payload.sub),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return err(c, "You have already reviewed this booking", 409);
  }

  const [review] = await db
    .insert(reviews)
    .values({
      bookingId,
      customerId: payload.sub,
      driverId,
      rating,
      comment: comment ?? null,
    })
    .returning();

  return ok(c, { review }, 201);
});
