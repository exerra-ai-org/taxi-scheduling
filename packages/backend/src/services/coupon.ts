import { db } from "../db/index";
import { coupons } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";

interface CouponRecord {
  id: number;
  code: string;
  discountType: "fixed" | "percentage";
  discountValue: number;
  expiresAt: Date | null;
  maxUses: number | null;
  currentUses: number;
}

export async function validateCoupon(
  code: string,
  executor: any = db,
): Promise<{ valid: boolean; coupon?: CouponRecord; reason?: string }> {
  const results = await executor
    .select()
    .from(coupons)
    .where(sql`UPPER(${coupons.code}) = UPPER(${code})`);

  if (results.length === 0) {
    return { valid: false, reason: "Coupon not found" };
  }

  const coupon = results[0];

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return { valid: false, reason: "Coupon has expired" };
  }

  if (coupon.maxUses !== null && coupon.currentUses >= coupon.maxUses) {
    return { valid: false, reason: "Coupon usage limit reached" };
  }

  return { valid: true, coupon };
}

export function applyCoupon(
  coupon: CouponRecord,
  pricePence: number,
): { discountPence: number; finalPricePence: number } {
  let discountPence: number;

  if (coupon.discountType === "percentage") {
    discountPence = Math.round((pricePence * coupon.discountValue) / 100);
  } else {
    discountPence = Math.min(coupon.discountValue, pricePence);
  }

  return {
    discountPence,
    finalPricePence: pricePence - discountPence,
  };
}

export async function reserveCouponUsage(
  couponId: number,
  executor: any = db,
): Promise<boolean> {
  const updated = await executor
    .update(coupons)
    .set({ currentUses: sql`${coupons.currentUses} + 1` })
    .where(
      and(
        eq(coupons.id, couponId),
        sql`(${coupons.expiresAt} IS NULL OR ${coupons.expiresAt} > NOW())`,
        sql`(${coupons.maxUses} IS NULL OR ${coupons.currentUses} < ${coupons.maxUses})`,
      ),
    )
    .returning({ id: coupons.id });

  return updated.length > 0;
}
