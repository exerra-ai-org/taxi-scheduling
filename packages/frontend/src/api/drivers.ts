import { api } from "./client";
import type { DriverHeartbeat } from "shared/types";

export interface AdminDriverRow {
  id: number;
  email: string;
  name: string;
  phone: string;
  createdAt: string;
  upcomingAssignments: number;
}

export function listDrivers() {
  return api.get<{ drivers: AdminDriverRow[] }>("/api/drivers");
}

export function sendHeartbeat(input: {
  bookingId: number;
  lat?: number;
  lon?: number;
}) {
  return api.post<{ heartbeat: DriverHeartbeat }>(
    "/api/drivers/heartbeat",
    input,
  );
}

export interface WatchdogResult {
  checked: number;
  warnings: number[];
  fallbacks: number[];
  config: { warningWindowMs: number; fallbackWindowMs: number };
}

export function runWatchdog() {
  return api.post<WatchdogResult>("/api/drivers/watchdog");
}
