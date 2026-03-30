import { z } from "zod";

// Booking time constraints
export const BOOKING_MIN_HOURS_STANDARD = 4;
export const BOOKING_MIN_HOURS_LONDON = 2;
export const BOOKING_MAX_DAYS = 30;

export const bookingStatusEnum = z.enum([
  "scheduled",
  "assigned",
  "en_route",
  "arrived",
  "completed",
  "cancelled",
]);

export const userRoleEnum = z.enum(["customer", "admin", "driver"]);

export const createBookingSchema = z.object({
  pickupAddress: z.string().min(1),
  dropoffAddress: z.string().min(1),
  scheduledAt: z.string().datetime(),
  couponCode: z.string().optional(),
  pickupLat: z.number().optional(),
  pickupLon: z.number().optional(),
  dropoffLat: z.number().optional(),
  dropoffLon: z.number().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
});

export const updateBookingStatusSchema = z.object({
  status: bookingStatusEnum,
});

export const assignDriversSchema = z.object({
  primaryDriverId: z.number().int().positive(),
  backupDriverId: z.number().int().positive(),
});

export const createCouponSchema = z.object({
  code: z.string().min(1).max(50),
  discountType: z.enum(["fixed", "percentage"]),
  discountValue: z.number().positive(),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
});

export const validateCouponSchema = z.object({
  code: z.string().min(1),
});

export const createReviewSchema = z.object({
  bookingId: z.number().int().positive(),
  driverId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const pricingQuoteSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  fromLat: z.coerce.number().optional(),
  fromLon: z.coerce.number().optional(),
  toLat: z.coerce.number().optional(),
  toLon: z.coerce.number().optional(),
});
