import { api } from "./client";

export type Settings = {
  adminContactPhone: string;
  emergencyNumber: string;
  waitingFreeMinutes: string;
  waitingRatePence: string;
  waitingIncrementMinutes: string;
  noShowAfterMinutes: string;
};

export type PublicSettings = Pick<
  Settings,
  "adminContactPhone" | "emergencyNumber"
>;

export function getPublicSettings() {
  return api.get<PublicSettings>("/settings/public");
}

export function getAdminSettings() {
  return api.get<Settings>("/settings");
}

export function updateSettings(updates: Partial<Settings>) {
  return api.put<Settings>("/settings", { updates });
}
