import { api } from "./client";
import type {
  Booking,
  BookingStatus,
  DriverLocation,
  Vehicle,
  VehicleClass,
} from "shared/types";

// Customer-scope GET /api/bookings adds these fields per backend spec.
export type CustomerBooking = Booking & {
  primaryDriverName?: string | null;
  primaryDriverPhone?: string | null;
};

export interface BookingAssignment {
  id: number;
  driverId: number;
  role: "primary" | "backup";
  isActive: boolean;
  assignedAt: string;
  driverName: string;
  driverPhone: string;
}

export interface BookingDetail {
  booking: Booking;
  assignments: BookingAssignment[];
  vehicle?: Vehicle | null;
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

export function createBooking(input: CreateBookingInput) {
  return api.post<{ booking: Booking }>("/api/bookings", input);
}

export function listBookings() {
  return api.get<{ bookings: CustomerBooking[] }>("/api/bookings");
}

export function getBooking(id: number) {
  return api.get<BookingDetail>(`/api/bookings/${id}`);
}

export interface UpdateBookingInput {
  scheduledAt?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  pickupLat?: number | null;
  pickupLon?: number | null;
  dropoffLat?: number | null;
  dropoffLon?: number | null;
  pickupFlightNumber?: string | null;
  dropoffFlightNumber?: string | null;
}

export function updateBooking(id: number, input: UpdateBookingInput) {
  return api.patch<{ booking: Booking }>(`/api/bookings/${id}`, input);
}

export function updateBookingStatus(id: number, status: BookingStatus) {
  return api.patch<{ booking: Booking }>(`/api/bookings/${id}/status`, {
    status,
  });
}

export function cancelBooking(id: number) {
  return api.patch<{ booking: Booking }>(`/api/bookings/${id}/cancel`);
}

export function assignDrivers(
  id: number,
  primaryDriverId: number,
  backupDriverId: number,
) {
  return api.post<{ booking: Booking; assignments: BookingAssignment[] }>(
    `/api/bookings/${id}/assign`,
    { primaryDriverId, backupDriverId },
  );
}

export function triggerFallback(id: number) {
  return api.post<{ message: string; assignments: BookingAssignment[] }>(
    `/api/bookings/${id}/fallback`,
  );
}

export function getDriverLocation(id: number) {
  return api.get<DriverLocation>(`/api/bookings/${id}/driver-location`);
}
