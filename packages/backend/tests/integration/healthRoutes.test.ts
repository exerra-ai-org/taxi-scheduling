import { describe, test, expect, beforeAll, mock } from "bun:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);

let dbHealthy = true;

mock.module("../../src/db/index", () => ({
  dbClient: { end: async () => {} },
  db: {
    execute: async () => {
      if (!dbHealthy) throw new Error("DB down");
      return [{ "?column?": 1 }];
    },
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

describe("health probes", () => {
  test("/livez always returns 200", async () => {
    dbHealthy = false; // even when DB is down
    const res = await appDefault.fetch(new Request("http://localhost/livez"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("/readyz returns 200 + db:ok when DB is reachable", async () => {
    dbHealthy = true;
    const res = await appDefault.fetch(new Request("http://localhost/readyz"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; db: string };
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
  });

  test("/readyz returns 503 + db:down when DB ping throws", async () => {
    dbHealthy = false;
    const res = await appDefault.fetch(new Request("http://localhost/readyz"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; db: string };
    expect(body.db).toBe("down");
  });

  test("/health remains for backwards compat (alias of /readyz)", async () => {
    dbHealthy = true;
    const res = await appDefault.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});
