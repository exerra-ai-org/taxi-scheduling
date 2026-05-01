import { validateRuntimeConfig } from "./lib/configValidation";
import { readDbPoolConfig } from "./lib/dbPoolConfig";

const nodeEnv = process.env.NODE_ENV || "development";

validateRuntimeConfig({
  nodeEnv,
  jwtSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL,
});

const dbPool = readDbPoolConfig(process.env);

export const config = {
  env: nodeEnv as "development" | "production" | "test",
  isProduction: nodeEnv === "production",

  server: {
    port: Number(process.env.PORT) || 3000,
  },

  database: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/taxi",
    pool: dbPool,
  },

  cors: {
    origins: (process.env.CORS_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((s) => s.trim()),
  },

  jwt: {
    secret: process.env.JWT_SECRET || "dev-secret-change-me",
    cookieName: "token",
    expiresInSeconds:
      Number(process.env.JWT_EXPIRES_IN_SECONDS) || 60 * 60 * 24 * 7,
  },

  app: {
    name: process.env.APP_NAME || "Taxi Concierge",
    // Frontend URL — used in email links (magic link, password reset, invitations)
    baseUrl: (process.env.APP_BASE_URL || "http://localhost:5173").replace(
      /\/$/,
      "",
    ),
    // Backend's own public URL — used to construct uploaded-file download URLs
    selfUrl: (process.env.APP_SELF_URL || "http://localhost:3000").replace(
      /\/$/,
      "",
    ),
  },

  email: {
    from: process.env.EMAIL_FROM || "",
    resendApiKey: process.env.RESEND_API_KEY,
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },

  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || "mailto:ops@taxi.local",
  },

  drivers: {
    heartbeatStaleMinutes: Math.max(
      1,
      Number(process.env.DRIVER_HEARTBEAT_STALE_MINUTES) || 5,
    ),
    heartbeatFallbackWindows: Math.max(
      1,
      Number(process.env.DRIVER_HEARTBEAT_FALLBACK_WINDOWS) || 2,
    ),
  },

  geofence: {
    // Auto-flip en_route → arrived once driver dwells inside the pickup
    // radius for the dwell window. Off by default; flip via env to ship.
    autoArrive: process.env.GEOFENCE_AUTO_ARRIVE === "true",
    pickupRadiusM: Math.max(
      20,
      Number(process.env.GEOFENCE_PICKUP_RADIUS_M) || 75,
    ),
    pickupDwellMs: Math.max(
      5_000,
      Number(process.env.GEOFENCE_PICKUP_DWELL_MS) || 20000,
    ),
  },

  // OSRM host used for server-side breadcrumb map-matching. Defaults to
  // the public demo (rate-limited, no SLA). Swap to a self-hosted or
  // paid endpoint via OSRM_URL in prod. See docs/breadcrumb-and-osrm.md.
  osrm: {
    url: (process.env.OSRM_URL || "https://router.project-osrm.org").replace(
      /\/$/,
      "",
    ),
  },

  jobs: {
    enabled: process.env.BACKGROUND_JOBS_ENABLED !== "false",
    tickSeconds: Math.max(
      30,
      Number(process.env.BACKGROUND_JOBS_TICK_SECONDS) || 60,
    ),
    rideReminderMinutes: (process.env.RIDE_REMINDER_MINUTES || "120,60,15")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v > 0)
      .sort((a, b) => b - a),
  },
};
