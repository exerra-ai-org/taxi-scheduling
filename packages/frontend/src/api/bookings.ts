import { api } from "./client";
import type { Booking, PricingQuote } from "shared/types";

export async function getQuote(
  from: string,
  to: string,
  opts?: {
    fromLat?: number;
    fromLon?: number;
    toLat?: number;
    toLon?: number;
  },
) {
  const params = new URLSearchParams({
    from,
    to,
  });
  if (opts?.fromLat != null) params.set("fromLat", String(opts.fromLat));
  if (opts?.fromLon != null) params.set("fromLon", String(opts.fromLon));
  if (opts?.toLat != null) params.set("toLat", String(opts.toLat));
  if (opts?.toLon != null) params.set("toLon", String(opts.toLon));

  return api.get<PricingQuote>(`/api/pricing/quote?${params.toString()}`);
}

export async function createBooking(data: {
  pickupAddress: string;
  dropoffAddress: string;
  scheduledAt: string;
  couponCode?: string;
  pickupLat?: number;
  pickupLon?: number;
  dropoffLat?: number;
  dropoffLon?: number;
}) {
  return api.post<{ booking: Booking }>("/api/bookings", data);
}

export async function listBookings() {
  return api.get<{ bookings: Array<Booking & { hasReview?: boolean }> }>(
    "/api/bookings",
  );
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
