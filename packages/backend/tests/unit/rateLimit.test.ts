import { test, expect, describe, beforeEach } from "bun:test";
import { Hono } from "hono";
import { createRateLimiter } from "../../src/middleware/rateLimit";

describe("rateLimit middleware", () => {
  beforeEach(() => {
    // Each test creates its own fresh limiter, so no shared state.
  });

  test("allows up to `max` requests, then 429s", async () => {
    const app = new Hono();
    app.use(
      "/x",
      createRateLimiter({ max: 3, windowMs: 60_000, key: () => "k" }),
    );
    app.get("/x", (c) => c.text("ok"));

    for (let i = 0; i < 3; i++) {
      const res = await app.request("/x");
      expect(res.status).toBe(200);
    }
    const blocked = await app.request("/x");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toMatch(/^\d+$/);
  });

  test("scopes counters by the key function", async () => {
    const app = new Hono();
    let n = 0;
    app.use(
      "/x",
      createRateLimiter({
        max: 1,
        windowMs: 60_000,
        key: () => `k${n++}`, // unique per request
      }),
    );
    app.get("/x", (c) => c.text("ok"));

    expect((await app.request("/x")).status).toBe(200);
    expect((await app.request("/x")).status).toBe(200); // different bucket
  });

  test("window resets after expiry", async () => {
    const app = new Hono();
    app.use(
      "/x",
      createRateLimiter({ max: 1, windowMs: 10, key: () => "shared" }),
    );
    app.get("/x", (c) => c.text("ok"));

    expect((await app.request("/x")).status).toBe(200);
    expect((await app.request("/x")).status).toBe(429);

    await new Promise((r) => setTimeout(r, 20));
    expect((await app.request("/x")).status).toBe(200);
  });

  test("response on 429 uses the standard envelope", async () => {
    const app = new Hono();
    app.use(
      "/x",
      createRateLimiter({ max: 0, windowMs: 60_000, key: () => "k" }),
    );
    app.get("/x", (c) => c.text("ok"));

    const blocked = await app.request("/x");
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as {
      success: boolean;
      error: string;
    };
    expect(body.success).toBe(false);
    expect(body.error.toLowerCase()).toMatch(/too many|rate/);
  });
});
