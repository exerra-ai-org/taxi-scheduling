import { api } from "./client";
import type {
  Booking,
  BookingStatus,
  DriverLocation,
  Vehicle,
  VehicleClass,
} from "shared/types";

// Customer-scope GET /bookings adds these fields per backend spec.
export type CustomerBooking = Booking & {
  primaryDriverName?: string | null;
  primaryDriverPhone?: string | null;
  reviewRating?: number | null;
};

export interface BookingAssignment {
  id: number;
  driverId: number;
  role: "primary" | "backup";
  isActive: boolean;
  assignedAt: string;
  driverName: string;
  driverPhone: string | null;
  driverProfilePicture: string | null;
  driverProfile: {
    vehicleMake: string | null;
    vehicleModel: string | null;
    vehicleYear: number | null;
    vehicleColor: string | null;
    licensePlate: string | null;
    vehicleClass: string | null;
    bio: string | null;
  } | null;
  avgRating: number | null;
  totalReviews: number;
}

export interface BookingReview {
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface PaymentRow {
  id: number;
  bookingId: number;
  customerId: number;
  stripeIntentId: string;
  intentType: "payment_intent" | "setup_intent";
  status: string;
  amountPence: number;
  currency: string;
  stripeChargeId: string | null;
  paymentMethodId: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
}

export interface RefundRow {
  id: number;
  bookingId: number;
  paymentId: number;
  stripeRefundId: string;
  amountPence: number;
  reason: string;
  adminNote: string | null;
  initiatedByUserId: number | null;
  status: string;
  failureReason: string | null;
  createdAt: string;
}

export interface PaymentTrail {
  payments: PaymentRow[];
  refunds: RefundRow[];
}

export interface BookingDetail {
  booking: Booking;
  assignments: BookingAssignment[];
  vehicle?: Vehicle | null;
  review?: BookingReview | null;
  paymentTrail?: PaymentTrail | null;
}

export type AdminRefundReason =
  | "requested_by_customer"
  | "duplicate"
  | "fraudulent"
  | "service_failure"
  | "route_change"
  | "other";

export interface RefundResult {
  refundId: string;
  amountPence: number;
  status: string;
  remainingRefundablePence: number;
}

export function refundBooking(
  id: number,
  input: {
    amountPence?: number | null;
    reason: AdminRefundReason;
    adminNote?: string | null;
  },
) {
  return api.post<{ refund: RefundResult }>(`/bookings/${id}/refund`, input);
}

export interface CreateBookingInput {
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt: string;
  vehicleClass?: VehicleClass;
  pickupLat?: number;
  pickupLon?: number;
  dropoffLat?: number;
  dropoffLon?: number;
  couponCode?: string;
  pickupFlightNumber?: string;
  dropoffFlightNumber?: string;
}

export interface BookingPaymentInit {
  clientSecret: string;
  intentId: string;
  intentType: "payment_intent" | "setup_intent";
  amountPence: number;
  publishableKey: string;
}

export function createBooking(input: CreateBookingInput) {
  return api.post<{ booking: Booking; payment: BookingPaymentInit | null }>(
    "/bookings",
    input,
  );
}

export function listBookings() {
  return api.get<{ bookings: CustomerBooking[] }>("/bookings");
}

export function getBooking(id: number) {
  return api.get<BookingDetail>(`/bookings/${id}`);
}

export function updateBookingStatus(id: number, status: BookingStatus) {
  return api.patch<{ booking: Booking }>(`/bookings/${id}/status`, {
    status,
  });
}

export interface CancellationDecision {
  action: "void" | "partial_capture" | "full_capture";
  feePence: number;
  refundablePence: number;
  reason: string;
  window: "outside_full_refund" | "partial_window" | "no_refund_window";
}

export function getCancelPreview(id: number) {
  return api.get<{ decision: CancellationDecision }>(
    `/bookings/${id}/cancel-preview`,
  );
}

export function cancelBooking(id: number) {
  return api.patch<{
    booking: Booking;
    cancellation: CancellationDecision | null;
  }>(`/bookings/${id}/cancel`);
}

export function assignDrivers(
  id: number,
  primaryDriverId: number,
  backupDriverId: number,
) {
  return api.post<{ booking: Booking; assignments: BookingAssignment[] }>(
    `/bookings/${id}/assign`,
    { primaryDriverId, backupDriverId },
  );
}

export function triggerFallback(id: number) {
  return api.post<{ message: string; assignments: BookingAssignment[] }>(
    `/bookings/${id}/fallback`,
  );
}

export function getDriverLocation(id: number) {
  return api.get<DriverLocation>(`/bookings/${id}/driver-location`);
}

export interface Incident {
  id: number;
  bookingId: number;
  type: "emergency" | "contact_admin";
  message: string | null;
  createdAt: string;
}

export function reportIncident(
  id: number,
  type: "emergency" | "contact_admin",
  message?: string,
) {
  return api.post<{ incident: Incident }>(`/bookings/${id}/incident`, {
    type,
    message,
  });
}
