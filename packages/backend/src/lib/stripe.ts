/**
 * Stripe SDK singleton.
 *
 * The rest of the app imports `stripe` from here. We construct the client
 * lazily on first access so test runs and dev environments without keys
 * configured don't crash at import time — instead they throw a clear
 * `StripeNotConfiguredError` if a payments code path is exercised.
 *
 * Idempotency: every mutating Stripe call should pass an idempotency key
 * derived from a stable domain identifier (booking id + action). Use
 * `idempotencyKeyFor` so retries don't accidentally double-charge.
 */

import Stripe from "stripe";
import { config } from "../config";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super(
      "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable payments.",
    );
    this.name = "StripeNotConfiguredError";
  }
}

let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!config.stripe.enabled) {
    throw new StripeNotConfiguredError();
  }
  if (!_client) {
    _client = new Stripe(config.stripe.secretKey, {
      apiVersion: config.stripe.apiVersion,
      // The default 80s is too generous for synchronous request paths.
      // 10s keeps a slow Stripe call from holding a request socket open.
      timeout: 10_000,
      maxNetworkRetries: 2,
      typescript: true,
      appInfo: {
        name: "taxi-concierge",
        version: "0.1.0",
      },
    });
  }
  return _client;
}

export function isStripeEnabled(): boolean {
  return config.stripe.enabled;
}

/**
 * Build a deterministic idempotency key. The same (resource, action, version)
 * always returns the same key — Stripe will dedupe replays of the same
 * mutating call. Bump `version` when intentionally retrying with different
 * inputs (e.g. amount changed after a route edit).
 */
export function idempotencyKeyFor(
  resource: string,
  action: string,
  version: number | string = 1,
): string {
  return `${resource}:${action}:v${version}`;
}

/**
 * Narrow Stripe errors to a small set we expose to clients. Anything else
 * gets logged with full detail server-side and returned as a generic
 * "payment failed" to avoid leaking internals.
 */
export interface StripeErrorPayload {
  code: string;
  message: string;
  declineCode?: string;
}

export function classifyStripeError(err: unknown): StripeErrorPayload {
  if (err instanceof Stripe.errors.StripeCardError) {
    return {
      code: err.code || "card_error",
      message: err.message,
      declineCode: err.decline_code ?? undefined,
    };
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    return {
      code: "invalid_request",
      message: "Invalid payment request",
    };
  }
  if (err instanceof Stripe.errors.StripeRateLimitError) {
    return { code: "rate_limited", message: "Too many requests, try again" };
  }
  if (err instanceof Stripe.errors.StripeConnectionError) {
    return {
      code: "network_error",
      message: "Could not reach payment provider",
    };
  }
  if (err instanceof Stripe.errors.StripeAuthenticationError) {
    return { code: "auth_error", message: "Payment provider misconfigured" };
  }
  return { code: "payment_failed", message: "Payment failed" };
}

// Re-export the Stripe class so callers can access the type namespace
// (Stripe.Event, Stripe.PaymentIntent, etc.) without a second import.
export { Stripe };
export type { Stripe as StripeNS } from "stripe";
