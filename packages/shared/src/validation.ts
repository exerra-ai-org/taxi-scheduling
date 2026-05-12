import { z } from "zod";

// Booking time constraints
export const BOOKING_MIN_HOURS_STANDARD = 4;
export const BOOKING_MIN_HOURS_LONDON = 4;
export const BOOKING_MAX_DAYS = 30;

export const bookingStatusEnum = z.enum([
  "scheduled",
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
]);

export const userRoleEnum = z.enum(["customer", "admin", "driver"]);

export const vehicleClassSchema = z.enum(["regular", "comfort", "max"]);

export const updateVehicleSchema = z.object({
  passengerCapacity: z.number().int().min(1).max(20).optional(),
  baggageCapacity: z.number().int().min(0).max(20).optional(),
});

export const updateMileRateSchema = z.object({
  baseFarePence: z.number().int().min(0).optional(),
  ratePerMilePence: z.number().int().min(0).optional(),
});

export const paymentMethodSchema = z.enum(["card", "cash"]);
// Cash bookings collect a fixed % of fare as a Stripe deposit and the
// rest in person. Anchored here so frontend + backend agree.
export const CASH_DEPOSIT_PERCENT = 25;

export const createBookingSchema = z.object({
  pickupAddress: z.string().min(1),
  dropoffAddress: z.string().min(1),
  scheduledAt: z.string().datetime(),
  couponCode: z.string().optional(),
  pickupLat: z.number().optional(),
  pickupLon: z.number().optional(),
  dropoffLat: z.number().optional(),
  dropoffLon: z.number().optional(),
  flightNumber: z.string().max(10).optional(),
  pickupFlightNumber: z.string().max(10).optional(),
  dropoffFlightNumber: z.string().max(10).optional(),
  vehicleClass: vehicleClassSchema.default("regular"),
  // Defaults to card. `cash` switches the Stripe charge to a 25% deposit
  // and lifts the auth-horizon guard for long-lead bookings.
  paymentMethod: paymentMethodSchema.default("card"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
  phone: z.string().min(6).optional(),
});

export const checkEmailSchema = z.object({
  email: z.string().email(),
});

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().min(6).optional(),
  password: z.string().min(8).optional(),
  // Required from the sign-up form. Must be literal true so an unchecked
  // checkbox can never bypass the gate.
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms to continue" }),
  }),
});

export const magicLinkRequestSchema = z.object({
  email: z.string().email(),
});

export const magicLinkVerifySchema = z.object({
  token: z.string().min(1),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetVerifySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["driver", "admin"]),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const driverProfileSchema = z.object({
  vehicleMake: z.string().min(1).optional(),
  vehicleModel: z.string().min(1).optional(),
  vehicleYear: z.number().int().min(1990).max(2100).optional(),
  vehicleColor: z.string().min(1).optional(),
  licensePlate: z.string().min(1).optional(),
  vehicleClass: z.enum(["regular", "comfort", "max"]).optional(),
  bio: z.string().max(500).optional(),
  profilePictureUrl: z.string().url().optional(),
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

export const createFixedRouteSchema = z.object({
  name: z.string().min(1).max(120),
  fromLabel: z.string().min(1).max(120),
  toLabel: z.string().min(1).max(120),
  pricePence: z.number().int().positive(),
  isAirport: z.boolean().optional(),
});

export const updateFixedRouteSchema = createFixedRouteSchema.partial().extend({
  id: z.number().int().positive().optional(),
});

export const driverHeartbeatSchema = z.object({
  bookingId: z.number().int().positive(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  // accuracy in meters; speed in m/s. Both come straight from the browser's
  // GeolocationPosition.coords and are forwarded so we can score points when
  // computing actual ride distance later.
  accuracyM: z.number().nonnegative().optional(),
  speedMps: z.number().optional(),
});

export const driverPresenceSchema = z.object({
  isOnDuty: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
});

export const notificationSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const notificationUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(5).optional().nullable(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(5).optional().nullable(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const reportIncidentSchema = z.object({
  type: z.enum(["emergency", "contact_admin"]),
  message: z.string().max(500).optional(),
});

export const pricingQuoteSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  fromLat: z.coerce.number().optional(),
  fromLon: z.coerce.number().optional(),
  toLat: z.coerce.number().optional(),
  toLon: z.coerce.number().optional(),
  vehicleClass: vehicleClassSchema.optional(),
});
