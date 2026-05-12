import { describe, expect, test } from "bun:test";
import {
  computeWaitingFee,
  type WaitingFeeConfig,
} from "../../src/services/waitingFee";

const cfg: WaitingFeeConfig = {
  freeMinutes: 30,
  ratePence: 200,
  incrementMinutes: 5,
};

const arrived = new Date("2026-01-01T10:00:00Z");
const at = (mins: number) =>
  new Date(arrived.getTime() + mins * 60_000);

describe("computeWaitingFee", () => {
  test("returns 0 when driver hasn't arrived", () => {
    expect(
      computeWaitingFee(
        {
          driverArrivedAt: null,
          customerArrivedAt: null,
          endAt: at(120),
        },
        cfg,
      ),
    ).toBe(0);
  });

  test("returns 0 inside the 30-minute free window", () => {
    expect(
      computeWaitingFee(
        {
          driverArrivedAt: arrived,
          customerArrivedAt: null,
          endAt: at(29),
        },
        cfg,
      ),
    ).toBe(0);
  });

  test("returns 0 at exactly 30 minutes", () => {
    expect(
      computeWaitingFee(
        {
          driverArrivedAt: arrived,
          customerArrivedAt: null,
          endAt: at(30),
        },
        cfg,
      ),
    ).toBe(0);
  });

  test("charges 200p in the first billable 5-minute block", () => {
    expect(
      computeWaitingFee(
        {
          driverArrivedAt: arrived,
          customerArrivedAt: null,
          endAt: at(31),
        },
        cfg,
      ),
    ).toBe(200);
  });

  test("charges 200p per started 5-minute block", () => {
    // 30 + 14 = 44 minutes; 14 over → 3 blocks (5+5+5) → 600p
    expect(
      computeWaitingFee(
        {
          driverArrivedAt: arrived,
          customerArrivedAt: null,
          endAt: at(44),
        },
        cfg,
      ),
    ).toBe(600);
  });

  test("freezes at customer-arrived time, ignoring endAt", () => {
    // customer arrived at 40 (10 billable min → 2 blocks → 400p), endAt past it
    expect(
      computeWaitingFee(
        {
          driverArrivedAt: arrived,
          customerArrivedAt: at(40),
          endAt: at(200),
        },
        cfg,
      ),
    ).toBe(400);
  });

  test("rounds partial blocks UP (10.1 min → 3 blocks)", () => {
    expect(
      computeWaitingFee(
        {
          driverArrivedAt: arrived,
          customerArrivedAt: null,
          endAt: at(30 + 10.1),
        },
        cfg,
      ),
    ).toBe(600);
  });
});
