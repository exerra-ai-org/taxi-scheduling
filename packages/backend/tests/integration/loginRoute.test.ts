import { describe, test, expect, beforeAll, mock } from "bun:test";

// Stable env so config & jwt module load.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);

// In-memory user store the mocked db will read from.
const fakeUsers: Array<{
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "customer" | "admin" | "driver";
  passwordHash: string | null;
}> = [];

// Build a chainable thenable that resolves to a row list, matching how the
// route uses Drizzle's query builder.
function selectThenable(rows: unknown[]) {
  const obj: any = {};
  obj.from = () => obj;
  obj.where = () => obj;
  obj.limit = () => Promise.resolve(rows);
  obj.then = (resolve: (v: unknown[]) => void) => resolve(rows);
  return obj;
}

mock.module("../../src/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (_w: unknown) => {
          // Crude: return all current users; the route's `LOWER(email) = ?`
          // filter is matched in JS to keep the mock simple.
          return selectThenable(fakeUsers);
        },
      }),
    }),
  },
}));

let authRoutes: any;
let app: any;

beforeAll(async () => {
  const { Hono } = await import("hono");
  const mod = await import("../../src/routes/auth");
  authRoutes = mod.authRoutes;
  app = new Hono();
  app.route("/auth", authRoutes);
});

describe("POST /auth/login — security", () => {
  test("rejects password-less customer attempting to log in with phone", async () => {
    fakeUsers.length = 0;
    fakeUsers.push({
      id: 1,
      email: "alice@example.com",
      name: "Alice",
      phone: "07123456789",
      role: "customer",
      passwordHash: null,
    });

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.12",
      },
      body: JSON.stringify({
        email: "alice@example.com",
        phone: "07123456789",
      }),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    // Body must NOT contain a JWT cookie.
    expect(res.headers.get("set-cookie")).toBeNull();
    // Wording must point user at magic link, not phone.
    expect(body.error.toLowerCase()).toContain("magic-link");
  });

  test("returns generic 401 for unknown email (no enumeration)", async () => {
    fakeUsers.length = 0;

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.10", // unique IP avoids shared rate-limit bucket
      },
      body: JSON.stringify({ email: "nope@example.com", password: "x" }),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    // Must not say "Account not found".
    expect(body.error.toLowerCase()).not.toContain("not found");
    expect(body.error.toLowerCase()).toContain("invalid credentials");
  });

  test("password-having user without password gets password_required (not magic-link message)", async () => {
    fakeUsers.length = 0;
    fakeUsers.push({
      id: 2,
      email: "bob@example.com",
      name: "Bob",
      phone: null,
      role: "customer",
      passwordHash: "$argon2id$v=19$m=65536,t=2,p=1$dummy$dummy",
    });

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.11",
      },
      body: JSON.stringify({ email: "bob@example.com" }),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("password required");
  });
});
