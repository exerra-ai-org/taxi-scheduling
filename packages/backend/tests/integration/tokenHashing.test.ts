import { describe, test, expect, beforeAll, mock } from "bun:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);

type FakeUser = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "customer" | "admin" | "driver";
  passwordHash: string | null;
  magicLinkToken: string | null;
  magicLinkExpiresAt: Date | null;
  resetPasswordToken: string | null;
  resetPasswordExpiresAt: Date | null;
  invitationToken: string | null;
  invitationTokenExpiresAt: Date | null;
};

const fakeUsers: FakeUser[] = [];
let lastEmailedToken: { kind: string; raw: string } | null = null;

mock.module("../../src/services/email", () => ({
  sendMagicLinkEmail: async (_to: string, raw: string) => {
    lastEmailedToken = { kind: "magic", raw };
  },
  sendPasswordResetEmail: async (_to: string, raw: string) => {
    lastEmailedToken = { kind: "reset", raw };
  },
  sendInvitationEmail: async (_to: string, raw: string) => {
    lastEmailedToken = { kind: "invite", raw };
  },
}));

// Drizzle SQL chunks: [StringChunk, Column, StringChunk(' = '), Param, StringChunk]
function extractColumnName(sqlObj: any): string | null {
  const chunks = sqlObj?.queryChunks ?? [];
  for (const c of chunks) {
    if (c && typeof c === "object" && typeof c.name === "string") return c.name;
  }
  return null;
}
function extractParamValue(sqlObj: any): unknown {
  const chunks = sqlObj?.queryChunks ?? [];
  for (const c of chunks) {
    if (c && typeof c === "object" && "value" in c && !c.queryChunks) {
      // skip StringChunk whose value is an array
      if (!Array.isArray(c.value)) return c.value;
    }
  }
  return undefined;
}

const COL_TO_FIELD: Record<string, keyof FakeUser> = {
  magic_link_token: "magicLinkToken",
  reset_password_token: "resetPasswordToken",
  invitation_token: "invitationToken",
  id: "id",
};

mock.module("../../src/db/index", () => {
  function selectChain(initialRows: () => unknown[]) {
    let pendingRows: () => unknown[] = initialRows;
    const obj: any = {};
    obj.from = () => obj;
    obj.where = (sqlObj: any) => {
      const col = extractColumnName(sqlObj);
      const val = extractParamValue(sqlObj);
      if (col && col in COL_TO_FIELD) {
        const field = COL_TO_FIELD[col];
        pendingRows = () => fakeUsers.filter((u: any) => u[field] === val);
      }
      return obj;
    };
    obj.limit = () => Promise.resolve(pendingRows());
    obj.then = (resolve: (v: unknown[]) => void) => resolve(pendingRows());
    obj.orderBy = () => obj;
    return obj;
  }

  function updateChain() {
    let pendingPatch: Partial<FakeUser> = {};
    let targetField: keyof FakeUser | null = null;
    let targetValue: unknown = undefined;
    const obj: any = {};
    obj.set = (patch: Partial<FakeUser>) => {
      pendingPatch = patch;
      return obj;
    };
    obj.where = (sqlObj: any) => {
      const col = extractColumnName(sqlObj);
      const val = extractParamValue(sqlObj);
      if (col && col in COL_TO_FIELD) {
        targetField = COL_TO_FIELD[col];
        targetValue = val;
      }
      return obj;
    };
    function applyPatch() {
      if (!targetField) return [];
      const matched = fakeUsers.filter(
        (u: any) => u[targetField as string] === targetValue,
      );
      for (const u of matched) Object.assign(u, pendingPatch);
      return matched;
    }
    obj.returning = () => Promise.resolve(applyPatch());
    obj.then = (resolve: (v: unknown[]) => void) => resolve(applyPatch());
    return obj;
  }

  function insertChain() {
    const obj: any = {};
    obj.values = () => obj;
    obj.returning = () => Promise.resolve([fakeUsers[0]]);
    obj.then = (resolve: (v: unknown[]) => void) => resolve([fakeUsers[0]]);
    return obj;
  }

  return {
    db: {
      select: () => selectChain(() => fakeUsers),
      update: () => updateChain(),
      insert: () => insertChain(),
    },
  };
});

let app: any;

beforeAll(async () => {
  const { Hono } = await import("hono");
  const { authRoutes } = await import("../../src/routes/auth");
  app = new Hono();
  app.route("/auth", authRoutes);
});

function seedUser(over: Partial<FakeUser> = {}) {
  fakeUsers.length = 0;
  fakeUsers.push({
    id: 1,
    email: "alice@example.com",
    name: "Alice",
    phone: null,
    role: "customer",
    passwordHash: null,
    magicLinkToken: null,
    magicLinkExpiresAt: null,
    resetPasswordToken: null,
    resetPasswordExpiresAt: null,
    invitationToken: null,
    invitationTokenExpiresAt: null,
    ...over,
  });
}

describe("magic-link token hashing", () => {
  test("the value stored in DB is NOT the value emailed to the user", async () => {
    seedUser();
    lastEmailedToken = null;

    const res = await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com" }),
    });
    expect(res.status).toBe(200);

    expect(lastEmailedToken).not.toBeNull();
    const stored = fakeUsers[0].magicLinkToken!;
    expect(stored).toBeTruthy();
    expect(stored).not.toBe(lastEmailedToken!.raw);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  test("verify accepts the raw token from the email", async () => {
    seedUser();
    lastEmailedToken = null;

    const issue = await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com" }),
    });
    expect(issue.status).toBe(200);
    const raw = lastEmailedToken!.raw;

    const verify = await app.request("/auth/magic-link/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: raw }),
    });
    expect(verify.status).toBe(200);
    expect(verify.headers.get("set-cookie")).toContain("token=");
    // After successful verify, token should be cleared.
    expect(fakeUsers[0].magicLinkToken).toBeNull();
  });

  test("verify rejects the stored hash (DB-leak attacker scenario)", async () => {
    seedUser();
    lastEmailedToken = null;

    await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com" }),
    });
    const storedHash = fakeUsers[0].magicLinkToken!;

    const res = await app.request("/auth/magic-link/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: storedHash }),
    });
    expect(res.status).toBe(401);
  });

  test("verify rejects an arbitrary token", async () => {
    seedUser({
      magicLinkToken: "deadbeef".repeat(8),
      magicLinkExpiresAt: new Date(Date.now() + 60_000),
    });

    const res = await app.request("/auth/magic-link/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "not-the-token" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("password-reset token hashing", () => {
  test("DB stores hash, email contains raw, verify accepts raw only", async () => {
    seedUser();
    lastEmailedToken = null;

    const issue = await app.request("/auth/reset-password/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com" }),
    });
    expect(issue.status).toBe(200);

    const stored = fakeUsers[0].resetPasswordToken!;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe(lastEmailedToken!.raw);

    // The hash itself must NOT be a valid reset token.
    const replayHash = await app.request("/auth/reset-password/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: stored, password: "n3wpassword!" }),
    });
    expect(replayHash.status).toBe(401);

    // The raw token must work and rotate the password.
    const ok = await app.request("/auth/reset-password/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: lastEmailedToken!.raw,
        password: "n3wpassword!",
      }),
    });
    expect(ok.status).toBe(200);
    expect(fakeUsers[0].resetPasswordToken).toBeNull();
    expect(fakeUsers[0].passwordHash).toBeTruthy();
  });
});
