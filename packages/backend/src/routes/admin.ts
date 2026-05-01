import { Hono } from "hono";
import { eq, sql, avg, count } from "drizzle-orm";
import {
  inviteUserSchema,
  driverProfileSchema,
  updateUserSchema,
} from "shared/validation";
import { db } from "../db/index";
import { users, driverProfiles, reviews } from "../db/schema";
import { authMiddleware, requireRole } from "../middleware/auth";
import { ok, err } from "../lib/response";
import { generateAuthToken } from "../lib/tokens";
import { sendInvitationEmail } from "../services/email";

export const adminRoutes = new Hono();

adminRoutes.use("*", authMiddleware, requireRole("admin"));

// Invite a new driver or admin
adminRoutes.post("/invite", async (c) => {
  const body = await c.req.json();
  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success)
    return err(c, "Invalid input", 400, parsed.error.flatten());

  const { email, name, role } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0)
    return err(c, "An account with this email already exists", 409);

  const { raw, hash } = generateAuthToken();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  const [user] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      name,
      role,
      invitationToken: hash,
      invitationTokenExpiresAt: expiresAt,
    })
    .returning();

  await sendInvitationEmail(normalizedEmail, raw, name, role);

  return ok(c, {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// Get full driver profile (admin)
adminRoutes.get("/drivers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return err(c, "Invalid ID", 400);

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      profilePictureUrl: users.profilePictureUrl,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id));

  if (!user) return err(c, "Driver not found", 404);

  const [profile] = await db
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.driverId, id));

  const [ratings] = await db
    .select({ avg: avg(reviews.rating), total: count(reviews.id) })
    .from(reviews)
    .where(eq(reviews.driverId, id));

  return ok(c, {
    driver: {
      ...user,
      profile: profile ?? null,
      avgRating: ratings.avg ? Number(Number(ratings.avg).toFixed(1)) : null,
      totalReviews: ratings.total,
    },
  });
});

// Update any user's name/phone (admin)
adminRoutes.patch("/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return err(c, "Invalid ID", 400);

  const body = await c.req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success)
    return err(c, "Invalid input", 400, parsed.error.flatten());

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.phone !== undefined)
    updates.phone = parsed.data.phone?.trim() || null;

  if (Object.keys(updates).length === 0)
    return err(c, "Nothing to update", 400);

  const [user] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning();
  if (!user) return err(c, "User not found", 404);

  return ok(c, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
    },
  });
});

// Update driver vehicle/profile (admin)
adminRoutes.put("/drivers/:id/profile", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return err(c, "Invalid ID", 400);

  const body = await c.req.json();
  const parsed = driverProfileSchema.safeParse(body);
  if (!parsed.success)
    return err(c, "Invalid input", 400, parsed.error.flatten());

  const { profilePictureUrl, ...profileFields } = parsed.data;

  if (profilePictureUrl !== undefined) {
    await db.update(users).set({ profilePictureUrl }).where(eq(users.id, id));
  }

  await db
    .insert(driverProfiles)
    .values({ driverId: id, ...profileFields })
    .onConflictDoUpdate({
      target: driverProfiles.driverId,
      set: profileFields,
    });

  const [profile] = await db
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.driverId, id));
  return ok(c, { profile });
});
