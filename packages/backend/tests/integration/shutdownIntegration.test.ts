import { describe, test, expect, beforeAll, mock } from "bun:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);
process.env.BACKGROUND_JOBS_ENABLED = "false";

const dbEndCalls: { timeout: number }[] = [];

mock.module("../../src/db/index", () => ({
  dbClient: {
    end: async (opts: { timeout: number }) => {
      dbEndCalls.push(opts);
    },
  },
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

let shutdown: any;

beforeAll(async () => {
  ({ shutdown } = await import("../../src/index"));
});

describe("graceful shutdown wiring", () => {
  test("shutdown.run calls registered hooks including the dbClient.end hook", async () => {
    expect(dbEndCalls.length).toBe(0);
    await shutdown.run("SIGTEST");
    expect(dbEndCalls.length).toBe(1);
    expect(dbEndCalls[0].timeout).toBe(5);
  });

  test("calling shutdown.run a second time is a no-op", async () => {
    await shutdown.run("SIGTEST");
    expect(dbEndCalls.length).toBe(1);
  });
});
