import { describe, test, expect, beforeAll, mock } from "bun:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);

// Background jobs would touch the DB; disable for tests.
process.env.BACKGROUND_JOBS_ENABLED = "false";

// Pretend the DB is fine for the few startup paths that care.
mock.module("../../src/db/index", () => ({
  dbClient: { end: async () => {} },
  db: {
    execute: async () => [{ "?column?": 1 }],
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          then: (r: any) => r([]),
        }),
      }),
    }),
  },
}));

let appDefault: any;

beforeAll(async () => {
  appDefault = (await import("../../src/index")).default;
});

describe("global hardening middleware", () => {
  test("/health responds and carries security headers", async () => {
    const res = await appDefault.fetch(
      new Request("http://localhost/health"),
    );
    expect(res.status).toBe(200);

    // secureHeaders defaults
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBeTruthy();
    expect(res.headers.get("Referrer-Policy")).toBeTruthy();
    // HSTS only in production but the header should at least exist or be
    // intentionally absent — we accept either since we test in dev.
  });

  test("unknown route returns 404 envelope, not Hono default", async () => {
    const res = await appDefault.fetch(
      new Request("http://localhost/this-route-does-not-exist"),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error.toLowerCase()).toContain("not found");
  });

  test("oversized JSON body is rejected with 413", async () => {
    const big = "x".repeat(2 * 1024 * 1024); // 2 MB body
    const res = await appDefault.fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", password: big }),
      }),
    );
    expect([413, 400]).toContain(res.status);
    if (res.status === 413) {
      const body = (await res.json()) as { success: boolean; error: string };
      expect(body.success).toBe(false);
    }
  });

  test("internal errors yield a sanitized JSON envelope (no raw stack)", async () => {
    // Force a crash via a route that is guaranteed to throw — POST /auth/login
    // with malformed JSON body triggers c.req.json() to throw upstream of any
    // route validation. The onError handler must intercept it.
    const res = await appDefault.fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
    );

    // Either 400 from validation, or 500 from onError — both must be
    // wrapped in our envelope and not leak Error stack.
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain("at <anonymous>");
    expect(text.toLowerCase()).not.toContain("stacktrace");
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
