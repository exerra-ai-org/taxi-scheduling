import { test, expect, describe } from "bun:test";
import { withAdvisoryLock } from "../../src/lib/advisoryLock";

function flatSql(sql: any): string {
  const chunks = sql?.queryChunks ?? [];
  return chunks
    .map((c: any) => {
      if (Array.isArray(c?.value)) return c.value.join("");
      if (typeof c?.value === "string") return c.value;
      if (typeof c?.value === "number") return String(c.value);
      return "";
    })
    .join("");
}

function makeFakeDb(opts: { acquired: boolean }) {
  const calls: { sql: string }[] = [];

  // The implementation now wraps work in db.transaction(async tx => ...).
  // Our fake transaction simply forwards execute() into the call log.
  const tx = {
    execute: async (sql: any) => {
      const flat = flatSql(sql);
      calls.push({ sql: flat });
      if (flat.includes("pg_try_advisory_xact_lock")) {
        return [{ locked: opts.acquired }];
      }
      return [];
    },
  };

  return {
    calls,
    db: {
      transaction: async <T>(fn: (tx: typeof tx) => Promise<T>) => fn(tx),
    },
  };
}

describe("withAdvisoryLock", () => {
  test("runs fn when lock is acquired", async () => {
    const fake = makeFakeDb({ acquired: true });
    let ran = false;
    const result = await withAdvisoryLock(fake.db as any, 12345, async () => {
      ran = true;
      return "ok";
    });

    expect(ran).toBe(true);
    expect(result).toEqual({ ran: true, value: "ok" });

    const sqls = fake.calls.map((c) => c.sql).join("|");
    expect(sqls).toContain("pg_try_advisory_xact_lock");
  });

  test("does NOT call any pg_advisory_unlock — txn-scoped locks auto-release", async () => {
    const fake = makeFakeDb({ acquired: true });
    await withAdvisoryLock(fake.db as any, 12345, async () => "ok");

    const unlockCalls = fake.calls.filter((c) =>
      c.sql.includes("pg_advisory_unlock"),
    );
    expect(unlockCalls).toHaveLength(0);
  });

  test("skips fn when lock is NOT acquired", async () => {
    const fake = makeFakeDb({ acquired: false });
    let ran = false;
    const result = await withAdvisoryLock(fake.db as any, 12345, async () => {
      ran = true;
    });

    expect(ran).toBe(false);
    expect(result).toEqual({ ran: false });
  });

  test("propagates exceptions from fn (transaction rolls back, lock auto-releases)", async () => {
    const fake = makeFakeDb({ acquired: true });
    await expect(
      withAdvisoryLock(fake.db as any, 12345, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
