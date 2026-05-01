import type { Context, MiddlewareHandler } from "hono";

/**
 * In-memory IP rate limiter (single-process). For multi-instance
 * deployments swap the storage Map for Redis; the public API stays the
 * same.
 *
 * Buckets are keyed by the result of `opts.key(c)`. Default key reads
 * x-forwarded-for, then x-real-ip, then the literal string "unknown" —
 * the last is intentionally shared so misconfigured proxies fail-closed
 * rather than fail-open.
 */
export interface RateLimitOptions {
  max: number;
  windowMs: number;
  key?: (c: Context) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

function defaultKey(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "unknown";
}

export function createRateLimiter(opts: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();
  const keyOf = opts.key ?? defaultKey;

  return async (c, next) => {
    const k = keyOf(c);
    const now = Date.now();

    let bucket = buckets.get(k);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(k, bucket);
    }

    bucket.count += 1;

    if (bucket.count > opts.max) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000),
      );
      c.header("Retry-After", retryAfterSec.toString());
      return c.json(
        { success: false, error: "Too many requests, please try again later" },
        429,
      );
    }

    await next();
  };
}
