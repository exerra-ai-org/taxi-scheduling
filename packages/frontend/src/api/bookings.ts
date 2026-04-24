import { api } from "./client";
import type { Booking, PricingQuote, PricingQuoteMulti } from "shared/types";

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

export async function getQuoteAllClasses(
  from: string,
  to: string,
  opts?: {
    fromLat?: number;
    fromLon?: number;
    toLat?: number;
    toLon?: number;
  },
) {
  const params = new URLSearchParams({ from, to });
  if (opts?.fromLat != null) params.set("fromLat", String(opts.fromLat));
  if (opts?.fromLon != null) params.set("fromLon", String(opts.fromLon));
  if (opts?.toLat != null) params.set("toLat", String(opts.toLat));
  if (opts?.toLon != null) params.set("toLon", String(opts.toLon));
  return api.get<PricingQuoteMulti>(
    `/api/pricing/quote-all?${params.toString()}`,
  );
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
  pickupFlightNumber?: string;
  dropoffFlightNumber?: string;
  vehicleClass?: string;
}) {
  return api.post<{ booking: Booking }>("/api/bookings", data);
}

export async function updateBooking(
  id: number,
  data: {
    scheduledAt?: string;
    pickupFlightNumber?: string | null;
    dropoffFlightNumber?: string | null;
    pickupAddress?: string;
    dropoffAddress?: string;
    pickupLat?: number | null;
    pickupLon?: number | null;
    dropoffLat?: number | null;
    dropoffLon?: number | null;
  },
) {
  return api.patch<{ booking: Booking }>(`/api/bookings/${id}`, data);
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
    vehicle: {
      id: number;
      class: string;
      name: string;
      passengerCapacity: number;
      baggageCapacity: number;
      description: string | null;
      imageUrl: string | null;
    } | null;
  }>(`/api/bookings/${id}`);
}

export async function cancelBooking(id: number) {
  return api.patch<{ booking: Booking }>(`/api/bookings/${id}/cancel`);
}

export async function getDriverLocation(bookingId: number) {
  return api.get<{
    lat: number | null;
    lon: number | null;
    lastUpdatedAt: string | null;
  }>(`/api/bookings/${bookingId}/driver-location`);
}
