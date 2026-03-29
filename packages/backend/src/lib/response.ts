import type { Context } from "hono";

export function ok(c: Context, data: unknown, status: 200 | 201 = 200) {
  return c.json({ success: true, data }, status);
}

export function err(
  c: Context,
  error: string,
  status: 400 | 401 | 403 | 404 | 409 | 500 = 400,
  details?: unknown,
) {
  return c.json({ success: false, error, details }, status);
}
