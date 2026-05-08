/**
 * Stripe webhook receiver.
 *
 * Mounted before the global JSON body-limit middleware can interfere with
 * raw body access (Hono's bodyLimit clones rather than consumes, but we
 * still mount this route at the top of the chain to keep the contract
 * obvious). Signature is verified with Stripe's raw bytes — any mutation
 * (re-encoding, JSON round-trip) breaks HMAC.
 *
 * Idempotency contract:
 *   1. Verify signature → fail closed on any mismatch.
 *   2. INSERT into webhook_events with stripe_event_id as PK. A duplicate
 *      INSERT means we've already seen this event; respond 200 with no
 *      side-effects.
 *   3. Dispatch to handler. On success, set processed_at. On failure,
 *      record processing_error and return 500 — Stripe will retry.
 *
 * Webhooks must always reply within 30s or Stripe treats the call as
 * failed. Heavy work belongs in a background job triggered by the row
 * we just persisted, not inline here.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type StripeType from "stripe";
import { db } from "../db/index";
import { webhookEvents } from "../db/schema";
import { config } from "../config";
import { getStripe, isStripeEnabled } from "../lib/stripe";
import { handleStripeEvent } from "../services/stripeWebhookHandler";

export const webhookRoutes = new Hono();

webhookRoutes.post("/stripe", async (c) => {
  const log = c.get("logger");

  if (!isStripeEnabled()) {
    log?.warn("stripe.webhook.received_while_disabled");
    return c.json({ error: "Payments not configured" }, 503);
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) {
    log?.warn("stripe.webhook.missing_signature");
    return c.json({ error: "Missing signature" }, 400);
  }

  // Read the raw body BEFORE any JSON parsing — signature is HMAC of
  // the exact bytes Stripe sent. c.req.text() returns the original body
  // without re-encoding.
  const rawBody = await c.req.text();

  let event: StripeType.Event;
  try {
    // Bun's runtime exposes Web Crypto (SubtleCrypto), which is async.
    // The sync `constructEvent` only works on Node with node:crypto;
    // under Bun we must use the async variant or HMAC verification throws.
    event = await getStripe().webhooks.constructEventAsync(
      rawBody,
      signature,
      config.stripe.webhookSecret,
    );
  } catch (cause) {
    // Don't leak whether the failure was a bad signature, expired
    // timestamp, or malformed body — all map to a 400 to anyone probing.
    log?.warn("stripe.webhook.signature_invalid", {
      err: cause as Error,
    });
    return c.json({ error: "Invalid signature" }, 400);
  }

  // Idempotency. If the INSERT conflicts, this event has already been
  // processed (or is being processed concurrently). Respond 200 either
  // way so Stripe stops retrying.
  try {
    await db.insert(webhookEvents).values({
      stripeEventId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });
  } catch (cause) {
    // Unique violation on stripe_event_id — duplicate delivery, ack and exit.
    if (isUniqueViolation(cause)) {
      log?.info("stripe.webhook.duplicate", {
        type: event.type,
        eventId: event.id,
      });
      return c.json({ received: true, duplicate: true });
    }
    log?.error("stripe.webhook.persist_failed", {
      type: event.type,
      eventId: event.id,
      err: cause as Error,
    });
    // Tell Stripe to retry — we never recorded the event.
    return c.json({ error: "Persist failed" }, 500);
  }

  try {
    const childLog = log?.child({ stripeEventId: event.id }) ?? log;
    await handleStripeEvent(event, childLog!);
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eqEventId(event.id));
    return c.json({ received: true });
  } catch (cause) {
    const errMsg = cause instanceof Error ? cause.message : String(cause);
    log?.error("stripe.webhook.handler_failed", {
      type: event.type,
      eventId: event.id,
      err: cause as Error,
    });
    await db
      .update(webhookEvents)
      .set({ processingError: errMsg.slice(0, 1000) })
      .where(eqEventId(event.id));
    // 500 → Stripe retries with exponential backoff up to ~3 days.
    return c.json({ error: "Handler failed" }, 500);
  }
});

function isUniqueViolation(err: unknown): boolean {
  // postgres.js surfaces error codes on `.code`; 23505 = unique_violation.
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: string }).code === "23505";
  }
  return false;
}

function eqEventId(id: string) {
  return eq(webhookEvents.stripeEventId, id);
}
