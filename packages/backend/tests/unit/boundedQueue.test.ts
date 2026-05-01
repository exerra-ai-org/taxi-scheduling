import { test, expect, describe } from "bun:test";
import { createBoundedQueue } from "../../src/lib/boundedQueue";

const OVERFLOW = { type: "overflow" } as const;

describe("createBoundedQueue", () => {
  test("push + drain returns events in order", () => {
    const q = createBoundedQueue<{ n: number } | typeof OVERFLOW>({
      max: 10,
      overflowSentinel: OVERFLOW,
    });
    q.push({ n: 1 });
    q.push({ n: 2 });
    q.push({ n: 3 });
    expect(q.drain()).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(q.drain()).toEqual([]);
  });

  test("when over limit, drops oldest and inserts overflow sentinel exactly once", () => {
    const q = createBoundedQueue<{ n: number } | typeof OVERFLOW>({
      max: 3,
      overflowSentinel: OVERFLOW,
    });
    for (let i = 1; i <= 7; i++) q.push({ n: i });
    const drained = q.drain();
    // Sentinel must appear exactly once.
    expect(drained.filter((d) => d === OVERFLOW).length).toBe(1);
    // Must be capped to max + 1 (sentinel slot).
    expect(drained.length).toBeLessThanOrEqual(4);
    // The most recent real event must still be present.
    const realEvents = drained.filter((d) => d !== OVERFLOW);
    expect(realEvents[realEvents.length - 1]).toEqual({ n: 7 });
  });

  test("after a drain, pushing more does not duplicate sentinel from previous overflow", () => {
    const q = createBoundedQueue<{ n: number } | typeof OVERFLOW>({
      max: 2,
      overflowSentinel: OVERFLOW,
    });
    for (let i = 1; i <= 5; i++) q.push({ n: i });
    expect(q.drain().filter((d) => d === OVERFLOW).length).toBe(1);
    q.push({ n: 100 });
    const next = q.drain();
    expect(next.filter((d) => d === OVERFLOW).length).toBe(0);
    expect(next).toEqual([{ n: 100 }]);
  });

  test("size reports current length", () => {
    const q = createBoundedQueue<number>({ max: 5, overflowSentinel: -1 });
    expect(q.size()).toBe(0);
    q.push(1);
    q.push(2);
    expect(q.size()).toBe(2);
    q.drain();
    expect(q.size()).toBe(0);
  });
});
