import { Hono } from "hono";
import { sign } from "hono/jwt";
import { setCookie, deleteCookie } from "hono/cookie";
import { config } from "../config";
import { eq, sql } from "drizzle-orm";
import {
  loginSchema,
  registerSchema,
  checkEmailSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  passwordResetRequestSchema,
  passwordResetVerifySchema,
  acceptInvitationSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "shared/validation";
import { db } from "../db/index";
import { users } from "../db/schema";
import {
  JWT_SECRET,
  JWT_COOKIE_NAME,
  JWT_EXPIRES_IN_SECONDS,
} from "../lib/constants";
import { ok, err } from "../lib/response";
import { decideLoginAttempt } from "../lib/loginPolicy";
import { generateAuthToken, hashAuthToken } from "../lib/tokens";
import { authMiddleware, type JwtPayload } from "../middleware/auth";
import { sendMagicLinkEmail, sendPasswordResetEmail } from "../services/email";

export const authRoutes = new Hono();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function setAuthCookie(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "Lax",
    path: "/",
    maxAge: JWT_EXPIRES_IN_SECONDS,
  });
}

async function issueAuthCookie(
  c: Parameters<typeof setCookie>[0],
  user: {
    id: number;
    email: string;
    role: "customer" | "admin" | "driver";
    name: string;
  },
) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN_SECONDS,
  };

  const token = await sign(payload, JWT_SECRET);
  setAuthCookie(c, token);
}

authRoutes.post("/check-email", async (c) => {
  const body = await c.req.json();
  const parsed = checkEmailSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const email = normalizeEmail(parsed.data.email);

  const result = await db
    .select({
      id: users.id,
      role: users.role,
      name: users.name,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email}`)
    .limit(1);

  if (result.length === 0) {
    return ok(c, { exists: false });
  }

  const account = result[0];
  return ok(c, {
    exists: true,
    role: account.role,
    name: account.name,
    hasPassword: !!account.passwordHash,
  });
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const email = normalizeEmail(parsed.data.email);
  const { password } = parsed.data;

  const result = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email}`)
    .limit(1);

  // Generic 401 for unknown email — avoids account enumeration via /login.
  if (result.length === 0) {
    return err(c, "Invalid credentials", 401);
  }

  const user = result[0];
  const outcome = decideLoginAttempt(user, password);

  if (outcome.kind === "magic_link_required") {
    return err(
      c,
      "This account uses magic-link sign-in. Request a sign-in link from your email.",
      401,
    );
  }
  if (outcome.kind === "password_required") {
    return err(c, "Password required", 401);
  }

  const valid = await Bun.password.verify(
    outcome.password,
    outcome.passwordHash,
  );
  if (!valid) {
    return err(c, "Invalid credentials", 401);
  }

  await issueAuthCookie(c, user);

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

authRoutes.post("/register", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const email = normalizeEmail(parsed.data.email);
  const name = parsed.data.name.trim();
  const phone = parsed.data.phone?.trim() || null;
  const password = parsed.data.password;

  // Check if user already exists
  const existing = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email}`)
    .limit(1);

  if (existing.length > 0) {
    return err(c, "An account with this email already exists", 409);
  }

  const passwordHash = password ? await Bun.password.hash(password) : null;

  const [user] = await db
    .insert(users)
    .values({ email, name, phone, role: "customer", passwordHash })
    .returning();

  // Magic-link registration: send verification email instead of issuing cookie
  if (!password) {
    const { raw, hash } = generateAuthToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db
      .update(users)
      .set({ magicLinkToken: hash, magicLinkExpiresAt: expiresAt })
      .where(eq(users.id, user.id));

    await sendMagicLinkEmail(email, raw, name);

    return ok(c, { magicLinkSent: true });
  }

  await issueAuthCookie(c, user);

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

authRoutes.post("/logout", (c) => {
  deleteCookie(c, JWT_COOKIE_NAME, { path: "/" });
  return ok(c, { message: "Logged out" });
});

authRoutes.post("/magic-link", async (c) => {
  const body = await c.req.json();
  const parsed = magicLinkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const email = normalizeEmail(parsed.data.email);

  const result = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email}`)
    .limit(1);

  if (result.length === 0) {
    return err(c, "Account not found", 404);
  }

  const account = result[0];

  const { raw, hash } = generateAuthToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db
    .update(users)
    .set({ magicLinkToken: hash, magicLinkExpiresAt: expiresAt })
    .where(eq(users.id, account.id));

  await sendMagicLinkEmail(email, raw, account.name);

  return ok(c, { message: "Magic link sent to your email" });
});

