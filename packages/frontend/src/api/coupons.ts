import { api } from "./client";

interface CouponValidation {
  valid: boolean;
  code?: string;
  discountType?: "fixed" | "percentage";
  discountValue?: number;
  reason?: string;
}

export async function validateCoupon(code: string) {
  return api.post<CouponValidation>("/api/coupons/validate", { code });
}
