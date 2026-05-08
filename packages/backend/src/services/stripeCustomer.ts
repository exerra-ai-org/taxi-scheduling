/**
 * Stripe Customer lifecycle.
 *
 * Customers are created eagerly when a customer-role user signs up, so
 * the saved-cards page works on day one and so we never block a booking
 * on a Stripe API roundtrip. Admin/driver accounts get no Stripe Customer.
 *
 * If Stripe is not configured, we silently skip — auth flows must keep
 * working in dev/test without payment keys.
 */

import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { users } from "../db/schema";
import { getStripe, isStripeEnabled, idempotencyKeyFor } from "../lib/stripe";
import { logger } from "../lib/logger";

interface EnsureCustomerInput {
  userId: number;
  email: string;
  name: string;
  phone?: string | null;
}

/**
 * Ensure the given customer-role user has a Stripe Customer. Idempotent:
 * if `users.stripeCustomerId` is already set, we trust it and return. If
 * Stripe is disabled, returns null and logs at debug.
 */
export async function ensureStripeCustomer(
  input: EnsureCustomerInput,
): Promise<string | null> {
  if (!isStripeEnabled()) {
    logger.debug("stripe.customer.skip", { reason: "stripe_disabled" });
    return null;
  }

  const [existing] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create(
    {
      email: input.email,
      name: input.name,
      phone: input.phone ?? undefined,
      metadata: { userId: String(input.userId) },
    },
    {
      idempotencyKey: idempotencyKeyFor("user", `create-${input.userId}`),
    },
  );

  await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, input.userId));

  logger.info("stripe.customer.created", {
    userId: input.userId,
    stripeCustomerId: customer.id,
  });

  return customer.id;
}

/**
 * Mirror profile updates back to Stripe so receipts and invoices match
 * the user's current contact info. Best-effort: failures are logged but
 * never bubble up — a Stripe outage must not break profile saves.
 */
export async function syncStripeCustomer(
  userId: number,
  updates: { email?: string; name?: string; phone?: string | null },
): Promise<void> {
  if (!isStripeEnabled()) return;

  const [user] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.stripeCustomerId) return;

  try {
    const stripe = getStripe();
    await stripe.customers.update(user.stripeCustomerId, {
      ...(updates.email !== undefined ? { email: updates.email } : {}),
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.phone !== undefined ? { phone: updates.phone ?? "" } : {}),
    });
  } catch (cause) {
    logger.warn("stripe.customer.sync_failed", {
      userId,
      err: cause as Error,
    });
  }
}
