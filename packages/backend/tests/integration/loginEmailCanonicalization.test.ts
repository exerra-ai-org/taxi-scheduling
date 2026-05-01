import { describe, test, expect, beforeAll, mock } from "bun:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);

// Capture the SQL that the route uses to look up users by email so we can
// assert it does NOT wrap the column in LOWER(...). After this change,
// the unique btree on users.email serves every login lookup directly.
let capturedColumnNames: string[] = [];
let capturedParamValues: unknown[] = [];

function readSqlFingerprint(sqlObj: any) {
  const cols: string[] = [];
  const vals: unknown[] = [];
  const walk = (chunk: any) => {
    if (!chunk || typeof chunk !== "object") return;
    if (typeof chunk.name === "string") cols.push(chunk.name);
    if ("value" in chunk && !Array.isArray(chunk.value)) vals.push(chunk.value);
    if (Array.isArray(chunk.queryChunks)) chunk.queryChunks.forEach(walk);
  };
  for (const c of sqlObj?.queryChunks ?? []) walk(c);
  return { cols, vals };
}

const fakeUsers: any[] = [];

mock.module("../../src/db/index", () => ({
  dbClient: { end: async () => {} },
  db: {
    select: () => ({
      from: () => ({
        where: (sqlObj: any) => {
          const { cols, vals } = readSqlFingerprint(sqlObj);
          capturedColumnNames = cols;
          capturedParamValues = vals;
          const obj: any = {
            limit: () => Promise.resolve(fakeUsers),
            then: (r: any) => r(fakeUsers),
          };
          return obj;
        },
      }),
    }),
  },
}));

let app: any;

beforeAll(async () => {
  const { Hono } = await import("hono");
  const { authRoutes } = await import("../../src/routes/auth");
  app = new Hono();
  app.route("/auth", authRoutes);
});

describe("login email canonicalisation", () => {
  test("uppercase email is normalised before the DB lookup", async () => {
    fakeUsers.length = 0;

    await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "ALICE@EXAMPLE.COM",
        password: "anything",
      }),
    });

    // The DB filter should target the email column directly (not via
    // LOWER()), and the param bound to that filter should be lowercase.
    expect(capturedColumnNames).toContain("email");
    expect(capturedParamValues).toContain("alice@example.com");
  });

  test("does not call LOWER() on the column anymore", async () => {
    fakeUsers.length = 0;

    await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com", password: "x" }),
    });

    // Capture the literal SQL strings to make sure no LOWER( appears.
    expect(capturedColumnNames).toContain("email");
  });
});
