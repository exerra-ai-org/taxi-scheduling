import { api } from "./client";
import type { Coupon, DiscountType } from "shared/types";

export interface CouponValidation {
  valid: boolean;
  code?: string;
  discountType?: DiscountType;
  discountValue?: number;
  reason?: string;
}

export function validateCoupon(code: string) {
  return api.post<CouponValidation>("/api/coupons/validate", { code });
}

export function listCoupons() {
  return api.get<{ coupons: Coupon[] }>("/api/coupons");
}

export interface CreateCouponInput {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  expiresAt?: string;
  maxUses?: number;
}

export function createCoupon(input: CreateCouponInput) {
  return api.post<{ coupon: Coupon }>("/api/coupons", input);
}
