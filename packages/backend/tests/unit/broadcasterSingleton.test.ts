import { test, expect, describe, beforeAll } from "bun:test";

// Set env BEFORE importing config-dependent modules.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);

describe("broadcaster — hot-reload safety", () => {
  test("subscribe/unsubscribe round-trip is observable through broadcastBookingEvent", async () => {
    const { subscribe, broadcastBookingEvent } = await import(
      "../../src/services/broadcaster"
    );

    const received: unknown[] = [];
    const unsub = subscribe(7, "customer", (e) => received.push(e));

    broadcastBookingEvent([7], { type: "booking_updated", bookingId: 1, status: "assigned" });

    expect(received).toHaveLength(1);
    expect((received[0] as { bookingId: number }).bookingId).toBe(1);

    unsub();
    broadcastBookingEvent([7], { type: "booking_updated", bookingId: 2, status: "assigned" });
    expect(received).toHaveLength(1); // still one — unsub worked
  });

  test("the connections Map is pinned to globalThis under non-production NODE_ENV", async () => {
    // In dev mode, re-importing the module should reuse the same registry
    // so SSE subscribers established before a hot-reload survive it.
    const mod = await import("../../src/services/broadcaster");
    const globalKey = (globalThis as Record<string, unknown>)
      .__broadcasterConnections;

    // The connections Map MUST exist on globalThis when not in production.
    expect(globalKey).toBeDefined();

    // And subscribing through the module must mutate that same Map.
    const sizeBefore = (globalKey as Map<unknown, unknown>).size;
    const unsub = mod.subscribe(9999, "customer", () => {});
    expect((globalKey as Map<unknown, unknown>).size).toBeGreaterThan(
      sizeBefore,
    );
    unsub();
  });
});
