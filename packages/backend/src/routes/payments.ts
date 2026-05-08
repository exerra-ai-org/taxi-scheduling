/**
 * Customer-facing payment endpoints.
 *
 * - GET  /payments/config        publishable key + currency for the
 *                                Payment Element bootstrap
 * - POST /payments/intent        create / retrieve a PI for a booking
 * - GET  /payments/intent/:id    poll status (used as a webhook fallback)
 *
 * All endpoints require an authenticated customer and verify booking
 * ownership before doing any Stripe work.
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index";
import { bookings, payments } from "../db/schema";
import { config } from "../config";
import {
  authMiddleware,
  requireRole,
  type JwtPayload,
} from "../middleware/auth";
import { createRateLimiter } from "../middleware/rateLimit";
import { ok, err } from "../lib/response";
import { isStripeEnabled } from "../lib/stripe";
import {
  createPaymentIntentForBooking,
  PaymentError,
} from "../services/payments";

export const paymentRoutes = new Hono();

// 30 req/min/IP — generous for a Payment Element retry storm but still
// blocks abuse (cost reconnaissance via repeated PI creates).
const paymentLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });

// Public bootstrap: the frontend needs the publishable key to instantiate
// stripe-js before the customer is authed (e.g., the receipt page can
// render before login). Keep this open but cache-friendly.
paymentRoutes.get("/config", (c) => {
  if (!isStripeEnabled()) {
    return ok(c, {
      enabled: false,
      publishableKey: "",
      currency: config.stripe.currency,
    });
  }
  return ok(c, {
    enabled: true,
    publishableKey: config.stripe.publishableKey,
    currency: config.stripe.currency,
  });
});

// All routes registered AFTER this line require a logged-in customer.
paymentRoutes.use("/intent", authMiddleware, requireRole("customer"));
paymentRoutes.use("/intent/*", authMiddleware, requireRole("customer"));
paymentRoutes.use("/intent/:id", authMiddleware, requireRole("customer"));

const createIntentSchema = z.object({
  bookingId: z.number().int().positive(),
});

paymentRoutes.post("/intent", paymentLimiter, async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const body = await c.req.json().catch(() => null);
  const parsed = createIntentSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }
  const { bookingId } = parsed.data;

  // Booking ownership check — never trust the client to scope this for us.
  const [booking] = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    return err(c, "Booking not found", 404);
  }
  if (booking.customerId !== payload.sub) {
    return err(c, "Booking not found", 404);
  }

  try {
    const intent = await createPaymentIntentForBooking(bookingId);
    return ok(c, intent, 201);
  } catch (cause) {
    if (cause instanceof PaymentError) {
      return err(c, cause.message, cause.status, { code: cause.code });
    }
    c.get("logger")?.error("payments.intent.unhandled", {
      bookingId,
      err: cause as Error,
    });
    return err(c, "Could not create payment", 500);
  }
});

paymentRoutes.get("/intent/:id", paymentLimiter, async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const intentId = c.req.param("id");

  // Look up via our payments table — never query Stripe directly here.
  // The webhook is authoritative; this endpoint just reads our projection.
  const [row] = await db
    .select({
      stripeIntentId: payments.stripeIntentId,
      status: payments.status,
      amountPence: payments.amountPence,
      currency: payments.currency,
      lastErrorMessage: payments.lastErrorMessage,
      bookingId: payments.bookingId,
      customerId: payments.customerId,
    })
    .from(payments)
    .where(eq(payments.stripeIntentId, intentId))
    .limit(1);

  if (!row) return err(c, "Intent not found", 404);
  if (row.customerId !== payload.sub) return err(c, "Intent not found", 404);

  return ok(c, {
    intentId: row.stripeIntentId,
    bookingId: row.bookingId,
    status: row.status,
    amountPence: row.amountPence,
    currency: row.currency,
    lastErrorMessage: row.lastErrorMessage,
  });
});
