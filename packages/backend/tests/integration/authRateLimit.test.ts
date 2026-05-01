import { describe, test, expect, beforeAll, mock } from "bun:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);

// Stub the DB so /auth/login can run without a real connection. Always
// returns "no user" → generic 401, but the rate limiter runs BEFORE the
// db lookup.
mock.module("../../src/db/index", () => ({
  db: {
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

mock.module("../../src/services/email", () => ({
  sendMagicLinkEmail: async () => {},
  sendPasswordResetEmail: async () => {},
  sendInvitationEmail: async () => {},
}));

let app: any;
beforeAll(async () => {
  const { Hono } = await import("hono");
  const { authRoutes } = await import("../../src/routes/auth");
  app = new Hono();
  app.route("/auth", authRoutes);
});

const FROM_IP = { "x-forwarded-for": "203.0.113.42" };

async function login(headers: Record<string, string> = {}) {
  return app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ email: "x@y.com", password: "wrong" }),
  });
}

describe("/auth rate limiting", () => {
  test("login limiter eventually returns 429 for the same IP", async () => {
    let saw429 = false;
    for (let i = 0; i < 25; i++) {
      const res = await login(FROM_IP);
      if (res.status === 429) {
        saw429 = true;
        expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
        const body = (await res.json()) as { success: boolean; error: string };
        expect(body.success).toBe(false);
        break;
      }
    }
    expect(saw429).toBe(true);
  });

  test("a different IP starts with a fresh quota", async () => {
    // Hammer one IP first.
    for (let i = 0; i < 25; i++) await login({ "x-forwarded-for": "1.1.1.1" });
    // Different IP should still be allowed.
    const res = await login({ "x-forwarded-for": "8.8.8.8" });
    expect(res.status).not.toBe(429);
  });
});
