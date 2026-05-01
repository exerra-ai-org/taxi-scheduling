import { test, expect, describe } from "bun:test";
import {
  haversineMeters,
  evaluatePickupDwell,
} from "../../src/services/geofence";

const NOW = new Date("2026-05-01T12:00:00Z");
function offset(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

// Coords roughly around Luton Airport pickup area
const PICKUP = { lat: 51.8747, lon: -0.3683 };

describe("haversineMeters", () => {
  test("zero distance for identical points", () => {
    expect(haversineMeters(51, -0.1, 51, -0.1)).toBe(0);
  });

  test("matches a known pair (London ↔ Luton ~ 44km as the crow flies)", () => {
    const meters = haversineMeters(51.5074, -0.1278, 51.8747, -0.3683);
    expect(meters).toBeGreaterThan(43_000);
    expect(meters).toBeLessThan(45_000);
  });

  test("symmetric in argument order", () => {
    const a = haversineMeters(51.0, -0.1, 51.5, -0.5);
    const b = haversineMeters(51.5, -0.5, 51.0, -0.1);
    expect(Math.abs(a - b)).toBeLessThan(1e-6);
  });
});

describe("evaluatePickupDwell", () => {
  const baseInput = {
    pickupLat: PICKUP.lat,
    pickupLon: PICKUP.lon,
    radiusM: 75,
    dwellMs: 20_000,
  };

  test("missing pickup coords → no dwell, no transition", () => {
    const result = evaluatePickupDwell({
      ...baseInput,
      pickupLat: null,
      pickupLon: null,
      driverLat: PICKUP.lat,
      driverLon: PICKUP.lon,
      previousSince: null,
      now: NOW,
    });
    expect(result.shouldArrive).toBe(false);
    expect(result.nextSince).toBeNull();
    expect(result.distanceM).toBeNull();
  });

  test("driver outside radius → clears dwell, no transition", () => {
    // ~1 km north of pickup
    const result = evaluatePickupDwell({
      ...baseInput,
      driverLat: PICKUP.lat + 0.01,
      driverLon: PICKUP.lon,
      previousSince: offset(NOW, -60_000), // had been dwelling
      now: NOW,
    });
    expect(result.shouldArrive).toBe(false);
    expect(result.nextSince).toBeNull();
    expect(result.distanceM).toBeGreaterThan(75);
  });

  test("driver enters radius for the first time → starts dwell, no transition", () => {
    const result = evaluatePickupDwell({
      ...baseInput,
      driverLat: PICKUP.lat,
      driverLon: PICKUP.lon,
      previousSince: null,
      now: NOW,
    });
    expect(result.shouldArrive).toBe(false);
    expect(result.nextSince).toEqual(NOW);
    expect(result.distanceM).toBeLessThan(1); // identical coords
  });

  test("dwell still under window → keeps the original since timestamp", () => {
    const since = offset(NOW, -10_000);
    const result = evaluatePickupDwell({
      ...baseInput,
      driverLat: PICKUP.lat,
      driverLon: PICKUP.lon,
      previousSince: since,
      now: NOW,
    });
    expect(result.shouldArrive).toBe(false);
    expect(result.nextSince).toEqual(since);
  });

  test("dwell duration crosses window → fires shouldArrive once", () => {
    const since = offset(NOW, -25_000);
    const result = evaluatePickupDwell({
      ...baseInput,
      driverLat: PICKUP.lat,
      driverLon: PICKUP.lon,
      previousSince: since,
      now: NOW,
    });
    expect(result.shouldArrive).toBe(true);
    expect(result.nextSince).toEqual(since);
  });

  test("driver exits and re-enters → dwell timer restarts", () => {
    // First call: outside radius → since cleared
    const out = evaluatePickupDwell({
      ...baseInput,
      driverLat: PICKUP.lat + 0.01,
      driverLon: PICKUP.lon,
      previousSince: offset(NOW, -25_000),
      now: NOW,
    });
    expect(out.nextSince).toBeNull();

    // Second call: re-enters with that cleared previousSince
    const back = evaluatePickupDwell({
      ...baseInput,
      driverLat: PICKUP.lat,
      driverLon: PICKUP.lon,
      previousSince: out.nextSince,
      now: offset(NOW, 5_000),
    });
    expect(back.shouldArrive).toBe(false);
    expect(back.nextSince).toEqual(offset(NOW, 5_000));
  });

  test("custom radius is respected", () => {
    // Point ~50m north of pickup
    const driverLat = PICKUP.lat + 50 / 111_320; // 1° lat ≈ 111.32 km
    const tight = evaluatePickupDwell({
      ...baseInput,
      radiusM: 25,
      driverLat,
      driverLon: PICKUP.lon,
      previousSince: null,
      now: NOW,
    });
    expect(tight.nextSince).toBeNull(); // outside the 25m radius

    const loose = evaluatePickupDwell({
      ...baseInput,
      radiusM: 100,
      driverLat,
      driverLon: PICKUP.lon,
      previousSince: null,
      now: NOW,
    });
    expect(loose.nextSince).toEqual(NOW); // inside the 100m radius
  });
});
