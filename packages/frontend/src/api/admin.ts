import { api } from "./client";
import type { Booking, BookingStatus, Coupon, FixedRoute } from "shared/types";

export async function listAllBookings() {
  return api.get<{ bookings: Booking[] }>("/api/bookings");
}

export async function getBookingDetail(id: number) {
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

export async function updateBookingStatus(id: number, status: BookingStatus) {
  return api.patch<{ booking: Booking }>(`/api/bookings/${id}/status`, {
    status,
  });
}

export async function assignDrivers(
  id: number,
  primaryDriverId: number,
  backupDriverId: number,
) {
  return api.post(`/api/bookings/${id}/assign`, {
    primaryDriverId,
    backupDriverId,
  });
}

export async function triggerFallback(id: number) {
  return api.post(`/api/bookings/${id}/fallback`);
}

export async function listDrivers() {
  return api.get<{
    drivers: {
      id: number;
      email: string;
      name: string;
      phone: string;
      createdAt: string;
      upcomingAssignments: number;
    }[];
  }>("/api/drivers");
}

export async function runDriverWatchdog() {
  return api.post<{
    checked: number;
    warnings: number[];
    fallbacks: number[];
    config: { staleMinutes: number; fallbackWindows: number };
  }>("/api/drivers/watchdog");
}

export async function listCoupons() {
  return api.get<{ coupons: Coupon[] }>("/api/coupons");
}

export async function createCoupon(data: {
  code: string;
  discountType: "fixed" | "percentage";
  discountValue: number;
  expiresAt?: string;
  maxUses?: number;
}) {
  return api.post<{ coupon: Coupon }>("/api/coupons", data);
}

export async function listFixedRoutes() {
  return api.get<{ routes: FixedRoute[] }>("/api/fixed-routes");
}

export async function createFixedRoute(data: {
  name: string;
  fromLabel: string;
  toLabel: string;
  pricePence: number;
  isAirport?: boolean;
}) {
  return api.post<{ route: FixedRoute }>("/api/fixed-routes", data);
}

export async function updateFixedRoute(
  id: number,
  data: Partial<{
    name: string;
    fromLabel: string;
    toLabel: string;
    pricePence: number;
    isAirport: boolean;
  }>,
) {
  return api.patch<{ route: FixedRoute }>(`/api/fixed-routes/${id}`, data);
}

export async function deleteFixedRoute(id: number) {
  return api.delete<{ route: FixedRoute }>(`/api/fixed-routes/${id}`);
}