authRoutes.post("/magic-link/verify", async (c) => {
  const body = await c.req.json();
  const parsed = magicLinkVerifySchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const { token } = parsed.data;
  const tokenHash = hashAuthToken(token);

  const result = await db
    .select()
    .from(users)
    .where(eq(users.magicLinkToken, tokenHash))
    .limit(1);

  if (result.length === 0) {
    return err(c, "Invalid or expired magic link", 401);
  }

  const user = result[0];

  if (!user.magicLinkExpiresAt || user.magicLinkExpiresAt < new Date()) {
    return err(c, "Magic link has expired", 401);
  }

  // Clear the token after use
  await db
    .update(users)
    .set({ magicLinkToken: null, magicLinkExpiresAt: null })
    .where(eq(users.id, user.id));

  await issueAuthCookie(c, user);

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

authRoutes.post("/reset-password/request", async (c) => {
  const body = await c.req.json();
  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const email = normalizeEmail(parsed.data.email);

  const result = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email}`)
    .limit(1);

  if (result.length === 0) {
    // Don't reveal whether the email exists
    return ok(c, {
      message: "If that email exists, a reset link has been sent",
    });
  }

  const account = result[0];
  const { raw, hash } = generateAuthToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db
    .update(users)
    .set({ resetPasswordToken: hash, resetPasswordExpiresAt: expiresAt })
    .where(eq(users.id, account.id));

  await sendPasswordResetEmail(email, raw, account.name);

  return ok(c, { message: "If that email exists, a reset link has been sent" });
});

authRoutes.post("/reset-password/verify", async (c) => {
  const body = await c.req.json();
  const parsed = passwordResetVerifySchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const { token, password } = parsed.data;
  const tokenHash = hashAuthToken(token);

  const result = await db
    .select()
    .from(users)
    .where(eq(users.resetPasswordToken, tokenHash))
    .limit(1);

  if (result.length === 0) {
    return err(c, "Invalid or expired reset link", 401);
  }

  const user = result[0];

  if (
    !user.resetPasswordExpiresAt ||
    user.resetPasswordExpiresAt < new Date()
  ) {
    return err(c, "Reset link has expired", 401);
  }

  const passwordHash = await Bun.password.hash(password);

  await db
    .update(users)
    .set({
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  await issueAuthCookie(c, user);

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

authRoutes.post("/accept-invitation", async (c) => {
  const body = await c.req.json();
  const parsed = acceptInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const { token, password } = parsed.data;
  const tokenHash = hashAuthToken(token);

  const result = await db
    .select()
    .from(users)
    .where(eq(users.invitationToken, tokenHash))
    .limit(1);

  if (result.length === 0) {
    return err(c, "Invalid or expired invitation", 401);
  }

  const user = result[0];

  if (
    !user.invitationTokenExpiresAt ||
    user.invitationTokenExpiresAt < new Date()
  ) {
    return err(c, "Invitation has expired", 401);
  }

  const passwordHash = await Bun.password.hash(password);

  await db
    .update(users)
    .set({
      passwordHash,
      invitationToken: null,
      invitationTokenExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  await issueAuthCookie(c, user);

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

authRoutes.get("/me", authMiddleware, async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;

  const result = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (result.length === 0) {
    return err(c, "User not found", 404);
  }

  return ok(c, { user: result[0] });
});

authRoutes.patch("/me", authMiddleware, async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const body = await c.req.json();
  const parsed = updateProfileSchema.safeParse(body);
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
    .where(eq(users.id, payload.sub))
    .returning();
  if (!user) return err(c, "User not found", 404);

  // Re-issue cookie with updated name in JWT
  await issueAuthCookie(c, user);

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

authRoutes.patch("/me/password", authMiddleware, async (c) => {
  const payload = c.get("jwtPayload") as JwtPayload;
  const body = await c.req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success)
    return err(c, "Invalid input", 400, parsed.error.flatten());

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);
  if (!user) return err(c, "User not found", 404);

  if (!user.passwordHash) return err(c, "No password set on this account", 400);

  const valid = await Bun.password.verify(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!valid) return err(c, "Current password is incorrect", 401);

  const passwordHash = await Bun.password.hash(parsed.data.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, payload.sub));

  return ok(c, { message: "Password changed successfully" });
});
