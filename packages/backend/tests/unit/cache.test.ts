import { test, expect, describe } from "bun:test";
import { createTtlCache } from "../../src/lib/cache";

describe("createTtlCache — basic get/set", () => {
  test("get returns undefined for unset keys", () => {
    const c = createTtlCache<string, number>({ maxSize: 10, ttlMs: 1000 });
    expect(c.get("missing")).toBeUndefined();
  });

  test("set then get returns the stored value", () => {
    const c = createTtlCache<string, number>({ maxSize: 10, ttlMs: 1000 });
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
  });

  test("entries past their TTL return undefined", async () => {
    const c = createTtlCache<string, number>({ maxSize: 10, ttlMs: 30 });
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(c.get("a")).toBeUndefined();
  });

  test("clear() empties the cache", () => {
    const c = createTtlCache<string, number>({ maxSize: 10, ttlMs: 1000 });
    c.set("a", 1);
    c.set("b", 2);
    c.clear();
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBeUndefined();
  });

  test("size reports number of live entries", () => {
    const c = createTtlCache<string, number>({ maxSize: 10, ttlMs: 1000 });
    expect(c.size()).toBe(0);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.size()).toBe(2);
  });
});

describe("createTtlCache — LRU eviction", () => {
  test("when set exceeds maxSize, oldest entries are evicted", () => {
    const c = createTtlCache<string, number>({ maxSize: 3, ttlMs: 60_000 });
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    c.set("d", 4); // evicts "a"
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
    expect(c.get("d")).toBe(4);
  });

  test("get() refreshes recency so the touched entry survives the next eviction", () => {
    const c = createTtlCache<string, number>({ maxSize: 3, ttlMs: 60_000 });
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.get("a")).toBe(1); // bumps "a" to most-recent
    c.set("d", 4); // evicts "b" now (was oldest after a got bumped)
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("c")).toBe(3);
    expect(c.get("d")).toBe(4);
  });
});

describe("createTtlCache — wrap (memoise async)", () => {
  test("wrap calls the underlying fn once per unique key", async () => {
    const c = createTtlCache<string, number>({ maxSize: 10, ttlMs: 60_000 });
    let calls = 0;
    const fn = c.wrap(async (k: string) => {
      calls += 1;
      return k.length;
    });

    expect(await fn("hello")).toBe(5);
    expect(await fn("hello")).toBe(5);
    expect(await fn("hello")).toBe(5);
    expect(calls).toBe(1);

    expect(await fn("world!")).toBe(6);
    expect(calls).toBe(2);
  });

  test("wrap dedupes concurrent calls — only one fetch in flight per key", async () => {
    const c = createTtlCache<string, number>({ maxSize: 10, ttlMs: 60_000 });
    let calls = 0;
    let resolveFirst!: (v: number) => void;
    const firstPromise = new Promise<number>((r) => {
      resolveFirst = r;
    });

    const fn = c.wrap(async (_k: string) => {
      calls += 1;
      return firstPromise;
    });

    const p1 = fn("k");
    const p2 = fn("k");
    const p3 = fn("k");

    expect(calls).toBe(1);

    resolveFirst(42);
    expect(await p1).toBe(42);
    expect(await p2).toBe(42);
    expect(await p3).toBe(42);
    expect(calls).toBe(1);
  });

  test("wrap propagates rejection and does NOT cache the error", async () => {
    const c = createTtlCache<string, number>({ maxSize: 10, ttlMs: 60_000 });
    let calls = 0;
    const fn = c.wrap(async (_k: string) => {
      calls += 1;
      throw new Error("boom");
    });

    await expect(fn("k")).rejects.toThrow("boom");
    await expect(fn("k")).rejects.toThrow("boom");
    expect(calls).toBe(2); // error path retries on subsequent call
  });

  test("wrap recomputes after TTL expiry", async () => {
    const c = createTtlCache<string, number>({ maxSize: 10, ttlMs: 30 });
    let calls = 0;
    const fn = c.wrap(async (_k: string) => {
      calls += 1;
      return calls;
    });
    expect(await fn("k")).toBe(1);
    expect(await fn("k")).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(await fn("k")).toBe(2);
  });
});
