export type UserRole = "customer" | "admin" | "driver";

export type BookingStatus =
  | "scheduled"
  | "assigned"
  | "en_route"
  | "arrived"
  | "completed"
  | "cancelled";

export type DriverAssignmentRole = "primary" | "backup";

export type DiscountType = "fixed" | "percentage";

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

export interface PricingQuote {
  pricePence: number;
  routeType: "fixed" | "zone";
  routeName: string | null;
  isAirport: boolean;
}
