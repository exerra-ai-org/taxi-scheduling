import { api } from "./client";
import type { Booking, PricingQuote } from "shared/types";

export async function getQuote(from: string, to: string) {
  return api.get<PricingQuote>(
    `/api/pricing/quote?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export async function createBooking(data: {
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt: string;
  couponCode?: string;
}) {
  return api.post<{ booking: Booking }>("/api/bookings", data);
}

export async function listBookings() {
  return api.get<{ bookings: Booking[] }>("/api/bookings");
}

export async function getBooking(id: number) {
  return api.get<{
    booking: Booking;
    assignments: {
      id: number;
      driverId: number;
      role: string;
      isActive: boolean;
      assignedAt: string;
      driverName: string;
      driverPhone: string;
    }[];
  }>(`/api/bookings/${id}`);
}

export async function cancelBooking(id: number) {
  return api.patch<{ booking: Booking }>(`/api/bookings/${id}/cancel`);
}
