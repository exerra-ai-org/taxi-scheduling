import { api, API_BASE } from "./client";

export async function uploadProfilePicture(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/upload/profile-picture`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || "Upload failed");
  return json.data.url as string;
}
import type { DriverHeartbeat } from "shared/types";

export interface AdminDriverRow {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  createdAt: string;
  upcomingAssignments: number;
  profile: {
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

export function listDrivers() {
  return api.get<{ drivers: AdminDriverRow[] }>("/drivers");
}

export function inviteDriver(
  email: string,
  name: string,
  role: "driver" | "admin",
) {
  return api.post<{
    user: { id: number; email: string; name: string; role: string };
  }>("/admin/invite", { email, name, role });
}

export interface DriverSelfProfile {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  profilePictureUrl: string | null;
  profile: AdminDriverRow["profile"];
  avgRating: number | null;
  totalReviews: number;
}

export function getMyProfile() {
  return api.get<{ driver: DriverSelfProfile }>("/drivers/me/profile");
}

export function updateMyProfile(data: {
  profilePictureUrl?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleColor?: string;
  licensePlate?: string;
  vehicleClass?: "regular" | "comfort" | "max";
  bio?: string;
}) {
  return api.put<{
    profile: AdminDriverRow["profile"];
    profilePictureUrl: string | null;
  }>("/drivers/me/profile", data);
}

export function sendHeartbeat(input: {
  bookingId: number;
  lat?: number;
  lon?: number;
  accuracyM?: number;
  speedMps?: number;
}) {
  return api.post<{ heartbeat: DriverHeartbeat }>("/drivers/heartbeat", input);
}

export interface BookingPathPoint {
  lat: number;
  lon: number;
  accuracyM: number | null;
  speedMps: number | null;
  recordedAt: string;
}

// Server returns either:
//   - `points` (raw filtered GPS fixes) for active rides
//   - `points: []` plus `snappedPath` (cached road-snapped polyline) for
//     completed rides whose path has been computed and cached
// The frontend uses snappedPath verbatim when present; otherwise it runs
// its own client-side snap on points.
export type SnappedPolyline = [number, number][];

export function getBookingPath(bookingId: number) {
  return api.get<{
    points: BookingPathPoint[];
    snappedPath?: SnappedPolyline | null;
  }>(`/admin/bookings/${bookingId}/path`);
}

export function sendPresence(input: {
  isOnDuty: boolean;
  lat?: number;
  lon?: number;
}) {
  return api.post<{ isOnDuty: boolean }>("/drivers/presence", input);
}

import type { LiveDriver } from "shared/types";

export function listLiveDrivers() {
  return api.get<{ drivers: LiveDriver[] }>("/admin/drivers/live");
}

export interface WatchdogResult {
  checked: number;
  warnings: number[];
  fallbacks: number[];
  config: { warningWindowMs: number; fallbackWindowMs: number };
}

export function runWatchdog() {
  return api.post<WatchdogResult>("/drivers/watchdog");
}
