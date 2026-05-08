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
  stripeSecretKey?: string | undefined;
  stripeWebhookSecret?: string | undefined;
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

  // Stripe is optional in production — until payments ship, the rest of
  // the app should boot without it. But if EITHER key is set, BOTH must be
  // set, and the secret key must look like a real key, not a placeholder.
  const hasStripeKey = !!input.stripeSecretKey;
  const hasWebhookSecret = !!input.stripeWebhookSecret;
  if (hasStripeKey || hasWebhookSecret) {
    if (!hasStripeKey) {
      throw new ConfigError(
        "STRIPE_SECRET_KEY is required when STRIPE_WEBHOOK_SECRET is set.",
      );
    }
    if (!hasWebhookSecret) {
      throw new ConfigError(
        "STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set.",
      );
    }
    if (!/^sk_(live|test)_/.test(input.stripeSecretKey!)) {
      throw new ConfigError(
        "STRIPE_SECRET_KEY does not look like a valid Stripe secret key (expected sk_live_… or sk_test_…).",
      );
    }
    if (!/^whsec_/.test(input.stripeWebhookSecret!)) {
      throw new ConfigError(
        "STRIPE_WEBHOOK_SECRET does not look like a valid Stripe webhook secret (expected whsec_…).",
      );
    }
  }
}
