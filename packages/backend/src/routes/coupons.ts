import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { createCouponSchema, validateCouponSchema } from "shared/validation";
import { db } from "../db/index";
import { coupons } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/auth";
import { ok, err } from "../lib/response";
import { validateCoupon } from "../services/coupon";

export const couponRoutes = new Hono();

// Public: validate a coupon code
couponRoutes.post("/validate", async (c) => {
  const body = await c.req.json();
  const parsed = validateCouponSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400);
  }

  const result = await validateCoupon(parsed.data.code);

  if (!result.valid) {
    return ok(c, { valid: false, reason: result.reason });
  }

  return ok(c, {
    valid: true,
    discountType: result.coupon!.discountType,
    discountValue: result.coupon!.discountValue,
    code: result.coupon!.code,
  });
});

// Admin: create coupon
couponRoutes.post("/", authMiddleware, requireRole("admin"), async (c) => {
  const body = await c.req.json();
  const parsed = createCouponSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  try {
    const [coupon] = await db
      .insert(coupons)
      .values({
        code: parsed.data.code,
        discountType: parsed.data.discountType,
        discountValue: parsed.data.discountValue,
        expiresAt: parsed.data.expiresAt
          ? new Date(parsed.data.expiresAt)
          : null,
        maxUses: parsed.data.maxUses ?? null,
      })
      .returning();

    return ok(c, { coupon }, 201);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("unique")) {
      return err(c, "Coupon code already exists", 409);
    }
    throw e;
  }
});

// Admin: list coupons
couponRoutes.get("/", authMiddleware, requireRole("admin"), async (c) => {
  const results = await db.select().from(coupons).orderBy(desc(coupons.id));
  return ok(c, { coupons: results });
});
