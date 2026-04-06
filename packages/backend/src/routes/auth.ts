import { Hono } from "hono";
import { sign } from "hono/jwt";
import { setCookie, deleteCookie } from "hono/cookie";
import { eq, sql } from "drizzle-orm";
import { loginSchema, registerSchema, checkEmailSchema } from "shared/validation";
import { db } from "../db/index";
import { users } from "../db/schema";
import {
  JWT_SECRET,
  JWT_COOKIE_NAME,
  JWT_EXPIRES_IN_SECONDS,
} from "../lib/constants";
import { ok, err } from "../lib/response";
import { authMiddleware, type JwtPayload } from "../middleware/auth";

export const authRoutes = new Hono();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function setAuthCookie(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: JWT_EXPIRES_IN_SECONDS,
  });
}

async function issueAuthCookie(c: Parameters<typeof setCookie>[0], user: {
  id: number;
  email: string;
  role: "customer" | "admin" | "driver";
  name: string;
}) {
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
  });
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const email = normalizeEmail(parsed.data.email);
  const { password, phone } = parsed.data;

  const result = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email}`)
    .limit(1);

  if (result.length === 0) {
    return err(c, "Account not found", 404);
  }

  const user = result[0];

  // Staff and password-based accounts require password.
  if (user.role === "admin" || user.role === "driver" || user.passwordHash) {
    if (!password || !user.passwordHash) {
      return err(c, "Password required", 401);
    }
    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) {
      return err(c, "Invalid credentials", 401);
    }
  } else {
    // Customer accounts without password must verify phone.
    if (!phone || !user.phone) {
      return err(c, "Phone number required for customer login", 401);
    }
    const phoneMatches = normalizePhone(phone) === normalizePhone(user.phone);
    if (!phoneMatches) {
      return err(c, "Invalid credentials", 401);
    }
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
  const phone = parsed.data.phone.trim();

  // Check if user already exists
  const existing = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email}`)
    .limit(1);

  if (existing.length > 0) {
    return err(c, "An account with this email already exists", 409);
  }

  const [user] = await db
    .insert(users)
    .values({ email, name, phone, role: "customer" })
    .returning();

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
