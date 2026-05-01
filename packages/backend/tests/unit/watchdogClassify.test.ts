import { test, expect, describe } from "bun:test";
import { classifyHeartbeat } from "../../src/services/watchdogClassify";

const NOW = new Date("2026-05-01T12:00:00Z");
const STALE_MIN = 5;
const FALLBACK_WINDOWS = 2;

function offset(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

describe("classifyHeartbeat", () => {
  test("fresh heartbeat → ok, with reset signal when missedWindows > 0", () => {
    const result = classifyHeartbeat({
      now: NOW,
      staleMinutes: STALE_MIN,
      fallbackWindows: FALLBACK_WINDOWS,
      lastHeartbeatAt: offset(NOW, -60), // 1 minute ago
      missedWindows: 1,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.shouldResetMissedWindows).toBe(true);
    }
  });

  test("fresh heartbeat with missedWindows=0 → ok, no reset needed", () => {
    const result = classifyHeartbeat({
      now: NOW,
      staleMinutes: STALE_MIN,
      fallbackWindows: FALLBACK_WINDOWS,
      lastHeartbeatAt: offset(NOW, -60),
      missedWindows: 0,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.shouldResetMissedWindows).toBe(false);
    }
  });

  test("stale heartbeat below fallback threshold → warn", () => {
    const result = classifyHeartbeat({
      now: NOW,
      staleMinutes: STALE_MIN,
      fallbackWindows: FALLBACK_WINDOWS,
      lastHeartbeatAt: offset(NOW, -10 * 60), // 10 minutes ago, stale
      missedWindows: 0,
    });
    expect(result.kind).toBe("warn");
    if (result.kind === "warn") {
      expect(result.newMissedWindows).toBe(1);
    }
  });

  test("stale heartbeat reaching fallback threshold → fallback", () => {
    const result = classifyHeartbeat({
      now: NOW,
      staleMinutes: STALE_MIN,
      fallbackWindows: FALLBACK_WINDOWS,
      lastHeartbeatAt: offset(NOW, -10 * 60),
      missedWindows: 1,
    });
    expect(result.kind).toBe("fallback");
    if (result.kind === "fallback") {
      expect(result.newMissedWindows).toBe(2);
    }
  });

  test("stale heartbeat exceeding fallback threshold → fallback", () => {
    const result = classifyHeartbeat({
      now: NOW,
      staleMinutes: STALE_MIN,
      fallbackWindows: FALLBACK_WINDOWS,
      lastHeartbeatAt: offset(NOW, -10 * 60),
      missedWindows: 5,
    });
    expect(result.kind).toBe("fallback");
  });

  test("never-beat (no lastHeartbeatAt) treated as stale", () => {
    const result = classifyHeartbeat({
      now: NOW,
      staleMinutes: STALE_MIN,
      fallbackWindows: FALLBACK_WINDOWS,
      lastHeartbeatAt: null,
      missedWindows: 0,
    });
    expect(result.kind).toBe("warn");
  });

  test("staleness boundary — exactly staleMinutes ago is NOT stale", () => {
    const result = classifyHeartbeat({
      now: NOW,
      staleMinutes: STALE_MIN,
      fallbackWindows: FALLBACK_WINDOWS,
      lastHeartbeatAt: offset(NOW, -STALE_MIN * 60),
      missedWindows: 0,
    });
    // Equal to threshold ⇒ NOT stale (uses lastHeartbeatAt < threshold).
    expect(result.kind).toBe("ok");
  });
});
