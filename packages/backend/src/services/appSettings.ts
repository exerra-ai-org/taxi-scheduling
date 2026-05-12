// Runtime-tunable settings backed by the `app_settings` kv table.
// All values are strings on disk; helpers coerce on read. Public-readable
// keys are listed explicitly — everything else requires admin auth.

import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { appSettings } from "../db/schema";

export const PUBLIC_SETTING_KEYS = [
  "adminContactPhone",
  "emergencyNumber",
] as const;

export const ADMIN_SETTING_KEYS = [
  "adminContactPhone",
  "emergencyNumber",
  "waitingFreeMinutes",
  "waitingRatePence",
  "waitingIncrementMinutes",
  "noShowAfterMinutes",
  // Geofence — when the driver's GPS sits inside `pickupRadiusM` of the
  // pickup for `pickupDwellMs` and the booking is en_route, auto-flip to
  // arrived. Off by default to preserve existing behaviour.
  "geofenceAutoArrive",
  "geofencePickupRadiusM",
  "geofencePickupDwellMs",
] as const;

export type SettingKey = (typeof ADMIN_SETTING_KEYS)[number];

const DEFAULTS: Record<SettingKey, string> = {
  adminContactPhone: "",
  emergencyNumber: "999",
  waitingFreeMinutes: "30",
  waitingRatePence: "200",
  waitingIncrementMinutes: "5",
  noShowAfterMinutes: "45",
  geofenceAutoArrive: "false",
  geofencePickupRadiusM: "75",
  geofencePickupDwellMs: "20000",
};

export async function getSetting(key: SettingKey): Promise<string> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return row?.value ?? DEFAULTS[key];
}

export async function getSettingInt(key: SettingKey): Promise<number> {
  const raw = await getSetting(key);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : Number(DEFAULTS[key]);
}

export async function getSettingBool(key: SettingKey): Promise<boolean> {
  const raw = (await getSetting(key)).toLowerCase().trim();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "") return false;
  // Unknown value — fall back to the default rather than silently coercing.
  return DEFAULTS[key].toLowerCase() === "true";
}

export async function getAllSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings);
  const out: Record<string, string> = { ...DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out as Record<SettingKey, string>;
}

export async function getPublicSettings(): Promise<Record<string, string>> {
  const all = await getAllSettings();
  const out: Record<string, string> = {};
  for (const key of PUBLIC_SETTING_KEYS) out[key] = all[key];
  return out;
}

export async function setSetting(
  key: SettingKey,
  value: string,
): Promise<void> {
  // Upsert via ON CONFLICT — keeps a single row per key.
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export function isAdminSettingKey(k: string): k is SettingKey {
  return (ADMIN_SETTING_KEYS as readonly string[]).includes(k);
}
