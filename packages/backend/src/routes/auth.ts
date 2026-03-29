import { Hono } from "hono";
import { sign } from "hono/jwt";
import { setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { loginSchema } from "shared/validation";
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

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return err(c, "Invalid input", 400, parsed.error.flatten());
  }

  const { email, password } = parsed.data;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (result.length === 0) {
    return err(c, "Invalid credentials", 401);
  }

  const user = result[0];

  // Admin and driver require password
  if (user.role === "admin" || user.role === "driver") {
    if (!password || !user.passwordHash) {
      return err(c, "Password required", 401);
    }
    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) {
      return err(c, "Invalid credentials", 401);
    }
  }

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN_SECONDS,
  };

  const token = await sign(payload, JWT_SECRET);

  setCookie(c, JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
    path: "/",
    maxAge: JWT_EXPIRES_IN_SECONDS,
  });

  return ok(c, {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
