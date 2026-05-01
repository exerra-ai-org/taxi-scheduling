/**
 * Production boot-time config validation.
 *
 * Refuse to start if JWT_SECRET is missing, equals a documented default, or
 * is too short. Refuse to start if DATABASE_URL is missing. In development,
 * we only warn — local devs should not be blocked by missing env vars.
 */

const KNOWN_DEFAULTS = new Set([
  "dev-secret-change-me",
  "change-me-in-production",
  "secret",
  "your-secret-here",
]);

const MIN_SECRET_LENGTH = 32;

export interface RuntimeConfigInput {
  nodeEnv: string;
  jwtSecret: string | undefined;
  databaseUrl: string | undefined;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function validateRuntimeConfig(input: RuntimeConfigInput): void {
  const isProduction = input.nodeEnv === "production";
  if (!isProduction) {
    if (!input.jwtSecret || KNOWN_DEFAULTS.has(input.jwtSecret)) {
      console.warn(
        "[Config] JWT_SECRET is missing or set to a known default — fine for dev, but this WILL refuse to boot in production.",
      );
    }
    return;
  }

  if (!input.jwtSecret) {
    throw new ConfigError(
      "JWT_SECRET is required in production. Set a 32+ character secret.",
    );
  }
  if (KNOWN_DEFAULTS.has(input.jwtSecret)) {
    throw new ConfigError(
      "JWT_SECRET is set to a known default value. Replace it with a strong, unique secret.",
    );
  }
  if (input.jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new ConfigError(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production.`,
    );
  }

  if (!input.databaseUrl) {
    throw new ConfigError("DATABASE_URL is required in production.");
  }
}
