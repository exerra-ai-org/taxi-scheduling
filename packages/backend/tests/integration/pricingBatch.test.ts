import { describe, test, expect, beforeAll, mock } from "bun:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/taxi";
process.env.JWT_SECRET ??= "x".repeat(40);

let fixedRouteSelectCalls = 0;
let mileRateSelectCalls = 0;
let returnedFixedRouteRows: any[] = [];
let returnedMileRateRows: any[] = [];

mock.module("../../src/db/index", () => ({
  dbClient: { end: async () => {} },
  db: {
    select: () => ({
      from: (table: any) => {
        const tableName =
          table?.[Symbol.for("drizzle:Name")] ?? "unknown";
        const obj: any = {};
        obj.where = () => obj;
        obj.limit = () => Promise.resolve([]);
        obj.then = (resolve: any) => {
          if (tableName === "fixed_routes") {
            fixedRouteSelectCalls += 1;
            resolve(returnedFixedRouteRows);
          } else if (tableName === "mile_rates") {
            mileRateSelectCalls += 1;
            resolve(returnedMileRateRows);
          } else {
            resolve([]);
          }
        };
        return obj;
      },
    }),
  },
}));

// Stub OSRM so we don't hit the network.
mock.module("../../src/services/osrm", () => ({
  getOsrmDistance: async () => ({
    distanceMeters: 16093.44,
    distanceMiles: 10.0,
    durationSeconds: 600,
  }),
  __resetOsrmCacheForTests: () => {},
}));

let getPricingQuoteAllClasses: any;

beforeAll(async () => {
  ({ getPricingQuoteAllClasses } = await import("../../src/services/pricing"));
});

async function resetCaches() {
  const mod = await import("../../src/services/pricing");
  mod.__resetMileRatesCacheForTests();
}

describe("getPricingQuoteAllClasses — batched query path", () => {
  test("uses ONE fixed-route query for all three vehicle classes (not three sequential)", async () => {
    fixedRouteSelectCalls = 0;
    returnedFixedRouteRows = [
      {
        id: 1,
        name: "London → Luton",
        fromLabel: "London",
        toLabel: "Luton",
        pricePence: 5000,
        vehicleType: "regular",
        isAirport: false,
      },
      {
        id: 2,
        name: "London → Luton",
        fromLabel: "London",
        toLabel: "Luton",
        pricePence: 6500,
        vehicleType: "comfort",
        isAirport: false,
      },
      {
        id: 3,
        name: "London → Luton",
        fromLabel: "London",
        toLabel: "Luton",
        pricePence: 8500,
        vehicleType: "max",
        isAirport: false,
      },
    ];

    const result = await getPricingQuoteAllClasses("London", "Luton");
    expect(result).not.toBeNull();
    expect(result.quotes).toHaveLength(3);
    expect(fixedRouteSelectCalls).toBe(1);
  });

  test("falls back to mile-based pricing with a single mile_rates query", async () => {
    await resetCaches();
    fixedRouteSelectCalls = 0;
    mileRateSelectCalls = 0;
    returnedFixedRouteRows = []; // no fixed routes match
    returnedMileRateRows = [
      {
        vehicleClass: "regular",
        baseFarePence: 500,
        ratePerMilePence: 200,
      },
      {
        vehicleClass: "comfort",
        baseFarePence: 800,
        ratePerMilePence: 280,
      },
      {
        vehicleClass: "max",
        baseFarePence: 1200,
        ratePerMilePence: 400,
      },
    ];

    const result = await getPricingQuoteAllClasses("Some addr", "Other addr", {
      fromLat: 51.5,
      fromLon: -0.1,
      toLat: 51.6,
      toLon: -0.2,
    });
    expect(result).not.toBeNull();
    expect(result.quotes).toHaveLength(3);
    expect(fixedRouteSelectCalls).toBe(1);
    expect(mileRateSelectCalls).toBeLessThanOrEqual(1);
  });

  test("mile_rates are cached — repeated quote calls reuse the lookup", async () => {
    await resetCaches();
    fixedRouteSelectCalls = 0;
    mileRateSelectCalls = 0;
    returnedFixedRouteRows = [];
    returnedMileRateRows = [
      {
        vehicleClass: "regular",
        baseFarePence: 500,
        ratePerMilePence: 200,
      },
      {
        vehicleClass: "comfort",
        baseFarePence: 800,
        ratePerMilePence: 280,
      },
      {
        vehicleClass: "max",
        baseFarePence: 1200,
        ratePerMilePence: 400,
      },
    ];

    await getPricingQuoteAllClasses("A", "B", {
      fromLat: 51.5,
      fromLon: -0.1,
      toLat: 51.6,
      toLon: -0.2,
    });
    await getPricingQuoteAllClasses("A", "B", {
      fromLat: 51.5,
      fromLon: -0.1,
      toLat: 51.6,
      toLon: -0.2,
    });
    await getPricingQuoteAllClasses("A", "B", {
      fromLat: 51.5,
      fromLon: -0.1,
      toLat: 51.6,
      toLon: -0.2,
    });

    // 3 quote calls × 2 mile_rate lookups = 6 if uncached. Cached: 1.
    expect(mileRateSelectCalls).toBe(1);
  });

  test("partial fixed-route match estimates missing classes via multiplier — still ONE query", async () => {
    fixedRouteSelectCalls = 0;
    returnedFixedRouteRows = [
      {
        id: 1,
        name: "London → Luton",
        fromLabel: "London",
        toLabel: "Luton",
        pricePence: 5000,
        vehicleType: "regular",
        isAirport: false,
      },
      // comfort + max missing
    ];

    const result = await getPricingQuoteAllClasses("London", "Luton");
    expect(result).not.toBeNull();
    expect(result.quotes).toHaveLength(3);
    expect(fixedRouteSelectCalls).toBe(1);
    const regular = result.quotes.find(
      (q: any) => q.vehicleClass === "regular",
    );
    const comfort = result.quotes.find(
      (q: any) => q.vehicleClass === "comfort",
    );
    expect(regular.pricePence).toBe(5000);
    expect(comfort.pricePence).toBe(Math.round(5000 * 1.3));
  });
});
