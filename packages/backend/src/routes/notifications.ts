import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import {
  notificationSubscriptionSchema,
  notificationUnsubscribeSchema,
} from "shared/validation";
import { db } from "../db/index";
import { notificationSubscriptions } from "../db/schema";
import { authMiddleware, type JwtPayload } from "../middleware/auth";
import { ok, err } from "../lib/response";
import { getPublicVapidKey } from "../services/notifications";

export const notificationRoutes = new Hono();

notificationRoutes.get("/public-key", async (c) => {
  const key = getPublicVapidKey();
  if (!key) {
    return err(c, "Push notifications are not configured", 500);
  }
  return ok(c, { publicKey: key });
});

notificationRoutes.use("*", authMiddleware);

notificationRoutes.get("/subscriptions", async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;

  const subscriptions = await db
    .select({
      id: notificationSubscriptions.id,
      endpoint: notificationSubscriptions.endpoint,
      createdAt: notificationSubscriptions.createdAt,
    })
    .from(notificationSubscriptions)
    .where(eq(notificationSubscriptions.userId, payload.sub));

  return ok(c, { subscriptions });
});

notificationRoutes.post("/subscribe", async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const body = await c.req.json();
  const parsed = notificationSubscriptionSchema.safeParse(body);

  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const { endpoint, p256dh, auth } = parsed.data;

  const [subscription] = await db
    .insert(notificationSubscriptions)
    .values({
      userId: payload.sub,
      endpoint,
      p256dh,
      auth,
    })
    .onConflictDoUpdate({
      target: notificationSubscriptions.endpoint,
      set: {
        userId: payload.sub,
        p256dh,
        auth,
      },
    })
    .returning();

  return ok(c, { subscription }, 201);
});

notificationRoutes.post("/unsubscribe", async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const body = await c.req.json();
  const parsed = notificationUnsubscribeSchema.safeParse(body);

  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const [subscription] = await db
    .delete(notificationSubscriptions)
    .where(
      and(
        eq(notificationSubscriptions.endpoint, parsed.data.endpoint),
        eq(notificationSubscriptions.userId, payload.sub),
      ),
    )
    .returning();

  if (!subscription) {
    return err(c, "Subscription not found", 404);
  }

  return ok(c, { message: "Unsubscribed" });
});
