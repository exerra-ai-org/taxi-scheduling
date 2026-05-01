import { test, expect, describe } from "bun:test";
import { createShutdown } from "../../src/lib/shutdown";

describe("createShutdown", () => {
  test("runs registered hooks in reverse order of registration (LIFO)", async () => {
    const calls: string[] = [];
    const sd = createShutdown();
    sd.register("first", async () => {
      calls.push("first");
    });
    sd.register("second", async () => {
      calls.push("second");
    });
    sd.register("third", async () => {
      calls.push("third");
    });

    await sd.run("SIGTEST");
    expect(calls).toEqual(["third", "second", "first"]);
  });

  test("a hook that throws does not stop subsequent hooks", async () => {
    const calls: string[] = [];
    const sd = createShutdown();
    sd.register("a", async () => {
      calls.push("a");
    });
    sd.register("b", async () => {
      throw new Error("boom");
    });
    sd.register("c", async () => {
      calls.push("c");
    });

    await sd.run("SIGTEST");
    expect(calls).toEqual(["c", "a"]);
  });

  test("calling run() a second time is a no-op (idempotent)", async () => {
    let n = 0;
    const sd = createShutdown();
    sd.register("inc", async () => {
      n += 1;
    });

    await sd.run("SIGTEST");
    await sd.run("SIGTEST");
    expect(n).toBe(1);
  });

  test("hooks that exceed the per-hook timeout do not block forever", async () => {
    let resolved = false;
    const sd = createShutdown({ hookTimeoutMs: 30 });
    sd.register("slow", () => new Promise(() => {})); // never resolves
    sd.register("fast", async () => {
      resolved = true;
    });

    const start = Date.now();
    await sd.run("SIGTEST");
    const elapsed = Date.now() - start;

    expect(resolved).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });
});
