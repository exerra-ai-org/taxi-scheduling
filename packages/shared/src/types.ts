export type VehicleClass = "regular" | "comfort" | "max";

export type UserRole = "customer" | "admin" | "driver";

export type BookingStatus =
  | "scheduled"
  | "assigned"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export type DriverAssignmentRole = "primary" | "backup";

export type DiscountType = "fixed" | "percentage";

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "requires_action"
  | "authorized"
  | "captured"
  | "partially_refunded"
  | "refunded"
  | "failed"
  | "disputed"
  | "uncollectible";

export interface User {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  createdAt: Date;
}

export interface Zone {
  id: number;
  name: string;
  label: string;
  boundary?: object | null;
  centerLat?: number | null;
  centerLon?: number | null;
}

export interface ZonePricing {
  id: number;
  fromZoneId: number;
  toZoneId: number;
  pricePence: number;
  vehicleType: string;
}

export interface Vehicle {
  id: number;
  class: VehicleClass;
  name: string;
  passengerCapacity: number;
  baggageCapacity: number;
  description: string | null;
  imageUrl: string | null;
}

export interface MileRate {
  id: number;
  vehicleClass: VehicleClass;
  baseFarePence: number;
  ratePerMilePence: number;
}

export interface FixedRoute {
  id: number;
  name: string;
  fromLabel: string;
  toLabel: string;
  pricePence: number;
  vehicleType: string;
  isAirport: boolean;
}

export interface Booking {
  id: number;
  customerId: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat?: number | null;
  pickupLon?: number | null;
  dropoffLat?: number | null;
  dropoffLon?: number | null;
  pickupZoneId: number | null;
  dropoffZoneId: number | null;
  fixedRouteId: number | null;
  scheduledAt: Date;
  pricePence: number;
  discountPence: number;
  couponId: number | null;
  status: BookingStatus;
  isAirport: boolean;
  flightNumber?: string | null;
  pickupFlightNumber?: string | null;
  dropoffFlightNumber?: string | null;
  vehicleClass: VehicleClass;
  distanceMiles?: number | null;
  ratePerMilePence?: number | null;
  baseFarePence?: number | null;
  hasReview?: boolean;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentStatus: PaymentStatus;
  amountAuthorizedPence: number;
  amountCapturedPence: number;
  amountRefundedPence: number;
  cancellationFeePence: number;
  paymentHoldExpiresAt?: string | Date | null;
  activePaymentIntentId?: string | null;
  // Cash flow
  paymentMethod?: "card" | "cash";
  depositPence?: number;
  balanceDuePence?: number;
  cashCollectedAt?: string | Date | null;
  // Arrival + waiting fee
  driverArrivedAt?: string | Date | null;
  customerArrivedAt?: string | Date | null;
  waitingFeePence?: number;
  noShowAt?: string | Date | null;
  createdAt: Date;
}

export interface DriverAssignment {
  id: number;
  bookingId: number;
  driverId: number;
  role: DriverAssignmentRole;
  isActive: boolean;
  assignedAt: Date;
}

export interface Coupon {
  id: number;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  expiresAt: Date | null;
  maxUses: number | null;
  currentUses: number;
}

export interface Review {
  id: number;
  bookingId: number;
  customerId: number;
  driverId: number;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export interface DriverHeartbeat {
  id: number;
  bookingId: number;
  driverId: number;
  lastHeartbeatAt: Date;
  missedWindows: number;
  lat?: number | null;
  lon?: number | null;
}

export interface NotificationSubscription {
  id: number;
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
}

export interface PricingQuote {
  pricePence: number;
  routeType: "fixed" | "mile";
  routeName: string | null;
  isAirport: boolean;
  distanceMiles?: number | null;
  baseFarePence?: number | null;
  ratePerMilePence?: number | null;
}

export interface PricingQuoteMulti {
  quotes: {
    vehicleClass: VehicleClass;
    pricePence: number;
    baseFarePence?: number;
    ratePerMilePence?: number;
  }[];
  routeType: "fixed" | "mile";
  routeName: string | null;
  isAirport: boolean;
  isPickupAirport?: boolean;
  isDropoffAirport?: boolean;
  distanceMiles?: number | null;
}

export interface DriverLocation {
  lat: number | null;
  lon: number | null;
  lastUpdatedAt: string | null;
  distanceMiles: number | null;
}

export interface DriverProfile {
  driverId: number;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleColor: string | null;
  licensePlate: string | null;
  vehicleClass: VehicleClass | null;
  bio: string | null;
}

export interface PublicDriverProfile {
  id: number;
  name: string;
  profilePictureUrl: string | null;
  avgRating: number | null;
  totalReviews: number;
  vehicle: DriverProfile | null;
}

export interface LiveDriver {
  driverId: number;
  name: string;
  phone: string | null;
  vehicle: DriverProfile | null;
  lat: number;
  lon: number;
  lastSeenAt: string;
  isOnDuty: boolean;
  activeBooking: {
    id: number;
    status: BookingStatus;
    pickupAddress: string;
    dropoffAddress: string;
    pickupLat: number | null;
    pickupLon: number | null;
    dropoffLat: number | null;
    dropoffLon: number | null;
    customerName: string;
    scheduledAt: string;
  } | null;
}
