import { test, expect, describe } from "bun:test";
import { withAdvisoryLock } from "../../src/lib/advisoryLock";

function makeFakeDb(opts: { acquired: boolean }) {
  const calls: { sql: string }[] = [];
  return {
    calls,
    db: {
      execute: async (sql: any) => {
        // Drizzle SQL has queryChunks; concat their .value StringChunk
        // representations to a flat string for assertions.
        const chunks = sql?.queryChunks ?? [];
        const flat = chunks
          .map((c: any) => {
            if (Array.isArray(c?.value)) return c.value.join("");
            if (typeof c?.value === "string") return c.value;
            if (typeof c?.value === "number") return String(c.value);
            return "";
          })
          .join("");
        calls.push({ sql: flat });
        if (flat.includes("pg_try_advisory_lock")) {
          return [{ locked: opts.acquired }];
        }
        return [];
      },
    },
  };
}

describe("withAdvisoryLock", () => {
  test("runs fn when lock is acquired and releases after", async () => {
    const fake = makeFakeDb({ acquired: true });
    let ran = false;
    const result = await withAdvisoryLock(fake.db as any, 12345, async () => {
      ran = true;
      return "ok";
    });

    expect(ran).toBe(true);
    expect(result).toEqual({ ran: true, value: "ok" });

    const sqls = fake.calls.map((c) => c.sql).join("|");
    expect(sqls).toContain("pg_try_advisory_lock");
    expect(sqls).toContain("pg_advisory_unlock");
  });

  test("skips fn when lock is NOT acquired and does NOT call unlock", async () => {
    const fake = makeFakeDb({ acquired: false });
    let ran = false;
    const result = await withAdvisoryLock(fake.db as any, 12345, async () => {
      ran = true;
    });

    expect(ran).toBe(false);
    expect(result).toEqual({ ran: false });

    const unlockCalls = fake.calls.filter((c) =>
      c.sql.includes("pg_advisory_unlock"),
    );
    expect(unlockCalls).toHaveLength(0);
  });

  test("releases the lock even if fn throws", async () => {
    const fake = makeFakeDb({ acquired: true });
    await expect(
      withAdvisoryLock(fake.db as any, 12345, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const unlockCalls = fake.calls.filter((c) =>
      c.sql.includes("pg_advisory_unlock"),
    );
    expect(unlockCalls).toHaveLength(1);
  });
});
