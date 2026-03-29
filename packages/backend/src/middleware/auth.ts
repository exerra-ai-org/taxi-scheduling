import { jwt } from "hono/jwt";
import type { MiddlewareHandler } from "hono";
import type { UserRole } from "shared/types";
import { JWT_SECRET, JWT_COOKIE_NAME } from "../lib/constants";
import { err } from "../lib/response";

export interface JwtPayload {
  sub: number;
  email: string;
  role: UserRole;
  name: string;
  exp: number;
}

export const authMiddleware = jwt({
  secret: JWT_SECRET,
  cookie: JWT_COOKIE_NAME,
  alg: "HS256",
});

export function requireRole(...roles: UserRole[]): MiddlewareHandler {
  return async (c, next) => {
    const payload = c.get("jwtPayload") as JwtPayload;
    if (!payload || !roles.includes(payload.role)) {
      return err(c, "Forbidden", 403);
    }
    await next();
  };
}
